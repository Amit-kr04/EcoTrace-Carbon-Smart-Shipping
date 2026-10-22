import { useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Icon, date } from './ui.jsx';

const NAV = [
  ['Overview', [['/app', 'dashboard', 'Dashboard'], ['/app/shipments', 'truck', 'Shipments'], ['/app/vendors', 'factory', 'Vendors'], ['/app/locations', 'pin', 'Locations']]],
  ['Decide', [['/app/compare', 'scale', 'Compare options'], ['/app/optimizer', 'target', 'Optimizer'], ['/app/what-if', 'sliders', 'What-if simulator'], ['/app/supply-chain', 'graph', 'Supply chain']]],
  ['Predict & report', [['/app/insights', 'brain', 'ML insights'], ['/app/reports', 'file', 'Reports & alerts'], ['/app/settings', 'gear', 'Settings']]],
];

export default function Layout() {
  const { user, company, logout, theme, setTheme, alerts, setAlerts } = useAuth();
  const [open, setOpen] = useState(false);
  const [bell, setBell] = useState(false);
  const location = useLocation();
  const unread = alerts.filter((a) => !a.read).length;
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  const openBell = async () => {
    setBell((b) => !b);
    if (unread) {
      await api.post('/alerts/read-all').catch(() => {});
      setTimeout(() => setAlerts((list) => list.map((a) => ({ ...a, read: true }))), 1500);
    }
  };

  return (
    <div className="shell">
      <aside className={`sidebar ${open ? 'open' : ''}`} onClick={() => setOpen(false)}>
        <Link to="/" className="brand">
          <span className="brand-mark"><Icon name="leaf" size={18} /></span>
          <span style={{ color: 'var(--text)' }}>EcoTrace</span>
        </Link>
        {NAV.map(([group, links]) => (
          <div key={group}>
            <div className="nav-group">{group}</div>
            {links.map(([to, icon, label]) => (
              <NavLink key={to} to={to} end={to === '/app'} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                <Icon name={icon} /> {label}
              </NavLink>
            ))}
          </div>
        ))}
        <div className="sidebar-foot">
          <div style={{ fontWeight: 600 }}>{user?.name}</div>
          <div className="muted" style={{ textTransform: 'capitalize' }}>{user?.role === 'manager' ? 'Logistics manager' : user?.role}</div>
          <button className="btn sm mt" onClick={logout}>Sign out</button>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <button className="btn ghost sm menu-btn" onClick={() => setOpen(true)} aria-label="Open menu"><Icon name="menu" /></button>
          <div>
            <div style={{ fontWeight: 700 }}>{company?.name}</div>
            <div className="muted" style={{ fontSize: '0.78rem' }}>{company?.industry} · {company?.city}</div>
          </div>
          <div className="spacer" />
          <button className="btn ghost sm" onClick={() => setTheme(dark ? 'light' : 'dark')} aria-label="Toggle dark mode" title="Toggle theme">
            <Icon name={dark ? 'sun' : 'moon'} />
          </button>
          <div className="bell" style={{ position: 'relative' }}>
            <button className="btn ghost sm" onClick={openBell} aria-label={`Alerts, ${unread} unread`}>
              <Icon name="bell" />
              {unread > 0 && <span className="count">{unread}</span>}
            </button>
            {bell && (
              <div className="dropdown" onMouseLeave={() => setBell(false)}>
                <div className="card-head" style={{ margin: '4px 6px 8px' }}><b>Alerts</b><Link to="/app/reports" onClick={() => setBell(false)}>View all</Link></div>
                {alerts.length === 0 && <div className="empty">No alerts yet</div>}
                {alerts.slice(0, 12).map((a) => (
                  <div key={a._id} className={`item ${a.read ? '' : 'unread'}`}>
                    <span className={`badge ${a.level === 'critical' ? 'red' : a.level === 'warning' ? 'amber' : 'green'}`} style={{ marginRight: 6 }}><span className="dot" />{a.type}</span>
                    {a.message}
                    <div className="muted" style={{ fontSize: '0.75rem', marginTop: 2 }}>{date(a.createdAt)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </header>
        <main className="content" key={location.pathname}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
