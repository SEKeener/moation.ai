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

// Reddit. www.reddit.com/search.json now serves HTML to anonymous browser-UA
// requests, so use the OAuth API when credentials exist and fall back to the
// old.reddit HTML, which still works.
async function reddit(env) {
  if (env.REDDIT_CLIENT_ID && env.REDDIT_CLIENT_SECRET) {
    const auth = btoa(`${env.REDDIT_CLIENT_ID}:${env.REDDIT_CLIENT_SECRET}`);
    const tok = await fetch('https://www.reddit.com/api/v1/access_token', {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA },
      body: 'grant_type=client_credentials',
    }).then((r) => r.json());
    const d = await j('https://oauth.reddit.com/search?q=%22moation%22&sort=new&limit=100', {
      headers: { Authorization: `Bearer ${tok.access_token}` },
    });
    return (d.data?.children || []).map((c) => ({
      source: 'reddit',
      external_id: c.data.id,
      url: `https://reddit.com${c.data.permalink}`,
      author: c.data.author,
      title: c.data.title,
      raw: `${c.data.title} ${c.data.selftext || ''}`,
      created_at: new Date(c.data.created_utc * 1000).toISOString(),
    }));
  }
  const html = await t('https://old.reddit.com/search?q=%22moation%22&sort=new');
  const out = [];
  const re = /<a[^>]+class="search-title[^"]*"[^>]+href="([^"]+)"[^>]*>(.*?)<\/a>/g;
  let m;
  while ((m = re.exec(html))) {
    out.push({
      source: 'reddit',
      external_id: m[1],
      url: m[1],
      author: null,
      title: m[2].replace(/<[^>]+>/g, ''),
      raw: m[2].replace(/<[^>]+>/g, ''),
      created_at: new Date().toISOString(),
    });
  }
  return out;
}

// Google News RSS. Free, no key, covers blogs and press that get indexed.
async function news() {
  const xml = await t('https://news.google.com/rss/search?q=%22moation%22&hl=en-US&gl=US&ceid=US:en');
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
