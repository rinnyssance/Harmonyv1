# Harmony

Harmony is a peaceful multiplayer piano room with live notes, room chat, private rooms, and a sunset-inspired interface.

## Local development

Requirements: Node.js 22 or newer.

```bash
npm install
npm run dev
```

Redis is optional locally. Without `REDIS_URL`, Harmony uses in-memory rooms and chat for development.

## Deploying to Vercel

1. Import this repository into Vercel.
2. Install a Redis provider from the Vercel Marketplace.
3. Add its connection string as `REDIS_URL` in Production, Preview, and Development.
4. If you use a custom domain, set `APP_URL` to its full `https://` origin.
5. Deploy and verify `/api/health` returns `200` with `"storage": "redis"`.

Redis is required on Vercel because WebSocket connections can land on different Function instances. It stores rooms and chat while the Socket.IO Redis adapter distributes live notes, presence, and messages across those instances.

## Checks

```bash
npm run typecheck
npm run build
```

Created by Rinnyssance.
