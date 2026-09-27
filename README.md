# Badminton Score

A shared, live badminton team/schedule/score tracker. Everyone who opens the
site sees the same teams, schedule and live scores — no per-device data,
no login. Built as a static frontend + Cloudflare Pages Functions API,
backed by Cloudflare D1 (SQLite).

## What it does

- **Teams** — add teams with any number of players.
- **Schedule** — pick teams + courts + minutes/match, generates a round-robin
  schedule spread across courts and time slots. "Extend schedule" appends
  more rounds (repeatable) if play runs long.
- **Live score** — tap a scheduled match to open the scoreboard. Supports
  two rule sets, chosen per match (locked once the first point is scored):
  - **BWF 21** — current official rule: first to 21, win by 2, capped at 30.
  - **Classic 15** — the pre-2006 system: first to 15, with a "setting"
    choice at 14-14 to extend the target to 17. This is a simplified house
    rule, not an official regulation — confirm against your group's exact
    convention if it matters.
- **History** — completed matches grouped by week, plus a player standings
  table (wins/losses, points for/against).

All game logic (win detection, round-robin generation) lives server-side in
`functions/`, so every viewer sees consistent results regardless of who taps
the button.

## Stack

- Static frontend: plain HTML/CSS/JS in `public/` — no build step.
- API: [Hono](https://hono.dev) running as a Cloudflare Pages Function
  (`functions/api/[[route]].ts`), one catch-all route file.
- Database: Cloudflare D1 (`migrations/0001_init.sql`).

## One-time setup (you'll need a free Cloudflare account)

```bash
npm install

# 1. Log into Cloudflare (opens a browser)
npx wrangler login

# 2. Create the D1 database
npx wrangler d1 create badminton
```

That prints a `database_id` — copy it into `wrangler.toml`, replacing
`REPLACE_WITH_YOUR_D1_DATABASE_ID`.

```bash
# 3. Apply the schema to the real (remote) database
npm run db:migrate:remote

# 4. Deploy
npm run deploy
```

`npm run deploy` prints the live `*.pages.dev` URL. For repeat deploys, just
re-run it (or connect this GitHub repo to a Cloudflare Pages project in the
dashboard for auto-deploy on every push).

## Local development

```bash
npm run db:migrate:local   # sets up a local D1 database (first time only)
npm run dev                # wrangler pages dev — serves public/ + functions/
```

## Project layout

```
public/            static site (index.html, styles.css, app.js)
functions/
  api/[[route]].ts   Hono app — all API routes
  lib/repo.ts        D1 data access
  lib/scoring.ts      scoring rules (pure logic)
  lib/scheduling.ts   round-robin schedule generation (pure logic)
migrations/         D1 schema migrations
wrangler.toml       Cloudflare config (Pages + D1 binding)
```
