import { useEffect, useState } from 'react';
import { api, errorMessage } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { ErrorBox, Loading, ModeChip, useApi } from '../components/ui.jsx';

export default function Settings() {
  const [tab, setTab] = useState('company');
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <p>Company profile, carbon budget, emission factors and team access.</p>
        </div>
      </div>
      <div className="tabs" role="tablist">
        {[['company', 'Company & budget'], ['factors', 'Emission factors'], ['team', 'Team & roles']].map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={`tab ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      {tab === 'company' && <CompanyForm />}
      {tab === 'factors' && <Factors />}
      {tab === 'team' && <Team />}
    </>
  );
}

function CompanyForm() {
  const { company, setCompany, can, toast } = useAuth();
  const [form, setForm] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    if (company) setForm({ name: company.name, industry: company.industry || '', city: company.city || '', monthlyCo2BudgetKg: company.monthlyCo2BudgetKg, alertEmail: company.alertEmail || '' });
  }, [company]);
  if (!form) return <Loading />;
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const editable = can('owner', 'admin');
  const save = async (e) => {
    e.preventDefault();
    try {
      const { data } = await api.put('/settings/company', form);
      setCompany(data);
      toast('Settings saved');
    } catch (err) {
      setError(errorMessage(err));
    }
  };
  return (
    <form className="card stack" onSubmit={save} style={{ maxWidth: 720 }}>
      <ErrorBox error={error} />
      {!editable && <div className="alert">Only an owner or admin can change these settings.</div>}
      <fieldset disabled={!editable} style={{ border: 0, padding: 0, margin: 0 }} className="form-grid">
        <label className="field">Company name<input value={form.name} onChange={set('name')} required /></label>
        <label className="field">Industry<input value={form.industry} onChange={set('industry')} /></label>
        <label className="field">City<input value={form.city} onChange={set('city')} /></label>
        <label className="field">Monthly CO2 budget (kg)<input type="number" min="0" step="1000" value={form.monthlyCo2BudgetKg} onChange={set('monthlyCo2BudgetKg')} /></label>
        <label className="field">Alert email<input type="email" value={form.alertEmail} onChange={set('alertEmail')} /></label>
      </fieldset>
      {editable && <div><button className="btn primary">Save</button></div>}
    </form>
  );
}

function Factors() {
  const { can, toast } = useAuth();
  const { data, error, reload } = useApi('/settings/factors');
  const [edit, setEdit] = useState({});
  if (error) return <ErrorBox error={error} />;
  if (!data) return <Loading />;
  const editable = can('owner', 'admin');
  const save = async (mode) => {
    try {
      await api.put(`/settings/factors/${mode}`, edit[mode]);
      setEdit({ ...edit, [mode]: undefined });
      toast(`${mode} factors updated`);
      reload();
    } catch (e) {
      toast(errorMessage(e));
    }
  };
  const fields = [['kgCo2PerTonneKm', 'kg CO2e / tonne-km'], ['costPerTonneKm', '₹ / tonne-km'], ['minCharge', 'Min charge ₹'], ['speedKmPerDay', 'km / day'], ['handlingDays', 'Handling days']];
  return (
    <div className="card table-wrap">
      <p className="muted" style={{ fontSize: '0.88rem' }}>Stored in EcoTrace's own database, so no paid carbon API is needed. Defaults follow the UK Government GHG Conversion Factors for freighting goods.</p>
      <table>
        <thead><tr><th>Mode</th>{fields.map(([, l]) => <th key={l} className="r">{l}</th>)}<th>Source</th><th /></tr></thead>
        <tbody>
          {data.map((f) => (
            <tr key={f.mode}>
              <td><ModeChip mode={f.mode} /></td>
              {fields.map(([k]) => (
                <td key={k} className="r">
                  {edit[f.mode] ? (
                    <input type="number" step="any" value={edit[f.mode][k]} onChange={(e) => setEdit({ ...edit, [f.mode]: { ...edit[f.mode], [k]: e.target.value } })} style={{ width: 90, textAlign: 'right' }} />
                  ) : f[k]}
                </td>
              ))}
              <td style={{ fontSize: '0.78rem' }} className="muted">{f.source}</td>
              <td>
                {editable && (edit[f.mode]
                  ? <button className="btn sm primary" onClick={() => save(f.mode)}>Save</button>
                  : <button className="btn sm" onClick={() => setEdit({ ...edit, [f.mode]: Object.fromEntries(fields.map(([k]) => [k, f[k]])) })}>Edit</button>)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <small>Changes apply to new shipments and comparisons; existing shipments keep the factor they were calculated with.</small>
    </div>
  );
}

function Team() {
  const { can, user, toast } = useAuth();
  const { data, reload } = useApi('/auth/users');
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'manager' });
  const [error, setError] = useState(null);
  const add = async (e) => {
    e.preventDefault();
    try {
      await api.post('/auth/users', form);
      setForm({ name: '', email: '', password: '', role: 'manager' });
      toast('Team member added');
      reload();
    } catch (err) {
      setError(errorMessage(err));
    }
  };
  const remove = async (u) => {
    if (!confirm(`Remove ${u.name}?`)) return;
    try {
      await api.delete(`/auth/users/${u._id}`);
      reload();
    } catch (e) {
      toast(errorMessage(e));
    }
  };
  const ROLE_TEXT = { owner: 'Owner: everything, including budget and team', manager: 'Logistics manager: vendors, locations, shipments', admin: 'Admin: settings, emission factors, team' };
  return (
    <div className="grid g-2">
      <div className="card">
        <h2>Team</h2>
        {!data ? <Loading /> : (
          <table className="mt">
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th /></tr></thead>
            <tbody>
              {data.map((u) => (
                <tr key={u._id}>
                  <td>{u.name}{u._id === user._id && <span className="muted"> (you)</span>}</td>
                  <td>{u.email}</td>
                  <td style={{ textTransform: 'capitalize' }}>{u.role}</td>
                  <td>{can('owner', 'admin') && u._id !== user._id && <button className="btn sm danger" onClick={() => remove(u)}>Remove</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <ul className="mt muted" style={{ fontSize: '0.85rem', paddingLeft: 18 }}>
          {Object.entries(ROLE_TEXT).map(([r, t]) => <li key={r}>{t}</li>)}
        </ul>
      </div>
      {can('owner', 'admin') && (
        <form className="card stack" onSubmit={add}>
          <h2>Add a team member</h2>
          <ErrorBox error={error} />
          <label className="field">Name<input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          <label className="field">Email<input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
          <label className="field">Temporary password<input type="password" required minLength={6} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>
          <label className="field">Role
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="manager">Logistics manager</option>
              <option value="admin">Admin</option>
              {can('owner') && <option value="owner">Owner</option>}
            </select>
          </label>
          <div><button className="btn primary">Add member</button></div>
        </form>
      )}
    </div>
  );
}
