import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import Layout from './components/Layout.jsx';
import { Loading } from './components/ui.jsx';
import Landing from './pages/Landing.jsx';
import { Login, Register } from './pages/Auth.jsx';

// App pages load on first visit, so the landing page doesn't download the charts and maps.
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'));
const Shipments = lazy(() => import('./pages/Shipments.jsx'));
const Vendors = lazy(() => import('./pages/Vendors.jsx'));
const Locations = lazy(() => import('./pages/Locations.jsx'));
const Compare = lazy(() => import('./pages/Compare.jsx'));
const Optimizer = lazy(() => import('./pages/Optimizer.jsx'));
const WhatIf = lazy(() => import('./pages/WhatIf.jsx'));
const SupplyChain = lazy(() => import('./pages/SupplyChain.jsx'));
const Insights = lazy(() => import('./pages/Insights.jsx'));
const Reports = lazy(() => import('./pages/Reports.jsx'));
const Settings = lazy(() => import('./pages/Settings.jsx'));

function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  return user ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/app" element={<Protected><Layout /></Protected>}>
          <Route index element={<Dashboard />} />
          <Route path="shipments" element={<Shipments />} />
          <Route path="vendors" element={<Vendors />} />
          <Route path="locations" element={<Locations />} />
          <Route path="compare" element={<Compare />} />
          <Route path="optimizer" element={<Optimizer />} />
          <Route path="what-if" element={<WhatIf />} />
          <Route path="supply-chain" element={<SupplyChain />} />
          <Route path="insights" element={<Insights />} />
          <Route path="reports" element={<Reports />} />
          <Route path="settings" element={<Settings />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
