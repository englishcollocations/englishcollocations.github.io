import { icon } from './icons.js';

/* ==========================================================================
   Utilities
   ========================================================================== */
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const pad = (n) => String(n).padStart(2, '0');
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const isMobile = () => matchMedia('(max-width: 899px)').matches;
export const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
export const modKey = isMac ? '⌘' : 'Ctrl';

export function fmtTime(sec) {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${pad(s)}`;
}
export function fmtDuration(sec) {
  const m = Math.round(sec / 60);
  return m < 1 ? `${Math.round(sec)} sec` : `${m} min`;
}
export function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}
export const todayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const hue = (id) => Math.round((228 + id * 137.508) % 360);
export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
export function seeded(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
export function plural(n, word, pl = word + 's') { return `${n.toLocaleString()} ${n === 1 ? word : pl}`; }
export function haptic(ms = 8) { try { navigator.vibrate?.(ms); } catch { /* unsupported */ } }

/** Wrap each word in a span for the blur-in reveal animation. */
export function reveal(text) {
  return text.split(/(\s+)/).map((w, i) => (w.trim() ? `<span class="w" style="--i:${i >> 1}">${esc(w)}</span>` : w)).join('');
}

/* ==========================================================================
   Data
   ========================================================================== */
export const data = { lessons: [], byId: new Map(), all: [], totalCollocations: 0 };

export async function loadData() {
  const res = await fetch('data/lessons.json');
  if (!res.ok) throw new Error(`Failed to load lessons (${res.status})`);
  const json = await res.json();
  data.lessons = json.lessons.map((l) => ({
    ...l,
    nn: pad(l.id),
    hue: hue(l.id),
    audio: `sounds/Collocations-Lesson${pad(l.id)}.mp3`,
    collocations: l.collocations.map((c, idx) => ({ ...c, lessonId: l.id, idx, key: `${l.id}|${c.p}` })),
  }));
  data.byId = new Map(data.lessons.map((l) => [l.id, l]));
  data.all = data.lessons.flatMap((l) => l.collocations);
  data.totalCollocations = data.all.length;
  return data;
}
export const lessonById = (id) => data.byId.get(Number(id));
export const collocationByKey = (key) => {
  const [id] = key.split('|');
  return lessonById(id)?.collocations.find((c) => c.key === key);
};

const storyCache = new Map();
/** Story text → safe HTML; bold phrases become tappable highlight buttons. */
export async function loadStory(id) {
  if (storyCache.has(id)) return storyCache.get(id);
  const res = await fetch(`texts/${pad(id)}.txt`);
  if (!res.ok) throw new Error('Story not available');
  const raw = (await res.text()).replace(/\r/g, '');
  const lines = raw.split('\n');
  const first = lines.findIndex((l) => l.trim());
  const body = lines.slice(first + 1).join('\n').trim();
  const paragraphs = body.split(/\n\s*\n/).map((p) => p.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean);
  const html = paragraphs.map((p) => {
    const safe = esc(p).replace(/&lt;strong&gt;([\s\S]*?)&lt;\/strong&gt;/g, (_, inner) => {
      const text = inner.replace(/&lt;[^&]*&gt;/g, '');
      return `<button type="button" class="hl" data-phrase="${text}">${text}</button>`;
    }).replace(/&lt;\/?(em|i|b)&gt;/g, '');
    return `<p>${safe}</p>`;
  }).join('');
  const plain = paragraphs.map((p) => p.replace(/<[^>]+>/g, '')).join('\n\n');
  const out = { html, plain };
  storyCache.set(id, out);
  return out;
}

/* ==========================================================================
   Store (localStorage) — legacy keys kept so existing progress survives
   ========================================================================== */
const KEYS = {
  completed: 'completedLessons', notes: 'lessonNotes', voice: 'voiceSettings',
  prefs: 'ec.prefs', positions: 'ec.positions', favorites: 'ec.favorites', activity: 'ec.activity',
  last: 'ec.lastLesson', practice: 'ec.practice', known: 'ec.known',
};
const read = (k, fallback) => {
  try { const v = localStorage.getItem(k); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
};
const write = (k, v) => {
  try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { toast('Storage is full — changes may not be saved', { type: 'error' }); return false; }
};

export const DEFAULT_PREFS = {
  theme: 'system', accent: 'indigo', textScale: 1,
  speed: 1, autoNext: false, autoComplete: true, resume: true, skip: 10,
  lessonsView: 'grid', lessonsFilter: 'all', hideMeanings: false, sidebar: true, zoomed: false,
  practiceSource: 'all', practiceCount: 10,
};

const listeners = new Set();
export const store = {
  completed: (read(KEYS.completed, []) || []).map(Number).filter(Boolean),
  notes: read(KEYS.notes, {}) || {},
  voice: { rate: 1, pitch: 1, volume: 1, voiceIndex: -1, voiceURI: '', ...read(KEYS.voice, {}) },
  prefs: { ...DEFAULT_PREFS, ...read(KEYS.prefs, {}) },
  positions: read(KEYS.positions, {}) || {},
  favorites: read(KEYS.favorites, []) || [],
  activity: read(KEYS.activity, []) || [],
  last: read(KEYS.last, null),
  practice: { answered: 0, correct: 0, sessions: 0, bestStreak: 0, ...read(KEYS.practice, {}) },
  known: read(KEYS.known, {}) || {},

  on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  emit(topic, detail) { listeners.forEach((fn) => fn(topic, detail)); },

  isDone: (id) => store.completed.includes(Number(id)),
  setDone(id, done = true) {
    id = Number(id);
    const has = store.isDone(id);
    if (done && !has) store.completed.push(id);
    else if (!done && has) store.completed = store.completed.filter((x) => x !== id);
    else return;
    store.completed.sort((a, b) => a - b);
    write(KEYS.completed, store.completed);
    if (done) store.logActivity();
    store.emit('completed', id);
  },
  setAllDone(done) {
    store.completed = done ? data.lessons.map((l) => l.id) : [];
    write(KEYS.completed, store.completed);
    store.emit('completed');
  },

  getNote: (id) => store.notes[id] || '',
  setNote(id, text) {
    if (text.trim()) store.notes[id] = text; else delete store.notes[id];
    write(KEYS.notes, store.notes);
    store.emit('notes', id);
  },

  setPref(key, value) {
    store.prefs[key] = value;
    write(KEYS.prefs, store.prefs);
    store.emit('prefs', key);
  },
  setVoice(patch) {
    Object.assign(store.voice, patch);
    write(KEYS.voice, store.voice);
    store.emit('voice');
  },

  setPosition(id, sec) {
    if (sec < 3) delete store.positions[id]; else store.positions[id] = Math.round(sec * 10) / 10;
    write(KEYS.positions, store.positions);
  },
  setLast(id) { store.last = id; write(KEYS.last, id); },

  isFav: (key) => store.favorites.includes(key),
  toggleFav(key) {
    const on = !store.isFav(key);
    store.favorites = on ? [...store.favorites, key] : store.favorites.filter((k) => k !== key);
    write(KEYS.favorites, store.favorites);
    store.emit('favorites', key);
    return on;
  },

  logActivity() {
    const t = todayKey();
    if (store.activity[store.activity.length - 1] === t) return;
    store.activity = [...store.activity.filter((d) => d !== t), t].slice(-400);
    write(KEYS.activity, store.activity);
    store.emit('activity');
  },
  streak() {
    const set = new Set(store.activity);
    const d = new Date();
    if (!set.has(todayKey(d))) d.setDate(d.getDate() - 1);
    let n = 0;
    while (set.has(todayKey(d))) { n++; d.setDate(d.getDate() - 1); }
    return n;
  },

  recordAnswer(key, correct) {
    store.practice.answered++;
    if (correct) store.practice.correct++;
    const box = store.known[key] || 0;
    store.known[key] = correct ? Math.min(5, box + 1) : 0;
    write(KEYS.known, store.known);
    write(KEYS.practice, store.practice);
  },
  finishSession(bestStreak) {
    store.practice.sessions++;
    store.practice.bestStreak = Math.max(store.practice.bestStreak, bestStreak);
    write(KEYS.practice, store.practice);
    store.logActivity();
    store.emit('practice');
  },
  mastered: () => Object.values(store.known).filter((b) => b >= 3).length,

  export() {
    return {
      app: 'english-collocations', version: 2, exportedAt: new Date().toISOString(),
      completedLessons: store.completed, lessonNotes: store.notes, voiceSettings: store.voice,
      prefs: store.prefs, positions: store.positions, favorites: store.favorites,
      activity: store.activity, practice: store.practice, known: store.known,
    };
  },
  import(obj) {
    if (!obj || typeof obj !== 'object' || !Array.isArray(obj.completedLessons)) throw new Error('Not a valid backup file');
    store.completed = obj.completedLessons.map(Number).filter(Boolean);
    store.notes = obj.lessonNotes || {};
    if (obj.voiceSettings) store.voice = { ...store.voice, ...obj.voiceSettings };
    if (obj.prefs) store.prefs = { ...DEFAULT_PREFS, ...obj.prefs };
    store.positions = obj.positions || {};
    store.favorites = obj.favorites || [];
    store.activity = obj.activity || [];
    store.practice = { ...store.practice, ...(obj.practice || {}) };
    store.known = obj.known || {};
    write(KEYS.completed, store.completed); write(KEYS.notes, store.notes); write(KEYS.voice, store.voice);
    write(KEYS.prefs, store.prefs); write(KEYS.positions, store.positions); write(KEYS.favorites, store.favorites);
    write(KEYS.activity, store.activity); write(KEYS.practice, store.practice); write(KEYS.known, store.known);
    store.emit('import');
  },
  resetProgress() {
    store.completed = []; store.positions = {}; store.activity = []; store.known = {};
    store.practice = { answered: 0, correct: 0, sessions: 0, bestStreak: 0 };
    [KEYS.completed, KEYS.positions, KEYS.activity, KEYS.known, KEYS.practice, KEYS.last].forEach((k) => localStorage.removeItem(k));
    store.last = null;
    store.emit('import');
  },
};

/* ==========================================================================
   Theme
   ========================================================================== */
export const ACCENTS = {
  indigo: '#6366f1', blue: '#0a84ff', purple: '#a855f7', pink: '#ec4899',
  red: '#f43f5e', orange: '#f97316', green: '#16a34a', teal: '#0d9488', graphite: '#71717a',
};
const darkMQ = matchMedia('(prefers-color-scheme: dark)');
export function applyTheme() {
  const { theme, accent, textScale } = store.prefs;
  const dark = theme === 'dark' || (theme === 'system' && darkMQ.matches);
  const root = document.documentElement;
  root.dataset.theme = dark ? 'dark' : 'light';
  root.style.setProperty('--accent', ACCENTS[accent] || ACCENTS.indigo);
  root.style.setProperty('--text-scale', textScale || 1);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#1c1c1f' : '#ffffff');
}
darkMQ.addEventListener?.('change', () => store.prefs.theme === 'system' && applyTheme());

/* ==========================================================================
   Speech (pronunciation via Web Speech API)
   ========================================================================== */
export const speech = {
  supported: 'speechSynthesis' in window,
  voices: [],
  current: null,
  init() {
    if (!this.supported) return;
    const load = () => {
      this.voices = speechSynthesis.getVoices();
      store.emit('voices');
    };
    load();
    speechSynthesis.addEventListener?.('voiceschanged', load);
  },
  englishVoices() {
    return this.voices.filter((v) => /^en([-_]|$)/i.test(v.lang));
  },
  pickVoice() {
    const { voiceURI, voiceIndex } = store.voice;
    if (voiceURI) { const v = this.voices.find((x) => x.voiceURI === voiceURI); if (v) return v; }
    if (voiceIndex >= 0 && this.voices[voiceIndex]) return this.voices[voiceIndex];
    const en = this.englishVoices();
    const preferred = ['Samantha', 'Ava', 'Google US English', 'Microsoft Aria', 'Microsoft Jenny', 'Alex', 'Daniel', 'Karen'];
    for (const name of preferred) { const v = en.find((x) => x.name.includes(name)); if (v) return v; }
    return en.find((v) => /en[-_]US/i.test(v.lang)) || en[0] || null;
  },
  speak(text, { rate, onstart, onend } = {}) {
    if (!this.supported) { toast('Speech is not supported in this browser', { type: 'error' }); onend?.(); return; }
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const v = this.pickVoice();
    if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'en-US';
    u.rate = rate ?? store.voice.rate;
    u.pitch = store.voice.pitch;
    u.volume = store.voice.volume;
    u.onstart = () => onstart?.();
    let done = false;
    const finish = () => { if (done) return; done = true; if (this.current === u) this.current = null; onend?.(); };
    u.onend = finish;
    u.onerror = finish;
    this.current = u;
    // Safari occasionally drops utterances queued right after cancel()
    setTimeout(() => speechSynthesis.speak(u), 30);
  },
  stop() { if (this.supported) speechSynthesis.cancel(); this.current = null; },
};

/* ==========================================================================
   Offline downloads (Cache API — shared with the service worker)
   ========================================================================== */
export const AUDIO_CACHE = 'ec-audio-v1';
export const DATA_CACHE = 'ec-data-v1';
export const offline = {
  supported: 'caches' in window,
  async downloadedIds() {
    if (!this.supported) return new Set();
    const cache = await caches.open(AUDIO_CACHE);
    const keys = await cache.keys();
    return new Set(keys.map((r) => Number((r.url.match(/Lesson(\d+)\.mp3/) || [])[1])).filter(Boolean));
  },
  async isDownloaded(id) {
    if (!this.supported) return false;
    const cache = await caches.open(AUDIO_CACHE);
    return !!(await cache.match(new URL(lessonById(id).audio, location.href).href));
  },
  async download(ids, { onProgress, signal } = {}) {
    const audio = await caches.open(AUDIO_CACHE);
    const text = await caches.open(DATA_CACHE);
    let done = 0;
    let failed = 0;
    for (const id of ids) {
      if (signal?.aborted) break;
      const l = lessonById(id);
      const url = new URL(l.audio, location.href).href;
      try {
        if (!(await audio.match(url))) {
          const res = await fetch(url, { signal });
          if (!res.ok) throw new Error(res.status);
          await audio.put(url, res);
        }
        await Promise.all([`texts/${l.nn}.txt`, `collocations/${l.nn}.txt`].map(async (p) => {
          const u = new URL(p, location.href).href;
          if (!(await text.match(u))) { const r = await fetch(u, { signal }); if (r.ok) await text.put(u, r); }
        }));
      } catch {
        if (signal?.aborted) break;
        failed++;
      }
      done++;
      onProgress?.(done, ids.length, id);
    }
    store.emit('downloads');
    return { done, failed };
  },
  async remove(id) {
    const cache = await caches.open(AUDIO_CACHE);
    await cache.delete(new URL(lessonById(id).audio, location.href).href);
    store.emit('downloads');
  },
  async clear() {
    await caches.delete(AUDIO_CACHE);
    store.emit('downloads');
  },
  async estimate() {
    try { return await navigator.storage?.estimate?.(); } catch { return null; }
  },
};

/* ==========================================================================
   UI primitives
   ========================================================================== */
export function art(lesson, { cls = '', num = false, style = '' } = {}) {
  return `<div class="art ${cls}" style="--h:${lesson.hue};${style}"><span class="emo">${lesson.emoji}</span>${num ? `<span class="art-num">${lesson.nn}</span>` : ''}</div>`;
}

export function ring(pct, { size = 44, stroke = 5, label = '', cls = '' } = {}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c * (1 - clamp(pct, 0, 1));
  return `<div class="ring-wrap ${cls}" style="width:${size}px;height:${size}px">
    <svg class="ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <circle class="track" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}"/>
      <circle class="val" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}" stroke-dasharray="${c}" stroke-dashoffset="${c}" data-off="${off}"/>
    </svg>${label ? `<span class="ring-label">${label}</span>` : ''}</div>`;
}
/** Animate rings and bars from empty to their value after insertion. */
export function animateRings(root) {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    $$('.ring .val[data-off]', root).forEach((c) => { c.style.strokeDashoffset = c.dataset.off; });
    $$('.bar > i[data-w]', root).forEach((b) => { b.style.width = b.dataset.w; });
  }));
}

export function countUp(root) {
  $$('[data-count]', root).forEach((el) => {
    const to = Number(el.dataset.count);
    if (!to || matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = to.toLocaleString(); return; }
    const start = performance.now();
    const dur = 900 + Math.min(600, to * 2);
    const step = (now) => {
      const t = Math.min(1, (now - start) / dur);
      const e = 1 - Math.pow(1 - t, 4);
      el.textContent = Math.round(to * e).toLocaleString();
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

/** Segmented control with a sliding pill. */
export function segmented(el, onChange) {
  if (!el) return null;
  let pill = el.querySelector('.seg-pill');
  if (!pill) { pill = document.createElement('span'); pill.className = 'seg-pill'; el.prepend(pill); }
  const move = (animate = true) => {
    const active = el.querySelector('button.active');
    if (!active) { pill.style.width = '0'; return; }
    if (!animate) el.classList.add('no-anim');
    pill.style.width = `${active.offsetWidth}px`;
    pill.style.transform = `translateX(${active.offsetLeft - 3}px)`;
    if (!animate) requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove('no-anim')));
  };
  const select = (value, animate = true) => {
    el.querySelectorAll('button').forEach((x) => { const on = x.dataset.value === String(value); x.classList.toggle('active', on); x.setAttribute('aria-selected', on); });
    move(animate);
  };
  move(false);
  new ResizeObserver(() => move(false)).observe(el);
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || !el.contains(b) || b.classList.contains('active')) return;
    select(b.dataset.value);
    haptic(5);
    onChange?.(b.dataset.value, b);
  });
  return { move, select };
}
export function segHTML(options, value, { cls = '' } = {}) {
  return `<div class="segmented ${cls}" role="tablist">${options.map((o) => `<button type="button" role="tab" data-value="${o.value}" class="${String(o.value) === String(value) ? 'active' : ''}" aria-selected="${String(o.value) === String(value)}">${o.icon ? icon(o.icon, { size: 15 }) : ''}${o.label ?? ''}${o.count != null ? `<span class="count">${o.count}</span>` : ''}</button>`).join('')}</div>`;
}

export function switchHTML(name, checked, label = name) {
  return `<label class="switch"><input type="checkbox" data-pref="${name}" ${checked ? 'checked' : ''} aria-label="${esc(label)}"><span class="sw-track"></span><span class="sw-thumb"></span></label>`;
}

export function setRangeFill(input) {
  const min = Number(input.min || 0);
  const max = Number(input.max || 100);
  input.style.setProperty('--p', `${((Number(input.value) - min) / (max - min)) * 100}%`);
}

/* ---------- layer root ---------- */
const layer = () => document.getElementById('layer');

/* ---------- toasts ---------- */
export function toast(message, { type = 'info', icon: ic, action, duration = 3200 } = {}) {
  const host = document.getElementById('toasts');
  if (!host) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.setAttribute('role', 'status');
  const iconName = ic || (type === 'success' ? 'check' : type === 'error' ? 'alert' : 'info');
  el.innerHTML = `<span class="t-icon">${icon(iconName, { size: 14, stroke: 2.6 })}</span><span>${esc(message)}</span>${action ? `<button class="t-action">${esc(action.label)}</button>` : ''}`;
  const remove = () => { el.classList.add('out'); setTimeout(() => el.remove(), 300); };
  if (action) el.querySelector('.t-action').onclick = () => { action.fn(); remove(); };
  host.appendChild(el);
  while (host.children.length > 3) host.firstElementChild.remove();
  setTimeout(remove, duration);
}

/* ---------- sheet / dialog ---------- */
let openSheets = [];
export function sheet({ title = '', body = '', footer = '', wide = false, full = false, cls = '', onClose, head = true } = {}) {
  closeMenu();
  closePopover();
  const root = layer();
  const backdrop = document.createElement('div');
  backdrop.className = 'backdrop';
  const el = document.createElement('div');
  el.className = `sheet ${wide ? 'wide' : ''} ${full ? 'full' : ''} ${cls}`;
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.tabIndex = -1;
  el.innerHTML = `<div class="grabber"></div>${head ? `<div class="sheet-head"><h2>${esc(title)}</h2><button class="icon-btn round" data-close aria-label="Close">${icon('x', { size: 18 })}</button></div>` : ''}<div class="sheet-body">${typeof body === 'string' ? body : ''}</div>${footer ? `<div class="sheet-foot">${footer}</div>` : ''}`;
  if (body instanceof Node) el.querySelector('.sheet-body').appendChild(body);
  root.append(backdrop, el);
  const prevFocus = document.activeElement;
  requestAnimationFrame(() => { backdrop.classList.add('open'); el.classList.add('open'); el.focus({ preventScroll: true }); });

  let closed = false;
  const api = {
    el,
    body: el.querySelector('.sheet-body'),
    close(result) {
      if (closed) return;
      closed = true;
      openSheets = openSheets.filter((s) => s !== api);
      el.classList.remove('open');
      el.style.removeProperty('--drag');
      backdrop.classList.remove('open');
      setTimeout(() => { el.remove(); backdrop.remove(); }, 450);
      prevFocus?.focus?.({ preventScroll: true });
      onClose?.(result);
    },
  };
  openSheets.push(api);
  backdrop.addEventListener('click', () => api.close());
  el.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) api.close(); });

  // drag-to-dismiss on mobile (from the grabber / header)
  let startY = null;
  let dy = 0;
  const onDown = (e) => {
    if (!isMobile() || !e.target.closest('.grabber, .sheet-head, .np-top')) return;
    if (e.target.closest('button')) return;
    startY = e.clientY; dy = 0;
    el.classList.add('dragging');
    el.setPointerCapture(e.pointerId);
  };
  const onMove = (e) => {
    if (startY == null) return;
    dy = Math.max(0, e.clientY - startY);
    el.style.setProperty('--drag', `${dy}px`);
  };
  const onUp = () => {
    if (startY == null) return;
    startY = null;
    el.classList.remove('dragging');
    if (dy > 110) api.close(); else el.style.setProperty('--drag', '0px');
  };
  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onUp);
  return api;
}
export const topSheet = () => openSheets[openSheets.length - 1];

export function confirmDialog({ title, message, confirmLabel = 'Confirm', danger = false }) {
  return new Promise((resolve) => {
    const s = sheet({
      title,
      body: `<p>${esc(message)}</p>`,
      footer: `<button class="btn btn-secondary btn-lg" data-close>Cancel</button><button class="btn ${danger ? 'btn-danger' : 'btn-primary'} btn-lg" data-ok>${esc(confirmLabel)}</button>`,
      onClose: (r) => resolve(r === true),
    });
    s.el.querySelector('[data-ok]').onclick = () => s.close(true);
    setTimeout(() => s.el.querySelector('[data-ok]').focus(), 60);
  });
}

/* ---------- menu (context menu / dropdown) ---------- */
let activeMenu = null;
export function closeMenu() {
  if (!activeMenu) return;
  const m = activeMenu;
  activeMenu = null;
  m.el.classList.add('closing');
  m.cleanup();
  setTimeout(() => m.el.remove(), 150);
}
export function menu(anchor, items, { align = 'start' } = {}) {
  closeMenu();
  closePopover();
  const el = document.createElement('div');
  el.className = 'menu';
  el.setAttribute('role', 'menu');
  el.innerHTML = items.map((it, i) => {
    if (it === 'sep') return '<div class="menu-sep"></div>';
    if (it.header) return `<div class="menu-label">${esc(it.header)}</div>`;
    return `<button class="menu-item ${it.danger ? 'danger' : ''}" role="menuitem" data-i="${i}">${it.icon ? icon(it.icon, { size: 16 }) : ''}<span>${esc(it.label)}</span>${it.checked ? `<span class="check">${icon('check', { size: 15 })}</span>` : ''}${it.kbd ? `<kbd>${it.kbd}</kbd>` : ''}</button>`;
  }).join('');
  layer().appendChild(el);

  const rect = anchor instanceof Element ? anchor.getBoundingClientRect() : { left: anchor.x, right: anchor.x, top: anchor.y, bottom: anchor.y };
  const mw = el.offsetWidth;
  const mh = el.offsetHeight;
  let x = align === 'end' ? rect.right - mw : rect.left;
  let y = rect.bottom + 6;
  let origin = `${align === 'end' ? 'right' : 'left'} top`;
  if (y + mh > innerHeight - 8) { y = rect.top - mh - 6; origin = origin.replace('top', 'bottom'); }
  x = clamp(x, 8, innerWidth - mw - 8);
  y = clamp(y, 8, innerHeight - mh - 8);
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  el.style.setProperty('--origin', origin);

  el.addEventListener('click', (e) => {
    const b = e.target.closest('.menu-item');
    if (!b) return;
    const it = items[Number(b.dataset.i)];
    closeMenu();
    it.onClick?.();
  });
  const btns = () => $$('.menu-item', el);
  let focus = -1;
  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeMenu(); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const list = btns();
      focus = (focus + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length;
      list.forEach((b, i) => b.classList.toggle('focus', i === focus));
    }
    if (e.key === 'Enter' && focus >= 0) { e.preventDefault(); btns()[focus].click(); }
  };
  const onDown = (e) => { if (!el.contains(e.target)) closeMenu(); };
  setTimeout(() => { document.addEventListener('pointerdown', onDown, true); }, 0);
  document.addEventListener('keydown', onKey, true);
  window.addEventListener('blur', closeMenu);
  activeMenu = {
    el,
    cleanup() {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('blur', closeMenu);
    },
  };
}

/* ---------- popover ---------- */
let activePopover = null;
export function closePopover() {
  if (!activePopover) return;
  const p = activePopover;
  activePopover = null;
  p.el.classList.add('closing');
  p.cleanup();
  p.anchor?.classList.remove('active');
  setTimeout(() => p.el.remove(), 150);
}
export function popover(anchor, html, { onMount } = {}) {
  closePopover();
  closeMenu();
  const el = document.createElement('div');
  el.className = 'popover';
  el.innerHTML = html;
  layer().appendChild(el);
  const r = anchor.getBoundingClientRect();
  const w = el.offsetWidth;
  const h = el.offsetHeight;
  const x = clamp(r.left + r.width / 2 - w / 2, 12, innerWidth - w - 12);
  let y = r.bottom + 10;
  let origin = 'top center';
  if (y + h > innerHeight - 12) { y = r.top - h - 10; origin = 'bottom center'; }
  el.style.left = `${x}px`;
  el.style.top = `${Math.max(12, y)}px`;
  el.style.setProperty('--origin', origin);
  anchor.classList.add('active');
  const onDown = (e) => { if (!el.contains(e.target) && e.target !== anchor) closePopover(); };
  const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); closePopover(); } };
  const scroller = document.getElementById('viewScroll');
  const onScroll = () => closePopover();
  setTimeout(() => document.addEventListener('pointerdown', onDown, true), 0);
  document.addEventListener('keydown', onKey, true);
  scroller?.addEventListener('scroll', onScroll, { passive: true });
  activePopover = {
    el, anchor,
    cleanup() {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey, true);
      scroller?.removeEventListener('scroll', onScroll);
    },
  };
  onMount?.(el);
  return el;
}

/* ---------- confetti ---------- */
export function confetti({ count = 140, origin } = {}) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const c = document.createElement('canvas');
  c.className = 'confetti';
  const dpr = Math.min(2, devicePixelRatio || 1);
  c.width = innerWidth * dpr;
  c.height = innerHeight * dpr;
  document.body.appendChild(c);
  const ctx = c.getContext('2d');
  ctx.scale(dpr, dpr);
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
  const colors = [accent, '#f43f5e', '#f59e0b', '#22c55e', '#0ea5e9', '#a855f7', '#ec4899'];
  const ox = origin?.x ?? innerWidth / 2;
  const oy = origin?.y ?? innerHeight * 0.35;
  const parts = Array.from({ length: count }, () => {
    const a = Math.random() * Math.PI * 2;
    const v = 6 + Math.random() * 9;
    return {
      x: ox, y: oy, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 7,
      w: 6 + Math.random() * 6, h: 8 + Math.random() * 8, r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.4,
      color: colors[(Math.random() * colors.length) | 0], shape: Math.random() > 0.7 ? 'c' : 'r',
    };
  });
  const start = performance.now();
  const tick = (now) => {
    const t = now - start;
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    for (const p of parts) {
      p.vy += 0.32; p.vx *= 0.985; p.vy *= 0.985;
      p.x += p.vx; p.y += p.vy; p.r += p.vr;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - t / 2600);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.r);
      ctx.fillStyle = p.color;
      if (p.shape === 'c') { ctx.beginPath(); ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2); ctx.fill(); } else ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r * 2)) + 2);
      ctx.restore();
    }
    if (t < 2600) requestAnimationFrame(tick); else c.remove();
  };
  requestAnimationFrame(tick);
}

/* ---------- copy ---------- */
export async function copyText(text, label = 'Copied to clipboard') {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  toast(label, { type: 'success', icon: 'copy' });
}

/** Highlight `phrase` inside `text` (both plain strings); returns safe HTML. */
export function markPhrase(text, phrase) {
  const safe = esc(text);
  if (!phrase) return safe;
  const p = esc(phrase).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return safe.replace(new RegExp(`(${p})`, 'i'), '<mark>$1</mark>');
}
