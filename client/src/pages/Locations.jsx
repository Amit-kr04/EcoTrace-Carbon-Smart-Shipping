import { useState } from 'react';
import { CircleMarker, MapContainer, TileLayer, Tooltip } from 'react-leaflet';
import { api, errorMessage } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { ErrorBox, Icon, Loading, Modal, useApi } from '../components/ui.jsx';

const TYPE_COLOR = { factory: '#1d6b4c', warehouse: '#b7791f', customer: '#2a78d6', vendor: '#6b7570' };

export default function Locations() {
  const { can, toast } = useAuth();
  const { data, error, reload } = useApi('/locations');
  const vendors = useApi('/vendors');
  const [editing, setEditing] = useState(null);

  const remove = async (l) => {
    if (!confirm(`Delete ${l.name}?`)) return;
    try {
      await api.delete(`/locations/${l._id}`);
      reload();
    } catch (e) {
      toast(errorMessage(e));
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Locations</h1>
          <p>Your factory, warehouses and the customers you deliver to.</p>
        </div>
        {can('owner', 'manager', 'admin') && <button className="btn primary" onClick={() => setEditing({})}><Icon name="plus" /> Add location</button>}
      </div>
      <ErrorBox error={error} />
      {!data ? <Loading /> : (
        <div className="grid g-2">
          <div className="card table-wrap">
            <table>
              <thead><tr><th>Name</th><th>Type</th><th>City</th><th /></tr></thead>
              <tbody>
                {data.map((l) => (
                  <tr key={l._id}>
                    <td><b>{l.name}</b>{l.address && <div className="muted" style={{ fontSize: '0.78rem' }}>{l.address}</div>}</td>
                    <td><span className="badge" style={{ textTransform: 'capitalize' }}><span className="dot" style={{ background: TYPE_COLOR[l.type] }} />{l.type}</span></td>
                    <td>{l.city}{l.coastal && <span className="muted"> · port</span>}</td>
                    <td>
                      {can('owner', 'manager', 'admin') && (
                        <div className="row" style={{ flexWrap: 'nowrap', gap: 4 }}>
                          <button className="btn sm" onClick={() => setEditing(l)}>Edit</button>
                          {can('owner', 'admin') && <button className="btn sm danger" onClick={() => remove(l)}>Delete</button>}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="card">
            <div className="card-head">
              <h2>Network map</h2>
              <div className="legend">{Object.entries(TYPE_COLOR).map(([t, c]) => <span key={t} style={{ textTransform: 'capitalize' }}><i style={{ background: c, borderRadius: '50%' }} />{t}</span>)}</div>
            </div>
            <MapContainer center={[22, 79]} zoom={4.6} scrollWheelZoom={false} className="map">
              <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              {[...(vendors.data || []).map((v) => ({ ...v, type: 'vendor' })), ...data].map((p) => (
                <CircleMarker key={p._id} center={[p.geo.coordinates[1], p.geo.coordinates[0]]} radius={p.type === 'factory' ? 9 : 6} pathOptions={{ color: '#fff', weight: 2, fillColor: TYPE_COLOR[p.type], fillOpacity: 1 }}>
                  <Tooltip>{p.name} · {p.city} ({p.type})</Tooltip>
                </CircleMarker>
              ))}
            </MapContainer>
          </div>
        </div>
      )}
      {editing && <LocationForm loc={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
    </>
  );
}

function LocationForm({ loc, onClose, onSaved }) {
  const [form, setForm] = useState({ name: loc.name || '', type: loc.type || 'customer', city: loc.city || '', address: loc.address || '' });
  const [error, setError] = useState(null);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const save = async (e) => {
    e.preventDefault();
    try {
      if (loc._id) await api.put(`/locations/${loc._id}`, form);
      else await api.post('/locations', form);
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    }
  };
  return (
    <Modal title={loc._id ? `Edit ${loc.name}` : 'Add location'} onClose={onClose}>
      <form onSubmit={save} className="stack">
        <ErrorBox error={error} />
        <div className="form-grid">
          <label className="field">Name<input required value={form.name} onChange={set('name')} /></label>
          <label className="field">Type
            <select value={form.type} onChange={set('type')}>
              <option value="factory">Factory</option>
              <option value="warehouse">Warehouse</option>
              <option value="customer">Customer</option>
            </select>
          </label>
          <label className="field">City<input required value={form.city} onChange={set('city')} /></label>
          <label className="field">Address<input value={form.address} onChange={set('address')} /></label>
        </div>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary">Save</button>
        </div>
      </form>
    </Modal>
  );
}
