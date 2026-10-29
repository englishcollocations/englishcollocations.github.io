import { icon } from './icons.js';
import {
  $, $$, esc, data, store, loadData, applyTheme, speech, ring, animateRings, toast, sheet, closeMenu, closePopover,
  topSheet, menu, modKey, lessonById, haptic, debounce, emojiImg,
} from './core.js';
import { player, playIcon, sync, initPlayerControls } from './player.js';
import { views, initGlobalActions } from './views.js';

const TABS = [
  { id: 'home', href: '#/', label: 'Home', icon: 'home' },
  { id: 'lessons', href: '#/lessons', label: 'Lessons', icon: 'book' },
  { id: 'practice', href: '#/practice', label: 'Practice', icon: 'layers' },
  { id: 'saved', href: '#/saved', label: 'Saved', icon: 'star' },
  { id: 'settings', href: '#/settings', label: 'Settings', icon: 'settings' },
];

let current = { route: null, view: null };
let deferredInstall = null;

const ctx = {
  navigate(hash) { if (location.hash === hash) render(parse(hash)); else location.hash = hash; },
  refresh(opts = {}) { if (current.route) render(current.route, { keepScroll: !opts.animate, animate: !!opts.animate }); },
  openShortcuts,
  openSearch,
  install: {
    available: () => !!deferredInstall,
    async prompt() {
      if (!deferredInstall) return;
      deferredInstall.prompt();
      const { outcome } = await deferredInstall.userChoice;
      deferredInstall = null;
      if (outcome === 'accepted') toast('Installing English Collocations…', { type: 'success', icon: 'smartphone' });
    },
  },
};

/* ==========================================================================
   Shell
   ========================================================================== */
function shellHTML() {
  const tl = (cls, act, label, glyph) => `<button class="${cls}" data-act="${act}" title="${label}" aria-label="${label}">${icon(glyph, { size: 8, stroke: 3.2 })}</button>`;
  return `
  <div class="wallpaper"></div>
  <div class="window ${store.prefs.sidebar ? '' : 'sidebar-collapsed'} ${store.prefs.zoomed ? 'zoomed' : ''}" id="window">
    <aside class="sidebar" aria-label="Sidebar">
      <div class="sidebar-inner">
        <div class="titlebar">
          <div class="traffic">${tl('t-close', 'stop', 'Stop playback', 'x')}${tl('t-min', 'sidebar', 'Hide sidebar', 'chevronLeft')}${tl('t-zoom', 'zoom', 'Zoom window', 'arrowRight')}</div>
        </div>
        <button class="sidebar-search" data-act="search">${icon('search', { size: 15 })}<span>Search</span><kbd>${modKey}K</kbd></button>
        <div class="side-scroll scroll">
          <nav class="side-nav" id="sideNav" aria-label="Sections">
            <span class="side-highlight" id="sideHighlight"></span>
            ${TABS.map((t) => `<a class="side-item" href="${t.href}" data-tab="${t.id}">${icon(t.icon, { size: 17 })}<span>${t.label}</span>${t.id === 'saved' ? '<span class="count" id="savedCount"></span>' : ''}</a>`).join('')}
          </nav>
          <div class="side-section">
            <div class="side-label"><span>Lessons</span><span id="sideCount"></span></div>
            <div class="side-lessons" id="sideLessons"></div>
          </div>
        </div>
        <div class="side-footer"><a class="progress-card" href="#/lessons" id="progressCard"></a></div>
      </div>
    </aside>

    <main class="main">
      <header class="toolbar" id="toolbar">
        <div class="tb-left desktop-only">
          <button class="icon-btn" data-act="sidebar" title="Toggle sidebar  [" aria-label="Toggle sidebar">${icon('sidebar', { size: 18 })}</button>
          <button class="icon-btn" data-act="back" title="Back" aria-label="Back">${icon('chevronLeft', { size: 19 })}</button>
          <button class="icon-btn" data-act="forward" title="Forward" aria-label="Forward">${icon('chevronRight', { size: 19 })}</button>
        </div>
        <div class="mobile-only" id="mobileBack"></div>
        <div class="toolbar-title" id="toolbarTitle"></div>
        <span class="spacer"></span>
        <span id="offlinePill"></span>
        <button class="toolbar-search" data-act="search">${icon('search', { size: 15 })}<span>Search lessons &amp; collocations</span><kbd>${modKey}K</kbd></button>
        <button class="icon-btn desktop-only" data-act="theme" id="themeBtn" title="Appearance" aria-label="Appearance"></button>
      </header>
      <div class="view-scroll scroll" id="viewScroll"><div id="view"></div></div>
      <footer class="playerbar" aria-label="Player">
        <button class="pb-now" data-act="open-current" title="Open lesson"><div data-p="art"></div><div class="t"><b data-p="topic"></b><span data-p="sub"></span></div></button>
        <div class="pb-center">
          <div class="pb-controls">
            <button class="icon-btn" data-pa="prev" title="Previous lesson (⇧←)" aria-label="Previous lesson">${icon('prev', { size: 18 })}</button>
            <button class="icon-btn" data-pa="back" title="Skip back (←)" aria-label="Skip back">${icon('back10', { size: 18 })}</button>
            <button class="play-btn" data-p="toggle" data-pa="toggle" title="Play / Pause (Space)" aria-label="Play">${playIcon(17)}</button>
            <button class="icon-btn" data-pa="fwd" title="Skip forward (→)" aria-label="Skip forward">${icon('fwd10', { size: 18 })}</button>
            <button class="icon-btn" data-pa="next" title="Next lesson (⇧→)" aria-label="Next lesson">${icon('next', { size: 18 })}</button>
          </div>
          <div class="pb-scrub"><span data-p="time">0:00</span><div class="scrubber" data-p="scrub" role="slider" tabindex="0" aria-label="Seek"><div class="track"><div class="buf"></div><div class="fill"></div></div><div class="thumb"></div></div><span data-p="dur">0:00</span></div>
        </div>
        <div class="pb-right">
          <button class="rate-btn" data-pa="rate" data-p="rate" title="Playback speed">1×</button>
          <button class="icon-btn" data-p="sleep" data-pa="sleep" title="Sleep timer" aria-label="Sleep timer">${icon('moon', { size: 17 })}</button>
          <button class="icon-btn" data-p="done" data-pa="done" title="Mark lesson complete (M)" aria-label="Mark lesson complete">${icon('checkCircle', { size: 18 })}</button>
          <div class="pb-volume"><button class="icon-btn sm" data-pa="mute" data-p="mute" aria-label="Mute"></button><div class="scrubber" data-p="vol" role="slider" tabindex="0" aria-label="Volume"><div class="track"><div class="fill"></div></div><div class="thumb"></div></div></div>
        </div>
      </footer>
    </main>
  </div>

  <div class="miniplayer hidden-mp" id="miniplayer">
    <button class="mp-open" data-pa="np" aria-label="Open player"><div data-p="art"></div><div class="t"><b data-p="topic"></b><span data-p="sub"></span></div></button>
    <button class="icon-btn" data-p="toggle" data-pa="toggle" aria-label="Play">${playIcon(22)}</button>
    <button class="icon-btn" data-pa="fwd" aria-label="Skip forward">${icon('fwd10', { size: 21 })}</button>
    <div class="mp-progress"><i data-p="mp-progress"></i></div>
  </div>

  <nav class="tabbar" id="tabbar" aria-label="Tabs">
    <div class="tb-pill">
      <span class="tb-hl" aria-hidden="true"></span>
      ${TABS.map((t) => `<a class="tab" href="${t.href}" data-tab="${t.id}"><span class="tab-icon">${icon(t.icon, { size: 23 })}</span><span class="tab-label"><span>${t.label}</span></span></a>`).join('')}
    </div>
    <button class="tb-acc" data-act="search" aria-label="Search">${icon('search', { size: 23 })}</button>
  </nav>`;
}

function renderSidebarLessons() {
  $('#sideLessons').innerHTML = data.lessons.map((l) => `<a class="side-lesson" href="#/lesson/${l.id}" data-lesson-card="${l.id}" data-id="${l.id}">
      <span class="num">${l.nn}</span><span class="emo">${emojiImg(l, '')}</span><span class="name">${esc(l.topic)}</span>
      <span data-eq-lesson="${l.id}" hidden><span class="eq"><i></i><i></i><i></i></span></span>
      ${store.isDone(l.id) ? `<span class="done">${icon('check', { size: 14, stroke: 3 })}</span>` : ''}
    </a>`).join('');
  updateSidebarStats();
  highlightSidebarLesson();
  sync();
}
function updateSidebarStats() {
  const done = store.completed.length;
  const total = data.lessons.length;
  const streak = store.streak();
  $('#sideCount').textContent = `${done}/${total}`;
  $('#savedCount').textContent = store.favorites.length || '';
  $('#progressCard').innerHTML = `${ring(done / total, { size: 40, stroke: 4.5, label: `<span style="font-size:10.5px">${Math.round((done / total) * 100)}%</span>` })}
    <div class="meta"><b>${done === total ? 'All lessons done 🎉' : `${done} of ${total} completed`}</b><span>${streak ? `🔥 ${streak}-day streak` : 'Start a streak today'}</span></div>`;
  animateRings($('#progressCard'));
}
function highlightSidebarLesson() {
  const id = current.route?.name === 'lesson' ? current.route.params.id : null;
  $$('.side-lesson').forEach((a) => {
    const on = Number(a.dataset.id) === id;
    a.classList.toggle('active', on);
    if (on) a.scrollIntoView({ block: 'nearest' });
  });
}
function moveSideHighlight() {
  const active = $('#sideNav .side-item.active');
  const hl = $('#sideHighlight');
  if (!hl) return;
  if (!active) { hl.style.opacity = '0'; return; }
  hl.style.opacity = '1';
  hl.style.transform = `translateY(${active.offsetTop}px)`;
}
function renderThemeBtn() {
  const t = store.prefs.theme;
  const b = $('#themeBtn');
  if (b) b.innerHTML = icon(t === 'dark' ? 'moon' : t === 'light' ? 'sun' : 'monitor', { size: 18 });
}

/* ==========================================================================
   Router
   ========================================================================== */
function parse(hash) {
  const path = (hash || '').replace(/^#\/?/, '').split('?')[0];
  const parts = path.split('/').filter(Boolean);
  const r = (name, tab, depth, params = {}) => ({ name, tab, depth, params });
  switch (parts[0]) {
    case undefined: case 'home': return r('home', 'home', 0);
    case 'lessons': return r('lessons', 'lessons', 0);
    case 'lesson': return r('lesson', 'lessons', 1, { id: Number(parts[1]), tab: parts[2] || 'story' });
    case 'practice': return parts[1] ? r('session', 'practice', 1, { mode: parts[1] }) : r('practice', 'practice', 0);
    case 'saved': return r('saved', 'saved', 0);
    case 'settings': return r('settings', 'settings', 0);
    default: return r('notFound', null, 0);
  }
}

function render(route, { keepScroll = false, animate = true } = {}) {
  const prev = current.route;
  const scroller = $('#viewScroll');
  const scrollTop = scroller.scrollTop;
  try { current.view?.cleanup?.(); } catch (e) { console.error(e); }
  closeMenu();
  closePopover();

  const v = (views[route.name] || views.notFound)(route.params, ctx);
  current = { route, view: v };

  let dir = '';
  if (prev && !keepScroll) {
    if (route.depth > prev.depth) dir = 'push';
    else if (route.depth < prev.depth) dir = 'pop';
  }
  const host = $('#view');
  host.innerHTML = `<div class="view ${animate && !keepScroll ? `view-enter ${dir}` : ''}" data-view="${route.name}">${v.html}</div>`;
  const root = host.firstElementChild;
  scroller.scrollTop = keepScroll ? scrollTop : 0;
  try { v.mount?.(root); } catch (e) { console.error(e); toast('Something went wrong rendering this page', { type: 'error' }); }

  document.title = route.name === 'home' ? 'English Collocations' : `${v.title} · English Collocations`;
  $('#toolbarTitle').textContent = v.title;
  $('#mobileBack').innerHTML = v.backTo ? `<a class="back-label" href="${v.backTo.href}">${icon('chevronLeft', { size: 24, stroke: 2.4 })}<span>${esc(v.backTo.label)}</span></a>` : '';
  $$('[data-tab]').forEach((t) => {
    const on = t.dataset.tab === route.tab;
    if (on && !t.classList.contains('active') && t.classList.contains('tab')) {
      t.classList.remove('bump'); void t.offsetWidth; t.classList.add('bump');
    }
    t.classList.toggle('active', on);
    if (on) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current');
  });
  const tabIndex = TABS.findIndex((t) => t.id === route.tab);
  $('#tabbar').style.setProperty('--i', Math.max(0, tabIndex));
  $('.tb-hl').style.opacity = tabIndex < 0 ? '0' : '1';
  setNavMin(false);
  moveSideHighlight();
  highlightSidebarLesson();
  onScroll();
  sync();
}

function onRoute() {
  const route = parse(location.hash);
  // tab switches inside a lesson use replaceState; skip re-rendering the same lesson tab
  const cur = current.route;
  if (cur?.name === 'lesson' && route.name === 'lesson' && cur.params.id === route.params.id && cur.params.tab === route.params.tab) return;
  render(route);
}

/* ==========================================================================
   Scroll-linked chrome (toolbar glass + collapsing title)
   ========================================================================== */
let lastScrollTop = 0;
function setNavMin(min) {
  const bar = $('#tabbar');
  if (!bar || bar.classList.contains('min') === min) return;
  bar.classList.toggle('min', min);
  document.body.classList.toggle('nav-min', min);
}
function onScroll() {
  const sc = $('#viewScroll');
  const top = sc.scrollTop;
  const delta = top - lastScrollTop;
  if (Math.abs(delta) > 4) {
    if (top <= 6 || delta < 0) setNavMin(false);
    else if (delta > 0) setNavMin(true);
    lastScrollTop = top;
  }
  const tb = $('#toolbar');
  tb.classList.toggle('scrolled', sc.scrollTop > 4);
  const h1 = $('#view h1');
  const showTitle = h1 ? h1.getBoundingClientRect().bottom < tb.getBoundingClientRect().bottom + 4 : sc.scrollTop > 40;
  tb.classList.toggle('show-title', showTitle);
}

/* ==========================================================================
   Command palette (⌘K)
   ========================================================================== */
function openSearch() {
  if ($('.cmdk')) return;
  closeMenu();
  closePopover();
  const layer = $('#layer');
  const backdrop = document.createElement('div');
  backdrop.className = 'backdrop';
  const el = document.createElement('div');
  el.className = 'cmdk';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'Search');
  el.innerHTML = `
    <div class="cmdk-input">${icon('search', { size: 20 })}<input type="text" placeholder="Search lessons, collocations, actions…" autocomplete="off" spellcheck="false" aria-label="Search"><kbd>esc</kbd></div>
    <div class="cmdk-list scroll" role="listbox"></div>
    <div class="cmdk-foot desktop-only"><span><kbd>↑</kbd><kbd>↓</kbd> navigate</span><span><kbd>↵</kbd> open</span><span><kbd>esc</kbd> close</span></div>`;
  layer.append(backdrop, el);
  requestAnimationFrame(() => backdrop.classList.add('open'));
  const input = $('input', el);
  const list = $('.cmdk-list', el);
  let items = [];
  let active = 0;

  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive(active + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active - 1); }
    else if (e.key === 'Enter') { e.preventDefault(); items[active]?.run(); }
  };
  const close = () => {
    el.classList.add('closing');
    backdrop.classList.remove('open');
    setTimeout(() => { el.remove(); backdrop.remove(); }, 180);
    document.removeEventListener('keydown', onKey, true);
  };
  const go = (hash, after) => { close(); ctx.navigate(hash); if (after) setTimeout(after, 450); };
  const actions = () => [
    ...TABS.map((t) => ({ group: 'Go to', icon: t.icon, title: t.label, run: () => go(t.href) })),
    player.lesson
      ? { group: 'Actions', icon: player.playing ? 'pause' : 'play', title: player.playing ? 'Pause' : `Resume Lesson ${player.lesson.id}`, sub: player.lesson.topic, run: () => { close(); player.toggle(); } }
      : { group: 'Actions', icon: 'play', title: 'Start listening', sub: 'Continue where you left off', run: () => { close(); player.play(); } },
    { group: 'Actions', icon: 'zap', title: 'Start a quick quiz', sub: 'Practice', run: () => go('#/practice/quiz') },
    { group: 'Actions', icon: 'layers', title: 'Review flashcards', sub: 'Practice', run: () => go('#/practice/flashcards') },
    { group: 'Actions', icon: 'moon', title: 'Toggle dark mode', sub: 'Appearance', run: () => { close(); toggleTheme(); } },
    { group: 'Actions', icon: 'cloud', title: 'Download lessons for offline', sub: 'Settings', run: () => go('#/settings') },
    { group: 'Actions', icon: 'file', title: 'Open the complete guide (PDF)', sub: 'Resources', run: () => { close(); window.open('collocations.pdf', '_blank', 'noopener'); } },
    { group: 'Actions', icon: 'keyboard', title: 'Keyboard shortcuts', sub: 'Help', run: () => { close(); openShortcuts(); } },
  ];
  const mark = (text, q) => {
    const i = q ? text.toLowerCase().indexOf(q) : -1;
    if (i < 0) return esc(text);
    return `${esc(text.slice(0, i))}<mark>${esc(text.slice(i, i + q.length))}</mark>${esc(text.slice(i + q.length))}`;
  };
  const build = () => {
    const q = input.value.trim().toLowerCase();
    items = [];
    if (!q) {
      const cont = lessonById(store.last) || data.lessons.find((l) => !store.isDone(l.id));
      if (cont) items.push({ group: 'Continue', lesson: cont, hue: cont.hue, title: `Lesson ${cont.id} · ${cont.topic}`, sub: `${cont.collocations.length} collocations`, run: () => go(`#/lesson/${cont.id}`) });
      items.push(...actions());
    } else {
      data.lessons.filter((l) => l.topic.toLowerCase().includes(q) || String(l.id) === q || `lesson ${l.id}` === q).slice(0, 8)
        .forEach((l) => items.push({ group: 'Lessons', lesson: l, hue: l.hue, title: `Lesson ${l.id} · `, hl: l.topic, sub: `${l.collocations.length} collocations${store.isDone(l.id) ? ' · ✓ completed' : ''}`, run: () => go(`#/lesson/${l.id}`) }));
      const colHits = data.all.filter((c) => c.p.toLowerCase().includes(q))
        .sort((a, b) => (a.p.toLowerCase().startsWith(q) ? 0 : 1) - (b.p.toLowerCase().startsWith(q) ? 0 : 1) || a.p.length - b.p.length)
        .slice(0, 14);
      const meaningHits = colHits.length < 6 ? data.all.filter((c) => !c.p.toLowerCase().includes(q) && c.m.toLowerCase().includes(q)).slice(0, 6 - colHits.length) : [];
      [...colHits, ...meaningHits].forEach((c) => {
        const l = lessonById(c.lessonId);
        items.push({
          group: 'Collocations', icon: 'quote', title: '', hl: c.p, sub: `${c.m || 'From the story'} · Lesson ${l.id}`, end: emojiImg(l),
          run: () => go(`#/lesson/${l.id}/collocations`, () => {
            const card = document.querySelector(`.colloc[data-key="${CSS.escape(c.key)}"]`);
            if (card) { card.scrollIntoView({ behavior: 'smooth', block: 'center' }); card.classList.add('speaking'); setTimeout(() => card.classList.remove('speaking'), 1800); }
          }),
        });
      });
      actions().filter((a) => a.title.toLowerCase().includes(q)).forEach((a) => items.push(a));
    }
    active = 0;
    let lastGroup = '';
    list.innerHTML = items.length ? items.map((it, i) => {
      const head = it.group !== lastGroup ? `<div class="cmdk-group">${esc(it.group)}</div>` : '';
      lastGroup = it.group;
      return `${head}<button class="cmdk-item ${i === 0 ? 'active' : ''}" data-i="${i}" role="option">
        <span class="ci-icon" ${it.hue != null ? `style="background:hsl(${it.hue} 80% 60% / .2)"` : ''}>${it.lesson ? emojiImg(it.lesson, '') : icon(it.icon, { size: 16 })}</span>
        <span class="ci-main"><b>${esc(it.title || '')}${it.hl ? mark(it.hl, q) : ''}</b>${it.sub ? `<span>${esc(it.sub)}</span>` : ''}</span>
        ${it.end ? `<span class="ci-end">${it.end}</span>` : ''}
      </button>`;
    }).join('') : `<div class="cmdk-empty">${icon('search', { size: 28, cls: '' })}<p style="margin-top:10px">No results for “${esc(input.value)}”</p></div>`;
  };
  const setActive = (i) => {
    const btns = $$('.cmdk-item', list);
    if (!btns.length) return;
    active = (i + btns.length) % btns.length;
    btns.forEach((b, k) => b.classList.toggle('active', k === active));
    btns[active].scrollIntoView({ block: 'nearest' });
  };
  input.addEventListener('input', build);
  list.addEventListener('click', (e) => { const b = e.target.closest('.cmdk-item'); if (b) items[Number(b.dataset.i)]?.run(); });
  list.addEventListener('pointermove', (e) => { const b = e.target.closest('.cmdk-item'); if (b && Number(b.dataset.i) !== active) setActive(Number(b.dataset.i)); });
  backdrop.addEventListener('click', close);
  document.addEventListener('keydown', onKey, true);
  build();
  setTimeout(() => input.focus(), 20);
}

/* ==========================================================================
   Shortcuts, theme, window controls
   ========================================================================== */
function openShortcuts() {
  const k = (...keys) => keys.map((x) => `<kbd>${x}</kbd>`).join('');
  const rows = [
    ['Play / pause', k('Space')],
    [`Skip back / forward ${store.prefs.skip}s`, k('←') + k('→')],
    ['Previous / next lesson', k('⇧', '←') + k('⇧', '→')],
    ['Mark lesson complete', k('M')],
    ['Search', k(modKey, 'K') + k('/')],
    ['Toggle sidebar', k('[')],
    ['Toggle dark mode', k('T')],
    ['Go to Home / Lessons / Practice / Saved', `${k('G')} then ${k('H')}${k('L')}${k('P')}${k('S')}`],
    ['Show shortcuts', k('?')],
  ];
  sheet({ title: 'Keyboard shortcuts', body: `<div class="kbd-grid">${rows.map(([a, b]) => `<span>${a}</span><span>${b}</span>`).join('')}</div>` });
}

function toggleTheme() {
  const dark = document.documentElement.dataset.theme === 'dark';
  store.setPref('theme', dark ? 'light' : 'dark');
  applyTheme();
  renderThemeBtn();
}

function setSidebar(open) {
  store.setPref('sidebar', open);
  $('#window').classList.toggle('sidebar-collapsed', !open);
}

function initChromeActions() {
  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]');
    if (!a) return;
    switch (a.dataset.act) {
      case 'search': openSearch(); break;
      case 'sidebar': setSidebar(!store.prefs.sidebar); break;
      case 'zoom': store.setPref('zoomed', !store.prefs.zoomed); $('#window').classList.toggle('zoomed', store.prefs.zoomed); break;
      case 'stop': if (player.lesson) { player.pause(); player.seek(0); toast('Playback stopped', { icon: 'x' }); } break;
      case 'back': history.back(); break;
      case 'forward': history.forward(); break;
      case 'open-current': if (player.lesson) ctx.navigate(`#/lesson/${player.lesson.id}`); else player.play(); break;
      case 'theme':
        menu(a, [
          { header: 'Appearance' },
          ...[['system', 'System', 'monitor'], ['light', 'Light', 'sun'], ['dark', 'Dark', 'moon']].map(([v, label, ic]) => ({
            label, icon: ic, checked: store.prefs.theme === v, onClick: () => { store.setPref('theme', v); applyTheme(); renderThemeBtn(); },
          })),
        ], { align: 'end' });
        break;
      default: break;
    }
  });

  // tapping the active tab scrolls to top (iOS behaviour)
  $('#tabbar').addEventListener('focusin', () => setNavMin(false));
  $('#tabbar').addEventListener('click', (e) => {
    const t = e.target.closest('.tab');
    if (!t) return;
    haptic(5);
    if ($('#tabbar').classList.contains('min')) setNavMin(false);
    if (t.classList.contains('active') && current.route?.depth === 0) { e.preventDefault(); $('#viewScroll').scrollTo({ top: 0, behavior: 'smooth' }); }
  });

  let gPending = 0;
  document.addEventListener('keydown', (e) => {
    const key = e.key;
    if ((e.metaKey || e.ctrlKey) && key.toLowerCase() === 'k') { e.preventDefault(); openSearch(); return; }
    if (key === 'Escape') { const s = topSheet(); if (s) { s.close(); return; } }
    const typing = e.target.closest?.('input, textarea, select, [contenteditable="true"]');
    if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
    if ($('.cmdk') || topSheet() || $('.menu')) return;
    if (current.view?.handlesKeys && [' ', 'Enter', 'ArrowLeft', 'ArrowRight', '1', '2', '3', '4'].includes(key)) return;
    if (key === ' ' && e.target.closest?.('button, a, [role="slider"]')) return;

    if (gPending && Date.now() - gPending < 1200) {
      gPending = 0;
      const map = { h: '#/', l: '#/lessons', p: '#/practice', s: '#/saved', ',': '#/settings' };
      const dest = map[key.toLowerCase()];
      if (dest) { e.preventDefault(); ctx.navigate(dest); }
      return;
    }
    switch (key) {
      case ' ': e.preventDefault(); player.toggle(); break;
      case 'ArrowLeft': e.preventDefault(); if (e.shiftKey) player.prev(); else player.skip(-store.prefs.skip); break;
      case 'ArrowRight': e.preventDefault(); if (e.shiftKey) player.next(); else player.skip(store.prefs.skip); break;
      case '/': e.preventDefault(); openSearch(); break;
      case '?': e.preventDefault(); openShortcuts(); break;
      case '[': setSidebar(!store.prefs.sidebar); break;
      case 't': case 'T': toggleTheme(); break;
      case 'g': case 'G': gPending = Date.now(); break;
      case 'm': case 'M': {
        const id = current.route?.name === 'lesson' ? current.route.params.id : player.lesson?.id;
        if (!id) break;
        const done = !store.isDone(id);
        store.setDone(id, done);
        toast(done ? `Lesson ${id} marked complete` : `Lesson ${id} marked not completed`, { type: done ? 'success' : 'info' });
        break;
      }
      default: break;
    }
  });
}

/* ==========================================================================
   PWA: service worker, install prompt, connectivity
   ========================================================================== */
function initPWA() {
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    // The worker activates immediately; when it replaces an existing one, offer a reload.
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('sw.js').catch((err) => console.warn('Service worker registration failed', err));
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController) return;
      toast('A new version is ready', {
        icon: 'sparkles', duration: 15000,
        action: { label: 'Reload', fn: () => { player.savePosition(); location.reload(); } },
      });
    });
  }

  addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredInstall = e; });
  addEventListener('appinstalled', () => { deferredInstall = null; toast('App installed — find it on your home screen', { type: 'success', icon: 'smartphone' }); });

  const renderOnline = (announce) => {
    $('#offlinePill').innerHTML = navigator.onLine ? '' : `<span class="offline-pill">${icon('wifiOff', { size: 13 })} Offline</span>`;
    if (announce) toast(navigator.onLine ? 'Back online' : 'You are offline — downloaded lessons still work', { icon: navigator.onLine ? 'check' : 'wifiOff', type: navigator.onLine ? 'success' : 'info' });
  };
  addEventListener('online', () => renderOnline(true));
  addEventListener('offline', () => renderOnline(true));
  renderOnline(false);
}

/* ==========================================================================
   Boot
   ========================================================================== */
async function boot() {
  applyTheme();
  const app = $('#app');
  try {
    await loadData();
  } catch (e) {
    console.error(e);
    app.innerHTML = `<div class="empty" style="height:100dvh;justify-content:center"><div class="empty-icon">${icon('wifiOff', { size: 32 })}</div><h3>Couldn't load lessons</h3><p>Check your connection and try again.</p><button class="btn btn-primary btn-pill" id="retryBtn">Try again</button></div>`;
    $('#retryBtn').onclick = () => location.reload();
    return;
  }

  // legacy deep link from the manifest shortcut: /?lesson=3
  const qs = new URLSearchParams(location.search);
  if (qs.has('lesson')) {
    const id = Number(qs.get('lesson'));
    history.replaceState(null, '', `${location.pathname}#/lesson/${lessonById(id) ? id : 1}`);
  }

  app.innerHTML = shellHTML();
  renderSidebarLessons();
  renderThemeBtn();
  speech.init();
  initGlobalActions();
  initPlayerControls({ navigate: ctx.navigate });
  initChromeActions();
  initPWA();

  if (store.last && lessonById(store.last)) player.load(store.last);

  $('#viewScroll').addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', debounce(() => { moveSideHighlight(); onScroll(); }, 100));
  addEventListener('hashchange', onRoute);

  const refreshFor = new Set();
  const flush = debounce(() => {
    const topics = [...refreshFor];
    refreshFor.clear();
    if (topics.some((t) => current.view?.refreshOn?.includes(t)) && !document.activeElement?.matches?.('input, textarea')) ctx.refresh();
  }, 60);
  store.on((topic) => {
    if (topic === 'completed' || topic === 'import') renderSidebarLessons();
    if (['favorites', 'activity', 'practice'].includes(topic)) updateSidebarStats();
    if (topic === 'prefs') renderThemeBtn();
    refreshFor.add(topic);
    flush();
  });

  render(parse(location.hash), { animate: true });
  document.body.classList.add('ready');
}

boot();
