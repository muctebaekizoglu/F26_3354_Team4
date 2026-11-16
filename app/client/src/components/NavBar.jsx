import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../App.jsx';

export default function NavBar() {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const canReport = user.role === 'SUPERVISOR' || user.role === 'ADMIN';
  return (
    <header className="navbar">
      <div className="navbar-inner">
        <span className="brand">LOTO Manager</span>
        <nav aria-label="Main" className="nav-links">
          <NavLink to="/" className={({ isActive }) => (isActive || pathname.startsWith('/equipment') ? 'active' : '')} end>Dashboard</NavLink>
          {canReport && <NavLink to="/report">Compliance Report</NavLink>}
          {user.role === 'ADMIN' && <NavLink to="/admin">Admin</NavLink>}
        </nav>
        <div className="nav-user">
          <span><strong>{user.fullName}</strong> <span className="role-chip">{user.role}</span></span>
          <button className="btn btn-light" onClick={logout}>Log out</button>
        </div>
      </div>
    </header>
  );
}
