const API_ORIGIN = import.meta.env.VITE_API_ORIGIN ?? (import.meta.env.PROD ? "" : "http://localhost:5000");

export async function apiRequest(path, { method = "GET", body, csrfToken } = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (csrfToken) headers["X-CSRF-Token"] = csrfToken;

  const response = await fetch(`${API_ORIGIN}${path}`, {
    method,
    credentials: "include",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = response.status === 204 ? null : await response.json();
  if (!response.ok) {
    const error = new Error(data.error || `Request failed (HTTP ${response.status}).`);
    error.status = response.status;
    throw error;
  }
  return data;
}
