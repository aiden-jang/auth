# Deploying is-it-a-dog → is-it-a-dog.aidenjang.com

**Status: not yet deployed** (step 4.6). Two Cloudflare Workers:

- **`is-it-a-dog-ai`** — the vision worker (`/guess`). Internal: only the game server calls it,
  server-side. Stays on its `*.workers.dev` URL (no custom domain). Mock provider by default.
- **`is-it-a-dog-game`** — the game server: the `GameRoom` Durable Object (one per room) + serves
  the client SPA (`[assets]`) + the `/rooms/:id/ws` WebSocket. Custom domain, free tier.

The room DO is SQLite-backed and created automatically by the `new_sqlite_classes` migration on
first deploy — no separate command (unlike D1).

## 1. Deploy the ai-worker

```bash
cd apps/is-it-a-dog/packages/ai-worker
pnpm exec wrangler deploy        # → note the URL, e.g. https://is-it-a-dog-ai.aidenjang.workers.dev
```

Optional real vision (else mock): `echo "<key>" | pnpm exec wrangler secret put ANTHROPIC_API_KEY`
(or `OPENAI_API_KEY`). Mock needs no key and proves the pipeline end-to-end.

## 2. Point the game server at it

In `apps/is-it-a-dog/packages/game-server/wrangler.toml`, set the ai-worker URL from step 1:

```toml
[vars]
AI_WORKER_URL = "https://is-it-a-dog-ai.aidenjang.workers.dev"
```

(Leave it `""` to ship without AI — classic mode is unaffected; AI modes just won't guess.)

## 3. Deploy the game server (custom-domain two-step)

```bash
cd apps/is-it-a-dog/packages/game-server
# - Comment out the [[routes]] block in wrangler.toml first.
pnpm run deploy                  # builds the client, then wrangler deploy (creates the DO + first deployment)
# - Uncomment [[routes]], then:
pnpm run deploy                  # redeploy to attach is-it-a-dog.aidenjang.com
```

`workers_dev = false` keeps it custom-domain-only. The account already has a workers.dev subdomain.

## Smoke test + two-player playthrough

```bash
curl https://is-it-a-dog.aidenjang.com/health   # {"status":"ok","service":"is-it-a-dog"}
```

Then open `https://is-it-a-dog.aidenjang.com` in **two browser windows** (or two devices):

1. Window A: enter a name, create/join a room (note the room in the URL hash), pick a mode.
2. Window B: open the same invite link → both should appear in the roster (presence).
3. Start the game. The drawer picks a word and draws; strokes stream live to the other window.
4. The guesser types the word → it's consumed as a correct guess (scored, not shown as chat).
5. Watch the turn timer, hint reveals, round rotation, and the scoreboard.
6. (AI mode, if a key is set) the AI joins the roster and guesses/draws.
7. Reconnect check: refresh one window mid-game → it rejoins as the same player with state intact.

## Local dev (no Cloudflare needed)

```bash
# ai-worker (:33400) + game server (:33300, serves client dist + WS) + client dev (:33100)
cd apps/is-it-a-dog/packages/ai-worker   && pnpm exec wrangler dev --port 33400 --inspector-port 9233 --local
cd apps/is-it-a-dog/packages/game-server && pnpm exec wrangler dev --port 33300 --inspector-port 9232 --local --var AI_WORKER_URL:http://localhost:33400
cd apps/is-it-a-dog/packages/client      && pnpm dev   # http://localhost:33100, proxies /rooms → :33300
```
