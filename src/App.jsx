import { BrowserRouter, Routes, Route } from 'react-router-dom';
import UserPage from './pages/UserPage';
import PublicTrackPage from './pages/PublicTrackPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Halaman Utama untuk Pengguna (Izin GPS & Timer) */}
        <Route path="/" element={<UserPage />} />

        {/* Halaman Publik untuk Keluarga/Teman Memantau */}
        <Route path="/track/:sessionId" element={<PublicTrackPage />} />
      </Routes>
    </BrowserRouter>
  );
}