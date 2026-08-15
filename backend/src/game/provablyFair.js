import crypto from 'crypto';

/**
 * Provably Fair crash point via HMAC-SHA256.
 *
 * Instant crash (1.00x) chance equals HOUSE_EDGE.
 * Otherwise: crash = floor((100 - houseEdge*100) * 2^52 / (h+1)) / 100
 * where h is the first 52 bits of the HMAC digest.
 */
const HOUSE_EDGE = 0.03; // 3%

export function generateServerSeed() {
  return crypto.randomBytes(32).toString('hex');
}

export function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function hmacSha256(serverSeed, message) {
  return crypto.createHmac('sha256', serverSeed).update(message).digest('hex');
}

/**
 * @param {string} serverSeed
 * @param {string} clientSeed
 * @param {number} nonce
 * @returns {{ crashPoint: number, hash: string }}
 */
export function calculateCrashPoint(serverSeed, clientSeed = 'aviator', nonce = 0) {
  const message = `${clientSeed}:${nonce}`;
  const hash = hmacSha256(serverSeed, message);

  // Instant crash with probability = HOUSE_EDGE
  const instantRoll = parseInt(hash.slice(0, 8), 16) / 0x100000000;
  if (instantRoll < HOUSE_EDGE) {
    return { crashPoint: 1.0, hash };
  }

  const h = parseInt(hash.slice(0, 13), 16);
  const e = Math.pow(2, 52);
  const raw = (100 * e - h) / (e - h);
  const crashPoint = Math.floor(raw) / 100;

  return {
    crashPoint: Math.max(1.0, crashPoint),
    hash,
  };
}

export function verifyCrashPoint(serverSeed, clientSeed, nonce, expectedCrashPoint) {
  const { crashPoint } = calculateCrashPoint(serverSeed, clientSeed, nonce);
  return Math.abs(crashPoint - expectedCrashPoint) < 0.001;
}
