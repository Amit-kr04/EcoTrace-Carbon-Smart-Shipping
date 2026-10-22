import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { Icon } from '../components/ui.jsx';

// Fill in your team details here.
const TEAM = [
  { member: 'Member 1', name: 'Mohammed Afaan Sherief', reg: '24MID0178' },
  { member: 'Member 2', name: 'Amit Kumar', reg: '24MID0155' },
  { member: 'Member 3', name: 'Bhumi Kumari', reg: '24MID0216' },
];

const PROBLEMS = [
  ['No visibility', 'A small manufacturer does not know how much CO2 each shipment, route or vendor generates. Shipment records sit in spreadsheets and are never analysed.'],
  ['Decisions are made on cost alone', 'Vendors and transport modes (road, rail, sea, air) are chosen by price or habit. No simple tool shows the trade-off between carbon, cost and delivery time side by side.'],
  ['No foresight', "Businesses cannot predict next quarter's emissions, or which shipments are likely to be delayed during the monsoon and festival seasons."],
  ['Existing tools do not fit', 'Enterprise carbon-accounting platforms are expensive and complex. Free online calculators handle one shipment at a time: they keep no history, make no comparisons and give no predictions.'],
];

const STAKEHOLDERS = [
  ['MSME owners', 'Cannot answer a client who asks for the carbon footprint of their deliveries.'],
  ['Logistics managers', 'Choose vendors and modes without data on emissions or delay risk.'],
  ['Large client companies', 'Need supplier (value-chain) emission data for ESG reporting.'],
  ['Environment and society', 'Avoidable emissions from inefficient, carbon-heavy transport choices.'],
];

const OBJECTIVES = [
  'Calculate the CO2 footprint of every shipment automatically from route distance, weight and transport mode.',
  'Present emissions clearly through an interactive dashboard, route map and supply-chain view.',
  'Compare vendor and transport-mode options on carbon, cost and time, with user-adjustable priorities.',
  'Use machine learning to forecast future emissions, predict delay risk and detect abnormal shipments.',
  'Recommend the lowest-cost shipping plan that stays within a monthly CO2 budget (optimization).',
  'Generate shareable monthly sustainability reports and send budget alerts.',
];

const STEPS = [
  ['Register', 'The business owner creates an account and company profile (JWT authentication, roles).'],
  ['Set up', 'Add vendors (city, materials, price) and delivery locations (factory, customers).'],
  ['Log shipments', 'Enter shipments one by one, or bulk-import past records from a CSV/Excel file.'],
  ['Auto-calculate', 'OpenRouteService returns the route distance. EcoTrace computes CO2 = distance × weight × emission factor for the chosen mode.'],
  ['Analyse', 'The dashboard shows totals, trends, emissions by mode, vendor and route, and a route map.'],
  ['Compare', 'For a planned shipment, every vendor + mode option is ranked by carbon, cost and time.'],
  ['Predict', "ML forecasts the next 3 months' emissions and flags shipments at risk of delay."],
  ['Optimize and report', 'The optimizer suggests the cheapest plan under the CO2 budget. A PDF report and email alerts are generated.'],
];

const MODULES = [
  ['Authentication and roles', 'Owner, Logistics Manager and Admin accounts', 'JWT, bcrypt, Express middleware', '/app/settings'],
  ['Vendor and location manager', 'Add, edit and delete vendors and delivery points', 'React forms, REST API, MongoDB', '/app/vendors'],
  ['Shipment logger and CSV import', 'Single entry or bulk upload; automatic CO2 calculation', 'Multer, csv-parser, OpenRouteService', '/app/shipments'],
  ['Analytics dashboard', 'KPIs, trend lines, breakdown charts, route map', 'Recharts, React-Leaflet, MongoDB aggregation', '/app'],
  ['Green Option Comparator', 'Ranks options with carbon / cost / time sliders', 'React state, Express scoring API', '/app/compare'],
  ['What-if simulator', '"Move 30% of road freight to rail" with charts updating live', 'React, Express', '/app/what-if'],
  ['Supply-chain graph', 'Vendors to factory to customers, edges coloured by CO2', 'React Flow', '/app/supply-chain'],
  ['Alerts and reports', 'Carbon-budget emails, monthly PDF report', 'Nodemailer, node-cron, pdfkit', '/app/reports'],
  ['Real-time updates', 'Dashboard refreshes when a teammate logs a shipment', 'Socket.io', '/app'],
];

const ML = [
  ['Emission forecasting', 'Predict monthly emissions for the next 3 months', 'Prophet (Indian holidays); SARIMA fallback', 'Forecast line with confidence band'],
  ['Delay-risk prediction', 'Probability that a shipment arrives late', 'XGBoost / Random Forest', 'Green / amber / red risk badge'],
  ['Explainable risk', 'Why a shipment is risky', 'SHAP', '"Monsoon month +18%, vendor late 3/10 times"'],
  ['Anomaly detection', 'Catch unusual or wrongly entered shipments', 'Isolation Forest', 'Flagged rows with reason'],
  ['Vendor segmentation', 'Group vendors by carbon, cost and reliability', 'K-Means', 'Labels like "Green and Reliable"'],
  ['Carbon-budget optimizer', 'Cheapest shipping mix within a CO2 budget and deadline', 'PuLP (linear programming)', 'Recommended allocation plan'],
];

const TECH = {
  'A. Frontend': [
    ['HTML5', 'Page structure and forms (shipment entry, vendor details)'], ['CSS3', 'Styling, responsive layout, light and dark theme'],
    ['JavaScript (ES6+)', 'All client-side logic'], ['React (with Vite)', 'Component-based user interface'],
    ['React Router', 'Navigation: Dashboard, Shipments, Vendors, Compare, Reports'], ['Context API', 'Sharing logged-in user and company data across pages'],
    ['Axios', 'Calling the backend REST APIs'], ['Recharts', 'Emission trends, breakdown by mode and vendor, forecast line'],
    ['React-Leaflet + OpenStreetMap', 'Interactive route map coloured by emissions'], ['React Flow', 'Supply-chain graph: vendors to factory to customers'],
    ['Socket.io client', 'Live dashboard updates'],
  ],
  'B. Backend': [
    ['Node.js', 'Server runtime'], ['Express.js', 'REST API routes and middleware'], ['JWT (jsonwebtoken)', 'Login sessions and protected, role-based routes'],
    ['bcrypt', 'Password hashing'], ['Multer', 'File uploads (CSV import)'], ['csv-parser', 'Reading uploaded shipment spreadsheets'],
    ['Nodemailer', 'Carbon-budget email alerts'], ['node-cron', 'Scheduled jobs: weekly model retraining, monthly reports'],
    ['pdfkit', 'Monthly sustainability PDF report'], ['Socket.io', 'Real-time updates between users'], ['dotenv', 'Keeping API keys and secrets out of the code'],
  ],
  'C. Database': [
    ['MongoDB Atlas', 'Cloud database (free tier)'], ['Mongoose', 'Schemas: users, companies, vendors, locations, shipments, emission factors, forecasts, alerts'],
    ['Aggregation pipelines', 'Dashboard totals and breakdowns by mode, vendor, route and month'], ['Geospatial indexes', 'Storing and querying vendor and customer locations'],
  ],
  'D. Machine Learning': [
    ['Python', 'Language for all ML work'], ['FastAPI + Uvicorn', 'ML microservice called by the Express backend'],
    ['pandas, NumPy', 'Data handling and synthetic shipment data generation'], ['scikit-learn', 'Random Forest, Isolation Forest, K-Means, evaluation metrics'],
    ['XGBoost', 'Delay-risk prediction'], ['Prophet / statsmodels SARIMA', "Forecasting the next 3 months' emissions"],
    ['SHAP', 'Explaining why a shipment is predicted to be risky'], ['PuLP', 'Optimizer: cheapest shipping plan within a CO2 budget'],
    ['joblib', 'Saving and loading trained models'], ['pymongo', 'Reading training data from MongoDB'], ['Jupyter Notebook', 'Data exploration and model experiments'],
  ],
  'E. External APIs and Data': [
    ['OpenRouteService API', 'Route distance (truck profile) and geocoding of city names'], ['OpenStreetMap tiles', 'Map background'],
    ['UK Government GHG Conversion Factors', 'Emission factors per tonne-km for road, rail, sea and air, stored in our own database'],
    ['Climatiq API (optional)', 'Live emission estimates'], ['OpenWeather API (optional)', 'Weather data as an extra input for delay prediction'],
  ],
  'F. Deployment and Tools': [
    ['Vercel / Netlify', 'Hosting the React frontend (deployed directly from the build folder)'], ['Render / Railway', 'Hosting the Node API and the Python ML service'],
    ['Postman', 'API testing'], ['VS Code', 'Code editor'], ['Figma', 'Wireframes and UI design'],
  ],
};

const SYLLABUS = [
  ['Frontend', 'HTML, CSS, JavaScript, React'], ['Backend', 'Node.js, Express, REST APIs, middleware, authentication'],
  ['Database', 'MongoDB, Mongoose, aggregation, geospatial queries'], ['APIs', 'Own REST API, third-party APIs (OpenRouteService, maps), internal ML API'],
  ['Advanced web', 'WebSockets, JWT security, file uploads, scheduled jobs, PDF generation, cloud deployment'],
  ['ML integration', 'Python service with 6 models: forecasting, classification, explanation, anomaly detection, clustering, optimization'],
];

const TECH_FEAS = [
  ['React UI, charts, maps', 'Medium', 'Recharts and React-Leaflet provide ready-made components.'],
  ['Express REST API + JWT auth', 'Medium', 'Standard MERN patterns already covered in the course.'],
  ['MongoDB schemas and aggregations', 'Medium', 'Mongoose models plus aggregation pipelines for the dashboard.'],
  ['CO2 calculation', 'Easy', 'A simple formula using published emission factors.'],
  ['Routing API integration', 'Easy', 'OpenRouteService has a free key and clear REST documentation.'],
  ['Forecasting and delay models', 'Medium', 'scikit-learn, XGBoost and Prophet have many tutorials; small datasets train in seconds.'],
  ['Optimizer (PuLP)', 'Medium-High', 'A small linear program (a few variables per option); well-known textbook pattern.'],
  ['Node to Python integration', 'Medium', 'FastAPI exposes REST endpoints; Node calls them with axios.'],
];

const COSTS = [
  ['MongoDB Atlas', 'Database', 'Free tier (M0 cluster)'], ['OpenRouteService', 'Distance and geocoding', 'Free API key, no credit card'],
  ['Vercel / Netlify', 'Frontend hosting', 'Free'], ['Render / Railway', 'Node API and FastAPI hosting', 'Free tier (sleeps when idle)'],
  ['All libraries', 'React, Express, scikit-learn, Prophet, PuLP, etc.', 'Open source'],
];

const SCHEDULE = [
  ['1', 'Scope, wireframes, DB schema, project setup', 'Approved design and project skeleton'],
  ['2-3', 'Auth, vendor and shipment CRUD, CO2 calculation, synthetic data', 'Working backend with seeded data'],
  ['4-5', 'Routing API, dashboard charts and map', 'Usable dashboard'],
  ['6', 'Green Option Comparator', 'Ranked comparison with sliders'],
  ['7-8', 'ML service: forecasting, delay risk, anomalies, optimizer', 'ML features live in the UI'],
  ['9', 'CSV import, alerts, PDF report, polish', 'Feature-complete system'],
  ['10', 'Testing, deployment, documentation, demo', 'Live URL, report, presentation'],
];

const TEAM_RESP = [
  ['A - Frontend', 'React pages, dashboard, map, comparator, optimizer UI', 'HTML, CSS, JS, React'],
  ['B - Backend', 'Express API, auth, MongoDB, external APIs, CSV, alerts, PDF, Node-Python link', 'Node, Express, MongoDB'],
  ['C - ML and data', 'Synthetic data, notebooks, all ML models, FastAPI service, metrics', 'Python, pandas, scikit-learn'],
];

const RISKS = [
  ['No real company data', 'High', 'Synthetic data generator with realistic seasonal patterns, plus CSV import for real data.'],
  ['ML models perform poorly', 'Medium', 'Build patterns into the data; compare against a naive baseline; try 2-3 models and report the best.'],
  ['Prophet fails to install on Windows', 'Medium', 'Switch to statsmodels SARIMA (lighter, equally valid academically).'],
  ['External API limits or downtime', 'Low', 'Cache distances in MongoDB; keep emission factors locally.'],
  ['Scope too large for the time', 'Medium', 'Strict Must / Should / Could priority list.'],
  ['Free hosting sleeps during demo', 'Medium', 'Wake both services a few minutes before the demo; keep a local backup run ready.'],
];

const SCOPE = [
  ['Must have', 'Auth and roles, vendors, shipments, CO2 calculation, dashboard and map, comparator, emission forecasting, delay-risk prediction', 'Guaranteed deliverables'],
  ['Should have', 'Carbon-budget optimizer, CSV import, alerts, PDF report, anomaly detection', 'Planned'],
  ['Could have', 'SHAP explanations, vendor clustering, what-if simulator, supply-chain graph, Socket.io', 'If time permits'],
];

const SUCCESS = [
  'CO2 values produced by the system match manual calculations for test shipments.',
  'The dashboard loads 2 years of data (about 5,000 shipments) in under 2 seconds.',
  'The emission forecast beats a naive "same as last month" baseline on MAE / MAPE.',
  'The delay-risk model achieves a higher F1-score and ROC-AUC than a simple baseline, validated on held-out data.',
  'The optimizer returns a plan that meets demand, stays within the CO2 budget and costs less than the current mix.',
  'The application is deployed and accessible through a public URL.',
];

const LIMITS = [
  'Model accuracy reflects patterns in the synthetic data; real-world accuracy would need real company data.',
  'Emission factors are published averages, so results are estimates, not certified carbon accounting.',
  'Scope covers transport emissions only, not manufacturing or packaging emissions.',
];

function Table({ head, rows, first = true }) {
  return (
    <div className="card table-wrap" style={{ padding: 0 }}>
      <table>
        <thead><tr>{head.map((h) => <th key={h} style={{ padding: '12px 14px' }}>{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r[0]}>{r.map((c, i) => <td key={i} style={{ padding: '11px 14px', fontWeight: first && i === 0 ? 600 : 400 }}>{c}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Section({ id, eyebrow, title, lead, children, alt }) {
  const body = (
    <>
      <div className="eyebrow">{eyebrow}</div>
      <h2 className="l-title">{title}</h2>
      {lead && <p className="lead">{lead}</p>}
      <div className="mt" style={{ marginTop: 28 }}>{children}</div>
    </>
  );
  return alt ? <section id={id} className="l-section alt"><div className="inner">{body}</div></section> : <section id={id} className="l-section">{body}</section>;
}

function Architecture() {
  const box = (x, y, w, title, lines, fill) => (
    <g>
      <rect x={x} y={y} width={w} height={84} rx={12} style={{ fill: fill || 'var(--surface)', stroke: 'var(--brand)', strokeWidth: 1.5 }} />
      <text x={x + w / 2} y={y + 30} textAnchor="middle" style={{ fill: 'var(--text)', fontWeight: 700, fontSize: 15 }}>{title}</text>
      {lines.map((l, i) => <text key={l} x={x + w / 2} y={y + 52 + i * 17} textAnchor="middle" style={{ fill: 'var(--text-2)', fontSize: 12 }}>{l}</text>)}
    </g>
  );
  const arrow = (d, label, lx, ly) => (
    <g>
      <path d={d} style={{ stroke: 'var(--muted)', strokeWidth: 1.6, fill: 'none' }} markerEnd="url(#arrow)" />
      {label && <text x={lx} y={ly} style={{ fill: 'var(--muted)', fontSize: 12 }}>{label}</text>}
    </g>
  );
  return (
    <svg viewBox="0 0 900 400" style={{ width: '100%', height: 'auto' }} role="img" aria-label="System architecture: React frontend talks to the Express API, which uses MongoDB, OpenRouteService and the Python ML service">
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0 10 5 0 10z" style={{ fill: 'var(--muted)' }} />
        </marker>
      </defs>
      {box(315, 10, 270, 'React Frontend (Vite)', ['Dashboard, maps, comparator,', 'optimizer UI, reports'], 'var(--brand-soft)')}
      {box(315, 150, 270, 'Node.js + Express API', ['Auth (JWT), CRUD, aggregation,', 'CSV import, alerts, PDF reports'])}
      {box(650, 150, 240, 'External APIs', ['OpenRouteService', '(distance, geocoding)'])}
      {box(10, 300, 280, 'MongoDB Atlas', ['Users, vendors, shipments,', 'emission factors, forecasts'])}
      {box(610, 300, 280, 'Python FastAPI (ML)', ['Prophet / SARIMA, XGBoost, SHAP,', 'Isolation Forest, K-Means, PuLP'], 'var(--accent-soft)')}
      {arrow('M450 94 L450 148', 'REST + Socket.io', 458, 126)}
      {arrow('M585 192 L648 192')}
      {arrow('M360 234 L200 298')}
      {arrow('M540 234 L700 298', 'internal REST (API key)', 628, 258)}
      {arrow('M610 342 L292 342', 'training data (pymongo)', 380, 334)}
    </svg>
  );
}

export default function Landing() {
  const { user } = useAuth();
  const [tab, setTab] = useState('A. Frontend');
  const go = user ? '/app' : '/login';
  return (
    <div className="landing">
      <nav className="l-nav">
        <Link to="/" className="row" style={{ fontWeight: 800, fontSize: '1.15rem', color: 'var(--text)' }}>
          <span className="brand-mark" style={{ color: '#fff' }}><Icon name="leaf" size={18} /></span>EcoTrace
        </Link>
        <div className="links">
          <a href="#problem">Problem</a><a href="#solution">Solution</a><a href="#modules">Modules</a><a href="#ml">ML</a>
          <a href="#architecture">Architecture</a><a href="#tech">Tech stack</a><a href="#feasibility">Feasibility</a><a href="#team">Team</a>
        </div>
        <Link to={go} className="btn primary">{user ? 'Open app' : 'Sign in'}</Link>
      </nav>

      <header className="hero">
        <div>
          <div className="eyebrow">Advanced Web Technologies project</div>
          <h1>Carbon-smart shipping decisions for <em>small businesses</em>.</h1>
          <p className="lead" style={{ marginTop: 16 }}>
            EcoTrace is a full-stack web platform where a business logs or imports its shipments. It calculates their carbon footprint, visualises where emissions come from, and uses machine learning and optimization to recommend greener, cheaper and more reliable shipping decisions.
          </p>
          <div className="row" style={{ marginTop: 24 }}>
            <Link to={go} className="btn primary lg">{user ? 'Open dashboard' : 'Try the live demo'}</Link>
            {!user && <Link to="/register" className="btn lg">Create a company account</Link>}
          </div>
          <p className="muted" style={{ marginTop: 12, fontSize: '0.85rem' }}>Stack: HTML, CSS, JavaScript, React, Node.js, Express, MongoDB, Python (ML)</p>
        </div>
        <div className="hero-card">
          <div className="muted" style={{ fontSize: '0.8rem', fontWeight: 600 }}>EVERY SHIPMENT, AUTOMATICALLY</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, margin: '8px 0 14px' }}>CO2 = distance × weight × emission factor</div>
          <table>
            <thead><tr><th>Mumbai → Delhi, 8 t</th><th className="r">kg CO2e</th><th className="r">Days</th></tr></thead>
            <tbody>
              <tr><td><span className="mode-chip" style={{ textTransform: 'none' }}><i style={{ background: 'var(--mode-road)' }} />Road · 0.107 kg/tkm</span></td><td className="r">1,234</td><td className="r">4</td></tr>
              <tr><td><span className="mode-chip" style={{ textTransform: 'none' }}><i style={{ background: 'var(--mode-rail)' }} />Rail · 0.028 kg/tkm</span></td><td className="r">355</td><td className="r">7</td></tr>
              <tr><td><span className="mode-chip" style={{ textTransform: 'none' }}><i style={{ background: 'var(--mode-air)' }} />Air · 1.13 kg/tkm</span></td><td className="r">10,947</td><td className="r">2</td></tr>
            </tbody>
          </table>
          <div className="grid g-2 mt">
            {[['4 areas', 'carbon accounting, visualisation, ML, optimization'], ['6 ML models', 'forecast, risk, SHAP, anomalies, clusters, LP'], ['₹0 cost', 'free tiers and open-source libraries'], ['10 weeks', '3-member team, one semester']].map(([a, b]) => (
              <div key={a} style={{ padding: 10, background: 'var(--surface-2)', borderRadius: 10 }}><b>{a}</b><div className="muted" style={{ fontSize: '0.78rem' }}>{b}</div></div>
            ))}
          </div>
        </div>
      </header>

      <Section id="problem" eyebrow="1. Problem statement" title="Small businesses are being pulled into carbon reporting without the tools to do it" alt
        lead="Freight transport is one of the largest sources of greenhouse-gas emissions. In India, millions of micro, small and medium enterprises (MSMEs) move raw materials and finished goods every day, mostly by road. Large listed companies now publish sustainability disclosures under SEBI's Business Responsibility and Sustainability Reporting (BRSR) framework, and are beginning to ask their suppliers for emission data.">
        <div className="grid g-4">
          {PROBLEMS.map(([t, d]) => <div className="feature" key={t}><h3>{t}</h3><p>{d}</p></div>)}
        </div>
        <h3 className="mt" style={{ marginTop: 32 }}>Formal problem statement</h3>
        <div className="statement">
          Small and medium businesses lack an affordable, easy-to-use system to measure, compare, forecast and reduce the carbon emissions of their shipments. As a result, logistics decisions ignore environmental impact, emission targets cannot be planned, and suppliers cannot provide the emission data their clients increasingly demand.
        </div>
        <h3 style={{ marginTop: 32 }}>Who is affected</h3>
        <Table head={['Stakeholder', 'Pain point']} rows={STAKEHOLDERS} />
      </Section>

      <Section id="objectives" eyebrow="2. Objectives" title="What EcoTrace sets out to do">
        <div className="grid g-3">
          {OBJECTIVES.map((o, i) => (
            <div className="feature" key={o}><div className="eyebrow" style={{ marginBottom: 4 }}>Objective {i + 1}</div><p style={{ color: 'var(--text)' }}>{o}</p></div>
          ))}
        </div>
      </Section>

      <Section id="solution" eyebrow="3. Proposed solution" title="How it works" alt lead="From sign-up to an optimized, reported shipping plan in eight steps.">
        <div className="steps">
          {STEPS.map(([t, d]) => <div className="step" key={t}><h3>{t}</h3><p>{d}</p></div>)}
        </div>
      </Section>

      <Section id="modules" eyebrow="3.2 System modules" title="Nine modules, all working in the demo" lead="Open any module in the live app with the demo account.">
        <div className="grid g-3">
          {MODULES.map(([t, d, tech, to]) => (
            <Link to={user ? to : '/login'} className="feature" key={t} style={{ color: 'inherit', textDecoration: 'none' }}>
              <h3>{t}</h3><p>{d}</p><div className="tag">{tech}</div>
            </Link>
          ))}
        </div>
      </Section>

      <Section id="ml" eyebrow="3.3 Machine learning components (Python)" title="Forecast, predict, explain, detect, segment, optimize" alt>
        <Table head={['Feature', 'Purpose', 'Model / library', 'User sees']} rows={ML} />
      </Section>

      <Section id="architecture" eyebrow="3.4 System architecture" title="React → Express → MongoDB and a Python ML service">
        <div className="card"><Architecture /></div>
        <p className="lead mt" style={{ fontSize: '0.98rem' }}>
          React talks only to the Express API. Express calls the Python ML service over an internal REST connection secured with a shared API key. The ML service reads training data directly from MongoDB, and a weekly cron job retrains the models on new shipments.
        </p>
        <h3 style={{ marginTop: 32 }}>3.5 What makes it unique</h3>
        <div className="grid g-3">
          <div className="feature"><p>The only sustainability and logistics project among the class proposals, which centre on health, campus, career and civic themes.</p></div>
          <div className="feature"><p>Combines four areas in one product: carbon accounting, data visualisation, machine learning and mathematical optimization.</p></div>
          <div className="feature"><p>Solves a real and growing business need (supplier emission data for ESG reporting) rather than a purely academic one.</p></div>
        </div>
      </Section>

      <Section id="tech" eyebrow="3.6 Technologies used" title="The full stack" alt>
        <div className="tabs" role="tablist">
          {Object.keys(TECH).map((k) => <button key={k} role="tab" aria-selected={tab === k} className={`tab ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>{k}</button>)}
        </div>
        <Table head={['Technology', 'Used for']} rows={TECH[tab]} />
        <h3 style={{ marginTop: 32 }}>3.7 Syllabus coverage</h3>
        <Table head={['Area', 'Covered by']} rows={SYLLABUS} />
      </Section>

      <Section id="feasibility" eyebrow="4. Feasibility analysis" title="Can we achieve this?">
        <div className="statement" style={{ fontStyle: 'normal' }}>
          <b>Short answer: yes.</b> The core system is achievable in one semester by a 3-member team using the planned stack. Every component relies on mature, well-documented, free libraries; none requires new research. The main risks (data, ML accuracy and scope) are known in advance and have clear mitigations.
        </div>
        <h3 style={{ marginTop: 32 }}>4.1 Technical feasibility</h3>
        <Table head={['Component', 'Difficulty', 'Why it is achievable']} rows={TECH_FEAS} />
        <h3 style={{ marginTop: 32 }}>4.2 Data feasibility</h3>
        <div className="grid g-3">
          <div className="feature"><h3>Emission factors</h3><p>kg CO2e per tonne-km for road, rail, sea and air are publicly available, e.g. the UK Government GHG Conversion Factors. They are stored in our own database, so the app does not depend on a paid carbon API.</p></div>
          <div className="feature"><h3>Shipment history</h3><p>A synthetic data generator (Python, pandas + NumPy) produces about 2 years of realistic shipments with deliberate patterns: monsoon delays (June to September), festival-season volume peaks, and a few chronically late vendors.</p></div>
          <div className="feature"><h3>Real users</h3><p>Businesses can import their own spreadsheets through CSV import, so the system is not limited to synthetic data.</p></div>
        </div>
        <h3 style={{ marginTop: 32 }}>4.3 Economic feasibility (zero cost)</h3>
        <Table head={['Service', 'Use', 'Cost']} rows={COSTS} />
        <h3 style={{ marginTop: 32 }}>4.4 Schedule feasibility (10 weeks)</h3>
        <div className="card">
          <div className="timeline">
            {SCHEDULE.map(([w, m, d]) => <div className="t" key={w}><b>Week {w}</b><span>{m}</span><span className="muted">{d}</span></div>)}
          </div>
        </div>
        <h3 style={{ marginTop: 32 }}>4.5 Team feasibility</h3>
        <Table head={['Member', 'Responsibility', 'Key skills']} rows={TEAM_RESP} />
        <h3 style={{ marginTop: 32 }}>4.6 Risks and mitigation</h3>
        <Table head={['Risk', 'Likelihood', 'Mitigation']} rows={RISKS} />
        <h3 style={{ marginTop: 32 }}>4.7 Scope commitment</h3>
        <Table head={['Priority', 'Features', 'Commitment']} rows={SCOPE} />
        <div className="grid g-2" style={{ marginTop: 32 }}>
          <div>
            <h3>4.8 Success criteria</h3>
            <ul className="stack" style={{ gap: 6, paddingLeft: 18 }}>{SUCCESS.map((s) => <li key={s}>{s}</li>)}</ul>
          </div>
          <div>
            <h3>4.9 Known limitations</h3>
            <ul className="stack" style={{ gap: 6, paddingLeft: 18 }}>{LIMITS.map((s) => <li key={s}>{s}</li>)}</ul>
          </div>
        </div>
      </Section>

      <Section id="conclusion" eyebrow="5. Conclusion" title="A real problem, the full web stack, and meaningful ML" alt>
        <p className="lead">
          EcoTrace addresses a real and growing problem: small businesses need to understand and reduce the carbon footprint of their shipments, but lack affordable tools. The platform brings together the full scope of Advanced Web Technologies (a React frontend, a Node/Express REST backend, a MongoDB database, third-party APIs and real-time communication) with meaningful machine learning and optimization in Python.
        </p>
        <div className="verdict mt"><b>Verdict: Achievable.</b> The Must-have features are a realistic one-semester target for a 3-member team; the Should-have and Could-have features add depth as time allows.</div>
      </Section>

      <Section id="team" eyebrow="Team" title="Project team">
        <Table head={['Member', 'Name', 'Registration No.']} rows={TEAM.map((t) => [t.member, t.name || '—', t.reg || '—'])} />
        <div className="row" style={{ marginTop: 28 }}>
          <Link to={go} className="btn primary lg">{user ? 'Open dashboard' : 'Try the live demo'}</Link>
        </div>
      </Section>

      <footer className="footer">
        EcoTrace · Carbon-smart shipping decisions for small businesses · Advanced Web Technologies<br />
        Emission factors: UK Government GHG Conversion Factors. Results are estimates, not certified carbon accounting. Map data © OpenStreetMap contributors.
      </footer>
    </div>
  );
}
