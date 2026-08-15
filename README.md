# Aviator

Full-stack Aviator-style multiplier game with React (Canvas) frontend and Node.js + Socket.io backend.

## Structure

```
aviator/
├── backend/          # Express + Socket.io game server
│   └── src/
│       ├── index.js
│       └── game/
│           ├── GameEngine.js
│           └── provablyFair.js
└── frontend/         # React + Vite client with Canvas graph
```

## Quick start

```bash
npm run install:all
npm run dev
```

- Frontend: http://localhost:5173
- Backend / Socket.io: http://localhost:3001

## Provably Fair

Each round generates a server seed. The crash point is derived via HMAC-SHA256. After the round ends, the server seed is revealed so clients can verify the result.

## Gameplay (Aviator-style)

- Dual independent bet panels per round
- Manual cash out + optional auto cash out
- Live bets feed for the current round
- Round history strip (color-coded multipliers)
- Demo balance in **ETB** (matches common operator embeds)

## Deploy (Netlify frontend)

Netlify can host the **frontend only**. Socket.io needs a Node host (Render, Railway, Fly.io, etc.).

1. Push this repo (includes `netlify.toml`).
2. In Netlify: import the GitHub repo — build settings are already in `netlify.toml`.
3. Deploy the backend separately, then set Netlify env:
   - `VITE_SOCKET_URL` = your backend URL (e.g. `https://your-app.onrender.com`)
4. On the backend host set:
   - `CORS_ORIGIN` = your Netlify URL (e.g. `https://your-site.netlify.app`)
5. Trigger a new Netlify deploy after setting `VITE_SOCKET_URL` (Vite bakes it in at build time).

Without a successful frontend build publish (`frontend/dist`), Netlify shows **Page not found**.

