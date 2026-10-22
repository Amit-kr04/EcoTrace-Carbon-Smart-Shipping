import { useState } from 'react';
import { api, errorMessage } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { ErrorBox, Icon, Loading, Modal, fmt, inr, pct, tonnes, useApi } from '../components/ui.jsx';

export default function Vendors() {
  const { can, toast } = useAuth();
  const { data, error, reload } = useApi('/vendors');
  const [editing, setEditing] = useState(null);
  const [clustering, setClustering] = useState(false);

  const cluster = async () => {
    setClustering(true);
    try {
      const { data: r } = await api.post('/ml/vendor-clusters');
      toast(`Grouped ${r.vendors.length} vendors into ${r.k} segments (silhouette ${r.silhouette})`);
      reload();
    } catch (e) {
      toast(errorMessage(e));
    } finally {
      setClustering(false);
    }
  };

  const remove = async (v) => {
    if (!confirm(`Delete ${v.name}?`)) return;
    try {
      await api.delete(`/vendors/${v._id}`);
      reload();
    } catch (e) {
      toast(errorMessage(e));
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Vendors</h1>
          <p>Suppliers, what they supply, and how green and reliable they have been.</p>
        </div>
        <div className="row">
          <button className="btn" onClick={cluster} disabled={clustering}>{clustering ? 'Segmenting…' : 'Segment vendors (K-Means)'}</button>
          {can('owner', 'manager', 'admin') && <button className="btn primary" onClick={() => setEditing({})}><Icon name="plus" /> Add vendor</button>}
        </div>
      </div>
      <ErrorBox error={error} />
      {!data ? <Loading /> : (
        <div className="card table-wrap">
          <table>
            <thead>
              <tr>
                <th>Vendor</th><th>City</th><th>Materials</th><th className="r">Price / kg</th><th className="r">Capacity / month</th>
                <th className="r">Shipments</th><th className="r">CO2e</th><th className="r">kg CO2e / tonne</th><th className="r">On-time</th><th>Segment</th><th />
              </tr>
            </thead>
            <tbody>
              {data.map((v) => (
                <tr key={v._id}>
                  <td><b>{v.name}</b>{v.contactEmail && <div className="muted" style={{ fontSize: '0.78rem' }}>{v.contactEmail}</div>}</td>
                  <td>{v.city}{v.coastal && <span className="muted"> · port</span>}</td>
                  <td style={{ textTransform: 'capitalize' }}>{v.materials.join(', ')}</td>
                  <td className="r">{inr(v.pricePerKg)}</td>
                  <td className="r">{tonnes(v.monthlyCapacityKg)}</td>
                  <td className="r">{fmt(v.stats.shipments)}</td>
                  <td className="r">{tonnes(v.stats.co2Kg)}</td>
                  <td className="r">{fmt(v.stats.co2PerTonne, 1)}</td>
                  <td className="r">
                    {v.stats.onTimeRate == null ? '-' : (
                      <span className={v.stats.onTimeRate < 0.7 ? 'delta-bad' : ''}>{pct(v.stats.onTimeRate)}</span>
                    )}
                  </td>
                  <td>{v.cluster?.label ? <span className="badge brand">{v.cluster.label}</span> : <span className="muted">-</span>}</td>
                  <td>
                    {can('owner', 'manager', 'admin') && (
                      <div className="row" style={{ flexWrap: 'nowrap', gap: 4 }}>
                        <button className="btn sm" onClick={() => setEditing(v)}>Edit</button>
                        {can('owner', 'admin') && <button className="btn sm danger" onClick={() => remove(v)}>Delete</button>}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.length === 0 && <div className="empty">No vendors yet. Add your first supplier.</div>}
        </div>
      )}
      {editing && <VendorForm vendor={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
    </>
  );
}

function VendorForm({ vendor, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: vendor.name || '', city: vendor.city || '', materials: (vendor.materials || []).join(', '),
    pricePerKg: vendor.pricePerKg ?? '', monthlyCapacityKg: vendor.monthlyCapacityKg ?? 20000, contactEmail: vendor.contactEmail || '',
  });
  const [error, setError] = useState(null);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const save = async (e) => {
    e.preventDefault();
    try {
      if (vendor._id) await api.put(`/vendors/${vendor._id}`, form);
      else await api.post('/vendors', form);
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    }
  };
  return (
    <Modal title={vendor._id ? `Edit ${vendor.name}` : 'Add vendor'} onClose={onClose}>
      <form onSubmit={save} className="stack">
        <ErrorBox error={error} />
        <div className="form-grid">
          <label className="field">Name<input required value={form.name} onChange={set('name')} /></label>
          <label className="field">City<input required value={form.city} onChange={set('city')} placeholder="e.g. Ludhiana" /></label>
          <label className="field">Materials (comma separated)<input value={form.materials} onChange={set('materials')} placeholder="steel, fasteners" /></label>
          <label className="field">Price per kg (₹)<input type="number" min="0" step="0.01" value={form.pricePerKg} onChange={set('pricePerKg')} /></label>
          <label className="field">Monthly capacity (kg)<input type="number" min="0" value={form.monthlyCapacityKg} onChange={set('monthlyCapacityKg')} /></label>
          <label className="field">Contact email<input type="email" value={form.contactEmail} onChange={set('contactEmail')} /></label>
        </div>
        <small>The city is geocoded (OpenRouteService, or the built-in Indian city table) to compute route distances.</small>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary">Save</button>
        </div>
      </form>
    </Modal>
  );
}
