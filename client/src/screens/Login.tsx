import { useState, type FormEvent } from 'react';
import { api } from '../api';
import { useGame } from '../game';

export function Login() {
  const { refresh, setLoggedIn } = useGame();
  const [mode, setMode] = useState<'login' | 'register' | 'reset'>('register');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.post(`/api/auth/${mode}`, mode === 'reset' ? { username, code, password } : { username, password });
      setLoggedIn(true);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login">
      <div className="login-soil" aria-hidden="true">
        <svg viewBox="0 0 400 260" preserveAspectRatio="xMidYMid slice">
          <path className="tunnel" d="M200 0 C200 40 180 60 150 80 S90 120 100 160 S170 210 230 200 S330 170 320 230" />
          <path className="tunnel" d="M150 80 C200 90 250 95 290 120" />
          <ellipse className="chamber" cx="100" cy="160" rx="34" ry="18" />
          <ellipse className="chamber" cx="290" cy="122" rx="28" ry="15" />
          <ellipse className="chamber queen" cx="230" cy="200" rx="40" ry="20" />
        </svg>
      </div>
      <div className="login-card">
        <h1 className="wordmark">Hormigas</h1>
        <p className="lede">Grow an ant kingdom from a single queen. Your colony keeps working while you're away.</p>
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={mode === 'register'} className={mode === 'register' ? 'on' : ''} onClick={() => setMode('register')}>
            Found a colony
          </button>
          <button role="tab" aria-selected={mode !== 'register'} className={mode !== 'register' ? 'on' : ''} onClick={() => setMode('login')}>
            Return to your colony
          </button>
        </div>
        <form onSubmit={submit}>
          {mode === 'reset' && (
            <p className="hint">Forgot your password? Ask the game’s keeper for a reset code, then pick a new password here.</p>
          )}
          <label>
            Name
            <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required minLength={3} maxLength={20} pattern="[A-Za-z0-9_]+" />
          </label>
          {mode === 'reset' && (
            <label>
              Reset code
              <input value={code} onChange={(e) => setCode(e.target.value)} autoComplete="one-time-code" placeholder="ABCD-2345" required minLength={8} maxLength={12} spellCheck={false} autoCapitalize="characters" />
            </label>
          )}
          <label>
            {mode === 'reset' ? 'New password' : 'Password'}
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={8} />
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="btn primary wide" disabled={busy}>
            {mode === 'register' ? 'Found my colony' : mode === 'reset' ? 'Set password and log in' : 'Log in'}
          </button>
          {mode !== 'login' && <p className="hint">Names use letters, numbers and underscores. Passwords need 8+ characters.</p>}
          {mode === 'login' && (
            <button type="button" className="btn ghost small wide" onClick={() => { setMode('reset'); setError(''); }}>
              Forgot your password?
            </button>
          )}
          {mode === 'reset' && (
            <button type="button" className="btn ghost small wide" onClick={() => { setMode('login'); setError(''); }}>
              Back to log in
            </button>
          )}
        </form>
      </div>
    </main>
  );
}
