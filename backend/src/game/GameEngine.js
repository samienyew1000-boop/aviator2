import {
  calculateCrashPoint,
  generateServerSeed,
  sha256,
} from './provablyFair.js';
import { DemoBetSimulator } from './demoBets.js';

export const GameStatus = {
  WAITING: 'WAITING',
  RUNNING: 'RUNNING',
  CRASHED: 'CRASHED',
};

const TICK_MS = 100;
const WAITING_MS = 5000;
const CRASHED_MS = 3000;
/** Growth rate: multiplier ≈ e^(r * tSeconds) */
const GROWTH_RATE = 0.06;
const STARTING_BALANCE = 5000;
const MIN_BET = 1;
const MAX_BET = 1000;
const CURRENCY = 'ETB';

export class GameEngine {
  /**
   * @param {import('socket.io').Server} io
   */
  constructor(io) {
    this.io = io;
    this.status = GameStatus.WAITING;
    this.multiplier = 1.0;
    this.crashPoint = 1.0;
    this.roundId = 0;
    this.serverSeed = null;
    this.serverSeedHash = null;
    this.clientSeed = 'aviator';
    this.nonce = 0;
    this.startedAt = null;
    this.waitingEndsAt = null;
    this.tickTimer = null;
    this.phaseTimer = null;
    this.history = [];
    /** @type {Map<string, object>} */
    this.players = new Map();
    /** Active bets for the current round */
    this.bets = [];
    this.betSeq = 0;
    this.demo = new DemoBetSimulator(this);
  }

  start() {
    this.beginWaiting();
  }

  stop() {
    this.demo.clear();
    this.clearTimers();
  }

  registerPlayer(socketId, name) {
    const player = {
      id: socketId,
      name: name || `Player${Math.floor(Math.random() * 9000 + 1000)}`,
      balance: STARTING_BALANCE,
    };
    this.players.set(socketId, player);
    return player;
  }

  removePlayer(socketId) {
    this.players.delete(socketId);
    // Keep placed bets; they resolve with the round
  }

  getPlayer(socketId) {
    return this.players.get(socketId);
  }

  getPublicState() {
    const state = {
      status: this.status,
      multiplier: Number(this.multiplier.toFixed(2)),
      roundId: this.roundId,
      serverSeedHash: this.serverSeedHash,
      clientSeed: this.clientSeed,
      nonce: this.nonce,
      currency: CURRENCY,
      waitingEndsAt: this.waitingEndsAt,
      history: this.history.slice(0, 30).map((h) => ({
        roundId: h.roundId,
        crashPoint: h.crashPoint,
      })),
      bets: this.bets.map((b) => this.publicBet(b)),
    };

    if (this.status === GameStatus.CRASHED) {
      state.crashPoint = this.crashPoint;
      state.serverSeed = this.serverSeed;
    }

    return state;
  }

  publicBet(bet) {
    return {
      id: bet.id,
      playerId: bet.playerId,
      playerName: bet.playerName,
      slot: bet.slot,
      amount: bet.amount,
      status: bet.status,
      cashoutAt: bet.cashoutAt,
      payout: bet.payout,
      autoCashout: bet.autoCashout,
    };
  }

  broadcast(event = 'game:state') {
    this.io.emit(event, this.getPublicState());
  }

  broadcastBets() {
    this.io.emit(
      'bets:update',
      this.bets.map((b) => this.publicBet(b))
    );
  }

  beginWaiting() {
    this.clearTimers();
    this.demo.clear();
    this.status = GameStatus.WAITING;
    this.multiplier = 1.0;
    this.roundId += 1;
    this.nonce = this.roundId;
    this.serverSeed = generateServerSeed();
    this.serverSeedHash = sha256(this.serverSeed);
    this.bets = [];
    this.waitingEndsAt = Date.now() + WAITING_MS;

    const { crashPoint } = calculateCrashPoint(
      this.serverSeed,
      this.clientSeed,
      this.nonce
    );
    this.crashPoint = Number(crashPoint.toFixed(2));

    this.broadcast();
    this.demo.onWaiting();
    // Include seeded demo bets in the next state push
    this.broadcast();
    this.phaseTimer = setTimeout(() => this.beginRunning(), WAITING_MS);
  }

  beginRunning() {
    this.clearTimers();
    this.status = GameStatus.RUNNING;
    this.multiplier = 1.0;
    this.startedAt = Date.now();
    this.waitingEndsAt = null;
    this.broadcast();
    this.tickTimer = setInterval(() => this.tick(), TICK_MS);
  }

  tick() {
    const elapsedSec = (Date.now() - this.startedAt) / 1000;
    const next = Math.exp(GROWTH_RATE * elapsedSec);
    this.multiplier = Math.floor(next * 100) / 100;

    this.processAutoCashouts();
    this.demo.onTick(this.multiplier);

    if (this.multiplier >= this.crashPoint) {
      this.multiplier = this.crashPoint;
      this.beginCrashed();
      return;
    }

    this.io.emit('game:tick', {
      status: this.status,
      multiplier: this.multiplier,
      roundId: this.roundId,
    });
  }

  processAutoCashouts() {
    let changed = false;
    for (const bet of this.bets) {
      if (bet.status !== 'active' || !bet.autoCashout) continue;
      if (this.multiplier >= bet.autoCashout) {
        this.settleCashout(bet, bet.autoCashout);
        changed = true;
      }
    }
    if (changed) this.broadcastBets();
  }

  beginCrashed() {
    this.clearTimers();
    this.status = GameStatus.CRASHED;
    this.multiplier = this.crashPoint;

    for (const bet of this.bets) {
      if (bet.status === 'active') {
        bet.status = 'lost';
        bet.cashoutAt = null;
        bet.payout = 0;
      }
    }

    this.history.unshift({
      roundId: this.roundId,
      crashPoint: this.crashPoint,
      serverSeed: this.serverSeed,
      serverSeedHash: this.serverSeedHash,
      clientSeed: this.clientSeed,
      nonce: this.nonce,
    });
    if (this.history.length > 50) this.history.length = 50;

    this.broadcast('game:crash');
    this.broadcast();
    this.broadcastBets();

    // Push updated balances to each connected player
    for (const [socketId, player] of this.players) {
      this.io.to(socketId).emit('player:update', {
        balance: player.balance,
        name: player.name,
      });
    }

    this.phaseTimer = setTimeout(() => this.beginWaiting(), CRASHED_MS);
  }

  placeBet(socketId, { amount, slot = 0, autoCashout = null }) {
    const player = this.players.get(socketId);
    if (!player) return { ok: false, error: 'Not registered' };
    if (this.status !== GameStatus.WAITING) {
      return { ok: false, error: 'Betting is closed' };
    }

    const betAmount = Number(amount);
    if (!Number.isFinite(betAmount) || betAmount < MIN_BET || betAmount > MAX_BET) {
      return { ok: false, error: `Bet must be between ${MIN_BET} and ${MAX_BET}` };
    }

    const slotNum = Number(slot) === 1 ? 1 : 0;
    if (this.bets.some((b) => b.playerId === socketId && b.slot === slotNum)) {
      return { ok: false, error: 'Slot already used this round' };
    }

    if (player.balance < betAmount) {
      return { ok: false, error: 'Insufficient balance' };
    }

    let autoAt = null;
    if (autoCashout != null && autoCashout !== '') {
      autoAt = Number(autoCashout);
      if (!Number.isFinite(autoAt) || autoAt < 1.01) {
        return { ok: false, error: 'Auto cashout must be >= 1.01' };
      }
      autoAt = Math.floor(autoAt * 100) / 100;
    }

    player.balance = Number((player.balance - betAmount).toFixed(2));

    const bet = {
      id: ++this.betSeq,
      playerId: socketId,
      playerName: player.name,
      slot: slotNum,
      amount: betAmount,
      autoCashout: autoAt,
      status: 'active',
      cashoutAt: null,
      payout: null,
    };
    this.bets.push(bet);
    this.broadcastBets();

    return {
      ok: true,
      bet: this.publicBet(bet),
      balance: player.balance,
      roundId: this.roundId,
    };
  }

  cashout(socketId, { slot = 0 } = {}) {
    if (this.status !== GameStatus.RUNNING) {
      return { ok: false, error: 'Cannot cash out now' };
    }

    const slotNum = Number(slot) === 1 ? 1 : 0;
    const bet = this.bets.find(
      (b) => b.playerId === socketId && b.slot === slotNum && b.status === 'active'
    );
    if (!bet) return { ok: false, error: 'No active bet in this slot' };

    this.settleCashout(bet, this.multiplier);
    this.broadcastBets();

    const player = this.players.get(socketId);
    return {
      ok: true,
      bet: this.publicBet(bet),
      balance: player?.balance ?? 0,
      multiplier: bet.cashoutAt,
    };
  }

  settleCashout(bet, atMultiplier) {
    const player = this.players.get(bet.playerId);
    const mult = Number(atMultiplier.toFixed(2));
    const payout = Number((bet.amount * mult).toFixed(2));
    bet.status = 'cashed_out';
    bet.cashoutAt = mult;
    bet.payout = payout;
    if (player) {
      player.balance = Number((player.balance + payout).toFixed(2));
      this.io.to(bet.playerId).emit('player:update', {
        balance: player.balance,
        name: player.name,
      });
    }
  }

  clearTimers() {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    if (this.phaseTimer) {
      clearTimeout(this.phaseTimer);
      this.phaseTimer = null;
    }
  }
}
