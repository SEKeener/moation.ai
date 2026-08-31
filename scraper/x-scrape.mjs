// Playwright scrape of X search, using a persistent logged-in Chrome profile.
//
// X search returns nothing without a session: an anonymous fetch of
// /search?q=moation returns 289KB of JavaScript shell containing "JavaScript is
// not available" and no result data. The API tier that would give us search
// costs $200/mo. So we drive a real browser with a real session.
//
// Log in once, by hand:  node scraper/x-scrape.mjs --login
// Then this runs unattended against the saved profile.

import { chromium } from 'playwright';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PROFILE = process.env.X_PROFILE_DIR || join(HERE, 'state', 'chrome-profile');

// We search the bare word, not the hashtag. The coining post carries no
// hashtag and neither does almost any use of it, so #moation would find close
// to nothing while "moation" catches every plain-prose mention.
const QUERY = 'moation';

// A term with guaranteed recent activity. If this comes back empty the session
// is dead or the DOM moved, and a zero from the real query cannot be trusted.
// Without this check a broken scraper is indistinguishable from a quiet week,
// which on this site is a completely plausible result.
const CONTROL_QUERY = 'the';

const rand = (a, b) => a + Math.random() * (b - a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function search(page, q) {
  await page.goto(`https://x.com/search?q=${encodeURIComponent(q)}&src=typed_query&f=live`, {
    waitUntil: 'domcontentloaded', timeout: 45000,
  });
  await sleep(rand(2500, 5000));

  if (page.url().includes('/login') || page.url().includes('/i/flow/login')) {
    throw new Error('SESSION_DEAD: redirected to login. Re-run with --login.');
  }

  // Either results appear, or X tells us there are none. Both are valid outcomes.
  await Promise.race([
    page.waitForSelector('article[data-testid="tweet"]', { timeout: 20000 }).catch(() => null),
    page.waitForSelector('[data-testid="empty_state_header_text"]', { timeout: 20000 }).catch(() => null),
  ]);

  // A person scrolls a bit before deciding there is nothing there.
  await page.mouse.wheel(0, rand(300, 900));
  await sleep(rand(1500, 3500));

  return page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('article[data-testid="tweet"]')) {
      const textEl = el.querySelector('[data-testid="tweetText"]');
      const timeEl = el.querySelector('time[datetime]');
      const link = [...el.querySelectorAll('a[href*="/status/"]')]
        .map((a) => a.getAttribute('href'))
        .find((h) => /^\/[^/]+\/status\/\d+$/.test(h));
      if (!link || !timeEl) continue;
      const [, handle, , id] = link.split('/');
      out.push({
        external_id: id,
        url: `https://x.com${link}`,
        author: handle,
        raw: textEl ? textEl.innerText : '',
        created_at: timeEl.getAttribute('datetime'),
      });
    }
    return out;
  });
}

async function main() {
  const loginMode = process.argv.includes('--login');
  const ctx = await chromium.launchPersistentContext(PROFILE, {
    headless: loginMode ? false : process.env.HEADFUL !== '1' ? true : false,
    viewport: { width: 1440, height: 900 },
    timezoneId: 'America/Los_Angeles',
    locale: 'en-US',
  });
  const page = ctx.pages()[0] || (await ctx.newPage());

  try {
    if (loginMode) {
      await page.goto('https://x.com/login');
      console.log('Log in in the browser window, then press Enter here.');
      await new Promise((r) => process.stdin.once('data', r));
      console.log('Session saved to', PROFILE);
      return;
    }

    const control = await search(page, CONTROL_QUERY);
    if (control.length === 0) {
      throw new Error('CONTROL_EMPTY: control query returned no results. Treating this run as failed rather than reporting zero mentions.');
    }

    await sleep(rand(4000, 9000));
    const hits = await search(page, QUERY);

    const payload = { source: 'x', query: QUERY, control_count: control.length, items: hits };
    console.log(JSON.stringify({ ok: true, control: control.length, found: hits.length }));

    if (process.env.INGEST_URL && process.env.INGEST_KEY) {
      const r = await fetch(process.env.INGEST_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-ingest-key': process.env.INGEST_KEY },
        body: JSON.stringify(payload),
      });
      console.log(JSON.stringify({ ingest: r.status, body: await r.text() }));
    } else {
      console.log(JSON.stringify(payload));
    }
  } finally {
    await ctx.close();
  }
}

main().catch((e) => {
  console.error(JSON.stringify({ ok: false, error: String(e.message || e) }));
  process.exit(1);
});
