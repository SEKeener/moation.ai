import { collectMentions, collectSeedMetrics, excerpt } from './collect.js';
import { homepage, feed } from './render.js';
import { accept, excerpt as snip } from './match.js';
import EXHIBITS from '../data/exhibits.json';

async function runCollection(env) {
  const started = new Date().toISOString();
  const { candidates, scanned, detail } = await collectMentions(env);

  let found = 0;
  for (const c of candidates) {
    const r = await env.DB.prepare(
      `INSERT OR IGNORE INTO mentions (source, external_id, url, author, title, excerpt, created_at, first_seen_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(c.source, c.external_id, c.url, c.author, c.title, excerpt(c.raw), c.created_at, started).run();
    found += r.meta?.changes || 0;
  }

  try {
    const s = await collectSeedMetrics();
    await env.DB.prepare(
      `INSERT OR REPLACE INTO seed_metrics (captured_at, favorite_count, reply_count) VALUES (?, ?, ?)`
    ).bind(started, s.favorite_count, s.reply_count).run();
  } catch (e) {
    detail.x = { error: String(e.message || e) };
  }

  await env.DB.prepare(`INSERT OR REPLACE INTO runs (started_at, ok, found, scanned, detail) VALUES (?, 1, ?, ?, ?)`)
    .bind(started, found, scanned, JSON.stringify(detail)).run();

  return { started, found, scanned, detail };
}

// Exhibits live in git, not in the CMS. Sync them into D1 on every request path
// that needs them is wasteful, so we just read the JSON directly. D1 holds the
// table for future querying, seeded by `npm run seed`.
async function page(env) {
  const [rows, seedRow, runRow, countRow] = await Promise.all([
    env.DB.prepare(`SELECT source, external_id, url, author, title, excerpt, created_at FROM mentions ORDER BY created_at DESC LIMIT 60`).all(),
    env.DB.prepare(`SELECT * FROM seed_metrics ORDER BY captured_at DESC LIMIT 1`).first(),
    env.DB.prepare(`SELECT started_at FROM runs ORDER BY started_at DESC LIMIT 1`).first(),
    env.DB.prepare(`SELECT COUNT(*) AS n FROM mentions`).first(),
  ]);
  return {
    exhibits: EXHIBITS,
    mentions: rows.results || [],
    counts: { total: countRow?.n || 0 },
    seed: seedRow,
    lastRun: runRow?.started_at || null,
  };
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runCollection(env));
  },

  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/mentions.json') {
      const d = await page(env);
      return Response.json(
        { word: 'moation', coined_by: 'Dr. Alex Wissner-Gross', coined_at: '2026-08-30T13:17:33Z', source: `https://x.com/alexwg/status/2094051899502690804`, count: d.counts.total, mentions: d.mentions, exhibits: d.exhibits },
        { headers: { 'access-control-allow-origin': '*', 'cache-control': 'public, max-age=300' } }
      );
    }

    if (url.pathname === '/feed.xml') {
      const d = await page(env);
      return new Response(feed(d.mentions), { headers: { 'content-type': 'application/rss+xml; charset=utf-8', 'cache-control': 'public, max-age=300' } });
    }

    // Ingest from the X scraper, which runs on a Mac because X search needs a
    // logged-in browser session and Workers have no browser. The scraper is a
    // separate trust domain, so every item it sends is put through the same
    // accept() gate as anything we collect ourselves. Given how readily search
    // surfaces false positives for this word, taking a client's word for a
    // match would be the easiest way to end up publishing "motion".
    if (url.pathname === '/api/ingest' && request.method === 'POST') {
      if (!env.INGEST_KEY || request.headers.get('x-ingest-key') !== env.INGEST_KEY) {
        return new Response('forbidden', { status: 403 });
      }
      const body = await request.json().catch(() => null);
      if (!body || !Array.isArray(body.items)) return new Response('bad request', { status: 400 });

      // A zero from the scraper is only meaningful if its control query worked.
      if (!body.control_count) {
        return Response.json({ ok: false, reason: 'control query empty, run discarded' }, { status: 409 });
      }

      const now = new Date().toISOString();
      let found = 0;
      for (const it of body.items) {
        const item = { ...it, source: 'x', title: null };
        if (!accept(item)) continue;
        const r = await env.DB.prepare(
          `INSERT OR IGNORE INTO mentions (source, external_id, url, author, title, excerpt, created_at, first_seen_at)
           VALUES ('x', ?, ?, ?, NULL, ?, ?, ?)`
        ).bind(item.external_id, item.url, item.author, snip(item.raw), item.created_at, now).run();
        found += r.meta?.changes || 0;
      }
      await env.DB.prepare(`INSERT OR REPLACE INTO runs (started_at, ok, found, scanned, detail) VALUES (?, 1, ?, ?, ?)`)
        .bind(now, found, body.items.length, JSON.stringify({ x: { scanned: body.items.length, kept: found, control: body.control_count } })).run();
      return Response.json({ ok: true, scanned: body.items.length, found });
    }

    // Manual collector trigger, for testing before the cron has fired.
    if (url.pathname === '/api/collect') {
      if (!env.COLLECT_SECRET || url.searchParams.get('key') !== env.COLLECT_SECRET) {
        return new Response('forbidden', { status: 403 });
      }
      return Response.json(await runCollection(env));
    }

    if (url.pathname === '/') {
      const d = await page(env);
      return new Response(homepage(d), { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=300' } });
    }

    return new Response('not found', { status: 404 });
  },
};
