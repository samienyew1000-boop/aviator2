import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../AuthContext.jsx';
import './Admin.css';

export default function AdminPage() {
  const { user, token, loading, isAdmin, logout } = useAuth();
  const [game, setGame] = useState(null);
  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');
  const [manualMult, setManualMult] = useState(2);
  const [mode, setMode] = useState('provably_fair');
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    if (!token) return;
    try {
      const data = await api.adminState(token);
      setGame(data.game);
      setUsers(data.users || []);
      setMode(data.game?.crashMode || 'provably_fair');
      setManualMult(data.game?.manualCrashPoint || 2);
      setError('');
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    if (!isAdmin || !token) return undefined;
    refresh();
    const id = setInterval(refresh, 1500);
    return () => clearInterval(id);
  }, [isAdmin, token]);

  if (loading) return <div className="admin-shell">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (!isAdmin) return <Navigate to="/" replace />;

  const startRound = async () => {
    setBusy(true);
    try {
      await api.startRound(token);
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const toggleAuto = async () => {
    setBusy(true);
    try {
      await api.setAutoRun(token, !game?.autoRun);
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const saveCrash = async () => {
    setBusy(true);
    try {
      await api.setCrashConfig(token, {
        mode,
        manualCrashPoint: Number(manualMult),
      });
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin-shell">
      <header className="admin-top">
        <div>
          <h1>Admin Control</h1>
          <p>Logged in as {user.displayName}</p>
        </div>
        <div className="admin-actions">
          <Link to="/">Open game</Link>
          <button type="button" onClick={logout}>
            Logout
          </button>
        </div>
      </header>

      {error && <div className="admin-error">{error}</div>}

      <section className="admin-grid">
        <article className="admin-card">
          <h2>Round control</h2>
          <p className="status-line">
            Status: <strong>{game?.status || '—'}</strong>
            {game?.roundId ? ` · Round #${game.roundId}` : ''}
          </p>
          <p className="status-line">
            Live multiplier:{' '}
            <strong>
              {game?.status === 'RUNNING' || game?.status === 'CRASHED'
                ? `${Number(game.multiplier).toFixed(2)}x`
                : '—'}
            </strong>
          </p>
          {game?.crashPoint != null && (
            <p className="status-line">
              Target crash (admin): <strong>{game.crashPoint.toFixed(2)}x</strong>
            </p>
          )}
          <div className="admin-btn-row">
            <button type="button" className="primary" onClick={startRound} disabled={busy}>
              Start Round / Next Game
            </button>
            <button
              type="button"
              className={game?.autoRun ? 'on' : ''}
              onClick={toggleAuto}
              disabled={busy}
            >
              Auto-Run: {game?.autoRun ? 'ON' : 'OFF'}
            </button>
          </div>
          <p className="hint">
            When Auto-Run is off, the game stays idle until you press Start Round.
          </p>
        </article>

        <article className="admin-card">
          <h2>Crash settings</h2>
          <label className="radio">
            <input
              type="radio"
              checked={mode === 'provably_fair'}
              onChange={() => setMode('provably_fair')}
            />
            Provably fair (HMAC-SHA256)
          </label>
          <label className="radio">
            <input
              type="radio"
              checked={mode === 'manual'}
              onChange={() => setMode('manual')}
            />
            Manual target multiplier
          </label>
          <label>
            Manual crash at
            <input
              type="number"
              min="1"
              step="0.01"
              value={manualMult}
              onChange={(e) => setManualMult(e.target.value)}
              disabled={mode !== 'manual'}
            />
          </label>
          <button type="button" onClick={saveCrash} disabled={busy}>
            Save crash config
          </button>
        </article>

        <article className="admin-card wide">
          <h2>Active bets ({game?.bets?.length || 0})</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Player</th>
                  <th>Bet</th>
                  <th>Status</th>
                  <th>Win</th>
                </tr>
              </thead>
              <tbody>
                {(game?.bets || []).map((b) => (
                  <tr key={b.id}>
                    <td>{b.playerName}</td>
                    <td>
                      {b.amount.toFixed(2)} {game.currency}
                    </td>
                    <td>{b.status}</td>
                    <td>{b.payout != null ? b.payout.toFixed(2) : '—'}</td>
                  </tr>
                ))}
                {!game?.bets?.length && (
                  <tr>
                    <td colSpan={4}>No bets this round</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>

        <article className="admin-card">
          <h2>Online players</h2>
          <ul className="plain-list">
            {(game?.players || []).map((p) => (
              <li key={p.socketId}>
                <span>{p.name}</span>
                <strong>
                  {Number(p.balance).toFixed(2)} {game?.currency}
                </strong>
              </li>
            ))}
            {!game?.players?.length && <li>No connected players</li>}
          </ul>
        </article>

        <article className="admin-card">
          <h2>Accounts</h2>
          <ul className="plain-list">
            {users.map((u) => (
              <li key={u.id}>
                <span>
                  {u.displayName} <em>({u.role})</em>
                </span>
                <strong>{Number(u.balance).toFixed(2)}</strong>
              </li>
            ))}
          </ul>
        </article>

        <article className="admin-card wide">
          <h2>Round history</h2>
          <div className="history-chips">
            {(game?.history || []).map((h) => (
              <span key={h.roundId}>
                #{h.roundId} · {h.crashPoint.toFixed(2)}x
              </span>
            ))}
            {!game?.history?.length && <span>No history yet</span>}
          </div>
        </article>
      </section>
    </div>
  );
}
