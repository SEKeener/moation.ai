// Picks the day's run times. The point is to not look like a cron job.
//
// A scraper that fires at :00 every hour is trivially identifiable as
// automation. Four visits a day, at times that differ every day, inside waking
// hours, with gaps that a person would plausibly leave, is a much duller
// signature. This module owns that decision; run.mjs just obeys it.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const STATE_DIR = join(HERE, 'state');

export const CONFIG = {
  runsPerDay: 4,
  windowStartHour: 8,    // 08:00 PST, roughly when a person starts checking things
  windowEndHour: 22,     // 22:00 PST
  minGapMinutes: 75,     // no clustering
  catchUpGraceMinutes: 120, // if the Mac slept through a slot, still run it if recent
};

// Everything is reasoned about in PST/PDT, whatever the machine is set to.
export function pacificParts(d = new Date()) {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const p = Object.fromEntries(f.formatToParts(d).filter((x) => x.type !== 'literal').map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) };
}

function pickTimes() {
  const start = CONFIG.windowStartHour * 60;
  const end = CONFIG.windowEndHour * 60;
  for (let attempt = 0; attempt < 500; attempt++) {
    const t = Array.from({ length: CONFIG.runsPerDay }, () => start + Math.floor(Math.random() * (end - start)));
    t.sort((a, b) => a - b);
    if (t.every((v, i) => i === 0 || v - t[i - 1] >= CONFIG.minGapMinutes)) return t;
  }
  // Fallback: even spread with jitter, if the window is too tight for random draws.
  const step = (end - start) / CONFIG.runsPerDay;
  return Array.from({ length: CONFIG.runsPerDay }, (_, i) =>
    Math.floor(start + step * i + Math.random() * Math.min(step, 30)));
}

export function todaysPlan(now = new Date()) {
  const { date } = pacificParts(now);
  if (!existsSync(STATE_DIR)) mkdirSync(STATE_DIR, { recursive: true });
  const file = join(STATE_DIR, `plan-${date}.json`);
  if (existsSync(file)) return { file, plan: JSON.parse(readFileSync(file, 'utf8')) };
  const plan = { date, slots: pickTimes().map((m) => ({ atMinutes: m, done: false, result: null })) };
  writeFileSync(file, JSON.stringify(plan, null, 2));
  return { file, plan };
}

// Returns the slot to run right now, or null. Slots missed while the machine
// slept are still honoured inside the grace window, then abandoned rather than
// fired all at once.
export function dueSlot(now = new Date()) {
  const { minutes } = pacificParts(now);
  const { file, plan } = todaysPlan(now);
  const slot = plan.slots.find(
    (s) => !s.done && minutes >= s.atMinutes && minutes - s.atMinutes <= CONFIG.catchUpGraceMinutes
  );
  return slot ? { file, plan, slot } : null;
}

export function markDone(file, plan, slot, result) {
  slot.done = true;
  slot.result = result;
  slot.ranAtMinutes = pacificParts().minutes;
  writeFileSync(file, JSON.stringify(plan, null, 2));
}

export const fmt = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
