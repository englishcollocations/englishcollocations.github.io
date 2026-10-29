import { icon } from './icons.js';
import { store, data, lessonById, fmtTime, toast, confetti, menu, sheet, art, clamp, speech, haptic } from './core.js';

const audio = new Audio();
audio.preload = 'metadata';
const RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const PLACEHOLDER = { id: 0, nn: '··', topic: 'Choose a lesson', emoji: '🎧', hue: 248 };

let pendingSeek = 0;
let lastSaved = 0;
let rafQueued = false;
let sleepTimer = null;
let sleepAt = 0;
let sleepAtEnd = false;
let dragging = null;

export const player = {
  audio,
  lesson: null,
  npSheet: null,
  get playing() { return !audio.paused && !audio.ended; },
  get duration() { return isFinite(audio.duration) && audio.duration > 0 ? audio.duration : (this.lesson?.duration || 0); },

  load(id, { autoplay = false } = {}) {
    const lesson = lessonById(id);
    if (!lesson) return;
    if (this.lesson?.id === lesson.id) { if (autoplay) this.play(); return; }
    this.savePosition();
    this.lesson = lesson;
    pendingSeek = store.prefs.resume ? (store.positions[lesson.id] || 0) : 0;
    if (pendingSeek > lesson.duration - 5) pendingSeek = 0;
    audio.src = lesson.audio;
    audio.playbackRate = store.prefs.speed;
    store.setLast(lesson.id);
    updateMediaSession();
    sync(true);
    if (autoplay) this.play();
    store.emit('player-lesson', lesson.id);
  },
  play() {
    if (!this.lesson) { this.load(store.last || nextUnfinished(), { autoplay: true }); return; }
    speech.stop();
    audio.playbackRate = store.prefs.speed;
    const p = audio.play();
    p?.catch((err) => {
      if (err?.name === 'NotAllowedError' || err?.name === 'AbortError') return;
      toast(navigator.onLine ? 'Could not play this lesson' : 'You are offline — download lessons to listen offline', { type: 'error' });
    });
  },
  pause() { audio.pause(); },
  toggle() { if (this.playing) this.pause(); else this.play(); haptic(6); },
  seek(t) {
    if (!this.lesson) return;
    const d = this.duration;
    audio.currentTime = clamp(t, 0, d ? d - 0.25 : t);
    sync();
    updatePositionState();
  },
  skip(delta) { this.seek(audio.currentTime + delta); },
  next() {
    const id = (this.lesson?.id || 0) + 1;
    if (id > data.lessons.length) { toast('You reached the last lesson 🎉'); return; }
    this.load(id, { autoplay: true });
  },
  prev() {
    if (audio.currentTime > 4) { this.seek(0); return; }
    const id = (this.lesson?.id || 2) - 1;
    if (id < 1) { this.seek(0); return; }
    this.load(id, { autoplay: true });
  },
  playLesson(id) {
    if (this.lesson?.id === Number(id)) this.toggle();
    else this.load(id, { autoplay: true });
  },
  setRate(r) {
    audio.playbackRate = r;
    store.setPref('speed', r);
    updatePositionState();
    sync();
  },
  setVolume(v) {
    audio.volume = clamp(v, 0, 1);
    audio.muted = audio.volume === 0;
    sync();
  },
  savePosition() {
    if (!this.lesson) return;
    const t = audio.currentTime;
    if (t > 0) store.setPosition(this.lesson.id, t);
  },
  setSleep(value) {
    clearTimeout(sleepTimer);
    sleepTimer = null;
    sleepAt = 0;
    sleepAtEnd = false;
    if (value === 'end') { sleepAtEnd = true; toast('Sleep timer: stops at end of lesson', { icon: 'moon' }); }
    else if (value > 0) {
      sleepAt = Date.now() + value * 60000;
      sleepTimer = setTimeout(() => { this.pause(); sleepAt = 0; sync(); toast('Sleep timer ended — good night 🌙', { icon: 'moon' }); }, value * 60000);
      toast(`Sleep timer: ${value} min`, { icon: 'moon' });
    } else toast('Sleep timer off', { icon: 'moon' });
    sync();
  },
  get sleepActive() { return sleepAtEnd || sleepAt > 0; },
};

function nextUnfinished() {
  return data.lessons.find((l) => !store.isDone(l.id))?.id || 1;
}

/* ---------- audio events ---------- */
audio.addEventListener('loadedmetadata', () => {
  if (pendingSeek > 0 && pendingSeek < audio.duration - 3) audio.currentTime = pendingSeek;
  pendingSeek = 0;
  audio.playbackRate = store.prefs.speed;
  updatePositionState();
  sync();
});
audio.addEventListener('timeupdate', () => {
  schedule();
  const now = Date.now();
  if (now - lastSaved > 5000) { lastSaved = now; player.savePosition(); }
});
audio.addEventListener('progress', schedule);
audio.addEventListener('ratechange', schedule);
audio.addEventListener('volumechange', schedule);
audio.addEventListener('play', () => {
  store.logActivity();
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
  sync();
});
audio.addEventListener('pause', () => {
  player.savePosition();
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
  sync();
});
audio.addEventListener('ended', () => {
  const l = player.lesson;
  if (!l) return;
  store.setPosition(l.id, 0);
  if (store.prefs.autoComplete && !store.isDone(l.id)) {
    store.setDone(l.id, true);
    confetti();
    toast(`Lesson ${l.id} completed! Great work`, { type: 'success', icon: 'trophy' });
  }
  if (sleepAtEnd) { sleepAtEnd = false; sync(); return; }
  if (store.prefs.autoNext && l.id < data.lessons.length) setTimeout(() => player.load(l.id + 1, { autoplay: true }), 900);
  sync();
});
audio.addEventListener('error', () => {
  if (!audio.src || !player.lesson) return;
  toast(navigator.onLine ? 'Audio failed to load' : 'Offline: this lesson is not downloaded yet', { type: 'error', icon: 'wifiOff' });
  sync();
});
addEventListener('pagehide', () => player.savePosition());
document.addEventListener('visibilitychange', () => document.hidden && player.savePosition());

/* ---------- media session (lock screen / headphones) ---------- */
function updateMediaSession() {
  if (!('mediaSession' in navigator) || !player.lesson) return;
  const l = player.lesson;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: `Lesson ${l.id} · ${l.topic}`,
      artist: 'English Collocations',
      album: 'Audio Lessons',
      artwork: [
        { src: 'android-chrome-192x192.png', sizes: '192x192', type: 'image/png' },
        { src: 'android-chrome-512x512.png', sizes: '512x512', type: 'image/png' },
      ],
    });
  } catch { /* unsupported */ }
}
function updatePositionState() {
  if (!('mediaSession' in navigator) || !navigator.mediaSession.setPositionState) return;
  const d = audio.duration;
  if (!isFinite(d) || d <= 0) return;
  try { navigator.mediaSession.setPositionState({ duration: d, playbackRate: audio.playbackRate, position: Math.min(audio.currentTime, d) }); } catch { /* ignore */ }
}
if ('mediaSession' in navigator) {
  const set = (action, fn) => { try { navigator.mediaSession.setActionHandler(action, fn); } catch { /* unsupported */ } };
  set('play', () => player.play());
  set('pause', () => player.pause());
  set('previoustrack', () => player.prev());
  set('nexttrack', () => player.next());
  set('seekbackward', (d) => player.skip(-(d.seekOffset || store.prefs.skip)));
  set('seekforward', (d) => player.skip(d.seekOffset || store.prefs.skip));
  set('seekto', (d) => player.seek(d.seekTime));
}

/* ---------- UI binding: any element with data-p="…" is kept in sync ---------- */
function schedule() {
  if (rafQueued) return;
  rafQueued = true;
  requestAnimationFrame(() => { rafQueued = false; sync(); });
}

export function sync(lessonChanged = false) {
  const l = player.lesson || PLACEHOLDER;
  const has = !!player.lesson;
  const playing = player.playing;
  const cur = audio.currentTime || (has ? pendingSeek : 0);
  const dur = player.duration;
  const pct = dur ? (cur / dur) * 100 : 0;
  let buf = 0;
  try { if (audio.buffered.length && dur) buf = (audio.buffered.end(audio.buffered.length - 1) / dur) * 100; } catch { /* ignore */ }

  for (const el of document.querySelectorAll('[data-p]')) {
    switch (el.dataset.p) {
      case 'toggle':
        el.querySelector('.ic-play')?.classList.toggle('off', playing);
        el.querySelector('.ic-pause')?.classList.toggle('off', !playing);
        el.setAttribute('aria-label', playing ? 'Pause' : 'Play');
        break;
      case 'time': if (dragging?.el?.dataset.p !== 'scrub') el.textContent = fmtTime(cur); break;
      case 'dur': el.textContent = fmtTime(dur); break;
      case 'remain': el.textContent = `-${fmtTime(Math.max(0, dur - cur))}`; break;
      case 'scrub':
        if (dragging?.el !== el) el.style.setProperty('--p', `${pct}%`);
        el.style.setProperty('--b', `${clamp(buf, 0, 100)}%`);
        el.setAttribute('aria-valuenow', Math.round(cur));
        el.setAttribute('aria-valuemax', Math.round(dur));
        el.setAttribute('aria-valuetext', `${fmtTime(cur)} of ${fmtTime(dur)}`);
        break;
      case 'mp-progress': el.style.setProperty('--p', `${pct}%`); break;
      case 'title': el.textContent = has ? `Lesson ${l.id} · ${l.topic}` : 'Not playing'; break;
      case 'topic': el.textContent = has ? l.topic : 'Not playing'; break;
      case 'sub': el.textContent = has ? `Lesson ${l.id} of ${data.lessons.length}` : 'Pick a lesson to start listening'; break;
      case 'art':
        if (lessonChanged || el.dataset.lesson !== String(l.id)) { el.dataset.lesson = l.id; el.innerHTML = art(l, { num: el.dataset.num === '1' }); }
        el.firstElementChild?.classList.toggle('playing', playing);
        break;
      case 'hue': el.style.setProperty('--h', l.hue); break;
      case 'rate': el.textContent = `${audio.playbackRate || store.prefs.speed}×`; break;
      case 'vol': if (dragging?.el !== el) el.style.setProperty('--p', `${audio.muted ? 0 : audio.volume * 100}%`); break;
      case 'mute': el.innerHTML = icon(audio.muted || audio.volume === 0 ? 'volumeX' : 'volume', { size: 17 }); break;
      case 'sleep': el.classList.toggle('on', player.sleepActive); break;
      case 'done': el.classList.toggle('on', has && store.isDone(l.id)); el.disabled = !has; break;
      case 'need-lesson': el.disabled = !has; break;
      default: break;
    }
  }
  for (const el of document.querySelectorAll('[data-play-lesson]')) {
    const mine = Number(el.dataset.playLesson) === player.lesson?.id && playing;
    el.classList.toggle('is-playing', mine);
    el.querySelector('.ic-play')?.classList.toggle('off', mine);
    el.querySelector('.ic-pause')?.classList.toggle('off', !mine);
    const label = el.querySelector('.pl-label');
    if (label) label.textContent = mine ? 'Pause' : (store.positions[el.dataset.playLesson] ? 'Resume' : 'Play');
  }
  for (const el of document.querySelectorAll('[data-eq-lesson]')) {
    el.hidden = Number(el.dataset.eqLesson) !== player.lesson?.id || !playing;
    el.querySelector('.eq')?.classList.toggle('paused', !playing);
  }
  document.getElementById('miniplayer')?.classList.toggle('hidden-mp', !has || document.body.classList.contains('np-open'));
}

export const playIcon = (size = 18) => `<span class="icon-swap">${icon('play', { size, cls: 'ic-play' })}${icon('pause', { size, cls: 'ic-pause off' })}</span>`;
export const eqHTML = (cls = '') => `<span class="eq ${cls}"><i></i><i></i><i></i></span>`;

/* ---------- menus ---------- */
export function rateMenu(anchor) {
  const cur = audio.playbackRate || store.prefs.speed;
  menu(anchor, [{ header: 'Playback speed' }, ...RATES.map((r) => ({ label: `${r}×${r === 1 ? ' (normal)' : ''}`, checked: r === cur, onClick: () => player.setRate(r) }))], { align: 'end' });
}
export function sleepMenu(anchor) {
  const left = sleepAt ? Math.ceil((sleepAt - Date.now()) / 60000) : 0;
  menu(anchor, [
    { header: left ? `Sleep timer · ${left} min left` : sleepAtEnd ? 'Sleep timer · end of lesson' : 'Sleep timer' },
    { label: 'Off', icon: 'x', checked: !player.sleepActive, onClick: () => player.setSleep(0) },
    ...[5, 15, 30, 45, 60].map((m) => ({ label: `${m} minutes`, icon: 'clock', onClick: () => player.setSleep(m) })),
    { label: 'End of lesson', icon: 'moon', checked: sleepAtEnd, onClick: () => player.setSleep('end') },
  ], { align: 'end' });
}

/* ---------- full-screen "Now Playing" (mobile) ---------- */
export function openNowPlaying() {
  if (!player.lesson) return;
  document.body.classList.add('np-open');
  player.npSheet = sheet({
    head: false,
    full: true,
    cls: 'np-sheet',
    body: `<div class="np" data-p="hue">
      <div class="np-bg"></div>
      <div class="np-top">
        <button class="icon-btn lg round" data-close aria-label="Close">${icon('chevronDown', { size: 24 })}</button>
        <span class="eyebrow">Now playing</span>
        <button class="icon-btn lg round" data-pa="open-lesson" aria-label="Open lesson">${icon('book', { size: 20 })}</button>
      </div>
      <div class="np-art-wrap"><div data-p="art" data-num="1"></div></div>
      <div class="np-title">
        <div class="t"><b data-p="topic"></b><span data-p="sub"></span></div>
        <button class="icon-btn lg round" data-p="done" data-pa="done" aria-label="Mark lesson complete">${icon('checkCircle', { size: 24 })}</button>
      </div>
      <div class="scrubber accent" data-p="scrub" role="slider" tabindex="0" aria-label="Seek"><div class="track"><div class="buf"></div><div class="fill"></div></div><div class="thumb"></div></div>
      <div class="np-times"><span data-p="time">0:00</span><span data-p="remain">-0:00</span></div>
      <div class="np-controls">
        <button class="icon-btn" data-pa="prev" aria-label="Previous lesson">${icon('prev', { size: 28 })}</button>
        <button class="icon-btn" data-pa="back" aria-label="Back ${store.prefs.skip} seconds">${icon('back10', { size: 26 })}</button>
        <button class="play-btn" data-p="toggle" data-pa="toggle" aria-label="Play">${playIcon(32)}</button>
        <button class="icon-btn" data-pa="fwd" aria-label="Forward ${store.prefs.skip} seconds">${icon('fwd10', { size: 26 })}</button>
        <button class="icon-btn" data-pa="next" aria-label="Next lesson">${icon('next', { size: 28 })}</button>
      </div>
      <div class="np-volume">${icon('speaker', { size: 16 })}<div class="scrubber" data-p="vol" role="slider" tabindex="0" aria-label="Volume"><div class="track"><div class="fill"></div></div><div class="thumb"></div></div>${icon('volume', { size: 18 })}</div>
      <div class="np-extra">
        <button class="btn btn-ghost btn-sm" data-pa="rate">${icon('gauge', { size: 16 })}<span data-p="rate">1×</span></button>
        <button class="btn btn-ghost btn-sm" data-p="sleep" data-pa="sleep">${icon('moon', { size: 16 })} Sleep</button>
        <button class="btn btn-ghost btn-sm" data-pa="open-lesson">${icon('file', { size: 16 })} Text</button>
      </div>
    </div>`,
    onClose: () => { document.body.classList.remove('np-open'); player.npSheet = null; sync(); },
  });
  sync(true);
}

/* ---------- global wiring ---------- */
export function initPlayerControls({ navigate }) {
  document.addEventListener('click', (e) => {
    const pl = e.target.closest('[data-play-lesson]');
    if (pl) { e.preventDefault(); e.stopPropagation(); player.playLesson(Number(pl.dataset.playLesson)); return; }
    const a = e.target.closest('[data-pa]');
    if (!a) return;
    switch (a.dataset.pa) {
      case 'toggle': player.toggle(); break;
      case 'back': player.skip(-store.prefs.skip); break;
      case 'fwd': player.skip(store.prefs.skip); break;
      case 'prev': player.prev(); break;
      case 'next': player.next(); break;
      case 'rate': rateMenu(a); break;
      case 'sleep': sleepMenu(a); break;
      case 'np': openNowPlaying(); break;
      case 'mute': player.setVolume(audio.muted || audio.volume === 0 ? 1 : 0); break;
      case 'done':
        if (!player.lesson) break;
        store.setDone(player.lesson.id, !store.isDone(player.lesson.id));
        if (store.isDone(player.lesson.id)) { confetti({ count: 90 }); toast('Marked as completed', { type: 'success' }); }
        break;
      case 'open-lesson':
        if (!player.lesson) break;
        player.npSheet?.close();
        navigate(`#/lesson/${player.lesson.id}`);
        break;
      default: break;
    }
  });

  // scrubbing (seek + volume) with pointer capture
  document.addEventListener('pointerdown', (e) => {
    const el = e.target.closest('[data-p="scrub"], [data-p="vol"]');
    if (!el || (el.dataset.p === 'scrub' && !player.lesson)) return;
    e.preventDefault();
    const rect = el.getBoundingClientRect();
    const ratio = (x) => clamp((x - rect.left) / rect.width, 0, 1);
    dragging = { el, ratio: ratio(e.clientX) };
    el.classList.add('dragging');
    el.style.setProperty('--p', `${dragging.ratio * 100}%`);
    if (el.dataset.p === 'vol') player.setVolume(dragging.ratio);
    el.setPointerCapture(e.pointerId);
    const move = (ev) => {
      dragging.ratio = ratio(ev.clientX);
      el.style.setProperty('--p', `${dragging.ratio * 100}%`);
      if (el.dataset.p === 'vol') player.setVolume(dragging.ratio);
      else {
        const t = dragging.ratio * player.duration;
        el.closest('.pb-scrub, .np')?.querySelectorAll('[data-p="time"]').forEach((x) => { x.textContent = fmtTime(t); });
      }
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.classList.remove('dragging');
      const d = dragging;
      dragging = null;
      if (el.dataset.p === 'scrub') player.seek(d.ratio * player.duration);
      sync();
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  });
  document.addEventListener('keydown', (e) => {
    const el = e.target.closest?.('[data-p="scrub"], [data-p="vol"]');
    if (!el || !['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    e.preventDefault();
    e.stopPropagation();
    const dir = e.key === 'ArrowRight' ? 1 : -1;
    if (el.dataset.p === 'scrub') player.skip(dir * 5);
    else player.setVolume(audio.volume + dir * 0.1);
  }, true);

  store.on((topic) => { if (topic === 'completed' || topic === 'import') sync(); });
  sync(true);
}
