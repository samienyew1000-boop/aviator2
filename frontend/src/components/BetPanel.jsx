import { useEffect, useRef, useState } from 'react';

/**
 * Single Aviator-style bet panel (supports dual independent slots).
 */
export default function BetPanel({
  slot,
  currency,
  status,
  myBet,
  disabled,
  onPlace,
  onCashout,
}) {
  const [amount, setAmount] = useState(10);
  const [autoCashout, setAutoCashout] = useState('');
  const [autoEnabled, setAutoEnabled] = useState(false);

  const adjust = (delta) => {
    setAmount((v) => Math.max(1, Math.min(1000, Number((v + delta).toFixed(2)))));
  };

  const place = () => {
    onPlace({
      slot,
      amount,
      autoCashout: autoEnabled && autoCashout ? Number(autoCashout) : null,
    });
  };

  const isActive = myBet?.status === 'active';
  const isCashed = myBet?.status === 'cashed_out';
  const isLost = myBet?.status === 'lost';
  const canBet = status === 'WAITING' && !myBet && !disabled;
  const canCash = status === 'RUNNING' && isActive;

  return (
    <div className={`bet-panel ${isCashed ? 'won' : ''} ${isLost ? 'lost' : ''}`}>
      <div className="bet-tabs">
        <span className="active">Bet {slot + 1}</span>
      </div>

      <div className="amount-row">
        <button type="button" onClick={() => adjust(-1)} disabled={!canBet}>
          −
        </button>
        <input
          type="number"
          min="1"
          max="1000"
          step="1"
          value={amount}
          onChange={(e) => setAmount(Number(e.target.value))}
          disabled={!canBet}
        />
        <button type="button" onClick={() => adjust(1)} disabled={!canBet}>
          +
        </button>
      </div>

      <div className="quick-amounts">
        {[1, 2, 5, 10].map((n) => (
          <button
            key={n}
            type="button"
            disabled={!canBet}
            onClick={() => setAmount((v) => Math.min(1000, v + n))}
          >
            +{n}
          </button>
        ))}
      </div>

      <label className="auto-row">
        <input
          type="checkbox"
          checked={autoEnabled}
          onChange={(e) => setAutoEnabled(e.target.checked)}
          disabled={!canBet}
        />
        Auto cash out
        <input
          type="number"
          min="1.01"
          step="0.1"
          placeholder="2.00"
          value={autoCashout}
          onChange={(e) => setAutoCashout(e.target.value)}
          disabled={!canBet || !autoEnabled}
        />
      </label>

      {canCash ? (
        <button type="button" className="btn cash" onClick={() => onCashout(slot)}>
          Cash Out
        </button>
      ) : isCashed ? (
        <button type="button" className="btn won" disabled>
          Won {myBet.payout?.toFixed(2)} {currency}
        </button>
      ) : isLost ? (
        <button type="button" className="btn lost" disabled>
          Lost
        </button>
      ) : (
        <button type="button" className="btn bet" onClick={place} disabled={!canBet}>
          Bet
          <span>
            {amount.toFixed(2)} {currency}
          </span>
        </button>
      )}
    </div>
  );
}
