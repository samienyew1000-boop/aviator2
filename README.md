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
