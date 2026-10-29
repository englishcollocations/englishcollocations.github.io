#!/usr/bin/env node
// Builds data/lessons.json from texts/*.txt and collocations/*.txt.
// Run after editing lesson files:  node scripts/build-data.mjs
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const TOTAL = 50;

const EMOJI = {
  1: '👨‍👩‍👧', 2: '💞', 3: '🪞', 4: '🎭', 5: '😊', 6: '🏠', 7: '🍽️', 8: '🎬', 9: '🎵', 10: '⚽',
  11: '🩺', 12: '💻', 13: '📚', 14: '🎓', 15: '💼', 16: '📈', 17: '💰', 18: '✈️', 19: '⛅', 20: '🏙️',
  21: '🌾', 22: '🚨', 23: '⚖️', 24: '🕊️', 25: '🌍', 26: '⏰', 27: '🔊', 28: '📏', 29: '💡', 30: '🎨',
  31: '🧶', 32: '🌸', 33: '🍋', 34: '📊', 35: '🏃', 36: '🔄', 37: '🗣️', 38: '🏁', 39: '🏆', 40: '🔗',
  41: '📸', 42: '🤝', 43: '🤔', 44: '🧭', 45: '🙅', 46: '❤️', 47: '👏', 48: '🪄', 49: '🧩', 50: '⚡',
};

const decode = (s) => s
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const strip = (s) => decode(s.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();

function parseCollocations(raw) {
  const items = [];
  for (const m of raw.matchAll(/<li>([\s\S]*?)<\/li>/g)) {
    const li = m[1];
    const strong = li.match(/<strong>([\s\S]*?)<\/strong>/);
    if (!strong) continue;
    const phrase = strip(strong[1]);
    let rest = li.slice(strong.index + strong[0].length);
    let example = '';
    const ex = rest.split(/<em>\s*Example:?\s*<\/em>/i);
    if (ex.length > 1) { example = strip(ex.slice(1).join(' ')); rest = ex[0]; }
    rest = strip(rest.replace(/<br\s*\/?>/gi, ' '));
    // "(STDs) – meaning" → note "(STDs)", meaning after the dash
    let note = '';
    const noteMatch = rest.match(/^(\([^)]*\))\s*/);
    if (noteMatch) { note = noteMatch[1]; rest = rest.slice(noteMatch[0].length); }
    const meaning = rest.replace(/^[–—-]\s*/, '').trim();
    items.push({ p: phrase, ...(note && { n: note }), m: meaning, ...(example && { e: example }) });
  }
  return items;
}

function parseText(raw) {
  const lines = raw.replace(/\r/g, '').split('\n');
  const first = lines.findIndex((l) => l.trim());
  const heading = strip(lines[first]).replace(/\*+/g, '').trim();
  const topic = heading.replace(/^Lesson\s+\d+\s*[–—-]\s*/i, '').trim();
  const body = lines.slice(first + 1).join('\n').trim();
  const words = strip(body).split(/\s+/).filter(Boolean).length;
  // Bold phrases in the story — used when a lesson's collocation file is empty.
  const phrases = [...new Set([...body.matchAll(/<strong>([\s\S]*?)<\/strong>/g)].map((m) => strip(m[1])))];
  return { topic, words, phrases };
}

function audioDuration(file) {
  try {
    const out = execFileSync('afinfo', [file], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const m = out.match(/estimated duration:\s*([\d.]+)/);
    return m ? Math.round(parseFloat(m[1])) : 0;
  } catch {
    try {
      const out = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' });
      return Math.round(parseFloat(out)) || 0;
    } catch { return 0; }
  }
}

const lessons = [];
for (let id = 1; id <= TOTAL; id++) {
  const nn = String(id).padStart(2, '0');
  const text = parseText(readFileSync(join(root, 'texts', `${nn}.txt`), 'utf8'));
  let collocations = parseCollocations(readFileSync(join(root, 'collocations', `${nn}.txt`), 'utf8'));
  if (!collocations.length) collocations = text.phrases.map((p) => ({ p, m: '' }));
  const audio = join(root, 'sounds', `Collocations-Lesson${nn}.mp3`);
  lessons.push({
    id,
    topic: text.topic,
    emoji: EMOJI[id] || '📘',
    duration: existsSync(audio) ? audioDuration(audio) : 0,
    words: text.words,
    collocations,
  });
}

mkdirSync(join(root, 'data'), { recursive: true });
writeFileSync(join(root, 'data', 'lessons.json'), JSON.stringify({ version: 1, lessons }));
const total = lessons.reduce((n, l) => n + l.collocations.length, 0);
console.log(`Wrote data/lessons.json — ${lessons.length} lessons, ${total} collocations`);
