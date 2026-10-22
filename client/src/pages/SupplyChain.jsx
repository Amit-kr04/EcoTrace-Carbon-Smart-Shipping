import { useMemo, useState } from 'react';
import { Background, Controls, MarkerType, ReactFlow } from '@xyflow/react';
import { useAuth } from '../context/AuthContext.jsx';
import { ErrorBox, Loading, fmt, tonnes, useApi } from '../components/ui.jsx';

const RAMP = ['#b9dccb', '#7fbf9f', '#4a9e78', '#237a55', '#0f5135'];
const COLUMN = { vendor: 0, factory: 1, warehouse: 1, customer: 2 };
const TYPE_COLOR = { vendor: '#6b7570', factory: '#1d6b4c', warehouse: '#b7791f', customer: '#2a78d6' };

// Vendors -> factory/warehouse -> customers, edges coloured and sized by CO2.
export default function SupplyChain() {
  const [months, setMonths] = useState(12);
  const { theme } = useAuth();
  const { data, error } = useApi(`/analytics/supply-chain?months=${months}`, [months]);
  const [selected, setSelected] = useState(null);

  const graph = useMemo(() => {
    if (!data) return null;
    const max = Math.max(1, ...data.edges.map((e) => e.co2Kg));
    const cols = [[], [], []];
    [...data.nodes].sort((a, b) => b.co2Out + b.co2In - (a.co2Out + a.co2In)).forEach((n) => cols[COLUMN[n.type] ?? 2].push(n));
    const nodes = cols.flatMap((col, ci) => {
      const gap = ci === 1 ? 200 : 76;
      const offset = ((Math.max(...cols.map((c) => c.length)) - col.length) * 76) / 2;
      return col.map((n, i) => ({
        id: n.id,
        position: { x: ci * 420, y: offset + i * gap },
        data: {
          label: (
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontWeight: 600, fontSize: 12 }}>{n.id}</div>
              <div style={{ fontSize: 11, opacity: 0.75 }}>{n.city} · {tonnes(n.type === 'vendor' ? n.co2Out : n.co2In)}</div>
            </div>
          ),
        },
        sourcePosition: 'right',
        targetPosition: 'left',
        style: { border: '1px solid var(--border)', borderLeft: `5px solid ${TYPE_COLOR[n.type]}`, borderRadius: 8, width: 210, padding: 8, background: 'var(--surface)', color: 'var(--text)' },
      }));
    });
    const edges = data.edges.map((e) => {
      const t = e.co2Kg / max;
      const color = RAMP[Math.min(RAMP.length - 1, Math.floor(Math.sqrt(t) * RAMP.length))];
      const dim = selected && e.source !== selected && e.target !== selected;
      return {
        id: `${e.source}->${e.target}`,
        source: e.source,
        target: e.target,
        // Only label the links of the focused node, otherwise labels overlap.
        label: selected && !dim ? tonnes(e.co2Kg) : undefined,
        labelStyle: { fontSize: 11, fill: 'var(--text)' },
        labelBgStyle: { fill: 'var(--surface)' },
        style: { stroke: color, strokeWidth: 1.5 + Math.sqrt(t) * 7, opacity: dim ? 0.12 : 0.9 },
        markerEnd: { type: MarkerType.ArrowClosed, color },
        data: e,
      };
    });
    return { nodes, edges };
  }, [data, selected]);

  if (error) return <ErrorBox error={error} />;
  if (!graph) return <Loading />;
  const sel = selected && data.nodes.find((n) => n.id === selected);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Supply-chain graph</h1>
          <p>Vendors → factory and warehouse → customers. Thicker, darker links carry more CO2. Click a node to focus on it.</p>
        </div>
        <select value={months} onChange={(e) => setMonths(Number(e.target.value))} aria-label="Period">
          <option value={3}>Last 3 months</option>
          <option value={12}>Last 12 months</option>
          <option value={24}>Last 24 months</option>
        </select>
      </div>
      <div className="grid g-3">
        <div className="card span-2" style={{ height: 640, padding: 0, overflow: 'hidden' }}>
          <ReactFlow
            nodes={graph.nodes}
            edges={graph.edges}
            fitView
            colorMode={theme === 'system' ? 'system' : theme}
            onNodeClick={(_, n) => setSelected(selected === n.id ? null : n.id)}
            onPaneClick={() => setSelected(null)}
            nodesConnectable={false}
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={20} color="var(--grid)" />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>
        <div className="card">
          <h2>{sel ? sel.id : 'Legend'}</h2>
          {sel ? (
            <div className="stack" style={{ gap: 8 }}>
              <div className="muted" style={{ textTransform: 'capitalize' }}>{sel.type} · {sel.city}</div>
              {sel.co2Out > 0 && <div>Outgoing CO2e: <b>{tonnes(sel.co2Out)}</b></div>}
              {sel.co2In > 0 && <div>Incoming CO2e: <b>{tonnes(sel.co2In)}</b></div>}
              {sel.label && <span className="badge brand">{sel.label}</span>}
              <table className="mt">
                <thead><tr><th>Link</th><th className="r">CO2e</th><th className="r">Trips</th></tr></thead>
                <tbody>
                  {data.edges.filter((e) => e.source === sel.id || e.target === sel.id).map((e) => (
                    <tr key={`${e.source}${e.target}`}>
                      <td style={{ fontSize: '0.8rem' }}>{e.source === sel.id ? `→ ${e.target}` : `← ${e.source}`}<div className="muted">{e.modes.join(', ')}</div></td>
                      <td className="r">{tonnes(e.co2Kg)}</td>
                      <td className="r">{fmt(e.shipments)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="stack" style={{ gap: 10 }}>
              {Object.entries(TYPE_COLOR).map(([t, col]) => (
                <div key={t} className="row" style={{ textTransform: 'capitalize' }}><span style={{ width: 4, height: 18, background: col, borderRadius: 2 }} />{t}</div>
              ))}
              <div className="legend mt"><span>Link CO2e: low</span>{RAMP.map((r) => <i key={r} style={{ background: r, width: 20, height: 6 }} />)}<span>high</span></div>
              <p className="muted mt" style={{ fontSize: '0.85rem' }}>{data.nodes.length} sites, {data.edges.length} active links.</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
