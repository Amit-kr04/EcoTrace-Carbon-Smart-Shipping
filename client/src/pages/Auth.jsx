import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { errorMessage } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { ErrorBox, Icon } from '../components/ui.jsx';

function Side() {
  return (
    <div className="auth-side">
      <Link to="/" className="row" style={{ color: '#fff', fontWeight: 700, fontSize: '1.2rem' }}>
        <Icon name="leaf" size={22} /> EcoTrace
      </Link>
      <div>
        <h1>Carbon-smart shipping decisions for small businesses.</h1>
        <p style={{ opacity: 0.85, maxWidth: '44ch' }}>
          Measure the CO2 of every shipment, compare vendors and transport modes, forecast next quarter and plan the cheapest mix within your carbon budget.
        </p>
      </div>
      <small style={{ color: 'rgba(255,255,255,0.7)' }}>Emission factors: UK Government GHG Conversion Factors</small>
    </div>
  );
}

export function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  if (user) return <Navigate to="/app" replace />;

  const submit = async (e, creds = form) => {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(creds.email, creds.password);
      navigate('/app');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <Side />
      <div className="auth-form">
        <form onSubmit={submit}>
          <h1>Sign in</h1>
          <p className="muted" style={{ margin: 0 }}>Welcome back. New here? <Link to="/register">Create a company account</Link></p>
          <ErrorBox error={error} />
          <label className="field">Email<input type="email" required autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
          <label className="field">Password<input type="password" required autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>
          <button className="btn primary lg" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
          <div className="card" style={{ padding: 14 }}>
            <b style={{ fontSize: '0.9rem' }}>Demo accounts</b>
            <p className="muted" style={{ fontSize: '0.82rem', margin: '4px 0 10px' }}>A sample auto-parts manufacturer with 2 years of shipments. Password: demo1234</p>
            <div className="row">
              {[['Owner', 'owner@ecotrace.demo'], ['Logistics manager', 'manager@ecotrace.demo'], ['Admin', 'admin@ecotrace.demo']].map(([label, email]) => (
                <button type="button" key={email} className="btn sm" disabled={busy} onClick={() => submit(null, { email, password: 'demo1234' })}>{label}</button>
              ))}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

export function Register() {
  const { user, register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', companyName: '', industry: '', city: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  if (user) return <Navigate to="/app" replace />;
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await register(form);
      navigate('/app/vendors');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <Side />
      <div className="auth-form">
        <form onSubmit={submit}>
          <h1>Create your company</h1>
          <p className="muted" style={{ margin: 0 }}>You will be the owner. Already registered? <Link to="/login">Sign in</Link></p>
          <ErrorBox error={error} />
          <label className="field">Your name<input required value={form.name} onChange={set('name')} /></label>
          <label className="field">Work email<input type="email" required value={form.email} onChange={set('email')} /></label>
          <label className="field">Password<input type="password" required minLength={6} value={form.password} onChange={set('password')} /></label>
          <label className="field">Company name<input required value={form.companyName} onChange={set('companyName')} /></label>
          <div className="form-grid">
            <label className="field">Industry<input value={form.industry} onChange={set('industry')} placeholder="e.g. Textiles" /></label>
            <label className="field">Factory city<input value={form.city} onChange={set('city')} placeholder="e.g. Pune" /></label>
          </div>
          <button className="btn primary lg" disabled={busy}>{busy ? 'Creating…' : 'Create account'}</button>
        </form>
      </div>
    </div>
  );
}
