import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import { BrandsPage } from './pages/BrandsPage';
import { AdminLayout } from './components/admin/AdminLayout';
import { AddPicks } from './pages/AddPicks';
import { FinalizePicks } from './pages/FinalizePicks';
import { ManualPickEntry } from './pages/ManualPickEntry';
import { AddBrands } from './pages/AddBrands';
import { SyncGem } from './pages/SyncGem';
import { GenerateAssets } from './pages/GenerateAssets';
import { Freshness } from './pages/Freshness';
import { SalesApprovals } from './pages/SalesApprovals';
import { Toaster } from './components/ui/sonner';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/brands" element={<BrandsPage />} />
        
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<Navigate to="/admin/picks" replace />} />
          <Route path="picks" element={<AddPicks />} />
          <Route path="picks/finalize" element={<FinalizePicks />} />
          <Route path="picks/manual" element={<ManualPickEntry />} />
          <Route path="sales-approvals" element={<SalesApprovals />} />
          <Route path="brands" element={<AddBrands />} />
          <Route path="assets" element={<GenerateAssets />} />
          <Route path="freshness" element={<Freshness />} />
          <Route path="sync" element={<SyncGem />} />
        </Route>
      </Routes>
      <Toaster />
    </BrowserRouter>
  );
}
