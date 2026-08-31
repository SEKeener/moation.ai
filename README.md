# moation.ai

A live record of the word **moation** and of the behaviour it names.

> **moation** *n.* /ˈmoʊtʃən/ (moat + motion)
> The ability to turn one temporary competitive advantage into the next before the first is competed away. A moat is a position. Moation is a process.

Coined by [Dr. Alex Wissner-Gross](https://x.com/alexwg) on 30 August 2026 in [this post](https://x.com/alexwg/status/2094051899502690804). This site is an independent record, not affiliated with him. The homepage and footer credit him and link the original.

## What the site does

Two separate streams, because they behave very differently:

1. **Uses of the word.** Collected hourly from Hacker News, Bluesky, Reddit, Google News, GitHub and Mastodon. On day 1 this was genuinely empty everywhere except X, and it may stay thin for a while. That is fine: the point is that collection starts at hour zero, so the record of how the word spreads exists from the beginning and cannot be reconstructed later.
2. **Exhibits.** Named instances of the *behaviour*, curated in `data/exhibits.json`. The word is new; the move is not. Each exhibit converts one edge into another, and since the definition names six edge kinds (capital, talent, compute, data, distribution, technology) they arrange into a 6x6 **moation matrix** on the homepage. Hatched cells are conversions not yet catalogued.

Adding an exhibit is a pull request against `data/exhibits.json`. No CMS.

## Why the matching is paranoid

"moation" is one letter from "motion" and search APIs will confidently hand you thousands of the wrong thing. Measured 2026-08-31:

- Hacker News Algolia returned **56,629 hits** for the unquoted query and **0** for `"moation"`. The unquoted results were "motion", "notation", "mutation".
- GitHub search returned **487 repositories and 1,492 code results**, every one of them noise ("moat", "moats", VertexAnimation).

So `src/match.js` re-checks every candidate against the raw text with a word-boundary regex, and applies two more gates that caught real false positives on the first live run:

- **Date floor.** The word did not exist before 2026-08-30T13:17:33Z, so nothing published earlier can be a use of it. This caught a spam repo whose description is literally `moation`.
- **Self-reference.** Excludes moation.ai and this repository, otherwise the site's first recorded mention of the word is itself.

Never trust an upstream relevance score. Filter on the text you actually received.

## Sources and their quirks

| Source | Auth | Notes |
|---|---|---|
| Hacker News | none | Algolia. Must quote the query. |
| Google News | none | RSS. Covers blogs and press once indexed. |
| Mastodon | none | Public tag timeline only, so it catches hashtagged use and misses plain prose. |
| GitHub | optional token | Token only raises the rate limit. |
| Bluesky | app password | The public appview 403s from some networks, including Cloudflare. Set `BSKY_HANDLE` and `BSKY_APP_PASSWORD` for a real session. |
| Reddit | optional OAuth | `www.reddit.com/search.json` now serves HTML to anonymous browser-UA requests. Falls back to scraping old.reddit, which still works. |
| X | **no free search** | The origin post's engagement is tracked hourly via the unauthenticated syndication endpoint, which exposes likes and replies only. Full search needs X API Basic at $200/mo, which is not worth it until volume justifies it. |

## Setup

```bash
npm install
npx wrangler d1 create moation          # put the returned id in wrangler.toml
npm run db:init                          # remote schema
npm run seed                             # mirror exhibits.json into D1
npm run deploy
```

Local development:

```bash
npm run db:init:local
echo 'COLLECT_SECRET = "devtest"' > .dev.vars
npm run dev
curl "http://127.0.0.1:8787/api/collect?key=devtest"   # force a run
```

Optional secrets, all set with `npx wrangler secret put NAME`: `COLLECT_SECRET`, `BSKY_HANDLE`, `BSKY_APP_PASSWORD`, `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, `GITHUB_TOKEN`.

## Routes

- `/` homepage: definition, matrix, exhibits, mention feed
- `/mentions.json` full corpus as JSON, CORS open
- `/feed.xml` RSS of uses in the wild
- `/api/collect?key=...` manual collector trigger

## Stack

Cloudflare Worker, D1, hourly cron trigger. No framework, no build step. Costs about nothing.
