import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api, clearAuth, getStoredAuth, saveAuth } from './api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => getStoredAuth()?.token || null);
  const [user, setUser] = useState(() => getStoredAuth()?.user || null);
  const [loading, setLoading] = useState(Boolean(getStoredAuth()?.token));

  useEffect(() => {
    let cancelled = false;
    async function hydrate() {
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const data = await api.me(token);
        if (!cancelled) {
          setUser(data.user);
          saveAuth({ token, user: data.user });
        }
      } catch {
        if (!cancelled) {
          clearAuth();
          setToken(null);
          setUser(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    hydrate();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const value = useMemo(
    () => ({
      token,
      user,
      loading,
      isAdmin: user?.role === 'admin',
      async login(username, password) {
        const data = await api.login(username, password);
        saveAuth({ token: data.token, user: data.user });
        setToken(data.token);
        setUser(data.user);
        return data.user;
      },
      async register(username, password) {
        const data = await api.register(username, password);
        saveAuth({ token: data.token, user: data.user });
        setToken(data.token);
        setUser(data.user);
        return data.user;
      },
      async logout() {
        try {
          if (token) await api.logout(token);
        } catch {
          /* ignore */
        }
        clearAuth();
        setToken(null);
        setUser(null);
      },
      setUserBalance(balance) {
        setUser((prev) => {
          if (!prev) return prev;
          const next = { ...prev, balance };
          saveAuth({ token, user: next });
          return next;
        });
      },
    }),
    [token, user, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
