import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, errorMessage } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import {
  ErrorBox, Icon, Loading, MODES, MODE_LABEL, Modal, ModeChip, RiskBadge, date, fmt, inr, kg, pct, useApi,
} from '../components/ui.jsx';

export default function Shipments() {
  const { can } = useAuth();
  const [params, setParams] = useSearchParams();
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [explain, setExplain] = useState(null);
  const filters = Object.fromEntries(['q', 'mode', 'status', 'direction', 'risk', 'flagged', 'sort'].map((k) => [k, params.get(k) || '']));
  const qs = new URLSearchParams({ ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)), page, limit: 25 }).toString();
  const { data, error, loading, reload } = useApi(`/shipments?${qs}`, [qs]);

  const setFilter = (k, v) => {
    const next = new URLSearchParams(params);
    v ? next.set(k, v) : next.delete(k);
    setParams(next);
    setPage(1);
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Shipments</h1>
          <p>Every shipment's CO2 is calculated as distance × weight × emission factor for its mode.</p>
        </div>
        {can('owner', 'manager', 'admin') && (
          <div className="row">
            <button className="btn" onClick={() => setImporting(true)}><Icon name="upload" /> Import CSV</button>
            <button className="btn primary" onClick={() => setAdding(true)}><Icon name="plus" /> Log shipment</button>
          </div>
        )}
      </div>

      <div className="card">
        <div className="row" style={{ marginBottom: 12 }}>
          <input placeholder="Search city, vendor, customer, material…" defaultValue={filters.q} onKeyDown={(e) => e.key === 'Enter' && setFilter('q', e.target.value)} onBlur={(e) => e.target.value !== filters.q && setFilter('q', e.target.value)} style={{ flex: '1 1 240px' }} aria-label="Search" />
          <select value={filters.mode} onChange={(e) => setFilter('mode', e.target.value)} aria-label="Mode">
            <option value="">All modes</option>
            {MODES.map((m) => <option key={m} value={m}>{MODE_LABEL[m]}</option>)}
          </select>
          <select value={filters.status} onChange={(e) => setFilter('status', e.target.value)} aria-label="Status">
            <option value="">Any status</option>
            <option value="in_transit">In transit</option>
            <option value="delivered">Delivered</option>
          </select>
          <select value={filters.direction} onChange={(e) => setFilter('direction', e.target.value)} aria-label="Direction">
            <option value="">Inbound + outbound</option>
            <option value="inbound">Inbound (from vendors)</option>
            <option value="outbound">Outbound (to customers)</option>
          </select>
          <select value={filters.risk} onChange={(e) => setFilter('risk', e.target.value)} aria-label="Risk">
            <option value="">Any risk</option>
            <option value="red">High risk</option>
            <option value="amber">Medium risk</option>
            <option value="green">Low risk</option>
          </select>
          <select value={filters.sort} onChange={(e) => setFilter('sort', e.target.value)} aria-label="Sort">
            <option value="">Newest first</option>
            <option value="co2Kg">Highest CO2</option>
            <option value="cost">Highest cost</option>
            <option value="distanceKm">Longest</option>
          </select>
          <label className="row" style={{ fontSize: '0.85rem' }}>
            <input type="checkbox" checked={filters.flagged === 'true'} onChange={(e) => setFilter('flagged', e.target.checked ? 'true' : '')} /> Flagged only
          </label>
        </div>
        <ErrorBox error={error} />
        {!data ? <Loading /> : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th><th>Route</th><th>Mode</th><th>Material</th><th className="r">Weight</th><th className="r">Distance</th>
                    <th className="r">CO2e</th><th className="r">Cost</th><th>Delivery</th><th>Risk / flags</th>
                  </tr>
                </thead>
                <tbody style={{ opacity: loading ? 0.6 : 1 }}>
                  {data.items.map((s) => (
                    <tr key={s._id}>
                      <td style={{ whiteSpace: 'nowrap' }}>{date(s.shipDate)}</td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{s.origin.city} → {s.destination.city}</div>
                        <div className="muted" style={{ fontSize: '0.78rem' }}>{s.origin.name} → {s.destination.name}</div>
                      </td>
                      <td><ModeChip mode={s.mode} /></td>
                      <td style={{ textTransform: 'capitalize' }}>{s.material}</td>
                      <td className="r">{fmt(s.weightKg)} kg</td>
                      <td className="r">{fmt(s.distanceKm)} km</td>
                      <td className="r"><b>{kg(s.co2Kg)}</b></td>
                      <td className="r">{inr(s.cost)}</td>
                      <td>
                        {s.status === 'delivered' ? (
                          <span className={`badge ${s.delayed ? 'amber' : 'green'}`}><span className="dot" />{s.delayed ? `Late +${s.actualDays - s.expectedDays}d` : 'On time'}</span>
                        ) : (
                          <DeliverButton shipment={s} onDone={reload} />
                        )}
                      </td>
                      <td>
                        <div className="stack" style={{ gap: 4, alignItems: 'flex-start' }}>
                          {s.status === 'in_transit' && <RiskBadge risk={s.risk} onClick={() => setExplain(s)} />}
                          {s.anomaly?.flag && <span className="badge red" title={s.anomaly.reason}><span className="dot" />Unusual</span>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {data.items.length === 0 && <div className="empty">No shipments match these filters</div>}
            </div>
            <div className="row mt" style={{ justifyContent: 'space-between' }}>
              <span className="muted">{fmt(data.total)} shipments</span>
              <div className="row">
                <button className="btn sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
                <span className="muted">Page {data.page} of {data.pages || 1}</span>
                <button className="btn sm" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>Next</button>
              </div>
            </div>
          </>
        )}
      </div>

      {adding && <NewShipment onClose={() => setAdding(false)} onSaved={() => { setAdding(false); reload(); }} />}
      {importing && <ImportCsv onClose={() => { setImporting(false); reload(); }} />}
      {explain && <ExplainRisk shipment={explain} onClose={() => setExplain(null)} />}
    </>
  );
}

function DeliverButton({ shipment, onDone }) {
  const { can, toast } = useAuth();
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState(shipment.expectedDays);
  if (!can('owner', 'manager', 'admin')) return <span className="badge brand">In transit · ETA {shipment.expectedDays}d</span>;
  if (!open) return <button className="btn sm" onClick={() => setOpen(true)}>Mark delivered</button>;
  const save = async () => {
    try {
      await api.patch(`/shipments/${shipment._id}`, { actualDays: days });
      onDone();
    } catch (e) {
      toast(errorMessage(e));
    }
  };
  return (
    <div className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
      <input type="number" min="0" value={days} onChange={(e) => setDays(e.target.value)} style={{ width: 60, padding: '3px 6px' }} aria-label="Actual days" />
      <span className="muted" style={{ fontSize: '0.75rem' }}>days</span>
      <button className="btn sm primary" onClick={save}>Save</button>
    </div>
  );
}

function ExplainRisk({ shipment, onClose }) {
  const [risk, setRisk] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    api.post(`/ml/risk/${shipment._id}`).then((r) => setRisk(r.data)).catch((e) => setError(errorMessage(e)));
  }, [shipment._id]);
  return (
    <Modal title="Why is this shipment at risk?" onClose={onClose}>
      <p><b>{shipment.origin.name}</b> → <b>{shipment.destination.name}</b> · <ModeChip mode={shipment.mode} /> · {fmt(shipment.distanceKm)} km · shipped {date(shipment.shipDate)}</p>
      <ErrorBox error={error} />
      {!risk ? <Loading text="Asking the delay model…" /> : (
        <>
          <div className="row"><RiskBadge risk={risk} /><span className="muted">Probability of late arrival: <b>{pct(risk.probability)}</b></span></div>
          <h3 className="mt">Main factors</h3>
          {risk.reasons?.length ? (
            <ul>{risk.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
          ) : <p className="muted">No single factor stands out.</p>}
          <small>Model: {risk.model}. Percentages are each factor's contribution to the predicted probability (SHAP values).</small>
        </>
      )}
    </Modal>
  );
}

function NewShipment({ onClose, onSaved }) {
  const { toast } = useAuth();
  const vendors = useApi('/vendors');
  const locations = useApi('/locations');
  const [form, setForm] = useState({ direction: 'inbound', vendorId: '', fromLocationId: '', toLocationId: '', mode: 'road', weightKg: '', material: '', shipDate: new Date().toISOString().slice(0, 10) });
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const own = locations.data?.filter((l) => l.type !== 'customer') || [];
  const ready = form.toLocationId && form.weightKg > 0 && (form.direction === 'inbound' ? form.vendorId : form.fromLocationId);
  const payload = { ...form, vendorId: form.direction === 'inbound' ? form.vendorId : undefined, fromLocationId: form.direction === 'outbound' ? form.fromLocationId : undefined };

  useEffect(() => {
    if (!ready) return setPreview(null);
    const t = setTimeout(() => {
      api.post('/shipments/preview', payload).then((r) => { setPreview(r.data); setError(null); }).catch((e) => { setPreview(null); setError(errorMessage(e)); });
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(form)]);

  const vendor = vendors.data?.find((v) => v._id === form.vendorId);
  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { data } = await api.post('/shipments', payload);
      toast(`Shipment saved: ${kg(data.co2Kg)} CO2e`);
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Log a shipment" onClose={onClose}>
      <form onSubmit={save} className="stack">
        <div className="tabs" style={{ marginBottom: 0 }}>
          <button type="button" className={`tab ${form.direction === 'inbound' ? 'active' : ''}`} onClick={() => setForm({ ...form, direction: 'inbound' })}>Inbound from vendor</button>
          <button type="button" className={`tab ${form.direction === 'outbound' ? 'active' : ''}`} onClick={() => setForm({ ...form, direction: 'outbound' })}>Outbound to customer</button>
        </div>
        <div className="form-grid">
          {form.direction === 'inbound' ? (
            <label className="field">Vendor
              <select required value={form.vendorId} onChange={set('vendorId')}>
                <option value="">Choose…</option>
                {vendors.data?.map((v) => <option key={v._id} value={v._id}>{v.name} ({v.city})</option>)}
              </select>
            </label>
          ) : (
            <label className="field">From
              <select required value={form.fromLocationId} onChange={set('fromLocationId')}>
                <option value="">Choose…</option>
                {own.map((l) => <option key={l._id} value={l._id}>{l.name} ({l.city})</option>)}
              </select>
            </label>
          )}
          <label className="field">To
            <select required value={form.toLocationId} onChange={set('toLocationId')}>
              <option value="">Choose…</option>
              {locations.data?.filter((l) => (form.direction === 'inbound' ? l.type !== 'customer' : l._id !== form.fromLocationId)).map((l) => <option key={l._id} value={l._id}>{l.name} ({l.city})</option>)}
            </select>
          </label>
          <label className="field">Mode
            <select value={form.mode} onChange={set('mode')}>
              {MODES.map((m) => <option key={m} value={m} disabled={preview && !preview.availableModes?.includes(m)}>{MODE_LABEL[m]}</option>)}
            </select>
          </label>
          <label className="field">Weight (kg)<input type="number" required min="1" value={form.weightKg} onChange={set('weightKg')} /></label>
          <label className="field">Material
            {vendor ? (
              <select value={form.material} onChange={set('material')}>
                {vendor.materials.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            ) : <input value={form.material} onChange={set('material')} placeholder="finished goods" />}
          </label>
          <label className="field">Ship date<input type="date" value={form.shipDate} onChange={set('shipDate')} /></label>
        </div>
        <ErrorBox error={error} />
        {preview && (
          <div className="card" style={{ background: 'var(--surface-2)', boxShadow: 'none' }}>
            <div className="grid g-4">
              <div><div className="muted" style={{ fontSize: '0.78rem' }}>Distance</div><b className="num">{fmt(preview.distanceKm)} km</b></div>
              <div><div className="muted" style={{ fontSize: '0.78rem' }}>CO2e</div><b className="num">{kg(preview.co2Kg)}</b></div>
              <div><div className="muted" style={{ fontSize: '0.78rem' }}>Freight cost</div><b className="num">{inr(preview.cost)}</b></div>
              <div><div className="muted" style={{ fontSize: '0.78rem' }}>Transit</div><b>{preview.expectedDays} days</b></div>
            </div>
            <p className="muted" style={{ fontSize: '0.8rem', margin: '10px 0 6px' }}>
              {fmt(preview.distanceKm)} km × {fmt(preview.weightKg / 1000, 2)} t × {preview.emissionFactor} kg/tkm = {kg(preview.co2Kg)}
            </p>
            {preview.risk && <div className="row"><RiskBadge risk={preview.risk} /><small>{preview.risk.reasons?.join(' · ')}</small></div>}
          </div>
        )}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={!ready || saving || !preview}>{saving ? 'Saving…' : 'Save shipment'}</button>
        </div>
      </form>
    </Modal>
  );
}

function ImportCsv({ onClose }) {
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const upload = async (e) => {
    e.preventDefault();
    const fd = new FormData();
    fd.append('file', file);
    setBusy(true);
    setError(null);
    try {
      const { data } = await api.post('/shipments/import', fd);
      setResult(data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const template = async () => {
    const { data } = await api.get('/shipments/import/template', { responseType: 'blob' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(data);
    a.download = 'ecotrace-shipments-template.csv';
    a.click();
  };

  return (
    <Modal title="Import shipments from CSV" onClose={onClose}>
      <p>Upload past shipment records. Distance, CO2 and cost are calculated automatically. Excel files: use <i>File → Save as → CSV</i> first.</p>
      <p className="muted" style={{ fontSize: '0.85rem' }}>
        Columns: <code>date, vendor, vendor_city, origin, destination, destination_city, mode, weight_kg, material, cost, expected_days, actual_days</code>.
        Fill <code>vendor</code> for inbound rows or <code>origin</code> for outbound rows. New vendors and destinations are created from their city.
      </p>
      <form onSubmit={upload} className="row">
        <input type="file" accept=".csv,text/csv" onChange={(e) => setFile(e.target.files[0])} aria-label="CSV file" />
        <button className="btn primary" disabled={!file || busy}>{busy ? 'Importing…' : 'Import'}</button>
        <button type="button" className="btn ghost" onClick={template}>Download template</button>
      </form>
      <div className="mt"><ErrorBox error={error} /></div>
      {result && (
        <div className="mt">
          <div className={`alert ${result.failed ? 'warn' : 'ok'}`}>Imported <b>{result.imported}</b> shipments{result.failed ? `, ${result.failed} rows skipped` : ''}.</div>
          {result.errors?.length > 0 && (
            <table className="mt"><thead><tr><th>Row</th><th>Problem</th></tr></thead>
              <tbody>{result.errors.map((e) => <tr key={e.row}><td>{e.row}</td><td>{e.message}</td></tr>)}</tbody>
            </table>
          )}
        </div>
      )}
    </Modal>
  );
}
