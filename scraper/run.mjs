// launchd calls this every 15 minutes. It runs the scraper only when one of the
// day's randomly chosen slots is due, so the visit pattern is four irregular
// checks rather than a metronome.

import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dueSlot, markDone, fmt } from './schedule.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const due = dueSlot();

if (!due) {
  process.exit(0); // nothing scheduled for now, stay quiet
}

const { file, plan, slot } = due;
// A few minutes of jitter so runs never land on a clean quarter hour.
const jitterMs = Math.floor(Math.random() * 7 * 60 * 1000);
await new Promise((r) => setTimeout(r, jitterMs));

try {
  const out = execFileSync('node', [join(HERE, 'x-scrape.mjs')], {
    encoding: 'utf8', timeout: 5 * 60 * 1000, env: process.env,
  });
  markDone(file, plan, slot, { ok: true, out: out.trim().split('\n').slice(-2).join(' ') });
  console.log(`[${new Date().toISOString()}] slot ${fmt(slot.atMinutes)} ok`);
} catch (e) {
  // Deliberately NOT marked done, so a transient failure retries at the next
  // 15 minute tick while still inside the grace window.
  console.error(`[${new Date().toISOString()}] slot ${fmt(slot.atMinutes)} FAILED: ${String(e.stderr || e.message).trim()}`);
  process.exit(1);
}
