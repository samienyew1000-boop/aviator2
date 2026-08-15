import cors from 'cors';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { GameEngine } from './game/GameEngine.js';
import { verifyCrashPoint } from './game/provablyFair.js';

const PORT = process.env.PORT || 3001;

const app = express();
app.use(cors());
app.use(express.json());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
    methods: ['GET', 'POST'],
  },
});

const game = new GameEngine(io);

app.get('/health', (_req, res) => {
  res.json({ ok: true, status: game.status });
});

app.get('/api/state', (_req, res) => {
  res.json(game.getPublicState());
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
  const player = game.registerPlayer(socket.id, socket.handshake.auth?.name);
  socket.emit('player:update', { balance: player.balance, name: player.name });
  socket.emit('game:state', game.getPublicState());

  socket.on('bet:place', (payload, ack) => {
    const result = game.placeBet(socket.id, payload ?? {});
    ack?.(result);
    if (result.ok) {
      socket.emit('player:update', {
        balance: result.balance,
        name: player.name,
      });
    }
  });

  socket.on('bet:cashout', (payload, ack) => {
    const result = game.cashout(socket.id, payload ?? {});
    ack?.(result);
  });

  socket.on('disconnect', () => {
    game.removePlayer(socket.id);
  });
});

game.start();

httpServer.listen(PORT, () => {
  console.log(`Aviator backend listening on http://localhost:${PORT}`);
});
