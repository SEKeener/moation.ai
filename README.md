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

## The X scraper

X is where the word actually lives and it is the one platform with no free
search. An anonymous fetch of `/search?q=moation` returns a JavaScript shell with
no result data, and the API tier that would give us search is $200/mo. So search
runs through a real logged-in browser on a Mac, not on the Worker (Workers have
no browser, and Cloudflare Browser Rendering would give us a fresh session that
hits the same login wall).

It searches the bare word, not `#moation`. The coining post carries no hashtag
and neither does almost any use of it.

**Four runs a day at random times inside a PST waking window**, rather than
hourly, because a request landing at :00 every hour is trivially identifiable as
automation. `scraper/schedule.mjs` draws four times per day between 08:00 and
22:00 PST with a minimum 75 minute gap, launchd ticks every 15 minutes, and
`run.mjs` fires only when a slot is due, plus a few minutes of jitter. Slots
missed while the Mac slept run late within a two hour grace window rather than
firing all at once.

### The failure mode this guards against

If the session expires or X changes its DOM, the scraper returns zero results.
On this site zero is a completely plausible number, so a broken scraper looks
exactly like a quiet week and you could sit blind for a month. Every run
therefore also issues a control query for a term guaranteed to have recent hits.
If the control comes back empty the run is treated as failed and discarded, and
the ingest endpoint refuses any batch whose `control_count` is zero.

The Worker re-applies the full `accept()` gate to everything the scraper sends.
The scraper is a separate trust domain and this word attracts false positives.

### Setting it up

```bash
npm install && npx playwright install chromium
npm run x:login          # log in once, by hand; session persists in scraper/state
npm run x:once           # verify a single scrape
cp scraper/com.moation.xscrape.plist ~/Library/LaunchAgents/
# edit the plist: replace REPLACE_WITH_REPO_PATH and REPLACE_WITH_INGEST_KEY
launchctl load ~/Library/LaunchAgents/com.moation.xscrape.plist
```

`scraper/state/` holds the Chrome profile with live session cookies and is
gitignored. Never commit it.

**This is against X's terms of service.** Automating a logged-in session risks
suspension of whatever account holds it. Use a secondary account.

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

## License

Code is [MIT](LICENSE). Editorial content, including the exhibit catalogue in
`data/exhibits.json`, is [CC BY 4.0](LICENSE-CONTENT).

Two carve-outs worth stating plainly. The word and its definition belong to
Dr. Alex Wissner-Gross and are quoted with attribution; this project claims no
ownership of the term. Collected mentions remain the property of their authors,
are quoted only in brief with a link, and are never republished in full.
