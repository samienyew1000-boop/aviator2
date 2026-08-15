/**
 * Live bets feed — current-round wagers (real + demo players).
 */
export default function BetsFeed({ bets, currency }) {
  const sorted = [...bets].sort((a, b) => {
    if (a.status === 'cashed_out' && b.status !== 'cashed_out') return -1;
    if (b.status === 'cashed_out' && a.status !== 'cashed_out') return 1;
    return b.id - a.id;
  });

  return (
    <aside className="bets-feed">
      <div className="feed-head">
        <span>ALL BETS</span>
        <span>{bets.length}</span>
      </div>
      <div className="feed-cols">
        <span>Player</span>
        <span>Bet</span>
        <span>Win</span>
      </div>
      <ul className="feed-list">
        {sorted.map((b) => (
          <li key={b.id} className={b.status}>
            <span className="name">{b.playerName}</span>
            <span className="amt">
              {b.amount.toFixed(2)} {currency}
            </span>
            <span className="win">
              {b.status === 'cashed_out'
                ? `${b.payout.toFixed(2)}`
                : b.status === 'lost'
                  ? '—'
                  : '…'}
            </span>
          </li>
        ))}
        {sorted.length === 0 && <li className="empty">Waiting for bets…</li>}
      </ul>
    </aside>
  );
}
