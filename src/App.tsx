import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import { AdminLayout } from './components/admin/AdminLayout';
import { AddPicks } from './pages/AddPicks';
import { AddBrands } from './pages/AddBrands';
import { SyncGem } from './pages/SyncGem';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<Navigate to="/admin/picks" replace />} />
          <Route path="picks" element={<AddPicks />} />
          <Route path="brands" element={<AddBrands />} />
          <Route path="sync" element={<SyncGem />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
