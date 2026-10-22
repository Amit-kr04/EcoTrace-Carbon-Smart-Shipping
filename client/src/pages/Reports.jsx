import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errorMessage } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { BudgetBar, ErrorBox, Loading, date, useApi } from '../components/ui.jsx';

function lastMonth() {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 7);
}

export default function Reports() {
  const { company, user, toast } = useAuth();
  const [month, setMonth] = useState(lastMonth());
  const [busy, setBusy] = useState('');
  const [error, setError] = useState(null);
  const alerts = useApi('/alerts');
  const summary = useApi('/analytics/summary?months=1');

  const getPdf = async () => {
    const { data } = await api.get(`/reports/monthly?month=${month}`, { responseType: 'blob' });
    return URL.createObjectURL(data);
  };
  const run = async (key, fn) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy('');
    }
  };
  const view = () => run('view', async () => window.open(await getPdf(), '_blank'));
  const download = () => run('download', async () => {
    const a = document.createElement('a');
    a.href = await getPdf();
    a.download = `ecotrace-report-${month}.pdf`;
    a.click();
  });
  const email = () => run('email', async () => {
    const { data } = await api.post('/reports/email', { month });
    toast(`Report emailed to ${data.to}`);
  });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Reports and alerts</h1>
          <p>Monthly sustainability reports you can share with clients for their ESG and BRSR value-chain reporting.</p>
        </div>
      </div>
      <div className="grid g-2">
        <div className="card">
          <h2>Monthly sustainability report (PDF)</h2>
          <p className="muted" style={{ fontSize: '0.9rem' }}>Total CO2e, change vs last month, budget status, emissions by mode, top vendors and routes, and recommendations. Sent automatically on the 1st of each month.</p>
          <div className="row mt">
            <label className="field">Month<input type="month" value={month} max={new Date().toISOString().slice(0, 7)} onChange={(e) => setMonth(e.target.value)} /></label>
          </div>
          <div className="row mt">
            <button className="btn primary" onClick={view} disabled={!!busy}>{busy === 'view' ? 'Building…' : 'View report'}</button>
            <button className="btn" onClick={download} disabled={!!busy}>Download PDF</button>
            <button className="btn" onClick={email} disabled={!!busy}>{busy === 'email' ? 'Sending…' : `Email to ${company?.alertEmail || user?.email}`}</button>
          </div>
          <div className="mt"><ErrorBox error={error} /></div>
        </div>
        <div className="card">
          <div className="card-head">
            <h2>Carbon budget</h2>
            <Link to="/app/settings">Change budget →</Link>
          </div>
          {summary.data ? <BudgetBar used={summary.data.budget.usedKg} budget={summary.data.budget.budgetKg} /> : <Loading />}
          <p className="muted mt" style={{ fontSize: '0.88rem' }}>
            An email alert goes to {company?.alertEmail || 'the owners'} when this month's emissions pass 80% and 100% of the budget. A daily job also re-checks the budget.
          </p>
        </div>
      </div>
      <div className="card mt">
        <h2>Alert history</h2>
        {!alerts.data ? <Loading /> : alerts.data.length === 0 ? <div className="empty">No alerts yet</div> : (
          <table className="mt">
            <thead><tr><th>Date</th><th>Type</th><th>Message</th></tr></thead>
            <tbody>
              {alerts.data.map((a) => (
                <tr key={a._id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{date(a.createdAt)}</td>
                  <td><span className={`badge ${a.level === 'critical' ? 'red' : a.level === 'warning' ? 'amber' : 'green'}`}><span className="dot" />{a.type} · {a.level}</span></td>
                  <td>{a.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
