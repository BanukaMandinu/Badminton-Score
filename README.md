# Badminton Score

A shared, live badminton team/schedule/score tracker. Everyone who opens the
site sees the same teams, schedule and live scores — no per-device data,
no login. Built as a Cloudflare Worker serving a static frontend plus an
API, backed by Cloudflare D1 (SQLite).

## What it does

- **Teams** — add teams with any number of players.
- **Schedule** — pick teams, courts, and how many rounds to schedule (a
  round-robin cycle repeats from the start if you ask for more rounds than
  one full cycle has). "Extend schedule" appends another cycle later if
  play runs long. Optionally, once every round is complete, a **Final** is
  auto-added between the top 2 teams by wins (points as tiebreak).
- **Live score** — tap a scheduled match to open the scoreboard. Supports
  two rule sets, chosen per match (locked once the first point is scored):
  - **BWF 21** — current official rule: first to 21, win by 2, capped at 30.
  - **Classic 15** — the pre-2006 system: first to 15, with a "setting"
    choice at 14-14 to extend the target to 17. This is a simplified house
    rule, not an official regulation — confirm against your group's exact
    convention if it matters.
  - Or skip the point-by-point scoring and just pick the winner directly.
- **Leaderboard** — the current session's team standings and Final fixture.
- **History** — completed matches grouped by week, plus a player standings
  table (wins/losses, points for/against) across all sessions.

All game logic (win detection, round-robin generation) lives server-side in
`src/`, so every viewer sees consistent results regardless of who taps the
button.

## Stack

- A single Cloudflare Worker (`src/index.ts`) using [Hono](https://hono.dev)
  for routing, serving the static frontend in `public/` via Workers Assets
  and the `/api/*` routes itself.
- Database: Cloudflare D1 (`migrations/`).

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

`npm run deploy` prints the live `*.workers.dev` URL. For repeat deploys,
just re-run it (or connect this GitHub repo to a Cloudflare Workers project
in the dashboard for auto-deploy on every push — make sure its deploy
command is `npx wrangler deploy`, not `npx wrangler pages deploy`).

Whenever a new file is added under `migrations/`, run
`npm run db:migrate:remote` again before the next deploy.

## Local development

```bash
npm run db:migrate:local   # sets up a local D1 database (first time only)
npm run dev                # wrangler dev — serves public/ + src/
```

## Project layout

```
public/            static site (index.html, styles.css, app.js)
src/
  index.ts           Hono app — all API routes, the Worker's entry point
  lib/repo.ts         D1 data access
  lib/scoring.ts      scoring rules (pure logic)
  lib/scheduling.ts   round-robin schedule generation (pure logic)
migrations/         D1 schema migrations
wrangler.toml       Cloudflare config (Worker entry, static assets, D1 binding)
```
