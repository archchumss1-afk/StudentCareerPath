
import { useCallback, useEffect, useRef, useState } from "react";
import "./App.css";
import CareerCard from "./CareerCard.jsx";
import LoginForm from "./LoginForm.jsx";
import { apiRequest } from "./api";

function App() {
  const [careers, setCareers] = useState([]);
  const [name, setName] = useState("");
  const [specializations, setSpecializations] =
    useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [auth, setAuth] = useState({ admin: null, csrfToken: "", expiresAt: null });
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState("");
  const [showLogin, setShowLogin] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const authRevision = useRef(0);
  const careerLoadRevision = useRef(0);

  const loadCareers = useCallback(async () => {
    const revision = ++careerLoadRevision.current;
    setLoading(true);
    setLoadError("");
    try {
      const loadedCareers = await apiRequest("/api/careers");
      if (revision === careerLoadRevision.current) setCareers(loadedCareers);
    } catch (err) {
      if (revision === careerLoadRevision.current) {
        setLoadError(err.message === "Failed to fetch"
          ? "Could not reach the server. Check that Express is running, then retry."
          : err.message);
      }
    } finally {
      if (revision === careerLoadRevision.current) setLoading(false);
    }
  }, []);

  const handleSessionExpired = useCallback(() => {
    authRevision.current++;
    setAuth({ admin: null, csrfToken: "", expiresAt: null });
    setAuthError("Your session has ended. Log in again to manage careers.");
    setShowLogin(false);
  }, []);

  useEffect(() => {
    let active = true;
    async function checkSession() {
      const revision = ++authRevision.current;
      try {
        const session = await apiRequest("/api/auth/session");
        if (active && revision === authRevision.current) {
          setAuth(session);
          setAuthError("");
        }
      } catch {
        if (active && revision === authRevision.current) {
          setAuthError("Could not check your login. You can still browse careers. Try logging in again.");
        }
      } finally {
        if (active && revision === authRevision.current) setAuthLoading(false);
      }
    }
    checkSession();
    window.addEventListener("focus", checkSession);
    return () => {
      active = false;
      window.removeEventListener("focus", checkSession);
    };
  }, []);

  useEffect(() => {
    if (!auth.admin || !auth.expiresAt) return;
    const timeout = setTimeout(handleSessionExpired, Math.max(0, auth.expiresAt - Date.now()));
    return () => clearTimeout(timeout);
  }, [auth, handleSessionExpired]);

  function handleLoggedIn(session) {
    authRevision.current++;
    setAuth(session);
    setAuthLoading(false);
    setAuthError("");
    setShowLogin(false);
    setError("");
    setSuccess("");
    loadCareers();
  }

  async function handleLogout() {
    if (loggingOut) return;
    authRevision.current++;
    setLoggingOut(true);
    setAuthError("");
    try {
      // Refresh the token in case another tab renewed or ended this session.
      const currentSession = await apiRequest("/api/auth/session");
      if (currentSession.admin) {
        await apiRequest("/api/auth/logout", { method: "POST", csrfToken: currentSession.csrfToken });
      }
      authRevision.current++;
      setAuth({ admin: null, csrfToken: "", expiresAt: null });
      setShowLogin(false);
      setName("");
      setSpecializations("");
      setError("");
      setSuccess("");
    } catch (err) {
      setAuthError(err.message);
    } finally {
      setLoggingOut(false);
    }
  }

  useEffect(() => {
    loadCareers();
    return () => { careerLoadRevision.current++; };
  }, [loadCareers]);

  async function handleSubmit(event) {
    event.preventDefault();
    if (saving || loggingOut || loading || !auth.admin) return;
    setError("");
    setSuccess("");

    const careerName = name.trim();
    const skills = specializations
      .split(",")
      .map(item => item.trim())
      .filter(Boolean);

    if (!careerName || skills.length === 0) {
      setError("Enter a name and specialization.");
      return;
    }

    setSaving(true);

    try {
      const createdCareer = await apiRequest("/api/careers", {
        method: "POST",
        csrfToken: auth.csrfToken,
        body: {
          name: careerName,
          specializations: skills
        }
      });

      setCareers(previous => [
        ...previous,
        createdCareer
      ]);

      setName("");
      setSpecializations("");
      setSuccess(`${createdCareer.name} was added.`);
    } catch (err) {
      if (err.status === 401) handleSessionExpired();
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <header className="hero">
        <div className="shell">
          <nav className="admin-nav" aria-label="Administrator access">
            {auth.admin ? (
              <>
                <span className="admin-email">{auth.admin.email}</span>
                <button type="button" onClick={handleLogout} disabled={loggingOut}>
                  {loggingOut ? "Logging out..." : "Log out"}
                </button>
              </>
            ) : (
              <button type="button" onClick={() => setShowLogin(true)} disabled={authLoading}>
                {authLoading ? "Checking login..." : "Administrator login"}
              </button>
            )}
          </nav>
          <h1>EduPath Sri Lanka</h1>
          <p>Engineering Career Directory</p>
        </div>
      </header>

      {authError && <p className="shell feedback error auth-notice" role="alert">{authError}</p>}
      {showLogin && !auth.admin ? (
        <main className="shell login-workspace">
          <LoginForm onLoggedIn={handleLoggedIn} onBack={() => setShowLogin(false)} />
        </main>
      ) : (
        <main className={`shell workspace ${auth.admin ? "" : "public-workspace"}`}>
          {auth.admin && (
            <section className="panel" aria-labelledby="add-career-heading">
              <h2 id="add-career-heading">Add a Career</h2>
              <form onSubmit={handleSubmit}>
                <div className="field">
                  <label htmlFor="career-name">Career name</label>
                  <input
                    id="career-name"
                    value={name}
                    onChange={event => setName(event.target.value)}
                    placeholder="e.g. Mechanical Engineering"
                    disabled={saving || loggingOut || loading}
                    required
                  />
                </div>

                <div className="field">
                  <label htmlFor="career-specializations">Specializations</label>
                  <input
                    id="career-specializations"
                    value={specializations}
                    onChange={event => setSpecializations(event.target.value)}
                    placeholder="e.g. Thermodynamics, Robotics"
                    aria-describedby="specializations-hint"
                    disabled={saving || loggingOut || loading}
                    required
                  />
                  <small id="specializations-hint">Separate each specialization with a comma.</small>
                </div>

                <button type="submit" disabled={saving || loggingOut || loading}>
                  {saving ? "Saving..." : "Add Career"}
                </button>
              </form>

              <div className="feedback success" role="status">{success}</div>
              {error && <p className="feedback error" role="alert">{error}</p>}
            </section>
          )}

          <section aria-labelledby="careers-heading">
            <h2 id="careers-heading">Available Careers</h2>
            {loadError && (
              <div className="feedback error" role="alert">
                <p>{loadError}</p>
                <button type="button" className="retry-button" onClick={loadCareers} disabled={loading}>
                  Retry loading careers
                </button>
              </div>
            )}
            {loading ? (
              <p className="list-message" role="status">Loading careers...</p>
            ) : (
              <div className="career-grid">
                {careers.map(career => (
                  <CareerCard
                    key={`${career.id}-${auth.admin?.id || "public"}`}
                    career={career}
                    canManage={Boolean(auth.admin)}
                    csrfToken={auth.csrfToken}
                    onUnauthorized={handleSessionExpired}
                    authBusy={loggingOut}
                    onUpdated={updatedCareer => setCareers(previous =>
                      previous.map(item => item.id === updatedCareer.id ? updatedCareer : item)
                    )}
                    onDeleted={id => setCareers(previous =>
                      previous.filter(item => item.id !== id)
                    )}
                  />
                ))}
              </div>
            )}
          </section>
        </main>
      )}
    </>
  );
}

export default App;
