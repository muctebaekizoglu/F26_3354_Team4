import React, { useState } from 'react';
import { useAuth } from '../App.jsx';

export default function Login() {
  const { login, sessionNote } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [locked, setLocked] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError(''); setLocked(false);
    try {
      await login(username, password);
    } catch (err) {
      setError(err.message);
      setLocked(err.status === 423);
      setPassword('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-wrap" id="main">
      <div className="login-card">
        <h1 className="login-brand">LOTO Manager</h1>
        <p className="muted">Lockout/Tagout management system. Sign in to continue.</p>
        {sessionNote && <div className="alert alert-warn" role="status">{sessionNote}</div>}
        <form onSubmit={submit} noValidate>
          <label htmlFor="username">Username</label>
          <input id="username" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
          <label htmlFor="password">Password</label>
          <input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          {error && (
            <div className={`alert ${locked ? 'alert-warn' : 'alert-error'}`} role="alert">
              {locked ? <strong>Account locked. </strong> : null}{error}
            </div>
          )}
          <button className="btn btn-primary btn-block" type="submit" disabled={busy || !username || !password}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </main>
  );
}
