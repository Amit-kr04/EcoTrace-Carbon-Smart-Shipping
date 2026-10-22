import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import Layout from './components/Layout.jsx';
import { Loading } from './components/ui.jsx';
import Landing from './pages/Landing.jsx';
import { Login, Register } from './pages/Auth.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Shipments from './pages/Shipments.jsx';
import Vendors from './pages/Vendors.jsx';
import Locations from './pages/Locations.jsx';
import Compare from './pages/Compare.jsx';
import Optimizer from './pages/Optimizer.jsx';
import WhatIf from './pages/WhatIf.jsx';
import SupplyChain from './pages/SupplyChain.jsx';
import Insights from './pages/Insights.jsx';
import Reports from './pages/Reports.jsx';
import Settings from './pages/Settings.jsx';

function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  return user ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
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
  );
}
