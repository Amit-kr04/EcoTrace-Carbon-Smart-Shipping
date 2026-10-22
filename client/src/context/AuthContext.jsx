import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { api } from '../api.js';

// Shares the signed-in user, company, theme, live socket and toasts across pages.
const AuthContext = createContext(null);

function initialTheme() {
  try {
    return localStorage.getItem('ecotrace_theme') || 'system';
  } catch {
    return 'system';
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [company, setCompany] = useState(null);
  const [loading, setLoading] = useState(true);
  const [theme, setThemeState] = useState(initialTheme);
  const [toasts, setToasts] = useState([]);
  const [liveTick, setLiveTick] = useState(0);
  const [alerts, setAlerts] = useState([]);
  const socketRef = useRef(null);

  const toast = useCallback((text) => {
    const id = Math.random();
    setToasts((t) => [...t, { id, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);

  useEffect(() => {
    if (theme === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem('ecotrace_theme', theme);
    } catch {}
  }, [theme]);

  const loadAlerts = useCallback(() => api.get('/alerts').then((r) => setAlerts(r.data)).catch(() => {}), []);

  useEffect(() => {
    const token = localStorage.getItem('ecotrace_token');
    if (!token) return setLoading(false);
    api.get('/auth/me')
      .then((r) => {
        setUser(r.data.user);
        setCompany(r.data.company);
      })
      .catch(() => localStorage.removeItem('ecotrace_token'))
      .finally(() => setLoading(false));
  }, []);

  // Real-time updates: refresh pages when a teammate logs a shipment.
  useEffect(() => {
    if (!user) return;
    loadAlerts();
    const socket = io({ auth: { token: localStorage.getItem('ecotrace_token') } });
    socketRef.current = socket;
    socket.on('shipment:created', (e) => {
      setLiveTick((n) => n + 1);
      if (e.by !== user.name) toast(`${e.by} logged a shipment: ${e.route} (${Math.round(e.co2Kg).toLocaleString('en-IN')} kg CO2e)`);
    });
    socket.on('shipment:imported', (e) => {
      setLiveTick((n) => n + 1);
      toast(`${e.by} imported ${e.count} shipments`);
    });
    socket.on('shipment:updated', () => setLiveTick((n) => n + 1));
    socket.on('shipment:deleted', () => setLiveTick((n) => n + 1));
    socket.on('alert', (a) => {
      setAlerts((list) => [a, ...list]);
      toast(a.message);
    });
    return () => socket.disconnect();
  }, [user, toast, loadAlerts]);

  const login = async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    localStorage.setItem('ecotrace_token', data.token);
    setUser(data.user);
    setCompany(data.company);
  };

  const register = async (form) => {
    const { data } = await api.post('/auth/register', form);
    localStorage.setItem('ecotrace_token', data.token);
    setUser(data.user);
    setCompany(data.company);
  };

  const logout = () => {
    localStorage.removeItem('ecotrace_token');
    setUser(null);
    setCompany(null);
  };

  const can = (...roles) => user && roles.includes(user.role);

  return (
    <AuthContext.Provider
      value={{ user, company, setCompany, loading, login, register, logout, can, theme, setTheme: setThemeState, toast, liveTick, alerts, setAlerts, loadAlerts }}
    >
      {children}
      <div className="toast-stack" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="toast">{t.text}</div>
        ))}
      </div>
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
