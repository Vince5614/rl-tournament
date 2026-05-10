import { Routes, Route } from 'react-router-dom';
import Landing from './pages/Landing.jsx';
import TournamentPage from './pages/TournamentPage.jsx';
import ProfilePage from './pages/ProfilePage.jsx';
import AdminPage from './pages/AdminPage.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/t/:code" element={<TournamentPage />} />
      <Route path="/profile" element={<ProfilePage />} />
      <Route path="/admin" element={<AdminPage />} />
    </Routes>
  );
}
