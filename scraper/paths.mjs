// Runtime state lives outside the repository.
//
// The Chrome profile holds a live X session. Keeping it in the source tree of a
// public repo means one line in a .gitignore is the only thing preventing those
// cookies from being published, and a stray `git add -f`, a refactor of the
// ignore rules, or a fresh clone with different ignores would defeat it. Out
// here, the ignore file is not load-bearing at all.
//
// It also survives `git clean -xfd`, which would otherwise wipe the session and
// force a fresh login. Re-logins are exactly what draw an account challenge, so
// a session that outlives routine git operations is worth having.
//
// Deliberately NOT under ~/.xero or ~/data/knowledge-base: those sync via
// Syncthing, and the same X session appearing from two machines is a flag.

import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync, chmodSync } from 'node:fs';

export const BASE = process.env.MOATION_STATE_DIR || join(homedir(), '.config', 'moation');
export const PROFILE_DIR = process.env.X_PROFILE_DIR || join(BASE, 'chrome-profile');

export function ensureBase() {
  mkdirSync(BASE, { recursive: true });
  try { chmodSync(BASE, 0o700); } catch {} // holds session cookies, keep it private
  return BASE;
}
