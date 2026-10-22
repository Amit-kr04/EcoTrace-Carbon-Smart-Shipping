# EcoTrace: carbon-smart shipping decisions for small businesses

Full-stack implementation of the EcoTrace proposal (Advanced Web Technologies).

| Folder | What it is | Stack |
|---|---|---|
| `client/` | Landing page (the full problem statement, solution and feasibility) and the web app | React + Vite, React Router, Context API, Axios, Recharts, React-Leaflet, React Flow, Socket.io client |
| `server/` | REST API, auth, CO2 calculation, CSV import, alerts, PDF reports, cron jobs, real-time updates | Node.js, Express, Mongoose, JWT, bcrypt(js), Multer, csv-parser, Nodemailer, node-cron, pdfkit, Socket.io |
| `ml/` | ML microservice and synthetic-data generator | Python, FastAPI, pandas, scikit-learn, XGBoost, statsmodels SARIMA (Prophet if installed), SHAP, PuLP |

## Run it locally

Prerequisites: Node.js 18+ and Python 3.9+. MongoDB is optional: if `MONGO_URI` is empty, the API starts a local MongoDB automatically (data is kept in `server/.data`).

```bash
# 1. API (port 5050). Seeds a demo company with ~2 years / ~4,900 shipments on first run.
cd server && cp .env.example .env && npm install && npm start

# 2. ML service (port 8000), in a second terminal
cd ml && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
cp .env.example .env && .venv/bin/uvicorn app.main:app --port 8000

# 3. Frontend (port 5173), in a third terminal
cd client && npm install && npm run dev
```

Open http://localhost:5173 and use **Try the live demo**:

| Role | Email | Password |
|---|---|---|
| Owner | owner@ecotrace.demo | demo1234 |
| Logistics manager | manager@ecotrace.demo | demo1234 |
| Admin | admin@ecotrace.demo | demo1234 |

On Windows use `.venv\Scripts\pip` and `.venv\Scripts\uvicorn`. If the ML service is not running, the app still works with fallbacks (seasonal-naive forecast, rule-based risk); the optimizer, anomaly scan and clustering need it.

### Useful commands

```bash
cd server && npm run seed                                   # reset the demo company
cd ml && .venv/bin/python -m scripts.evaluate               # print the success-criteria metrics
cd ml && .venv/bin/python scripts/generate_synthetic.py     # synthetic shipments CSV for the Import CSV page
```

## Optional configuration (`server/.env`)

- `MONGO_URI`: MongoDB Atlas connection string (set the same value in `ml/.env`).
- `ORS_API_KEY`: free OpenRouteService key for real truck-route distances and geocoding. Without it, distance is straight-line × 1.25 and cities come from a built-in table of Indian cities. Distances are cached in MongoDB.
- `SMTP_*`: send budget alerts and monthly reports by email. Without it, emails are logged to the console.

## Success criteria (from `scripts.evaluate` on the demo data)

| Criterion | Result |
|---|---|
| CO2 matches manual calculation | `distance × tonnes × factor`; the formula is shown in the "Log shipment" preview |
| Dashboard loads 2 years (~5,000 shipments) < 2 s | ~80 ms for the summary aggregation |
| Forecast beats naive "same as last month" | MAE 11.8k vs 18.6k kg (MAPE 8.0% vs 12.2%) |
| Delay model beats baseline on F1 and ROC-AUC | Random Forest F1 0.564 / AUC 0.761 vs rule baseline 0.535 / 0.680 |
| Optimizer meets demand, within budget, cheaper than current mix | ~18% cheaper and ~60% less CO2 than last month's actual mix |
| Anomaly detection | finds all 14 deliberately corrupted records, no false positives |

## Deployment

- Frontend: `cd client && npm run build`, then deploy `client/dist` to Vercel or Netlify with `VITE_API_URL=https://<api-host>/api`. Alternatively the API serves `client/dist` itself when it exists.
- API and ML service: Render or Railway. Set `MONGO_URI`, `JWT_SECRET`, `ML_URL`, `ML_API_KEY` and `CLIENT_URL` (the frontend origin, for CORS).

## Notes

- Emission factors (kg CO2e per tonne-km) approximate the UK Government GHG Conversion Factors and are stored in the database, where they can be edited under Settings → Emission factors. Results are estimates, not certified carbon accounting.
- Password hashing uses `bcryptjs`, the pure-JavaScript build of bcrypt (same algorithm, no native compile step).
- Team: Mohammed Afaan Sherief (24MID0178), Amit Kumar (24MID0155), Bhumi Kumari (24MID0216). Edit `TEAM` at the top of `client/src/pages/Landing.jsx` to change names.
