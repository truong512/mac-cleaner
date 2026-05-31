import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { JunkScan } from './pages/JunkScan';
import { Applications } from './pages/Applications';
import { Duplicates } from './pages/Duplicates';
import { DiskMap } from './pages/DiskMap';
import { BigFiles } from './pages/BigFiles';
import { SettingsPage } from './pages/Settings';
import './style.css';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/junk" element={<JunkScan />} />
          <Route path="/apps" element={<Applications />} />
          <Route path="/duplicates" element={<Duplicates />} />
          <Route path="/bigfiles" element={<BigFiles />} />
          <Route path="/disk" element={<DiskMap />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
