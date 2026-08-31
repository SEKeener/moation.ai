import { SEED_TWEET_ID } from './collect.js';

export const EDGES = ['capital', 'talent', 'compute', 'data', 'distribution', 'technology'];
export const COINED_AT = '2026-08-30T13:17:33Z';
export const TWEET_URL = `https://x.com/alexwg/status/${SEED_TWEET_ID}`;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const day = () => Math.floor((Date.now() - Date.parse(COINED_AT)) / 86400000) + 1;
const ago = (iso) => {
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
};

const SOURCE_LABEL = { hn: 'Hacker News', bluesky: 'Bluesky', reddit: 'Reddit', news: 'News', github: 'GitHub', mastodon: 'Mastodon', x: 'X' };

function matrix(exhibits) {
  const cell = {};
  for (const e of exhibits) (cell[`${e.from_edge}>${e.to_edge}`] ||= []).push(e);
  const head = EDGES.map((e) => `<th>${e}</th>`).join('');
  const rows = EDGES.map((from) => {
    const tds = EDGES.map((to) => {
      const hits = cell[`${from}>${to}`] || [];
      if (!hits.length) return '<td class="empty"></td>';
      return `<td class="hit">${hits.map((h) => `<a href="#${esc(h.slug)}" title="${esc(h.actor)}: ${esc(h.name)}">${esc(h.actor)}</a>`).join('')}</td>`;
    }).join('');
    return `<tr><th class="rh">${from}</th>${tds}</tr>`;
  }).join('');
  return `<table class="matrix"><thead><tr><th></th>${head}</tr></thead><tbody>${rows}</tbody></table>`;
}

function exhibitCards(exhibits) {
  return exhibits.map((e) => `
  <article class="exhibit" id="${esc(e.slug)}">
    <h3>${esc(e.name)}</h3>
    <p class="meta"><span class="actor">${esc(e.actor)}</span> <span class="kind">${esc(e.kind)}</span> <span class="era">${esc(e.era || '')}</span></p>
    <p class="conv"><span>${esc(e.from_edge)}</span> &rarr; <span>${esc(e.to_edge)}</span></p>
    <p>${esc(e.summary)}</p>
    ${e.source_url ? `<p class="src"><a href="${esc(e.source_url)}" rel="noopener">source</a></p>` : ''}
  </article>`).join('');
}

function mentionList(mentions) {
  if (!mentions.length) {
    return `<p class="empty-state">No uses of the word have been recorded outside X yet. That is expected, and it is the point: collection started on day 1, so whatever happens next is on the record from the beginning. Checked hourly across Hacker News, Bluesky, Reddit, Google News, GitHub and Mastodon.</p>`;
  }
  return `<ul class="mentions">${mentions.map((m) => `
    <li>
      <a class="m-src" href="${esc(m.url)}" rel="noopener">${esc(SOURCE_LABEL[m.source] || m.source)}</a>
      ${m.author ? `<span class="m-au">${esc(m.author)}</span>` : ''}
      <time>${esc(ago(m.created_at))}</time>
      <p>${esc(m.excerpt)}</p>
    </li>`).join('')}</ul>`;
}

export function homepage({ exhibits, mentions, counts, seed, lastRun }) {
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'DefinedTerm',
    name: 'moation',
    alternateName: 'moation (moat + motion)',
    description: 'The ability to turn one temporary competitive advantage into the next before the first is competed away. A moat is a position. Moation is a process.',
    inDefinedTermSet: { '@type': 'DefinedTermSet', name: 'moation.ai', url: 'https://moation.ai/' },
    url: 'https://moation.ai/',
    sameAs: TWEET_URL,
  };
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>moation - turning one temporary edge into the next</title>
<meta name="description" content="moation (moat + motion): the ability to turn one temporary competitive advantage into the next before the first is competed away. Coined by Dr. Alex Wissner-Gross. A live record of the word and the behaviour.">
<link rel="canonical" href="https://moation.ai/">
<link rel="alternate" type="application/rss+xml" title="moation mentions" href="/feed.xml">
<meta property="og:title" content="moation"><meta property="og:description" content="A moat is a position. Moation is a process."><meta property="og:url" content="https://moation.ai/"><meta property="og:type" content="website">
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">${JSON.stringify(ld)}</script>
<style>
:root{--bg:#0c0d10;--fg:#e8e6e1;--dim:#8b8a86;--line:#22242a;--acc:#7dd3a0;--card:#131519}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.6 ui-sans-serif,-apple-system,'Segoe UI',system-ui,sans-serif;-webkit-font-smoothing:antialiased}
.wrap{max-width:820px;margin:0 auto;padding:0 22px}
a{color:var(--acc);text-decoration:none}a:hover{text-decoration:underline}
header{padding:64px 0 40px;border-bottom:1px solid var(--line)}
h1{font:600 15px/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.22em;text-transform:uppercase;color:var(--dim);margin:0 0 34px}
.word{font-size:clamp(44px,9vw,76px);font-weight:600;letter-spacing:-.03em;margin:0;line-height:1}
.pron{color:var(--dim);font:400 18px/1.4 ui-monospace,Menlo,monospace;margin:12px 0 0}
.pos{font-style:italic;color:var(--dim)}
.def{font-size:20px;line-height:1.55;margin:26px 0 0;max-width:60ch}
.def strong{font-weight:600}
.credit{margin:28px 0 0;padding:14px 16px;background:var(--card);border-left:2px solid var(--acc);border-radius:0 4px 4px 0;font-size:14px;color:var(--dim)}
.credit a{font-weight:500}
section{padding:44px 0;border-bottom:1px solid var(--line)}
h2{font:600 13px/1 ui-monospace,Menlo,monospace;letter-spacing:.18em;text-transform:uppercase;color:var(--dim);margin:0 0 8px}
.lede{color:var(--dim);font-size:15px;margin:0 0 26px;max-width:62ch}
.stats{display:flex;flex-wrap:wrap;gap:34px;margin:0}
.stat b{display:block;font-size:30px;font-weight:600;letter-spacing:-.02em}
.stat span{font-size:12px;color:var(--dim);text-transform:uppercase;letter-spacing:.1em}
.mx-scroll{overflow-x:auto;margin:0 -22px;padding:0 22px}
table.matrix{border-collapse:collapse;font-size:12px;min-width:560px}
table.matrix th{font-weight:500;color:var(--dim);text-transform:uppercase;letter-spacing:.08em;font-size:10px;padding:7px 9px;text-align:left;white-space:nowrap}
table.matrix th.rh{text-align:right;border-right:1px solid var(--line)}
table.matrix td{border:1px solid var(--line);padding:6px 8px;vertical-align:top;min-width:74px;height:40px}
table.matrix td.empty{background:repeating-linear-gradient(45deg,transparent,transparent 5px,#16181d 5px,#16181d 6px)}
table.matrix td.hit{background:var(--card)}
table.matrix td a{display:block;font-size:11px;line-height:1.45;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:110px}
.exhibit{padding:22px 0;border-top:1px solid var(--line)}
.exhibit:first-of-type{border-top:none}
.exhibit h3{margin:0;font-size:21px;font-weight:600;letter-spacing:-.01em}
.exhibit .meta{margin:5px 0 0;font-size:13px;color:var(--dim)}
.exhibit .actor{color:var(--fg);font-weight:500}
.exhibit .kind{border:1px solid var(--line);border-radius:99px;padding:1px 8px;font-size:11px;text-transform:uppercase;letter-spacing:.08em;margin-left:6px}
.exhibit .conv{margin:11px 0;font:500 12px/1 ui-monospace,Menlo,monospace;color:var(--acc);text-transform:uppercase;letter-spacing:.1em}
.exhibit p{max-width:64ch}
.exhibit .src{font-size:12px;margin-bottom:0}
.mentions{list-style:none;padding:0;margin:0}
.mentions li{padding:15px 0;border-top:1px solid var(--line)}
.mentions li:first-child{border-top:none}
.m-src{font:500 12px/1 ui-monospace,Menlo,monospace;text-transform:uppercase;letter-spacing:.1em}
.m-au,.mentions time{color:var(--dim);font-size:12px;margin-left:9px}
.mentions p{margin:7px 0 0;font-size:15px}
.empty-state{color:var(--dim);font-size:15px;max-width:62ch;margin:0;padding:18px;background:var(--card);border-radius:5px}
footer{padding:38px 0 70px;font-size:13px;color:var(--dim)}
footer p{max-width:64ch}
@media(prefers-color-scheme:light){:root{--bg:#fbfaf8;--fg:#16171a;--dim:#6b6a67;--line:#e3e1dc;--acc:#177a4a;--card:#f2f0eb}table.matrix td.empty{background:repeating-linear-gradient(45deg,transparent,transparent 5px,#eceae5 5px,#eceae5 6px)}}
</style></head><body>
<div class="wrap">
<header>
  <h1>moation.ai</h1>
  <p class="word">moation</p>
  <p class="pron">/&#712;mo&#650;t&#643;&#601;n/ &#183; <span class="pos">noun</span> &#183; moat + motion</p>
  <p class="def">The ability to turn one temporary competitive advantage into the next before the first is competed away. <strong>A moat is a position. Moation is a process.</strong> It means continuously using today's transient edge in capital, talent, compute, data, distribution, or technology to create tomorrow's.</p>
  <p class="credit">Coined by <a href="https://x.com/alexwg" rel="noopener">Dr. Alex Wissner-Gross</a> on 30 August 2026, in <a href="${TWEET_URL}" rel="noopener">this post</a>: "In the Singularity, there may be no permanent moats. Only moation." This site is an independent record of the word and the behaviour, not affiliated with him.</p>
</header>

<section>
  <h2>Tracking</h2>
  <div class="stats">
    <div class="stat"><b>${day()}</b><span>day of record</span></div>
    <div class="stat"><b>${counts.total}</b><span>uses collected</span></div>
    <div class="stat"><b>${exhibits.length}</b><span>exhibits named</span></div>
    ${seed ? `<div class="stat"><b>${seed.favorite_count ?? '-'}</b><span>likes on the origin post</span></div>` : ''}
  </div>
</section>

<section>
  <h2>The moation matrix</h2>
  <p class="lede">Every act of moation converts one kind of edge into another. Rows are the edge held, columns the edge it bought. Hatched cells are conversions we have not catalogued yet.</p>
  <div class="mx-scroll">${matrix(exhibits)}</div>
</section>

<section>
  <h2>Exhibits</h2>
  <p class="lede">Named instances of the behaviour, by companies, people and agents. The word is new. The move is not.</p>
  ${exhibitCards(exhibits)}
</section>

<section>
  <h2>Uses of the word</h2>
  <p class="lede">Every recorded use of "moation" in the wild, newest first. Collected hourly. Matched strictly, because "moation" is one letter from "motion" and search APIs will confidently hand you thousands of the wrong thing.</p>
  ${mentionList(mentions)}
</section>

<footer>
  <p>moation was coined by <a href="https://x.com/alexwg" rel="noopener">Dr. Alex Wissner-Gross</a>. Read <a href="${TWEET_URL}" rel="noopener">the original post</a>.</p>
  <p>Independent, unaffiliated, and built as an open record. <a href="/mentions.json">JSON</a> &#183; <a href="/feed.xml">RSS</a> &#183; <a href="https://github.com/SEKeener/moation.ai" rel="noopener">source</a>. Know an exhibit we are missing? Open a pull request against <code>data/exhibits.json</code>.</p>
  <p>Last collection run: ${lastRun ? esc(ago(lastRun)) : 'pending'}.</p>
</footer>
</div></body></html>`;
}

export function feed(mentions) {
  const items = mentions.map((m) => `<item><title>${esc((SOURCE_LABEL[m.source] || m.source) + ': ' + (m.title || m.excerpt).slice(0, 90))}</title><link>${esc(m.url)}</link><guid isPermaLink="false">${esc(m.source + ':' + m.external_id)}</guid><pubDate>${new Date(m.created_at).toUTCString()}</pubDate><description>${esc(m.excerpt)}</description></item>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>moation - uses in the wild</title><link>https://moation.ai/</link><description>Every recorded use of the word moation, collected hourly.</description>${items}</channel></rss>`;
}
