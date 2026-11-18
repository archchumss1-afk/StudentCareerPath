import { useState } from "react";
import { apiRequest } from "./api";

function CareerCard({ career, canManage, csrfToken, onUnauthorized, authBusy, onUpdated, onDeleted }) {
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [name, setName] = useState(career.name);
  const [specializations, setSpecializations] = useState(career.specializations.join(", "));
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const busy = pending !== "" || authBusy;

  function startEditing() {
    setName(career.name);
    setSpecializations(career.specializations.join(", "));
    setError("");
    setSuccess("");
    setEditing(true);
  }

  function cancelEditing() {
    setEditing(false);
    setError("");
  }

  async function saveChanges(event) {
    event.preventDefault();
    if (busy || !canManage) return;
    setError("");
    setSuccess("");

    const careerName = name.trim();
    const skills = specializations.split(",").map(item => item.trim()).filter(Boolean);

    if (!careerName || skills.length === 0) {
      setError("Enter a name and specialization.");
      return;
    }

    setPending("saving");
    try {
      const updatedCareer = await apiRequest(`/api/careers/${career.id}`, {
        method: "PUT",
        csrfToken,
        body: { name: careerName, specializations: skills }
      });
      onUpdated(updatedCareer);
      setEditing(false);
      setSuccess("Changes saved.");
    } catch (err) {
      if (err.status === 401) onUnauthorized();
      setError(err.message);
    } finally {
      setPending("");
    }
  }

  async function deleteCareer() {
    if (busy || !canManage) return;
    setError("");
    setSuccess("");
    setPending("deleting");

    try {
      await apiRequest(`/api/careers/${career.id}`, { method: "DELETE", csrfToken });
      // A successful DELETE returns 204 with an empty body.
      onDeleted(career.id);
    } catch (err) {
      if (err.status === 401) onUnauthorized();
      setError(err.message);
    } finally {
      setPending("");
    }
  }

  return (
    <article className="career-card" aria-busy={busy}>
      <h3>{career.name}</h3>
      {canManage && editing ? (
        <form className="edit-career-form" onSubmit={saveChanges} aria-label={`Edit ${career.name}`}>
          <div className="field">
            <label htmlFor={`edit-name-${career.id}`}>Career name</label>
            <input
              id={`edit-name-${career.id}`}
              value={name}
              onChange={event => setName(event.target.value)}
              disabled={busy}
              required
            />
          </div>
          <div className="field">
            <label htmlFor={`edit-specializations-${career.id}`}>Specializations</label>
            <input
              id={`edit-specializations-${career.id}`}
              value={specializations}
              onChange={event => setSpecializations(event.target.value)}
              aria-describedby={`edit-hint-${career.id}`}
              disabled={busy}
              required
            />
            <small id={`edit-hint-${career.id}`}>Separate each specialization with a comma.</small>
          </div>
          <div className="card-actions">
            <button type="submit" disabled={busy}>{busy ? "Saving..." : "Save"}</button>
            <button type="button" className="secondary-button" onClick={cancelEditing} disabled={busy}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <>
          <ul className="specializations">
            {career.specializations.map((specialization, index) => (
              <li key={index}>{specialization}</li>
            ))}
          </ul>
          {canManage && (confirmingDelete ? (
            <div className="delete-confirmation">
              <p id={`delete-warning-${career.id}`}>Delete {career.name}? This will remove it permanently.</p>
              <div className="card-actions">
                <button type="button" className="delete-button" onClick={deleteCareer} disabled={busy}
                  aria-describedby={`delete-warning-${career.id}`}>
                  {pending === "deleting" ? "Deleting..." : "Confirm delete"}
                </button>
                <button type="button" className="secondary-button" onClick={() => {
                  setConfirmingDelete(false);
                  setError("");
                }} disabled={busy}>Cancel</button>
              </div>
            </div>
          ) : (
            <div className="card-actions">
              <button type="button" className="secondary-button" onClick={startEditing} disabled={busy}
                aria-label={`Edit ${career.name}`}>
                Edit
              </button>
              <button type="button" className="delete-button" onClick={() => {
                setError("");
                setSuccess("");
                setConfirmingDelete(true);
              }} disabled={busy} aria-label={`Delete ${career.name}`}>
                Delete
              </button>
            </div>
          ))}
        </>
      )}
      <div className="feedback success" role="status">{success}</div>
      {error && <p className="feedback error" role="alert">{error}</p>}
    </article>
  );
}

export default CareerCard;
