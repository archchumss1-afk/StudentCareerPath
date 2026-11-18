import { useState } from "react";
import { apiRequest } from "./api";

function LoginForm({ onLoggedIn, onBack }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin(event) {
    event.preventDefault();
    if (pending) return;
    setError("");
    setPending(true);
    try {
      const session = await apiRequest("/api/auth/session");
      const result = await apiRequest("/api/auth/login", {
        method: "POST",
        csrfToken: session.csrfToken,
        body: { email: email.trim(), password },
      });
      setPassword("");
      onLoggedIn(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="panel login-panel" aria-labelledby="login-heading">
      <h2 id="login-heading">Administrator login</h2>
      <p className="login-intro">Log in to manage the career directory.</p>
      <form onSubmit={handleLogin}>
        <div className="field">
          <label htmlFor="admin-email">Email</label>
          <input id="admin-email" type="email" autoComplete="username" maxLength={254}
            value={email} onChange={event => setEmail(event.target.value)} disabled={pending} required />
        </div>
        <div className="field">
          <label htmlFor="admin-password">Password</label>
          <input id="admin-password" type="password" autoComplete="current-password" maxLength={1024}
            value={password} onChange={event => setPassword(event.target.value)} disabled={pending} required />
        </div>
        <button type="submit" disabled={pending}>{pending ? "Logging in..." : "Log in"}</button>
      </form>
      {error && <p className="feedback error" role="alert">{error}</p>}
      <button type="button" className="back-button" onClick={onBack} disabled={pending}>Back to careers</button>
    </section>
  );
}

export default LoginForm;
