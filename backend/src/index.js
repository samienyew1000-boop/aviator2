import cors from 'cors';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import {
  adminMiddleware,
  authMiddleware,
  getUserByToken,
  listUsersPublic,
  login,
  logout,
  register,
} from './auth/store.js';
import { GameEngine } from './game/GameEngine.js';
import { verifyCrashPoint } from './game/provablyFair.js';

const PORT = process.env.PORT || 3001;
const CORS_ORIGINS = (
  process.env.CORS_ORIGIN ||
  'http://localhost:5173,http://127.0.0.1:5173'
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const app = express();
app.use(cors({ origin: CORS_ORIGINS, credentials: true }));
app.use(express.json());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: CORS_ORIGINS,
    methods: ['GET', 'POST'],
  },
});

const game = new GameEngine(io);

app.get('/health', (_req, res) => {
  res.json({ ok: true, status: game.status, autoRun: game.autoRun });
});

app.get('/api/state', (_req, res) => {
  res.json(game.getPublicState());
});

app.post('/api/auth/register', (req, res) => {
  const result = register(req.body?.username, req.body?.password);
  if (!result.ok) return res.status(400).json(result);
  res.json(result);
});

app.post('/api/auth/login', (req, res) => {
  const result = login(req.body?.username, req.body?.password);
  if (!result.ok) return res.status(401).json(result);
  res.json(result);
});

app.post('/api/auth/logout', authMiddleware, (req, res) => {
  logout(req.token);
  res.json({ ok: true });
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  res.json({ ok: true, user: req.user });
});

app.get('/api/admin/state', adminMiddleware, (_req, res) => {
  res.json({
    ok: true,
    game: game.getAdminState(),
    users: listUsersPublic(),
  });
});

app.post('/api/admin/start-round', adminMiddleware, (_req, res) => {
  const result = game.adminStartRound();
  if (!result.ok) return res.status(400).json(result);
  res.json(result);
});

app.post('/api/admin/auto-run', adminMiddleware, (req, res) => {
  const result = game.setAutoRun(Boolean(req.body?.enabled));
  res.json(result);
});

app.post('/api/admin/crash-config', adminMiddleware, (req, res) => {
  const result = game.setCrashConfig(req.body ?? {});
  res.json(result);
});

app.post('/api/verify', (req, res) => {
  const { serverSeed, clientSeed, nonce, crashPoint } = req.body ?? {};
  if (!serverSeed || clientSeed == null || nonce == null || crashPoint == null) {
    return res.status(400).json({ error: 'Missing fields' });
  }
  const valid = verifyCrashPoint(
    serverSeed,
    clientSeed,
    Number(nonce),
    Number(crashPoint)
  );
  res.json({ valid });
});

io.on('connection', (socket) => {
  const token = socket.handshake.auth?.token;
  const account = getUserByToken(token);

  const player = game.registerPlayer(socket.id, {
    name: account?.displayName || socket.handshake.auth?.name,
    userId: account?.id || null,
    balance: account?.balance,
  });

  if (account?.role === 'admin') {
    socket.join('admins');
    socket.emit('admin:state', game.getAdminState());
  }

  socket.emit('player:update', {
    balance: player.balance,
    name: player.name,
    userId: player.userId,
    role: account?.role || 'guest',
  });
  socket.emit('game:state', game.getPublicState());

  socket.on('bet:place', (payload, ack) => {
    const result = game.placeBet(socket.id, payload ?? {});
    ack?.(result);
    if (result.ok) {
      socket.emit('player:update', {
        balance: result.balance,
        name: player.name,
        userId: player.userId,
      });
    }
  });

  socket.on('bet:cashout', (payload, ack) => {
    const result = game.cashout(socket.id, payload ?? {});
    ack?.(result);
  });

  socket.on('admin:start-round', (payload, ack) => {
    if (account?.role !== 'admin') {
      ack?.({ ok: false, error: 'Admin only' });
      return;
    }
    ack?.(game.adminStartRound());
  });

  socket.on('admin:auto-run', (payload, ack) => {
    if (account?.role !== 'admin') {
      ack?.({ ok: false, error: 'Admin only' });
      return;
    }
    ack?.(game.setAutoRun(Boolean(payload?.enabled)));
  });

  socket.on('admin:crash-config', (payload, ack) => {
    if (account?.role !== 'admin') {
      ack?.({ ok: false, error: 'Admin only' });
      return;
    }
    ack?.(game.setCrashConfig(payload ?? {}));
  });

  socket.on('disconnect', () => {
    game.removePlayer(socket.id);
  });
});

game.start();

httpServer.listen(PORT, () => {
  console.log(`Aviator backend listening on http://localhost:${PORT}`);
  console.log('Default admin: admin / admin123');
});
