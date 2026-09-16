import { accept, excerpt } from './match.js';

const UA = 'moation.ai collector (+https://moation.ai)';
const SEED_TWEET_ID = '2094051899502690804';

async function j(url, init = {}) {
  const r = await fetch(url, { ...init, headers: { 'User-Agent': UA, ...(init.headers || {}) } });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json();
}
async function t(url, init = {}) {
  const r = await fetch(url, { ...init, headers: { 'User-Agent': UA, ...(init.headers || {}) } });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.text();
}

// Google throttles Cloudflare egress hard: measured over 18 days of hourly runs,
// Google News 503'd on 136 of 200 attempts while working fine from a laptop.
// The failures are transient, so a couple of backed-off retries recover most of
// them. Retries 5xx and 429; any other 4xx means we are wrong, not throttled.
async function withRetry(fn, { attempts = 3, baseMs = 800 } = {}) {
  let last;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      const msg = String(e.message || e);
      if (!/\b5\d\d\b/.test(msg) && !/\b429\b/.test(msg)) throw e;
      // 429 means back off properly, not politely.
      const mult = /\b429\b/.test(msg) ? 4 : 1;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, mult * baseMs * Math.pow(2, i) + Math.random() * 400));
    }
  }
  throw last;
}

// Hacker News via Algolia. MUST use the quoted query; the unquoted one is
// typo-tolerant and returns tens of thousands of "motion" hits.
async function hn() {
  const d = await j('https://hn.algolia.com/api/v1/search_by_date?query=%22moation%22&hitsPerPage=100');
  return (d.hits || []).map((h) => {
    const text = h.comment_text || h.story_text || '';
    return {
      source: 'hn',
      external_id: String(h.objectID),
      url: `https://news.ycombinator.com/item?id=${h.objectID}`,
      author: h.author,
      title: h.title || h.story_title || null,
      raw: `${h.title || ''} ${text}`,
      created_at: h.created_at,
    };
  });
}

// Bluesky. The unauthenticated public appview 403s from some networks; with an
// app password in env we use a real session, otherwise we try public and let it
// fail soft.
async function bluesky(env) {
  let headers = {};
  if (env.BSKY_HANDLE && env.BSKY_APP_PASSWORD) {
    const s = await fetch('https://bsky.social/xrpc/com.atproto.server.createSession', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': UA },
      body: JSON.stringify({ identifier: env.BSKY_HANDLE, password: env.BSKY_APP_PASSWORD }),
    }).then((r) => r.json());
    if (s.accessJwt) headers = { Authorization: `Bearer ${s.accessJwt}` };
  }
  const host = headers.Authorization ? 'https://bsky.social' : 'https://public.api.bsky.app';
  const d = await j(`${host}/xrpc/app.bsky.feed.searchPosts?q=moation&limit=100`, { headers });
  return (d.posts || []).map((p) => ({
    source: 'bluesky',
    external_id: p.uri,
    url: `https://bsky.app/profile/${p.author.handle}/post/${p.uri.split('/').pop()}`,
    author: p.author.handle,
    title: null,
    raw: p.record?.text || '',
    created_at: p.record?.createdAt || p.indexedAt,
  }));
}

// Reddit, via the public search RSS feed.
//
// Reddit closed new Data API app creation in 2026 to moderation use cases only,
// so there is no script-app route any more and no credentials to hold. The
// search RSS feed is still public and needs no auth.
//
// Two measured quirks decide this implementation:
//
// 1. The descriptive bot User-Agent gets 200; a browser User-Agent gets 429 on
//    the identical URL. Reddit rewards identifying yourself and throttles
//    impersonation, so never disguise this request.
// 2. A common-word control query is served from Reddit's cache (byte-identical
//    across calls) and so returns 200 even while our rare query is being 429'd
//    at origin. A cached control is therefore a useless canary and we do not use
//    one. The feed distinguishes the two states by itself: HTTP 200 with zero
//    entries is a trustworthy zero, while 429 or 5xx throws and surfaces as a
//    source outage rather than as "no mentions".
//
// Runs once every three hours rather than hourly. Our query is rare, so it is
// always uncached and always hits origin, which is exactly the traffic that
// draws a rate limit. Eight requests a day is plenty to catch a word that has
// produced nothing in three weeks.
const REDDIT_EVERY_N_HOURS = 3;

async function reddit() {
  if (new Date().getUTCHours() % REDDIT_EVERY_N_HOURS !== 0) return { skipped: true };

  const xml = await withRetry(() =>
    t('https://www.reddit.com/search.rss?q=%22moation%22&sort=new&limit=50'), { attempts: 2, baseMs: 1500 });

  const out = [];
  const unesc = (v) => v.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&amp;/g, '&');
  for (const m of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const e = m[1];
    const pick = (tag) => unesc(((e.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`)) || [, ''])[1]))
      .replace(/<[^>]+>/g, ' ').trim();
    const link = (e.match(/<link[^>]*href="([^"]+)"/) || [, ''])[1];
    const id = (e.match(/<id>([\s\S]*?)<\/id>/) || [, link])[1];
    if (!link) continue;

    // Reddit search returns subreddits (t5_) and accounts alongside posts (t3_)
    // and comments (t1_). A subreddit entry carries the subreddit's CREATION
    // date, so one merely named for the word would arrive dated years before the
    // coinage, or years after for reasons unrelated to any actual use of it.
    // Only posts and comments are uses of the word.
    if (!/^t[13]_/.test(id)) continue;

    // <author> wraps <name> and <uri>; taking the whole block appends the URL to
    // the handle.
    const author = ((e.match(/<author>[\s\S]*?<name>([\s\S]*?)<\/name>/) || [, ''])[1] || '')
      .trim().replace(/^\/u\//, '') || null;

    out.push({
      source: 'reddit',
      external_id: id,
      url: link.replace(/&amp;/g, '&'),
      author,
      title: pick('title'),
      raw: `${pick('title')} ${pick('content')}`,
      created_at: pick('updated') || new Date().toISOString(),
    });
  }
  return out;
}

// Google News RSS. Free, no key, covers blogs and press that get indexed.
async function news() {
  const xml = await withRetry(() =>
    t('https://news.google.com/rss/search?q=%22moation%22&hl=en-US&gl=US&ceid=US:en'));
  const out = [];
  const re = /<item>([\s\S]*?)<\/item>/g;
  let m;
  const pick = (b, tag) => (b.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`)) || [, ''])[1]
    .replace(/^<!\[CDATA\[|\]\]>$/g, '').replace(/<[^>]+>/g, '').trim();
  while ((m = re.exec(xml))) {
    const b = m[1];
    const link = pick(b, 'link');
    if (!link) continue;
    out.push({
      source: 'news',
      external_id: link,
      url: link,
      author: pick(b, 'source') || null,
      title: pick(b, 'title'),
      raw: `${pick(b, 'title')} ${pick(b, 'description')}`,
      created_at: new Date(pick(b, 'pubDate') || Date.now()).toISOString(),
    });
  }
  return out;
}

// GitHub repo search. Reported 487 hits on 2026-08-31, every one of them noise
// ("moat", "moats", VertexAnimation). The strict filter downstream is what makes
// this source usable at all.
async function github(env) {
  const headers = env.GITHUB_TOKEN ? { Authorization: `Bearer ${env.GITHUB_TOKEN}` } : {};
  const d = await j('https://api.github.com/search/repositories?q=moation&per_page=50', { headers });
  return (d.items || []).map((r) => ({
    source: 'github',
    external_id: String(r.id),
    url: r.html_url,
    author: r.owner?.login,
    title: r.full_name,
    raw: `${r.full_name} ${r.description || ''}`,
    created_at: r.created_at,
  }));
}

// Mastodon public tag timeline. Only catches hashtagged use, which is a real
// limitation, but it is free and needs no token.
async function mastodon() {
  const d = await j('https://mastodon.social/api/v1/timelines/tag/moation?limit=40');
  return (Array.isArray(d) ? d : []).map((s) => ({
    source: 'mastodon',
    external_id: s.id,
    url: s.url,
    author: s.account?.acct,
    title: null,
    raw: (s.content || '').replace(/<[^>]+>/g, ' '),
    created_at: s.created_at,
  }));
}

const SOURCES = { hn, bluesky, reddit, news, github, mastodon };

export async function collectMentions(env) {
  const detail = {};
  let scanned = 0;
  const candidates = [];
  for (const [name, fn] of Object.entries(SOURCES)) {
    try {
      const items = await fn(env);
      // A collector may deliberately sit out this run (Reddit is throttle-shy and
      // goes every third hour). That is not an outage and must not be scored as one.
      if (items && items.skipped) { detail[name] = { skipped: true }; continue; }
      scanned += items.length;
      const kept = items.filter(accept);
      detail[name] = { scanned: items.length, kept: kept.length };
      candidates.push(...kept);
    } catch (e) {
      detail[name] = { error: String(e.message || e) };
    }
  }
  return { candidates, scanned, detail };
}

// X has no free search tier. The syndication endpoint is unauthenticated though,
// so we can at least track the origin post's engagement hour by hour.
export async function collectSeedMetrics() {
  const d = await j(`https://cdn.syndication.twimg.com/tweet-result?id=${SEED_TWEET_ID}&token=x`);
  return {
    favorite_count: d.favorite_count ?? null,
    reply_count: d.conversation_count ?? null,
  };
}

export { excerpt, SEED_TWEET_ID };
