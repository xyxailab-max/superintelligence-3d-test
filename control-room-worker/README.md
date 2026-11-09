# USI Control Room V2 — TEST Worker

Private founder dashboard. **TEST only.** Not the live site (live Worker = `usesuperintelligence`, other repo).

- Worker name: `usi-control-room-test` (locked in `wrangler.jsonc`)
- Database: `usi-control-room-test-db` (TEST only; tables are created by the Worker itself on first login)
- Screens: `public/` (copy of the V1.1 design; the public demo in `/control-room/` is separate and unchanged)
- Login: Cloudflare Access on workers.dev + full login-pass check in `src/auth.js` on every request
- Locked until these 3 dashboard variables exist: `POLICY_AUD`, `TEAM_DOMAIN`, `ALLOWED_EMAIL`

## Cloudflare build settings
- Root directory: `control-room-worker`
- Build command: (leave empty)
- Deploy command: `npx wrangler deploy`
- Production branch: `control-room-deploy`
- Preview builds: OFF

## Safety test (local, no network)
`node --test control-room-worker/test/security.test.mjs`

No AI, no expenses (V2.1), no delete routes.
