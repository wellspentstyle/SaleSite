import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { HomePage } from './pages/HomePage';
import { BrandsPage } from './pages/BrandsPage';
import { AdminLayout } from './components/admin/AdminLayout';
import { AddPicks } from './pages/AddPicks';
import { FinalizePicks } from './pages/FinalizePicks';
import { ManualPickEntry } from './pages/ManualPickEntry';
import { AddBrands } from './pages/AddBrands';
import { SyncGem } from './pages/SyncGem';
import { GenerateAssets } from './pages/GenerateAssets';
import { ConfigureAssets } from './pages/ConfigureAssets';
import { AssetResults } from './pages/AssetResults';
import { Freshness } from './pages/Freshness';
import { SalesApprovals } from './pages/SalesApprovals';
import { ManualSaleEntry } from './pages/ManualSaleEntry';
import { ManageSales } from './pages/ManageSales';
import { ManageBrands } from './pages/ManageBrands';
import { Toaster } from './components/ui/sonner';

function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}

export default function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/brands" element={<BrandsPage />} />
        
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<Navigate to="/admin/picks" replace />} />
          <Route path="picks" element={<AddPicks />} />
          <Route path="picks/finalize" element={<FinalizePicks />} />
          <Route path="picks/manual" element={<ManualPickEntry />} />
          <Route path="sales-approvals" element={<SalesApprovals />} />
          <Route path="sales-approvals/manual" element={<ManualSaleEntry />} />
          <Route path="manage-sales" element={<ManageSales />} />
          <Route path="manage-brands" element={<ManageBrands />} />
          <Route path="brands" element={<AddBrands />} />
          <Route path="assets" element={<GenerateAssets />} />
          <Route path="assets/configure/:saleId" element={<ConfigureAssets />} />
          <Route path="assets/results" element={<AssetResults />} />
          <Route path="freshness" element={<Freshness />} />
          <Route path="sync" element={<SyncGem />} />
        </Route>
      </Routes>
      <Toaster />
    </BrowserRouter>
  );
}
