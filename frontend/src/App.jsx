import { useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import BetPanel from './components/BetPanel.jsx';
import BetsFeed from './components/BetsFeed.jsx';
import FlightCanvas from './components/FlightCanvas.jsx';
import {
  crashDemoBets,
  createDemoBets,
  mergeBets,
  tickDemoCashouts,
  visibleDemoBets,
} from './demoBets.js';
import './App.css';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001';

function historyClass(crashPoint) {
  if (crashPoint >= 10) return 'x10';
  if (crashPoint >= 2) return 'x2';
  return 'x1';
}

export default function App() {
  const [status, setStatus] = useState('WAITING');
  const [multiplier, setMultiplier] = useState(1);
  const [history, setHistory] = useState([]);
  const [serverBets, setServerBets] = useState([]);
  const [demoBets, setDemoBets] = useState([]);
  const [demoTick, setDemoTick] = useState(0);
  const [balance, setBalance] = useState(0);
  const [playerName, setPlayerName] = useState('');
  const [currency, setCurrency] = useState('ETB');
  const [waitingEndsAt, setWaitingEndsAt] = useState(null);
  const [countdown, setCountdown] = useState(0);
  const [connected, setConnected] = useState(false);
  const [socketId, setSocketId] = useState('');
  const [flash, setFlash] = useState('');
  const socketRef = useRef(null);
  const pointsRef = useRef([]);
  const startedAtRef = useRef(null);
  const roundRef = useRef(0);
  const prevStatusRef = useRef('WAITING');

  useEffect(() => {
    const socket = io(SOCKET_URL, { transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      setSocketId(socket.id);
    });
    socket.on('disconnect', () => setConnected(false));

    socket.on('player:update', (p) => {
      setBalance(p.balance);
      setPlayerName(p.name);
    });

    socket.on('game:state', (state) => {
      applyState(state);
    });

    socket.on('game:tick', (tick) => {
      setStatus(tick.status);
      setMultiplier(tick.multiplier);
      if (!startedAtRef.current) startedAtRef.current = Date.now();
      pointsRef.current = [...pointsRef.current, tick.multiplier];
      setDemoBets((prev) => tickDemoCashouts(prev, tick.multiplier));
    });

    socket.on('game:crash', (state) => {
      applyState(state);
      setDemoBets((prev) => crashDemoBets(prev));
      setFlash(`Flew away at ${state.crashPoint?.toFixed(2)}x`);
    });

    socket.on('bets:update', (list) => {
      if (Array.isArray(list)) setServerBets(list);
    });

    return () => socket.disconnect();
  }, []);

  function applyState(state) {
    const isNewRound = state.roundId !== roundRef.current;
    if (isNewRound) {
      roundRef.current = state.roundId;
      pointsRef.current = [];
      startedAtRef.current = state.status === 'RUNNING' ? Date.now() : null;
    }
    if (state.status === 'RUNNING' && !startedAtRef.current) {
      startedAtRef.current = Date.now();
    }
    if (state.status === 'WAITING') {
      startedAtRef.current = null;
      pointsRef.current = [];
      if (isNewRound || prevStatusRef.current !== 'WAITING') {
        setDemoBets(createDemoBets(state.roundId, 20));
      }
    }
    if (state.status === 'RUNNING' && isNewRound) {
      // Joined mid-flight: still show a populated All Bets list
      const seeded = createDemoBets(state.roundId, 16).map((b) => ({
        ...b,
        appearAt: 0,
      }));
      setDemoBets(tickDemoCashouts(seeded, state.multiplier));
    }
    if (state.status === 'CRASHED') {
      pointsRef.current = [...pointsRef.current, state.multiplier];
      setDemoBets((prev) => crashDemoBets(prev));
    }

    prevStatusRef.current = state.status;
    setStatus(state.status);
    setMultiplier(state.multiplier);
    setHistory(state.history || []);
    setServerBets(state.bets || []);
    setCurrency(state.currency || 'ETB');
    setWaitingEndsAt(state.waitingEndsAt || null);
  }

  // Reveal staggered demo bets during waiting
  useEffect(() => {
    if (status !== 'WAITING') return undefined;
    const id = setInterval(() => setDemoTick((n) => n + 1), 200);
    return () => clearInterval(id);
  }, [status]);

  useEffect(() => {
    if (!waitingEndsAt || status !== 'WAITING') {
      setCountdown(0);
      return undefined;
    }
    const tick = () => {
      const left = Math.max(0, (waitingEndsAt - Date.now()) / 1000);
      setCountdown(left);
    };
    tick();
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, [waitingEndsAt, status]);

  const bets = useMemo(() => {
    const visible = visibleDemoBets(demoBets);
    return mergeBets(serverBets, visible);
    // demoTick forces re-compute as staggered bets appear
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverBets, demoBets, demoTick]);

  const myBets = useMemo(() => {
    const mine = bets.filter((b) => b.playerId === socketId);
    return {
      0: mine.find((b) => b.slot === 0) || null,
      1: mine.find((b) => b.slot === 1) || null,
    };
  }, [bets, socketId]);

  const placeBet = (payload) => {
    socketRef.current?.emit('bet:place', payload, (res) => {
      if (!res?.ok) setFlash(res?.error || 'Bet failed');
      else setFlash(`Bet placed on slot ${payload.slot + 1}`);
    });
  };

  const cashout = (slot) => {
    socketRef.current?.emit('bet:cashout', { slot }, (res) => {
      if (!res?.ok) setFlash(res?.error || 'Cash out failed');
      else setFlash(`Cashed out at ${res.multiplier.toFixed(2)}x`);
    });
  };

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand-block">
          <h1 className="brand">Aviator</h1>
          <span className={`link ${connected ? 'on' : ''}`}>
            {connected ? 'Online' : 'Offline'}
          </span>
        </div>
        <div className="balance-block">
          <span className="label">{playerName || '—'}</span>
          <strong>
            {balance.toFixed(2)} <em>{currency}</em>
          </strong>
        </div>
      </header>

      <div className="history-strip">
        {history.map((h) => (
          <span key={h.roundId} className={historyClass(h.crashPoint)}>
            {h.crashPoint.toFixed(2)}x
          </span>
        ))}
      </div>

      <div className="play-grid">
        <section className="stage">
          <FlightCanvas
            multiplier={multiplier}
            status={status}
            pointsRef={pointsRef}
            startedAtRef={startedAtRef}
          />
          <div className={`hud ${status.toLowerCase()}`}>
            {status === 'WAITING' && (
              <div className="wait">
                <p>WAITING FOR NEXT ROUND</p>
                <div className="bar">
                  <i style={{ width: `${Math.min(100, ((5 - countdown) / 5) * 100)}%` }} />
                </div>
              </div>
            )}
            {status === 'RUNNING' && (
              <div className="mult">{multiplier.toFixed(2)}x</div>
            )}
            {status === 'CRASHED' && (
              <div className="mult crash">
                <span>FLEW AWAY!</span>
                {multiplier.toFixed(2)}x
              </div>
            )}
          </div>
        </section>

        <BetsFeed bets={bets} currency={currency} />
      </div>

      <section className="bet-row">
        <BetPanel
          slot={0}
          currency={currency}
          status={status}
          myBet={myBets[0]}
          onPlace={placeBet}
          onCashout={cashout}
        />
        <BetPanel
          slot={1}
          currency={currency}
          status={status}
          myBet={myBets[1]}
          onPlace={placeBet}
          onCashout={cashout}
        />
      </section>

      {flash && <p className="flash">{flash}</p>}
    </div>
  );
}
