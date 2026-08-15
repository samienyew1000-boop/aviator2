/** Fake player names for the All Bets demo feed */
export const DEMO_NAMES = [
  'Abebe',
  'Liya',
  'Dawit',
  'Hanna',
  'Yonas',
  'Saron',
  'Kidus',
  'Mekdes',
  'Biruk',
  'Selam',
  'Nahom',
  'Helen',
  'Tewodros',
  'Ruth',
  'Amir',
  'Betty',
  'Fikru',
  'Meron',
  'Samson',
  'Tsion',
  'Elias',
  'Rahel',
  'Girma',
  'Hiwot',
  'Kaleb',
  'Marta',
  'Natnael',
  'Sofia',
  'Wondimu',
  'Yordanos',
];

const BET_AMOUNTS = [1, 2, 5, 10, 15, 20, 25, 50, 75, 100, 150, 200, 250, 500];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function rand(min, max) {
  return min + Math.random() * (max - min);
}

/**
 * Schedule demo bets during WAITING, and random cashouts while RUNNING.
 */
export class DemoBetSimulator {
  /**
   * @param {import('./GameEngine.js').GameEngine} game
   */
  constructor(game) {
    this.game = game;
    this.timers = [];
    this.roundToken = 0;
  }

  clear() {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
  }

  /** Call when a new WAITING phase starts */
  onWaiting() {
    this.clear();
    this.roundToken += 1;
    const token = this.roundToken;
    const usedNames = new Set();

    // Seed immediately so All Bets is never empty at round start
    const immediate = 8 + Math.floor(Math.random() * 5);
    for (let i = 0; i < immediate; i += 1) {
      this.placeOne(usedNames);
    }

    // More bets trickle in during the waiting window
    const extra = 10 + Math.floor(Math.random() * 12);
    for (let i = 0; i < extra; i += 1) {
      const delay = 200 + i * 180 + Math.floor(Math.random() * 220);
      const t = setTimeout(() => {
        if (token !== this.roundToken) return;
        if (this.game.status !== 'WAITING') return;
        this.placeOne(usedNames);
      }, delay);
      this.timers.push(t);
    }
  }

  placeOne(usedNames) {
    let name = pick(DEMO_NAMES);
    let guard = 0;
    while (usedNames.has(name) && guard < 40) {
      name = `${pick(DEMO_NAMES)}${Math.floor(Math.random() * 90 + 10)}`;
      guard += 1;
    }
    usedNames.add(name);

    const amount = pick(BET_AMOUNTS);
    let autoCashout = null;
    if (Math.random() < 0.35) {
      autoCashout = Number(rand(1.2, 5.5).toFixed(2));
    }

    const betId = ++this.game.betSeq;
    const bet = {
      id: betId,
      playerId: `demo_${this.game.roundId}_${betId}`,
      playerName: name,
      slot: 0,
      amount,
      autoCashout,
      status: 'active',
      cashoutAt: null,
      payout: null,
      isDemo: true,
      demoCashAt:
        autoCashout ??
        (Math.random() < 0.75 ? Number(rand(1.05, 8).toFixed(2)) : null),
    };

    this.game.bets.push(bet);
    this.game.broadcastBets();
  }

  /** Call every tick while RUNNING — cash out demo bets that hit their target */
  onTick(multiplier) {
    let changed = false;
    for (const bet of this.game.bets) {
      if (!bet.isDemo || bet.status !== 'active') continue;
      const target = bet.autoCashout ?? bet.demoCashAt;
      if (target != null && multiplier >= target) {
        this.game.settleCashout(bet, target);
        changed = true;
      }
    }
    if (changed) this.game.broadcastBets();
  }
}
