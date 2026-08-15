const DEMO_NAMES = [
  'Abebe', 'Liya', 'Dawit', 'Hanna', 'Yonas', 'Saron', 'Kidus', 'Mekdes',
  'Biruk', 'Selam', 'Nahom', 'Helen', 'Tewodros', 'Ruth', 'Amir', 'Betty',
  'Fikru', 'Meron', 'Samson', 'Tsion', 'Elias', 'Rahel', 'Girma', 'Hiwot',
];

const BET_AMOUNTS = [1, 2, 5, 10, 15, 20, 25, 50, 75, 100, 150, 200, 250, 500];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function rand(min, max) {
  return min + Math.random() * (max - min);
}

let seq = 0;

/**
 * Client-side demo bets so All Bets stays populated even if the server
 * process hasn't been restarted with the demo simulator.
 */
export function createDemoBets(roundId, count = 18) {
  const used = new Set();
  const bets = [];
  for (let i = 0; i < count; i += 1) {
    let name = pick(DEMO_NAMES);
    let g = 0;
    while (used.has(name) && g < 30) {
      name = `${pick(DEMO_NAMES)}${Math.floor(rand(10, 99))}`;
      g += 1;
    }
    used.add(name);

    const amount = pick(BET_AMOUNTS);
    const cashAt = Math.random() < 0.8 ? Number(rand(1.08, 6.5).toFixed(2)) : null;
    bets.push({
      id: `local_demo_${roundId}_${++seq}`,
      playerId: `local_demo_${roundId}_${seq}`,
      playerName: name,
      slot: 0,
      amount,
      status: 'active',
      cashoutAt: null,
      payout: null,
      isDemo: true,
      demoCashAt: cashAt,
      // Stagger appearance over ~4s of waiting
      appearAt: Date.now() + i * 160 + Math.floor(Math.random() * 120),
    });
  }
  return bets;
}

export function visibleDemoBets(demoBets, now = Date.now()) {
  return demoBets.filter((b) => !b.appearAt || b.appearAt <= now);
}

export function tickDemoCashouts(demoBets, multiplier) {
  let changed = false;
  const next = demoBets.map((b) => {
    if (b.status !== 'active' || b.demoCashAt == null) return b;
    if (multiplier < b.demoCashAt) return b;
    changed = true;
    const cashoutAt = b.demoCashAt;
    return {
      ...b,
      status: 'cashed_out',
      cashoutAt,
      payout: Number((b.amount * cashoutAt).toFixed(2)),
    };
  });
  return changed ? next : demoBets;
}

export function crashDemoBets(demoBets) {
  return demoBets.map((b) =>
    b.status === 'active'
      ? { ...b, status: 'lost', cashoutAt: null, payout: 0 }
      : b
  );
}

/** Merge server bets with local demos (server real players win on id clash). */
export function mergeBets(serverBets, demoBets) {
  const real = (serverBets || []).filter((b) => !String(b.playerId || '').startsWith('demo_'));
  const serverDemo = (serverBets || []).filter((b) => String(b.playerId || '').startsWith('demo_'));
  // Prefer live server demos when present; otherwise local demos
  if (serverDemo.length > 0) return [...real, ...serverDemo];
  return [...real, ...demoBets];
}
