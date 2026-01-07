import { Routes, Route } from 'react-router-dom';
import { Dashboard } from './pages/Dashboard';
import { Resume } from './pages/Resume';
import { NewApplication } from './pages/NewApplication';
import { Application } from './pages/Application';

function App() {
  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/resume" element={<Resume />} />
      <Route path="/new" element={<NewApplication />} />
      <Route path="/application/:id" element={<Application />} />
    </Routes>
  );
}

export default App;
