import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { api, setUnauthorizedHandler } from './api.js';
import NavBar from './components/NavBar.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import EquipmentDetail from './pages/EquipmentDetail.jsx';
import Report from './pages/Report.jsx';
import Admin from './pages/Admin.jsx';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

function Guard({ roles, children }) {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  if (roles && !roles.includes(user.role)) {
    return <main className="page"><div className="alert alert-error" role="alert">You do not have access to this page.</div></main>;
  }
  return children;
}

export default function App() {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [sessionNote, setSessionNote] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    api.me().then((r) => setUser(r.user)).catch(() => {}).finally(() => setReady(true));
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser((u) => { if (u) setSessionNote('Your session expired. Please sign in again.'); return null; });
    });
  }, []);

  const login = useCallback(async (username, password) => {
    const r = await api.login(username, password);
    setSessionNote('');
    setUser(r.user);
    return r.user;
  }, []);

  const logout = useCallback(async () => {
    try { await api.logout(); } catch { /* already logged out */ }
    setUser(null);
    navigate('/login');
  }, [navigate]);

  if (!ready) return <div className="page"><p>Loading…</p></div>;

  return (
    <AuthContext.Provider value={{ user, login, logout, sessionNote }}>
      <a className="skip-link" href="#main">Skip to content</a>
      {user && <NavBar />}
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
        <Route path="/" element={<Guard><Dashboard /></Guard>} />
        <Route path="/equipment/:id" element={<Guard><EquipmentDetail /></Guard>} />
        <Route path="/report" element={<Guard roles={['SUPERVISOR', 'ADMIN']}><Report /></Guard>} />
        <Route path="/admin" element={<Guard roles={['ADMIN']}><Admin /></Guard>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthContext.Provider>
  );
}
