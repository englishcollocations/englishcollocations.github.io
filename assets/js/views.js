import { icon } from './icons.js';
import {
  $, $$, esc, pad, data, store, lessonById, collocationByKey, loadStory, speech, offline, ACCENTS, applyTheme,
  art, emojiImg, ring, animateRings, countUp, segmented, segHTML, switchHTML, setRangeFill, toast, confirmDialog, menu,
  popover, closePopover, confetti, copyText, markPhrase, fmtTime, fmtDuration, debounce, shuffle, seeded, plural,
  reveal, isMobile, todayKey, haptic, clamp,
} from './core.js';
import { player, playIcon, eqHTML, sync } from './player.js';

/* ==========================================================================
   Shared fragments
   ========================================================================== */
const lessonPct = (l) => (l.duration ? clamp((store.positions[l.id] || 0) / l.duration, 0, 1) : 0);
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function collocCard(c, { n, showLesson = false } = {}) {
  const l = lessonById(c.lessonId);
  return `<article class="card colloc" data-key="${esc(c.key)}" style="--i:${Math.min(n ?? 0, 20)}">
    <div class="c-head">
      <span class="c-num">${pad((n ?? c.idx) + 1)}</span>
      <div class="c-phrase">${esc(c.p)}${c.n ? ` <small>${esc(c.n)}</small>` : ''}</div>
      <div class="c-actions">
        <button class="icon-btn sm" data-speak="${esc(c.p)}" aria-label="Pronounce ${esc(c.p)}" title="Pronounce">${icon('speaker', { size: 16 })}</button>
        <button class="icon-btn sm ${store.isFav(c.key) ? 'starred' : ''}" data-fav="${esc(c.key)}" aria-label="Save" title="Save">${icon('star', { size: 16 })}</button>
        <button class="icon-btn sm" data-copy-c="${esc(c.key)}" aria-label="Copy" title="Copy">${icon('copy', { size: 15 })}</button>
      </div>
    </div>
    ${c.m ? `<div class="c-meaning">${esc(c.m)}</div>` : '<div class="c-meaning faint">Listen to the story to hear it in context.</div>'}
    ${c.e ? `<div class="c-example">${markPhrase(c.e, c.p)}</div>` : ''}
    ${showLesson ? `<a class="link-btn" style="align-self:flex-start;margin:4px 0 0 28px" href="#/lesson/${l.id}/collocations">${emojiImg(l)} Lesson ${l.id} · ${esc(l.topic)}</a>` : ''}
  </article>`;
}

function lessonCard(l, i) {
  const done = store.isDone(l.id);
  const pct = lessonPct(l);
  return `<a href="#/lesson/${l.id}" class="card card-interactive spot lesson-card" style="--i:${Math.min(i, 24)}" data-lesson-card="${l.id}">
    ${art(l, { num: true, extra: `<button class="lc-hover-play" data-play-lesson="${l.id}" aria-label="Play lesson ${l.id}">${playIcon(20)}</button>` })}
    <div class="lc-status">
      <span data-eq-lesson="${l.id}" hidden><span class="status-playing">${eqHTML('dark')} Playing</span></span>
      ${done ? `<span class="status-done" title="Completed">${icon('check', { size: 15, stroke: 3 })}</span>` : ''}
    </div>
    <div class="lc-body">
      <div class="lc-title">${esc(l.topic)}</div>
      <div class="lc-meta">${l.collocations.length} collocations<span class="dot"></span>${fmtDuration(l.duration)}</div>
    </div>
    ${!done && pct > 0.01 ? `<div class="lc-progress"><div class="bar thin"><i style="width:${pct * 100}%"></i></div></div>` : ''}
  </a>`;
}

function lessonRow(l, matches = 0) {
  const done = store.isDone(l.id);
  const pct = lessonPct(l);
  return `<a href="#/lesson/${l.id}" class="lesson-row" data-lesson-card="${l.id}">
    ${art(l)}
    <div class="lr-main">
      <b>${esc(l.topic)}</b>
      <span>Lesson ${l.id} · ${l.collocations.length} collocations · ${fmtDuration(l.duration)} ${matches ? `<span class="match-chip">${plural(matches, 'match', 'matches')}</span>` : ''}</span>
      ${!done && pct > 0.01 ? `<div class="bar thin"><i style="width:${pct * 100}%"></i></div>` : ''}
    </div>
    <div class="lr-end">
      <span data-eq-lesson="${l.id}" hidden>${eqHTML()}</span>
      ${done ? `<span style="color:var(--success)" title="Completed">${icon('checkCircle', { size: 20 })}</span>` : ''}
      <button class="icon-btn round" data-play-lesson="${l.id}" aria-label="Play lesson ${l.id}">${playIcon(16)}</button>
    </div>
  </a>`;
}

function emptyState(ic, title, text, action = '') {
  return `<div class="empty"><div class="empty-icon">${icon(ic, { size: 32 })}</div><h3>${esc(title)}</h3><p>${esc(text)}</p>${action}</div>`;
}

export function lessonContextMenu(id, at) {
  const l = lessonById(id);
  if (!l) return;
  const done = store.isDone(id);
  menu(at, [
    { header: `Lesson ${l.id} · ${l.topic}` },
    { label: player.lesson?.id === l.id && player.playing ? 'Pause' : 'Play', icon: 'play', onClick: () => player.playLesson(l.id) },
    { label: 'Open lesson', icon: 'book', onClick: () => { location.hash = `#/lesson/${l.id}`; } },
    { label: 'Practice this lesson', icon: 'layers', onClick: () => { store.setPref('practiceSource', `lesson:${l.id}`); location.hash = '#/practice/quiz'; } },
    'sep',
    { label: done ? 'Mark as not completed' : 'Mark as completed', icon: done ? 'circle' : 'checkCircle', onClick: () => store.setDone(l.id, !done) },
    { label: 'Download for offline', icon: 'cloud', onClick: () => downloadLesson(l.id) },
    { label: 'Copy link', icon: 'link', onClick: () => copyText(`${location.origin}${location.pathname}#/lesson/${l.id}`, 'Link copied') },
  ]);
}

async function downloadLesson(id, btn) {
  if (!offline.supported) { toast('Offline downloads are not supported in this browser', { type: 'error' }); return; }
  if (btn) { btn.disabled = true; btn.innerHTML = icon('repeat', { size: 18, cls: 'spin' }); }
  const { failed } = await offline.download([id]);
  if (failed) toast('Download failed — check your connection', { type: 'error' });
  else toast(`Lesson ${id} is available offline`, { type: 'success', icon: 'cloudCheck' });
  if (btn) { btn.disabled = false; btn.innerHTML = icon(failed ? 'cloud' : 'cloudCheck', { size: 18 }); btn.classList.toggle('on', !failed); }
}

/** Phrase popover used in the story view. */
function showPhrase(anchor, phrase, lessonId) {
  const low = phrase.toLowerCase();
  const l = lessonById(lessonId);
  const c = l?.collocations.find((x) => x.p.toLowerCase() === low && x.m)
    || data.all.find((x) => x.p.toLowerCase() === low && x.m)
    || l?.collocations.find((x) => x.m && (x.p.toLowerCase().includes(low) || low.includes(x.p.toLowerCase())));
  if (player.playing) player.pause();
  speech.speak(phrase);
  popover(anchor, `
    <h4>${esc(phrase)}</h4>
    ${c?.m ? `<p>${esc(c.m)}</p>` : '<p class="faint">A key collocation from this lesson.</p>'}
    ${c?.e ? `<p class="ex">“${markPhrase(c.e, c.p)}”</p>` : ''}
    <div class="pop-actions">
      <button class="btn btn-tinted btn-sm" data-speak="${esc(phrase)}">${icon('speaker', { size: 15 })} Listen</button>
      ${c ? `<button class="btn btn-secondary btn-sm ${store.isFav(c.key) ? 'starred' : ''}" data-fav="${esc(c.key)}">${icon('star', { size: 15 })} ${store.isFav(c.key) ? 'Saved' : 'Save'}</button>` : ''}
      <button class="btn btn-ghost btn-sm" data-copy-text="${esc(phrase)}" aria-label="Copy">${icon('copy', { size: 15 })}</button>
    </div>`);
}

/* ==========================================================================
   Global delegated actions (speak / save / copy / context menus / spotlight)
   ========================================================================== */
export function initGlobalActions() {
  const setFavButtons = (key, on) => $$(`[data-fav="${CSS.escape(key)}"]`).forEach((b) => {
    b.classList.toggle('starred', on);
    if (b.classList.contains('btn')) b.innerHTML = `${icon('star', { size: 15 })} ${on ? 'Saved' : 'Save'}`;
  });

  document.addEventListener('click', (e) => {
    const sp = e.target.closest('[data-speak]');
    if (sp) {
      e.preventDefault();
      sp.classList.add('on');
      if (player.playing) player.pause();
      speech.speak(sp.dataset.speak, { onend: () => sp.classList.remove('on') });
      return;
    }
    const fav = e.target.closest('[data-fav]');
    if (fav) {
      e.preventDefault();
      const key = fav.dataset.fav;
      const on = store.toggleFav(key);
      haptic(on ? 12 : 6);
      setFavButtons(key, on);
      toast(on ? 'Saved to your collection' : 'Removed from saved', {
        icon: 'star', type: on ? 'success' : 'info',
        action: { label: 'Undo', fn: () => { const back = store.toggleFav(key); setFavButtons(key, back); } },
      });
      return;
    }
    const cc = e.target.closest('[data-copy-c]');
    if (cc) {
      const c = collocationByKey(cc.dataset.copyC);
      if (c) copyText(`${c.p}${c.m ? ` – ${c.m}` : ''}${c.e ? `\nExample: ${c.e}` : ''}`);
      return;
    }
    const ct = e.target.closest('[data-copy-text]');
    if (ct) copyText(ct.dataset.copyText);
  });

  document.addEventListener('contextmenu', (e) => {
    const card = e.target.closest('[data-lesson-card]');
    if (!card) return;
    e.preventDefault();
    lessonContextMenu(Number(card.dataset.lessonCard), { x: e.clientX, y: e.clientY });
  });

  // cursor-following spotlight
  document.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    const el = e.target.closest?.('.spot');
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${e.clientX - r.left}px`);
    el.style.setProperty('--my', `${e.clientY - r.top}px`);
  }, { passive: true });

  // ripple on buttons
  document.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('.btn, .option');
    if (!b || b.disabled) return;
    const r = b.getBoundingClientRect();
    const s = Math.max(r.width, r.height);
    const span = document.createElement('span');
    span.className = 'ripple';
    span.style.cssText = `width:${s}px;height:${s}px;left:${e.clientX - r.left - s / 2}px;top:${e.clientY - r.top - s / 2}px`;
    b.appendChild(span);
    setTimeout(() => span.remove(), 650);
  });
}

/* ==========================================================================
   Home
   ========================================================================== */
function home() {
  const total = data.lessons.length;
  const done = store.completed.length;
  const last = lessonById(store.last);
  const current = last && !store.isDone(last.id) ? last : (data.lessons.find((l) => !store.isDone(l.id)) || last || data.lessons[0]);
  const pos = store.positions[current.id] || 0;
  const pct = lessonPct(current);
  const learned = data.lessons.filter((l) => store.isDone(l.id)).reduce((n, l) => n + l.collocations.length, 0);
  const streak = store.streak();
  const hour = new Date().getHours();
  const greeting = hour < 5 ? 'Good night' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  const rng = seeded(Number(todayKey().replace(/-/g, '')));
  const pool = data.all.filter((c) => c.m && c.e);
  const wotd = pool[Math.floor(rng() * pool.length)];
  const wl = lessonById(wotd.lessonId);

  const upNext = [];
  for (let k = 0; k < total && upNext.length < 12; k++) {
    const l = data.lessons[(current.id - 1 + k) % total];
    if (!store.isDone(l.id) || done === total) upNext.push(l);
  }
  const allDone = done === total;

  const html = `
  <div class="page-head">
    <div>
      <div class="eyebrow">${esc(dateStr)}</div>
      <h1 class="page-title reveal" style="margin-top:6px">${reveal(greeting)}</h1>
      <p class="page-sub">${allDone ? 'You finished every lesson — amazing! Keep your skills sharp with practice.' : done ? `You've completed ${done} of ${total} lessons. Keep the momentum going.` : 'Master natural English word combinations, one lesson at a time.'}</p>
    </div>
  </div>

  <section class="hero" style="--h:${current.hue}">
    <div class="hero-text">
      <div class="eyebrow">${pos > 0 ? 'Continue listening' : store.isDone(current.id) ? 'Listen again' : done ? 'Up next' : 'Start here'}</div>
      <h2>Lesson ${current.id} · ${esc(current.topic)}</h2>
      <p>${current.collocations.length} collocations · ${fmtDuration(current.duration)}</p>
      ${pos > 0 ? `<div class="hero-progress"><div class="bar"><i data-w="${pct * 100}%"></i></div><small><span>${fmtTime(pos)}</span><span>-${fmtTime(current.duration - pos)}</span></small></div>` : ''}
      <div class="hero-actions">
        <button class="btn btn-hero btn-lg btn-pill" data-play-lesson="${current.id}">${playIcon(18)}<span class="pl-label">${pos > 0 ? 'Resume' : 'Play'}</span></button>
        <a class="btn btn-glass btn-lg btn-pill" href="#/lesson/${current.id}">${icon('book', { size: 18 })} Open lesson</a>
      </div>
    </div>
    <div class="hero-emoji" aria-hidden="true">${emojiImg(current, '')}</div>
  </section>

  <div class="stats stagger">
    <a href="#/lessons" class="card card-interactive spot stat" style="--i:0">
      <div class="stat-top">${ring(done / total, { size: 38, stroke: 4.5 })}<span class="faint">${Math.round((done / total) * 100)}%</span></div>
      <div><div class="stat-val"><span data-count="${done}">0</span><small>/${total}</small></div><div class="stat-label">Lessons completed</div></div>
    </a>
    <a href="#/lessons" class="card card-interactive spot stat" style="--i:1">
      <div class="stat-top"><span class="stat-icon tone-blue">${icon('sparkles', { size: 18 })}</span></div>
      <div><div class="stat-val"><span data-count="${learned}">0</span></div><div class="stat-label">Collocations learned</div></div>
    </a>
    <a href="#/practice" class="card card-interactive spot stat" style="--i:2">
      <div class="stat-top"><span class="stat-icon tone-orange">${icon('flame', { size: 18 })}</span></div>
      <div><div class="stat-val"><span data-count="${streak}">0</span><small> ${streak === 1 ? 'day' : 'days'}</small></div><div class="stat-label">Learning streak</div></div>
    </a>
    <a href="#/saved" class="card card-interactive spot stat" style="--i:3">
      <div class="stat-top"><span class="stat-icon tone-yellow">${icon('star', { size: 18 })}</span></div>
      <div><div class="stat-val"><span data-count="${store.favorites.length}">0</span></div><div class="stat-label">Saved collocations</div></div>
    </a>
  </div>

  <section class="section">
    <div class="home-grid">
      <article class="card spot wotd">
        <span class="quote-mark">${icon('quote', { size: 90 })}</span>
        <div class="eyebrow accent">Collocation of the day</div>
        <div class="phrase">${esc(wotd.p)}</div>
        <div class="meaning">${esc(wotd.m)}</div>
        <div class="example">${markPhrase(wotd.e, wotd.p)}</div>
        <div class="wotd-actions">
          <button class="btn btn-tinted btn-sm" data-speak="${esc(wotd.p)}">${icon('speaker', { size: 15 })} Listen</button>
          <button class="btn btn-secondary btn-sm ${store.isFav(wotd.key) ? 'starred' : ''}" data-fav="${esc(wotd.key)}">${icon('star', { size: 15 })} ${store.isFav(wotd.key) ? 'Saved' : 'Save'}</button>
          <span style="flex:1"></span>
          <a class="link-btn" href="#/lesson/${wl.id}/collocations">${emojiImg(wl)} ${esc(wl.topic)} ${icon('chevronRight', { size: 15 })}</a>
        </div>
      </article>
      <article class="card spot cta-card">
        <div class="cta-orb"></div>
        <span class="stat-icon tone-accent" style="width:44px;height:44px;border-radius:13px;display:grid;place-items:center">${icon('brain', { size: 22 })}</span>
        <h3>Daily practice</h3>
        <p>${store.practice.answered ? `${store.mastered()} collocations mastered · ${Math.round((store.practice.correct / Math.max(1, store.practice.answered)) * 100)}% accuracy` : 'Test yourself with flashcards and quick quizzes. Five minutes a day makes a difference.'}</p>
        <div class="cta-stack">
          <a class="btn btn-primary btn-pill" href="#/practice/quiz">${icon('zap', { size: 16 })} Quick quiz</a>
          <a class="btn btn-secondary btn-pill" href="#/practice/flashcards">${icon('layers', { size: 16 })} Flashcards</a>
        </div>
      </article>
    </div>
  </section>

  <section class="section">
    <div class="section-head"><h2>${allDone ? 'Revisit lessons' : 'Up next'}</h2><a class="link-btn" href="#/lessons">See all ${icon('chevronRight', { size: 15 })}</a></div>
    <div class="hscroll">
      ${upNext.map((l) => `<a href="#/lesson/${l.id}" class="card card-interactive spot mini-card" data-lesson-card="${l.id}">
        ${art(l, { num: true })}
        <div class="mc-body"><b>${esc(l.topic)}</b><span>${store.isDone(l.id) ? '✓ Completed' : `${l.collocations.length} collocations`}</span></div>
      </a>`).join('')}
    </div>
  </section>

  <section class="section">
    <div class="card pdf-card">
      <div class="pdf-icon">${icon('file', { size: 24 })}</div>
      <div class="pdf-main"><b>Complete guide (PDF)</b><span>All 50 lessons in one printable, searchable document.</span></div>
      <div class="pdf-actions">
        <a class="btn btn-secondary" href="collocations.pdf" target="_blank" rel="noopener">${icon('external', { size: 16 })} View</a>
        <a class="btn btn-primary" href="collocations.pdf" download="English-Collocations-Complete-Guide.pdf">${icon('download', { size: 16 })} Download</a>
      </div>
    </div>
  </section>`;

  return {
    title: 'Home',
    html,
    refreshOn: ['completed', 'import'],
    mount(root) { animateRings(root); countUp(root); },
  };
}

/* ==========================================================================
   Lessons library
   ========================================================================== */
let lessonQuery = '';
function lessons() {
  const total = data.lessons.length;
  const done = store.completed.length;
  const html = `
  <div class="page-head">
    <div>
      <h1 class="page-title">Lessons</h1>
      <p class="page-sub">${total} lessons · ${data.totalCollocations.toLocaleString()} collocations · ${done} completed</p>
    </div>
  </div>
  <div class="lessons-toolbar">
    <label class="field">${icon('search', { size: 16 })}<input type="search" id="lessonSearch" placeholder="Search topics or collocations…" value="${esc(lessonQuery)}" autocomplete="off" spellcheck="false" aria-label="Search lessons"></label>
    <div id="lessonFilter" style="display:contents">${segHTML([{ value: 'all', label: 'All', count: total }, { value: 'todo', label: 'To do', count: total - done }, { value: 'done', label: 'Completed', count: done }], store.prefs.lessonsFilter)}</div>
    <span class="grow desktop-only"></span>
    <div id="lessonView" style="display:contents">${segHTML([{ value: 'grid', icon: 'grid' }, { value: 'list', icon: 'list' }], store.prefs.lessonsView, { cls: 'view-toggle' })}</div>
  </div>
  <div id="lessonResults"></div>`;

  const renderResults = (root) => {
    const q = lessonQuery.trim().toLowerCase();
    const filter = store.prefs.lessonsFilter;
    let list = data.lessons.filter((l) => (filter === 'done' ? store.isDone(l.id) : filter === 'todo' ? !store.isDone(l.id) : true));
    const matches = new Map();
    const phraseHits = [];
    if (q) {
      list = list.filter((l) => {
        const hits = l.collocations.filter((c) => c.p.toLowerCase().includes(q) || c.m.toLowerCase().includes(q));
        if (hits.length) { matches.set(l.id, hits.length); phraseHits.push(...hits); }
        return l.topic.toLowerCase().includes(q) || String(l.id) === q || hits.length;
      });
    }
    const out = $('#lessonResults', root);
    if (!list.length) {
      out.innerHTML = emptyState('search', 'No lessons found', q ? `Nothing matches “${lessonQuery}”. Try another word.` : 'No lessons in this filter yet.');
      return;
    }
    const grid = store.prefs.lessonsView === 'grid' && !q;
    out.innerHTML = grid
      ? `<div class="lesson-grid stagger">${list.map(lessonCard).join('')}</div>`
      : `<div class="card" style="padding:6px"><div class="lesson-list">${list.map((l) => lessonRow(l, matches.get(l.id))).join('')}</div></div>
         ${phraseHits.length ? `<div class="match-list"><div class="section-head"><h2>Matching collocations</h2><span class="faint">${plural(phraseHits.length, 'result')}</span></div><div class="colloc-list stagger">${phraseHits.slice(0, 40).map((c, i) => collocCard(c, { n: i, showLesson: true })).join('')}</div></div>` : ''}`;
    sync();
  };

  return {
    title: 'Lessons',
    html,
    refreshOn: ['completed', 'import'],
    mount(root) {
      renderResults(root);
      const input = $('#lessonSearch', root);
      input.addEventListener('input', debounce(() => { lessonQuery = input.value; renderResults(root); }, 120));
      input.addEventListener('keydown', (e) => { if (e.key === 'Escape' && input.value) { e.stopPropagation(); input.value = ''; lessonQuery = ''; renderResults(root); } });
      segmented($('#lessonFilter .segmented', root), (v) => { store.setPref('lessonsFilter', v); renderResults(root); });
      segmented($('#lessonView .segmented', root), (v) => { store.setPref('lessonsView', v); renderResults(root); });
    },
  };
}

/* ==========================================================================
   Lesson detail
   ========================================================================== */
let playAll = null;
function stopPlayAll() {
  if (!playAll) return;
  playAll.stopped = true;
  speech.stop();
  $$('.colloc.speaking').forEach((x) => x.classList.remove('speaking'));
  if (playAll.btn) { playAll.btn.classList.remove('on'); playAll.btn.innerHTML = `${icon('speaker', { size: 16 })}<span>Listen all</span>`; }
  playAll = null;
}

function lesson({ id, tab = 'story' }, ctx) {
  const l = lessonById(id);
  if (!l) return notFound();
  if (!['story', 'collocations', 'notes'].includes(tab)) tab = 'story';
  const done = store.isDone(l.id);
  const prev = lessonById(l.id - 1);
  const next = lessonById(l.id + 1);
  const hasNote = !!store.getNote(l.id);

  const html = `
  <header class="lesson-hero">
    ${art(l, { num: true, cls: player.lesson?.id === l.id && player.playing ? 'playing' : '' })}
    <div>
      <div class="eyebrow accent">Lesson ${l.id} of ${data.lessons.length}</div>
      <h1 class="reveal">${reveal(l.topic)}</h1>
      <div class="chips">
        <span class="chip">${icon('clock', { size: 13 })} ${fmtTime(l.duration)}</span>
        <span class="chip">${icon('sparkles', { size: 13 })} ${l.collocations.length} collocations</span>
        <span class="chip">${icon('file', { size: 13 })} ${l.words} words</span>
        <span class="chip success" id="doneChip" ${done ? '' : 'hidden'}>${icon('check', { size: 13, stroke: 3 })} Completed</span>
      </div>
      <div class="actions">
        <button class="btn btn-primary btn-lg btn-pill" data-play-lesson="${l.id}">${playIcon(18)}<span class="pl-label">${store.positions[l.id] ? 'Resume' : 'Play'}</span></button>
        <button class="btn ${done ? 'btn-success' : 'btn-secondary'} btn-lg btn-pill" id="doneBtn">${icon(done ? 'checkCircle' : 'circle', { size: 18 })}<span>${done ? 'Completed' : 'Mark complete'}</span></button>
        <button class="icon-btn lg round" id="dlBtn" title="Download for offline" aria-label="Download for offline">${icon('cloud', { size: 18 })}</button>
        <button class="icon-btn lg round" id="moreBtn" title="More" aria-label="More actions">${icon('more', { size: 20 })}</button>
      </div>
    </div>
  </header>

  <div class="lesson-tabs" id="lessonTabs">
    ${segHTML([
      { value: 'story', label: 'Story' },
      { value: 'collocations', label: 'Collocations', count: l.collocations.length },
      { value: 'notes', label: 'Notes', count: hasNote ? '✓' : null },
    ], tab, { cls: 'lesson-seg' })}
    <div class="tab-tools" id="tabTools"></div>
  </div>
  <div id="tabPanel"></div>

  <nav class="lesson-nav">
    ${prev ? `<a class="card card-interactive spot prev" href="#/lesson/${prev.id}">${icon('chevronLeft', { size: 18 })}${art(prev)}<div class="ln-text"><span>Previous</span><b>${esc(prev.topic)}</b></div></a>` : ''}
    ${next ? `<a class="card card-interactive spot next" href="#/lesson/${next.id}"><div class="ln-text"><span>Next</span><b>${esc(next.topic)}</b></div>${art(next)}${icon('chevronRight', { size: 18 })}</a>` : ''}
  </nav>`;

  let cleanupFns = [];
  const mount = (root) => {
    const panel = $('#tabPanel', root);
    const tools = $('#tabTools', root);
    const heroArt = $('.lesson-hero .art', root);

    const onAudio = () => heroArt.classList.toggle('playing', player.lesson?.id === l.id && player.playing);
    player.audio.addEventListener('play', onAudio);
    player.audio.addEventListener('pause', onAudio);
    cleanupFns.push(() => { player.audio.removeEventListener('play', onAudio); player.audio.removeEventListener('pause', onAudio); });

    const doneBtn = $('#doneBtn', root);
    const renderDone = () => {
      const d = store.isDone(l.id);
      doneBtn.className = `btn ${d ? 'btn-success' : 'btn-secondary'} btn-lg btn-pill`;
      doneBtn.innerHTML = `${icon(d ? 'checkCircle' : 'circle', { size: 18 })}<span>${d ? 'Completed' : 'Mark complete'}</span>`;
      $('#doneChip', root).hidden = !d;
    };
    doneBtn.onclick = () => {
      const d = !store.isDone(l.id);
      store.setDone(l.id, d);
      if (d) {
        const r = doneBtn.getBoundingClientRect();
        confetti({ origin: { x: r.left + r.width / 2, y: r.top } });
        toast(`Lesson ${l.id} completed!`, { type: 'success', icon: 'trophy' });
      }
    };
    cleanupFns.push(store.on((t) => { if (t === 'completed' || t === 'import') renderDone(); }));

    const dlBtn = $('#dlBtn', root);
    offline.isDownloaded(l.id).then((yes) => { if (yes) { dlBtn.innerHTML = icon('cloudCheck', { size: 18 }); dlBtn.classList.add('on'); dlBtn.title = 'Available offline'; } }).catch(() => {});
    dlBtn.onclick = () => {
      if (dlBtn.classList.contains('on')) {
        menu(dlBtn, [{ header: 'Available offline' }, { label: 'Remove download', icon: 'trash', danger: true, onClick: async () => { await offline.remove(l.id); dlBtn.classList.remove('on'); dlBtn.innerHTML = icon('cloud', { size: 18 }); toast('Download removed'); } }], { align: 'end' });
        return;
      }
      downloadLesson(l.id, dlBtn);
    };

    const listText = () => l.collocations.map((c, i) => `${i + 1}. ${c.p}${c.m ? ` – ${c.m}` : ''}${c.e ? `\n   Example: ${c.e}` : ''}`).join('\n');
    $('#moreBtn', root).onclick = (e) => menu(e.currentTarget, [
      { label: 'Copy story text', icon: 'copy', onClick: async () => copyText((await loadStory(l.id)).plain, 'Story copied') },
      { label: 'Copy all collocations', icon: 'list', onClick: () => copyText(listText(), 'Collocations copied') },
      { label: 'Practice this lesson', icon: 'layers', onClick: () => { store.setPref('practiceSource', `lesson:${l.id}`); ctx.navigate('#/practice/quiz'); } },
      'sep',
      { label: 'Copy link', icon: 'link', onClick: () => copyText(`${location.origin}${location.pathname}#/lesson/${l.id}`, 'Link copied') },
      ...(navigator.share ? [{ label: 'Share…', icon: 'share', onClick: () => navigator.share({ title: `Lesson ${l.id} · ${l.topic}`, url: `${location.origin}${location.pathname}#/lesson/${l.id}` }).catch(() => {}) }] : []),
    ], { align: 'end' });

    // glassy background on the sticky tab bar once it sticks
    const tabsEl = $('#lessonTabs', root);
    const scroller = document.getElementById('viewScroll');
    const onScroll = () => {
      const top = tabsEl.getBoundingClientRect().top;
      const bar = document.getElementById('toolbar').getBoundingClientRect().bottom;
      tabsEl.classList.toggle('stuck', top <= bar + 1);
    };
    scroller.addEventListener('scroll', onScroll, { passive: true });
    cleanupFns.push(() => scroller.removeEventListener('scroll', onScroll));

    const renderTab = (t) => {
      stopPlayAll();
      closePopover();
      tab = t;
      history.replaceState(history.state, '', `#/lesson/${l.id}${t === 'story' ? '' : `/${t}`}`);
      panel.innerHTML = '';
      tools.innerHTML = '';
      const p = document.createElement('div');
      p.className = 'tab-panel';
      panel.appendChild(p);
      if (t === 'story') renderStory(p);
      else if (t === 'collocations') renderCollocations(p);
      else renderNotes(p);
    };

    const renderStory = async (p) => {
      tools.innerHTML = `
        <button class="icon-btn" id="tsDown" title="Smaller text" aria-label="Smaller text">${icon('type', { size: 14 })}</button>
        <button class="icon-btn" id="tsUp" title="Larger text" aria-label="Larger text">${icon('type', { size: 19 })}</button>
        <button class="icon-btn" id="storyCopy" title="Copy text" aria-label="Copy text">${icon('copy', { size: 16 })}</button>`;
      const setScale = (d) => { store.setPref('textScale', clamp(Math.round((store.prefs.textScale + d) * 100) / 100, 0.85, 1.4)); applyTheme(); };
      $('#tsDown', tools).onclick = () => setScale(-0.05);
      $('#tsUp', tools).onclick = () => setScale(0.05);
      p.innerHTML = `<div class="story">${[96, 88, 92, 70, 84, 90, 60].map((w) => `<div class="skeleton" style="height:16px;margin:16px 0;width:${w}%"></div>`).join('')}</div>`;
      try {
        const s = await loadStory(l.id);
        if (tab !== 'story' || !p.isConnected) return;
        p.innerHTML = `<div class="story">${s.html}</div>
          <p class="faint" style="margin-top:20px;font-size:13px;display:flex;align-items:center;gap:6px">${icon('info', { size: 14 })} Tap any highlighted phrase to hear it and see its meaning.</p>`;
        $$('.hl', p).forEach((b) => {
          const c = l.collocations.find((x) => x.p.toLowerCase() === b.dataset.phrase.toLowerCase());
          if (c && store.isFav(c.key)) b.classList.add('saved');
        });
        $('#storyCopy', tools).onclick = () => copyText(s.plain, 'Story copied');
      } catch {
        p.innerHTML = emptyState('wifiOff', 'Story unavailable', 'Connect to the internet or download this lesson for offline use.');
      }
      p.addEventListener('click', (e) => {
        const b = e.target.closest('.hl');
        if (b) showPhrase(b, b.dataset.phrase, l.id);
      });
      p.addEventListener('keydown', (e) => {
        const b = e.target.closest('.hl');
        if (b && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); e.stopPropagation(); showPhrase(b, b.dataset.phrase, l.id); }
      });
    };

    const renderCollocations = (p) => {
      const hide = store.prefs.hideMeanings;
      tools.innerHTML = `
        <button class="btn btn-ghost btn-sm" id="hideBtn" title="Hide meanings to test yourself">${icon(hide ? 'eye' : 'eyeOff', { size: 16 })}<span>${hide ? 'Show' : 'Quiz me'}</span></button>
        <button class="btn btn-ghost btn-sm" id="playAllBtn" title="Listen to all">${icon('speaker', { size: 16 })}<span>Listen all</span></button>
        <button class="icon-btn" id="copyAllBtn" title="Copy all" aria-label="Copy all">${icon('copy', { size: 16 })}</button>`;
      p.innerHTML = `${hide ? `<p class="faint" style="font-size:13px;margin-bottom:12px;display:flex;gap:6px;align-items:center">${icon('eyeOff', { size: 14 })} Meanings are hidden — tap a card to reveal it.</p>` : ''}
        <div class="colloc-list stagger ${hide ? 'hide-meanings' : ''}" id="collocList">${l.collocations.map((c, i) => collocCard(c, { n: i })).join('')}</div>`;
      const list = $('#collocList', p);
      list.addEventListener('click', (e) => {
        if (!list.classList.contains('hide-meanings') || e.target.closest('button')) return;
        e.target.closest('.colloc')?.classList.toggle('revealed');
      });
      $('#hideBtn', tools).onclick = () => { store.setPref('hideMeanings', !store.prefs.hideMeanings); stopPlayAll(); renderCollocations(p); };
      $('#copyAllBtn', tools).onclick = () => copyText(listText(), 'Collocations copied');
      const pab = $('#playAllBtn', tools);
      pab.onclick = () => {
        if (playAll) { stopPlayAll(); return; }
        if (player.playing) player.pause();
        playAll = { stopped: false, btn: pab };
        pab.classList.add('on');
        pab.innerHTML = `${icon('x', { size: 16 })}<span>Stop</span>`;
        const cards = $$('.colloc', list);
        const run = (i) => {
          if (!playAll || playAll.stopped) return;
          cards.forEach((c) => c.classList.remove('speaking'));
          if (i >= cards.length) { stopPlayAll(); return; }
          cards[i].classList.add('speaking');
          cards[i].scrollIntoView({ behavior: 'smooth', block: 'center' });
          speech.speak(l.collocations[i].p, { onend: () => setTimeout(() => run(i + 1), 450) });
        };
        run(0);
      };
    };

    const renderNotes = (p) => {
      tools.innerHTML = `
        <button class="btn btn-ghost btn-sm" id="insertBtn" title="Insert this lesson's collocations">${icon('list', { size: 16 })}<span>Insert list</span></button>
        <button class="icon-btn" id="copyNote" title="Copy notes" aria-label="Copy notes">${icon('copy', { size: 16 })}</button>
        <button class="icon-btn" id="clearNote" title="Clear notes" aria-label="Clear notes">${icon('trash', { size: 16 })}</button>`;
      p.innerHTML = `<div class="notes-wrap">
        <textarea class="textarea" id="noteArea" placeholder="Write your notes for this lesson…&#10;&#10;• New words and phrases&#10;• Your own example sentences&#10;• Things to review later" spellcheck="true" aria-label="Lesson notes">${esc(store.getNote(l.id))}</textarea>
        <div class="notes-meta"><span class="save-state" id="saveState"><span class="dot"></span><span>${store.getNote(l.id) ? 'Saved' : 'Notes save automatically'}</span></span><span id="noteCount"></span></div>
      </div>`;
      const ta = $('#noteArea', p);
      const st = $('#saveState', p);
      const count = () => {
        const words = ta.value.trim() ? ta.value.trim().split(/\s+/).length : 0;
        $('#noteCount', p).textContent = `${plural(words, 'word')} · ${plural(ta.value.length, 'character')}`;
      };
      const autosize = () => { ta.style.height = 'auto'; ta.style.height = `${Math.max(300, ta.scrollHeight + 4)}px`; };
      const save = debounce(() => {
        if (!ta.isConnected) return;
        store.setNote(l.id, ta.value);
        st.classList.remove('saving');
        st.lastElementChild.textContent = `Saved · ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      }, 600);
      ta.addEventListener('input', () => { st.classList.add('saving'); st.lastElementChild.textContent = 'Saving…'; count(); autosize(); save(); });
      count();
      requestAnimationFrame(autosize);
      $('#copyNote', tools).onclick = () => (ta.value.trim() ? copyText(ta.value, 'Notes copied') : toast('Nothing to copy yet'));
      $('#clearNote', tools).onclick = async () => {
        if (!ta.value.trim()) return;
        if (await confirmDialog({ title: 'Clear notes?', message: `Your notes for Lesson ${l.id} will be deleted.`, confirmLabel: 'Clear notes', danger: true })) {
          ta.value = ''; store.setNote(l.id, ''); count(); autosize(); toast('Notes cleared');
        }
      };
      $('#insertBtn', tools).onclick = () => {
        const list = l.collocations.map((c) => `• ${c.p}${c.m ? ` — ${c.m}` : ''}`).join('\n');
        ta.value = ta.value.trim() ? `${ta.value.trimEnd()}\n\n${list}\n` : `${list}\n`;
        ta.dispatchEvent(new Event('input'));
        ta.focus();
      };
      cleanupFns.push(() => { if (ta.isConnected || ta.value !== store.getNote(l.id)) { if (ta.value !== store.getNote(l.id)) store.setNote(l.id, ta.value); } });
    };

    segmented($('#lessonTabs .segmented', root), (v) => renderTab(v));
    renderTab(tab);
  };

  return {
    title: l.topic,
    backTo: { href: '#/lessons', label: 'Lessons' },
    html,
    mount,
    cleanup() { stopPlayAll(); cleanupFns.forEach((f) => f()); cleanupFns = []; },
  };
}

/* ==========================================================================
   Practice
   ========================================================================== */
function buildPool(source) {
  let items;
  if (source === 'done') items = data.lessons.filter((l) => store.isDone(l.id)).flatMap((l) => l.collocations);
  else if (source === 'saved') items = store.favorites.map(collocationByKey).filter(Boolean);
  else if (source?.startsWith('lesson:')) items = lessonById(source.slice(7))?.collocations || [];
  else items = data.all;
  return items.filter((c) => c.m);
}
function sourceSelect(value) {
  return `<select class="select" id="srcSelect" aria-label="Practice source">
    <option value="all" ${value === 'all' ? 'selected' : ''}>All lessons</option>
    <option value="done" ${value === 'done' ? 'selected' : ''}>Completed lessons (${store.completed.length})</option>
    <option value="saved" ${value === 'saved' ? 'selected' : ''}>Saved collocations (${store.favorites.length})</option>
    <optgroup label="Single lesson">${data.lessons.map((l) => `<option value="lesson:${l.id}" ${value === `lesson:${l.id}` ? 'selected' : ''}>${l.id}. ${esc(l.topic)}</option>`).join('')}</optgroup>
  </select>`;
}

function practice() {
  const p = store.practice;
  const acc = p.answered ? Math.round((p.correct / p.answered) * 100) : 0;
  const poolSize = buildPool(store.prefs.practiceSource).length;
  const html = `
  <div class="page-head">
    <div>
      <h1 class="page-title">Practice</h1>
      <p class="page-sub">Turn listening into lasting vocabulary with active recall.</p>
    </div>
  </div>

  <div class="card setup">
    <label>${icon('target', { size: 16 })} Practice from ${sourceSelect(store.prefs.practiceSource)}</label>
    <label>Questions <span id="countSeg">${segHTML([10, 20, 30].map((n) => ({ value: n, label: String(n) })), store.prefs.practiceCount)}</span></label>
    <span class="faint" id="poolInfo" style="font-size:13px">${plural(poolSize, 'collocation')} available</span>
  </div>

  <div class="mode-grid stagger">
    <a href="#/practice/flashcards" class="card card-interactive spot mode-card" style="--i:0">
      <span class="mode-icon grad-1">${icon('layers', { size: 24 })}</span>
      <div class="mc-text"><h3>Flashcards</h3><p>Flip cards, swipe right if you know it, left to keep learning.</p></div>
      <span class="go">Start ${icon('arrowRight', { size: 16 })}</span>
    </a>
    <a href="#/practice/quiz" class="card card-interactive spot mode-card" style="--i:1">
      <span class="mode-icon grad-2">${icon('zap', { size: 24 })}</span>
      <div class="mc-text"><h3>Meaning quiz</h3><p>Read the definition and pick the right collocation.</p></div>
      <span class="go">Start ${icon('arrowRight', { size: 16 })}</span>
    </a>
    <a href="#/practice/fill" class="card card-interactive spot mode-card" style="--i:2">
      <span class="mode-icon grad-3">${icon('pen', { size: 24 })}</span>
      <div class="mc-text"><h3>Fill the gap</h3><p>Complete real example sentences with the missing phrase.</p></div>
      <span class="go">Start ${icon('arrowRight', { size: 16 })}</span>
    </a>
  </div>

  <section class="section">
    <div class="section-head"><h2>Your progress</h2></div>
    <div class="stats" style="margin-top:0">
      <div class="card stat"><div class="stat-top"><span class="stat-icon tone-accent">${icon('target', { size: 18 })}</span></div><div><div class="stat-val"><span data-count="${p.answered}">0</span></div><div class="stat-label">Questions answered</div></div></div>
      <div class="card stat"><div class="stat-top">${ring(acc / 100, { size: 38, stroke: 4.5 })}</div><div><div class="stat-val"><span data-count="${acc}">0</span><small>%</small></div><div class="stat-label">Accuracy</div></div></div>
      <div class="card stat"><div class="stat-top"><span class="stat-icon tone-orange">${icon('flame', { size: 18 })}</span></div><div><div class="stat-val"><span data-count="${p.bestStreak}">0</span></div><div class="stat-label">Best answer streak</div></div></div>
      <div class="card stat"><div class="stat-top"><span class="stat-icon tone-green">${icon('trophy', { size: 18 })}</span></div><div><div class="stat-val"><span data-count="${store.mastered()}">0</span></div><div class="stat-label">Mastered collocations</div></div></div>
    </div>
  </section>`;

  return {
    title: 'Practice',
    html,
    refreshOn: ['import'],
    mount(root) {
      animateRings(root);
      countUp(root);
      $('#srcSelect', root).onchange = (e) => {
        store.setPref('practiceSource', e.target.value);
        $('#poolInfo', root).textContent = `${plural(buildPool(e.target.value).length, 'collocation')} available`;
      };
      segmented($('#countSeg .segmented', root), (v) => store.setPref('practiceCount', Number(v)));
    },
  };
}

function distractors(item, n, { exclude = '' } = {}) {
  const seen = new Set([item.p.toLowerCase()]);
  const bad = (c) => !c.p || !c.m || seen.has(c.p.toLowerCase())
    || item.m.toLowerCase().includes(c.p.toLowerCase())
    || c.m.toLowerCase() === item.m.toLowerCase()
    || (exclude && exclude.toLowerCase().includes(c.p.toLowerCase()));
  const out = [];
  for (const c of shuffle(lessonById(item.lessonId).collocations)) {
    if (out.length >= n) break;
    if (bad(c)) continue;
    seen.add(c.p.toLowerCase());
    out.push(c);
  }
  let guard = 0;
  while (out.length < n && guard++ < 500) {
    const c = data.all[Math.floor(Math.random() * data.all.length)];
    if (bad(c)) continue;
    seen.add(c.p.toLowerCase());
    out.push(c);
  }
  return out;
}

function session({ mode }, ctx) {
  const MODES = { flashcards: 'Flashcards', quiz: 'Meaning quiz', fill: 'Fill the gap' };
  if (!MODES[mode]) return notFound();
  const source = store.prefs.practiceSource;
  let pool = buildPool(source);
  if (mode === 'fill') pool = pool.filter((c) => c.e && c.e.toLowerCase().includes(c.p.toLowerCase()));
  const count = Math.min(store.prefs.practiceCount, pool.length);

  const base = { title: MODES[mode], backTo: { href: '#/practice', label: 'Practice' } };
  if (pool.length < (mode === 'flashcards' ? 1 : 2)) {
    const why = source === 'saved' ? 'Save some collocations first — tap the star on any collocation.'
      : source === 'done' ? 'Complete a few lessons first, or practice from all lessons.'
        : 'This source has too few examples for this mode. Try another source.';
    return { ...base, html: emptyState('layers', 'Not enough collocations', why, '<a class="btn btn-primary btn-pill" href="#/practice">Choose another source</a>') };
  }

  // weight toward collocations you haven't mastered yet
  const items = shuffle(pool)
    .map((c) => ({ c, w: (store.known[c.key] || 0) + Math.random() * 2 }))
    .sort((a, b) => a.w - b.w)
    .slice(0, count)
    .map((x) => x.c);
  const questions = items.map((item) => ({ item, options: mode === 'flashcards' ? null : shuffle([item, ...distractors(item, 3, { exclude: mode === 'fill' ? item.e : '' })]) }));
  const st = { i: 0, correct: 0, streak: 0, best: 0, wrong: [], answered: false, start: Date.now(), keyHandler: null, timer: null };

  const html = `<div class="session">
    <div class="session-top">
      <a class="icon-btn round" href="#/practice" aria-label="End session">${icon('x', { size: 20 })}</a>
      <div class="bar"><i id="sessBar" style="width:0%"></i></div>
      ${mode !== 'flashcards' ? `<span class="streak-pill" id="streakPill">${icon('flame', { size: 14 })}<span>0</span></span>` : ''}
      <span class="counter" id="sessCounter">1/${questions.length}</span>
    </div>
    <div id="stage"></div>
  </div>`;

  const mount = (root) => {
    const stage = $('#stage', root);
    const updateTop = (bump) => {
      $('#sessBar', root).style.width = `${(Math.min(st.i + (st.answered ? 1 : 0), questions.length) / questions.length) * 100}%`;
      $('#sessCounter', root).textContent = `${Math.min(st.i + 1, questions.length)}/${questions.length}`;
      const sp = $('#streakPill', root);
      if (sp) { sp.lastElementChild.textContent = st.streak; if (bump) { sp.classList.remove('bump'); void sp.offsetWidth; sp.classList.add('bump'); } }
    };
    const record = (q, ok) => {
      store.recordAnswer(q.item.key, ok);
      if (ok) { st.correct++; st.streak++; st.best = Math.max(st.best, st.streak); } else { st.streak = 0; st.wrong.push(q.item); }
    };
    const advance = () => {
      clearTimeout(st.timer);
      st.i++;
      st.answered = false;
      updateTop();
      if (st.i >= questions.length) finish(); else render();
    };

    const renderFlash = () => {
      const q = questions[st.i];
      const c = q.item;
      const l = lessonById(c.lessonId);
      stage.innerHTML = `
        <div class="flash-stage">
          ${st.i + 1 < questions.length ? '<div class="flashcard behind"><div class="flip"><div class="face front"></div></div></div>' : ''}
          <div class="flashcard pop-in" id="fc" tabindex="0" aria-label="Flashcard: ${esc(c.p)}. Press space to flip.">
            <span class="flash-stamp know" id="stKnow">Got it</span><span class="flash-stamp learn" id="stLearn">Learning</span>
            <div class="flip">
              <div class="face front">
                <span class="fc-tag">${emojiImg(l)} Lesson ${l.id}</span>
                <button class="icon-btn round fc-speak" data-speak="${esc(c.p)}" aria-label="Pronounce">${icon('speaker', { size: 18 })}</button>
                <div class="fc-phrase">${esc(c.p)}</div>
                <div class="fc-hint">${icon('repeat', { size: 14 })} ${isMobile() ? 'Tap to flip · swipe to answer' : 'Click or press Space to flip'}</div>
              </div>
              <div class="face back">
                <span class="fc-tag">${esc(c.p)}</span>
                <div class="fc-meaning">${esc(c.m)}</div>
                ${c.e ? `<div class="fc-example">“${markPhrase(c.e, c.p)}”</div>` : ''}
              </div>
            </div>
          </div>
        </div>
        <div class="flash-actions">
          <button class="btn btn-secondary btn-xl" id="fcLearn" style="color:#f97316">${icon('repeat', { size: 18 })} Still learning</button>
          <button class="btn btn-xl" id="fcKnow" style="background:var(--success);color:#fff">${icon('check', { size: 18, stroke: 2.6 })} Got it</button>
        </div>
        ${isMobile() ? '' : '<p class="faint" style="text-align:center;font-size:12.5px;margin-top:14px">Shortcuts: <kbd>Space</kbd> flip · <kbd>←</kbd> still learning · <kbd>→</kbd> got it</p>'}`;
      const fc = $('#fc', stage);
      const stKnow = $('#stKnow', stage);
      const stLearn = $('#stLearn', stage);
      const decide = (known) => {
        if (st.answered) return;
        st.answered = true;
        record(q, known);
        updateTop();
        haptic(known ? 14 : 8);
        fc.classList.remove('pop-in');
        fc.style.transform = `translateX(${known ? 130 : -130}%) rotate(${known ? 18 : -18}deg)`;
        fc.style.opacity = '0';
        st.timer = setTimeout(advance, 320);
      };
      let sx = null; let dx = 0; let moved = false;
      fc.addEventListener('pointerdown', (e) => {
        if (e.target.closest('button')) return;
        sx = e.clientX; dx = 0; moved = false;
        fc.classList.remove('pop-in');
        fc.classList.add('dragging');
        fc.setPointerCapture(e.pointerId);
      });
      fc.addEventListener('pointermove', (e) => {
        if (sx == null) return;
        dx = e.clientX - sx;
        if (Math.abs(dx) > 6) moved = true;
        fc.style.transform = `translateX(${dx}px) rotate(${dx / 18}deg)`;
        stKnow.style.opacity = clamp(dx / 100, 0, 1);
        stLearn.style.opacity = clamp(-dx / 100, 0, 1);
      });
      const end = () => {
        if (sx == null) return;
        sx = null;
        fc.classList.remove('dragging');
        if (Math.abs(dx) > 110) decide(dx > 0);
        else { fc.style.transform = ''; stKnow.style.opacity = 0; stLearn.style.opacity = 0; if (!moved) fc.classList.toggle('flipped'); }
      };
      fc.addEventListener('pointerup', end);
      fc.addEventListener('pointercancel', end);
      $('#fcKnow', stage).onclick = () => decide(true);
      $('#fcLearn', stage).onclick = () => decide(false);
      st.keyHandler = (e) => {
        if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); fc.classList.toggle('flipped'); }
        else if (e.key === 'ArrowRight') { e.preventDefault(); decide(true); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); decide(false); }
      };
    };

    const renderChoice = () => {
      const q = questions[st.i];
      const c = q.item;
      const prompt = mode === 'quiz'
        ? `<div class="q-label">Which collocation means…</div><div class="q-text">“${esc(c.m)}”</div>`
        : `<div class="q-label">Complete the sentence</div><div class="q-text">${esc(c.e).replace(new RegExp(escRe(esc(c.p)), 'i'), (m) => `<span class="blank" id="blank">${m}</span>`)}</div>`;
      stage.innerHTML = `
        <div class="question pop-in">${prompt}</div>
        <div class="options stagger">${q.options.map((o, i) => `<button class="option" data-opt="${i}" style="--i:${i}"><span class="key">${i + 1}</span><span>${esc(o.p)}</span></button>`).join('')}</div>
        <div id="feedback"></div>
        <div class="session-foot"><button class="btn btn-primary btn-lg btn-pill" id="nextBtn" hidden>${st.i + 1 < questions.length ? 'Continue' : 'See results'} ${icon('arrowRight', { size: 17 })}</button></div>`;
      const choose = (idx) => {
        if (st.answered) return;
        st.answered = true;
        const ok = q.options[idx] === c;
        record(q, ok);
        $$('.option', stage).forEach((b, i) => {
          b.disabled = true;
          if (q.options[i] === c) { b.classList.add('correct'); b.insertAdjacentHTML('beforeend', `<span class="opt-icon" style="color:var(--success)">${icon('checkCircle', { size: 20 })}</span>`); }
          else if (i === idx) { b.classList.add('wrong', 'shake'); b.insertAdjacentHTML('beforeend', `<span class="opt-icon" style="color:var(--danger)">${icon('x', { size: 20 })}</span>`); }
          else b.classList.add('dim');
        });
        $('#blank', stage)?.classList.add('revealed');
        haptic(ok ? 12 : 30);
        speech.speak(c.p);
        updateTop(true);
        $('#feedback', stage).innerHTML = `<div class="feedback ${ok ? 'good' : 'bad'}">
          <span style="color:${ok ? 'var(--success)' : 'var(--danger)'}">${icon(ok ? 'checkCircle' : 'alert', { size: 22 })}</span>
          <div class="fb-main"><b>${ok ? ['Correct!', 'Nice!', 'Exactly!', 'Well done!'][Math.floor(Math.random() * 4)] : `Answer: ${esc(c.p)}`}</b><p>${mode === 'quiz' && c.e ? markPhrase(c.e, c.p) : esc(c.m)}</p></div>
          <button class="icon-btn" data-speak="${esc(c.p)}" aria-label="Pronounce">${icon('speaker', { size: 17 })}</button>
        </div>`;
        const nb = $('#nextBtn', stage);
        nb.hidden = false;
        nb.onclick = advance;
        if (ok) st.timer = setTimeout(advance, 1500);
        else nb.focus({ preventScroll: true });
      };
      $$('.option', stage).forEach((b) => { b.onclick = () => choose(Number(b.dataset.opt)); });
      st.keyHandler = (e) => {
        const n = Number(e.key);
        if (n >= 1 && n <= q.options.length) { e.preventDefault(); choose(n - 1); }
        else if (e.key === 'Enter' && st.answered) { e.preventDefault(); advance(); }
      };
    };

    const render = () => (mode === 'flashcards' ? renderFlash() : renderChoice());

    const finish = () => {
      st.keyHandler = null;
      store.finishSession(st.best);
      const total = questions.length;
      const pct = Math.round((st.correct / total) * 100);
      const secs = Math.round((Date.now() - st.start) / 1000);
      const headline = pct >= 90 ? 'Outstanding! 🏆' : pct >= 70 ? 'Great job! 🎉' : pct >= 50 ? 'Good effort 💪' : 'Keep practicing 🌱';
      $('.session-top', root)?.remove();
      stage.innerHTML = `
        <div class="summary">
          ${ring(pct / 100, { size: 140, stroke: 12, label: `<span style="font-size:30px;font-weight:800">${pct}%</span>` })}
          <h2>${headline}</h2>
          <p class="muted">${mode === 'flashcards' ? `You knew ${st.correct} of ${total} cards.` : `You answered ${st.correct} of ${total} correctly.`}</p>
          <div class="sum-stats">
            <div><b>${st.correct}/${total}</b><span>${mode === 'flashcards' ? 'Known' : 'Correct'}</span></div>
            <div><b>${mode === 'flashcards' ? total - st.correct : st.best}</b><span>${mode === 'flashcards' ? 'To review' : 'Best streak'}</span></div>
            <div><b>${fmtTime(secs)}</b><span>Time</span></div>
          </div>
          <div class="sum-actions">
            <button class="btn btn-primary btn-lg btn-pill" id="againBtn">${icon('repeat', { size: 17 })} Practice again</button>
            <a class="btn btn-secondary btn-lg btn-pill" href="#/practice">Done</a>
          </div>
          ${st.wrong.length ? `<div class="review-list"><div class="section-head"><h2>Review these</h2><span class="faint">${plural(st.wrong.length, 'collocation')}</span></div><div class="colloc-list stagger">${st.wrong.map((c, i) => collocCard(c, { n: i, showLesson: true })).join('')}</div></div>` : ''}
        </div>`;
      animateRings(stage);
      $('#againBtn', stage).onclick = () => ctx.refresh({ animate: true });
      if (pct >= 70) setTimeout(() => confetti(), 250);
    };

    const onKey = (e) => {
      if (e.target.closest?.('input, textarea, select') || e.metaKey || e.ctrlKey || e.altKey) return;
      if (document.querySelector('.sheet.open, .cmdk, .menu')) return;
      st.keyHandler?.(e);
    };
    document.addEventListener('keydown', onKey);
    st.cleanup = () => { clearTimeout(st.timer); document.removeEventListener('keydown', onKey); speech.stop(); };
    render();
  };

  return { ...base, html, mount, cleanup: () => st.cleanup?.(), handlesKeys: true };
}

/* ==========================================================================
   Saved
   ========================================================================== */
function saved(_, ctx) {
  const items = store.favorites.map(collocationByKey).filter(Boolean);
  const groups = new Map();
  items.forEach((c) => { if (!groups.has(c.lessonId)) groups.set(c.lessonId, []); groups.get(c.lessonId).push(c); });
  const html = `
  <div class="page-head">
    <div>
      <h1 class="page-title">Saved</h1>
      <p class="page-sub">${items.length ? `${plural(items.length, 'collocation')} in your personal collection.` : 'Your personal collection of collocations.'}</p>
    </div>
    ${items.length ? `<div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn btn-secondary btn-pill" id="copySaved">${icon('copy', { size: 16 })} Copy</button>
      <button class="btn btn-primary btn-pill" id="practiceSaved">${icon('layers', { size: 16 })} Practice saved</button>
    </div>` : ''}
  </div>
  ${items.length ? [...groups.entries()].sort((a, b) => a[0] - b[0]).map(([id, list]) => {
    const l = lessonById(id);
    return `<section class="saved-group"><h3>${art(l)}<a href="#/lesson/${l.id}/collocations">Lesson ${l.id} · ${esc(l.topic)}</a><span class="faint" style="font-weight:500;font-size:13px">${list.length}</span></h3>
      <div class="colloc-list stagger">${list.map((c) => collocCard(c, { n: c.idx })).join('')}</div></section>`;
  }).join('') : emptyState('star', 'No saved collocations yet', 'Tap the star on any collocation to collect it here for quick review and practice.', '<a class="btn btn-primary btn-pill" href="#/lessons">Browse lessons</a>')}`;

  return {
    title: 'Saved',
    html,
    refreshOn: ['favorites', 'import'],
    mount(root) {
      const ps = $('#practiceSaved', root);
      if (ps) ps.onclick = () => { store.setPref('practiceSource', 'saved'); ctx.navigate('#/practice/flashcards'); };
      const cs = $('#copySaved', root);
      if (cs) cs.onclick = () => copyText(items.map((c) => `${c.p}${c.m ? ` – ${c.m}` : ''}`).join('\n'), 'Saved collocations copied');
    },
  };
}

/* ==========================================================================
   Settings
   ========================================================================== */
const dl = { running: false, done: 0, total: 0, ctrl: null };

function settings(_, ctx) {
  const pr = store.prefs;
  const v = store.voice;
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const chev = icon('chevronRight', { size: 16 });

  const html = `
  <div class="page-head"><div><h1 class="page-title">Settings</h1><p class="page-sub">Make the app yours.</p></div></div>
  <div class="settings">

    <section>
      <div class="group-title">Appearance</div>
      <div class="group">
        <div class="row"><span class="row-icon bg-indigo">${icon('sun', { size: 17 })}</span><div class="row-main"><b>Theme</b></div>
          <div class="row-end" id="themeSeg">${segHTML([{ value: 'system', icon: 'monitor', label: isMobile() ? '' : 'Auto' }, { value: 'light', icon: 'sun', label: isMobile() ? '' : 'Light' }, { value: 'dark', icon: 'moon', label: isMobile() ? '' : 'Dark' }], pr.theme)}</div></div>
        <div class="row stack"><div style="display:flex;align-items:center;gap:12px"><span class="row-icon bg-pink">${icon('sparkles', { size: 17 })}</span><div class="row-main"><b>Accent color</b></div></div>
          <div class="swatches" style="padding-left:42px">${Object.entries(ACCENTS).map(([k, c]) => `<button class="swatch ${pr.accent === k ? 'active' : ''}" data-accent="${k}" style="--c:${c}" aria-label="${k}" title="${k[0].toUpperCase()}${k.slice(1)}"></button>`).join('')}</div></div>
        <div class="row stack"><div style="display:flex;align-items:center;gap:12px"><span class="row-icon bg-blue">${icon('type', { size: 17 })}</span><div class="row-main"><b>Reading text size</b><span>Applies to lesson stories and notes</span></div></div>
          <div class="slider-row" style="padding-left:42px"><span style="font-size:13px">A</span><input type="range" class="range" id="textScale" min="0.85" max="1.4" step="0.05" value="${pr.textScale}" aria-label="Text size"><span style="font-size:19px">A</span><span class="val" id="textScaleVal">${Math.round(pr.textScale * 100)}%</span></div></div>
      </div>
    </section>

    <section>
      <div class="group-title">Playback</div>
      <div class="group">
        <div class="row"><span class="row-icon bg-orange">${icon('gauge', { size: 17 })}</span><div class="row-main"><b>Playback speed</b></div>
          <div class="row-end"><select class="select" id="speedSel" aria-label="Playback speed">${[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map((r) => `<option value="${r}" ${pr.speed === r ? 'selected' : ''}>${r}×${r === 1 ? ' (normal)' : ''}</option>`).join('')}</select></div></div>
        <div class="row"><span class="row-icon bg-teal">${icon('fwd10', { size: 17 })}</span><div class="row-main"><b>Skip interval</b></div>
          <div class="row-end" id="skipSeg">${segHTML([5, 10, 15, 30].map((s) => ({ value: s, label: `${s}s` })), pr.skip)}</div></div>
        <div class="row"><span class="row-icon bg-green">${icon('checkCircle', { size: 17 })}</span><div class="row-main"><b>Complete when finished</b><span>Mark a lesson complete when its audio ends</span></div><div class="row-end">${switchHTML('autoComplete', pr.autoComplete, 'Complete when finished')}</div></div>
        <div class="row"><span class="row-icon bg-purple">${icon('next', { size: 17 })}</span><div class="row-main"><b>Auto-play next lesson</b></div><div class="row-end">${switchHTML('autoNext', pr.autoNext, 'Auto-play next lesson')}</div></div>
        <div class="row"><span class="row-icon bg-blue">${icon('clock', { size: 17 })}</span><div class="row-main"><b>Resume where I left off</b></div><div class="row-end">${switchHTML('resume', pr.resume, 'Resume where I left off')}</div></div>
      </div>
    </section>

    <section>
      <div class="group-title">Pronunciation voice</div>
      <div class="group">
        ${speech.supported ? `
        <div class="row"><span class="row-icon bg-pink">${icon('speaker', { size: 17 })}</span><div class="row-main"><b>Voice</b></div>
          <div class="row-end" style="max-width:62%"><select class="select" id="voiceSel" aria-label="Voice"></select></div></div>
        ${[['rate', 'Speed', 0.5, 1.5], ['pitch', 'Pitch', 0.5, 1.5], ['volume', 'Volume', 0, 1]].map(([k, label, min, max]) => `
        <div class="row no-icon"><div class="row-main" style="flex:0 0 72px"><b>${label}</b></div>
          <div class="slider-row"><input type="range" class="range" data-voice="${k}" min="${min}" max="${max}" step="0.05" value="${v[k]}" aria-label="Voice ${label}"><span class="val" data-voice-val="${k}">${Number(v[k]).toFixed(2)}</span></div></div>`).join('')}
        <div class="row no-icon" style="gap:10px"><button class="btn btn-tinted" id="testVoice">${icon('play', { size: 14 })} Test voice</button><button class="btn btn-ghost" id="resetVoice">Reset</button></div>
        ` : `<div class="row"><span class="row-icon bg-gray">${icon('alert', { size: 17 })}</span><div class="row-main"><b>Not supported</b><span>This browser doesn't support speech synthesis.</span></div></div>`}
      </div>
    </section>

    <section>
      <div class="group-title">Offline listening</div>
      <div class="group">
        <div class="row stack">
          <div style="display:flex;align-items:center;gap:12px"><span class="row-icon bg-blue">${icon('cloud', { size: 17 })}</span>
            <div class="row-main"><b>Download lessons</b><span id="dlInfo">Checking…</span></div>
            <div class="row-end" id="dlActions"></div></div>
          <div class="dl-progress" id="dlProgress" ${dl.running ? '' : 'hidden'} style="padding-left:42px"><div class="bar"><i id="dlBar" style="width:${dl.total ? (dl.done / dl.total) * 100 : 0}%"></i></div><div class="dl-meta"><span id="dlText">${dl.done} / ${dl.total}</span><span>About 225 MB in total</span></div></div>
        </div>
      </div>
      <div class="group-foot">Audio, stories and collocations are stored on this device so you can learn without a connection.</div>
    </section>

    <section>
      <div class="group-title">Your data</div>
      <div class="group">
        <button class="row" id="exportBtn"><span class="row-icon bg-green">${icon('download', { size: 17 })}</span><div class="row-main"><b>Export backup</b><span>Progress, notes, saved items and settings</span></div><span class="row-end">${chev}</span></button>
        <button class="row" id="importBtn"><span class="row-icon bg-blue">${icon('upload', { size: 17 })}</span><div class="row-main"><b>Import backup</b><span>Restore from a .json file</span></div><span class="row-end">${chev}</span></button>
        <button class="row" id="markAllBtn"><span class="row-icon bg-purple">${icon('checkCircle', { size: 17 })}</span><div class="row-main"><b>Mark all lessons complete</b></div><span class="row-end">${chev}</span></button>
        <button class="row danger" id="resetBtn"><span class="row-icon bg-red">${icon('trash', { size: 17 })}</span><div class="row-main"><b>Reset progress</b><span>Notes and saved collocations are kept</span></div></button>
      </div>
      <input type="file" id="importFile" accept="application/json,.json" hidden>
    </section>

    <section>
      <div class="group-title">App</div>
      <div class="group">
        ${!standalone && ctx.install.available() ? `<button class="row" id="installBtn"><span class="row-icon bg-indigo">${icon('smartphone', { size: 17 })}</span><div class="row-main"><b>Install app</b><span>Add to your home screen or dock for a native experience</span></div><span class="row-end">${chev}</span></button>` : ''}
        ${!standalone && !ctx.install.available() && isIOS ? `<div class="row"><span class="row-icon bg-indigo">${icon('smartphone', { size: 17 })}</span><div class="row-main"><b>Install on iPhone / iPad</b><span>In Safari tap Share, then “Add to Home Screen”.</span></div></div>` : ''}
        <button class="row desktop-only" id="shortcutsBtn"><span class="row-icon bg-gray">${icon('keyboard', { size: 17 })}</span><div class="row-main"><b>Keyboard shortcuts</b></div><span class="row-end"><kbd>?</kbd>${chev}</span></button>
        <a class="row" href="collocations.pdf" target="_blank" rel="noopener"><span class="row-icon bg-red">${icon('file', { size: 17 })}</span><div class="row-main"><b>Complete guide (PDF)</b><span>All lessons in one printable document</span></div><span class="row-end">${icon('external', { size: 16 })}</span></a>
        <div class="row"><span class="row-icon bg-orange">${icon('headphones', { size: 17 })}</span><div class="row-main"><b>English Collocations</b><span>${data.lessons.length} audio lessons · ${data.totalCollocations.toLocaleString()} collocations · Version 2.0</span></div></div>
      </div>
    </section>
  </div>`;

  let unsub = [];
  const mount = (root) => {
    segmented($('#themeSeg .segmented', root), (val) => { store.setPref('theme', val); applyTheme(); });
    segmented($('#skipSeg .segmented', root), (val) => store.setPref('skip', Number(val)));
    $$('[data-accent]', root).forEach((b) => {
      b.onclick = () => {
        store.setPref('accent', b.dataset.accent);
        applyTheme();
        $$('[data-accent]', root).forEach((x) => x.classList.toggle('active', x === b));
      };
    });
    const ts = $('#textScale', root);
    setRangeFill(ts);
    ts.oninput = () => { setRangeFill(ts); store.setPref('textScale', Number(ts.value)); applyTheme(); $('#textScaleVal', root).textContent = `${Math.round(ts.value * 100)}%`; };
    $('#speedSel', root).onchange = (e) => player.setRate(Number(e.target.value));
    $$('input[data-pref]', root).forEach((inp) => { inp.onchange = () => { store.setPref(inp.dataset.pref, inp.checked); haptic(6); }; });

    if (speech.supported) {
      const sel = $('#voiceSel', root);
      const fillVoices = () => {
        const list = speech.englishVoices().length ? speech.englishVoices() : speech.voices;
        const cur = speech.pickVoice();
        sel.innerHTML = list.length ? list.map((vv) => `<option value="${esc(vv.voiceURI)}" ${cur?.voiceURI === vv.voiceURI ? 'selected' : ''}>${esc(vv.name)} (${esc(vv.lang)})</option>`).join('') : '<option>Default voice</option>';
      };
      fillVoices();
      unsub.push(store.on((t) => t === 'voices' && fillVoices()));
      sel.onchange = () => { store.setVoice({ voiceURI: sel.value, voiceIndex: -1 }); speech.speak('Hello! This is my new voice.'); };
      $$('[data-voice]', root).forEach((r) => {
        setRangeFill(r);
        r.oninput = () => { setRangeFill(r); store.setVoice({ [r.dataset.voice]: Number(r.value) }); $(`[data-voice-val="${r.dataset.voice}"]`, root).textContent = Number(r.value).toFixed(2); };
      });
      $('#testVoice', root).onclick = () => speech.speak("Practice makes perfect. Let's learn some collocations!");
      $('#resetVoice', root).onclick = () => { store.setVoice({ rate: 1, pitch: 1, volume: 1, voiceURI: '', voiceIndex: -1 }); ctx.refresh(); toast('Voice settings reset'); };
    }

    const renderDl = async () => {
      const info = $('#dlInfo', root);
      const actions = $('#dlActions', root);
      if (!info?.isConnected) return;
      if (!offline.supported) { info.textContent = 'Not supported in this browser'; return; }
      const ids = await offline.downloadedIds();
      const est = await offline.estimate();
      info.textContent = `${ids.size} of ${data.lessons.length} lessons downloaded${est?.usage ? ` · ${(est.usage / 1048576).toFixed(0)} MB used` : ''}`;
      actions.innerHTML = dl.running
        ? '<button class="btn btn-secondary btn-sm" id="dlCancel">Cancel</button>'
        : `${ids.size ? `<button class="icon-btn" id="dlClear" title="Remove downloads" aria-label="Remove downloads">${icon('trash', { size: 16 })}</button>` : ''}${ids.size < data.lessons.length ? `<button class="btn btn-primary btn-sm" id="dlAll">${icon('download', { size: 15 })} ${ids.size ? 'Download rest' : 'Download all'}</button>` : `<span class="chip success">${icon('check', { size: 13, stroke: 3 })} All offline</span>`}`;
      const all = $('#dlAll', actions);
      if (all) all.onclick = async () => {
        try { await navigator.storage?.persist?.(); } catch { /* optional */ }
        const todo = data.lessons.map((l) => l.id).filter((id) => !ids.has(id));
        Object.assign(dl, { running: true, done: 0, total: todo.length, ctrl: new AbortController() });
        $('#dlProgress', root).hidden = false;
        renderDl();
        const res = await offline.download(todo, {
          signal: dl.ctrl.signal,
          onProgress: (d, t) => {
            dl.done = d; dl.total = t;
            const bar = document.getElementById('dlBar');
            if (bar) { bar.style.width = `${(d / t) * 100}%`; document.getElementById('dlText').textContent = `${d} / ${t}`; }
          },
        });
        const cancelled = dl.ctrl.signal.aborted;
        dl.running = false;
        document.getElementById('dlProgress')?.setAttribute('hidden', '');
        if (cancelled) toast('Download cancelled');
        else if (res.failed) toast(`${res.failed} lessons failed to download`, { type: 'error' });
        else { toast('All lessons are available offline', { type: 'success', icon: 'cloudCheck' }); confetti({ count: 80 }); }
        renderDl();
      };
      const cancel = $('#dlCancel', actions);
      if (cancel) cancel.onclick = () => dl.ctrl?.abort();
      const clear = $('#dlClear', actions);
      if (clear) clear.onclick = async () => {
        if (await confirmDialog({ title: 'Remove downloads?', message: 'Downloaded audio will be deleted from this device. You can download it again any time.', confirmLabel: 'Remove', danger: true })) {
          await offline.clear(); toast('Downloads removed'); renderDl();
        }
      };
    };
    renderDl();

    $('#exportBtn', root).onclick = () => {
      const blob = new Blob([JSON.stringify(store.export(), null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `english-collocations-backup-${todayKey()}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      toast('Backup exported', { type: 'success', icon: 'download' });
    };
    const file = $('#importFile', root);
    $('#importBtn', root).onclick = () => file.click();
    file.onchange = async () => {
      const f = file.files[0];
      file.value = '';
      if (!f) return;
      try {
        const obj = JSON.parse(await f.text());
        if (!obj || !Array.isArray(obj.completedLessons)) throw new Error('Not a valid backup file');
        if (!(await confirmDialog({ title: 'Import backup?', message: 'This replaces your current progress, notes and saved collocations with the backup.', confirmLabel: 'Import' }))) return;
        store.import(obj);
        applyTheme();
        toast('Backup restored', { type: 'success' });
        ctx.refresh();
      } catch (e) {
        toast(e instanceof SyntaxError ? 'That file is not valid JSON' : (e.message || 'Could not read that file'), { type: 'error' });
      }
    };
    $('#markAllBtn', root).onclick = async () => {
      if (await confirmDialog({ title: 'Mark all complete?', message: `All ${data.lessons.length} lessons will be marked as completed.`, confirmLabel: 'Mark all' })) {
        store.setAllDone(true); confetti(); toast('All lessons marked complete', { type: 'success' });
      }
    };
    $('#resetBtn', root).onclick = async () => {
      if (await confirmDialog({ title: 'Reset progress?', message: 'Completed lessons, listening positions, streak and practice stats will be cleared. Notes and saved collocations are kept.', confirmLabel: 'Reset', danger: true })) {
        store.resetProgress(); toast('Progress reset');
      }
    };
    const ib = $('#installBtn', root);
    if (ib) ib.onclick = () => ctx.install.prompt();
    const sb = $('#shortcutsBtn', root);
    if (sb) sb.onclick = () => ctx.openShortcuts();
  };

  return {
    title: 'Settings',
    html,
    mount,
    cleanup() { unsub.forEach((f) => f()); unsub = []; },
  };
}

/* ==========================================================================
   404
   ========================================================================== */
function notFound() {
  return {
    title: 'Not found',
    html: emptyState('search', 'Page not found', "We couldn't find what you were looking for.", '<a class="btn btn-primary btn-pill" href="#/">Go home</a>'),
  };
}

export const views = { home, lessons, lesson, practice, session, saved, settings, notFound };
