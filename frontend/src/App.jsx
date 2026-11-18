
import { useEffect, useState } from "react";
import "./App.css";

const API = "http://localhost:5000/api/careers";

function App() {
  const [careers, setCareers] = useState([]);
  const [name, setName] = useState("");
  const [specializations, setSpecializations] =
    useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    async function loadCareers() {
      try {
        const response = await fetch(API);
        if (!response.ok) {
          throw new Error(`GET failed: ${response.status}`);
        }

        setCareers(await response.json());
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    loadCareers();
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
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
      const response = await fetch(API, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          name: careerName,
          specializations: skills
        })
      });

      if (!response.ok) {
        throw new Error(`POST failed: ${response.status}`);
      }

      const createdCareer = await response.json();

      setCareers(previous => [
        ...previous,
        createdCareer
      ]);

      setName("");
      setSpecializations("");
      setSuccess(`${createdCareer.name} was added.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <header className="hero">
        <div className="shell">
          <h1>EduPath Sri Lanka</h1>
          <p>Engineering Career Directory</p>
        </div>
      </header>

      <main className="shell workspace">
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
                required
              />
              <small id="specializations-hint">Separate each specialization with a comma.</small>
            </div>

            <button type="submit" disabled={saving}>
              {saving ? "Saving..." : "Add Career"}
            </button>
          </form>

          <div className="feedback success" role="status">{success}</div>
          {error && <p className="feedback error" role="alert">{error}</p>}
        </section>

        <section aria-labelledby="careers-heading">
          <h2 id="careers-heading">Available Careers</h2>
          {loading ? (
            <p className="list-message" role="status">Loading careers...</p>
          ) : (
            <div className="career-grid">
              {careers.map(career => (
                <article className="career-card" key={career.id}>
                  <h3>{career.name}</h3>
                  <ul className="specializations">
                    {career.specializations.map((specialization, index) => (
                      <li key={index}>{specialization}</li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>
    </>
  );
}

export default App;
