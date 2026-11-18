const { test } = require("node:test");
const assert = require("node:assert/strict");
const { randomBytes } = require("node:crypto");
const session = require("express-session");
const { createApp } = require("./server");
const { hashPassword, verifyPassword } = require("./passwords");

// Keep authentication tests isolated from the user's database and credentials.
function createTestPool(admin) {
  const careers = new Map();
  let nextId = 1;
  let adminAvailable = true;
  return {
    careers,
    revokeAdmin() { adminAvailable = false; },
    async query(sql, values = []) {
      if (sql.includes("FROM administrators")) {
        const matches = sql.includes("WHERE email") ? values[0] === admin.email : values[0] === admin.id;
        const selected = sql.includes("password_hash") ? admin : { id: admin.id, email: admin.email };
        return { rows: adminAvailable && matches ? [selected] : [] };
      }
      if (sql.startsWith("INSERT INTO careers")) {
        const career = { id: nextId++, name: values[0], specializations: values[1] };
        careers.set(career.id, career);
        return { rows: [career] };
      }
      if (sql.startsWith("UPDATE careers")) {
        if (!careers.has(values[2])) return { rows: [] };
        const career = { id: values[2], name: values[0], specializations: values[1] };
        careers.set(career.id, career);
        return { rows: [career] };
      }
      if (sql.startsWith("DELETE FROM careers")) {
        const existed = careers.delete(values[0]);
        return { rows: existed ? [{ id: values[0] }] : [] };
      }
      if (sql.includes("FROM careers WHERE id")) return { rows: careers.has(values[0]) ? [careers.get(values[0])] : [] };
      if (sql.includes("FROM careers ORDER BY")) return { rows: [...careers.values()] };
      throw new Error("Unexpected database query in authentication test");
    },
  };
}

test("administrator authentication and career authorization over HTTP", async t => {
  const password = randomBytes(24).toString("base64url");
  const admin = { id: 1, email: "owner@example.test", password_hash: await hashPassword(password) };
  assert.notEqual(admin.password_hash, password);
  assert.equal(await verifyPassword(password, admin.password_hash), true);
  assert.equal(await verifyPassword(randomBytes(24).toString("hex"), admin.password_hash), false);
  const pool = createTestPool(admin);
  const store = new session.MemoryStore();
  const config = {
    production: false,
    sessionSecret: randomBytes(48).toString("hex"),
    frontendOrigin: "http://localhost:5173",
    sessionMaxAge: 8 * 60 * 60 * 1000,
  };
  const app = createApp({ pool, config, sessionStore: store });
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = "";
  let csrfToken = "";

  async function request(method, path, options = {}) {
    const headers = { Origin: options.origin || config.frontendOrigin };
    if (options.auth !== false && cookie) headers.Cookie = cookie;
    if (options.csrf !== false && csrfToken) headers["X-CSRF-Token"] = options.token || csrfToken;
    if (options.body) headers["Content-Type"] = "application/json";
    const response = await fetch(base + path, { method, headers, body: options.body ? JSON.stringify(options.body) : undefined });
    const setCookie = response.headers.getSetCookie()[0];
    if (setCookie && options.auth !== false) cookie = setCookie.split(";")[0];
    const body = response.status === 204 ? null : await response.json();
    return { status: response.status, body, headers: response.headers, setCookie };
  }

  const careerBody = { name: "Test Engineering", specializations: ["Testing"] };
  let careerId;

  await t.test("public viewing and direct unauthenticated write rejection", async () => {
    assert.equal((await request("GET", "/api/careers", { auth: false })).status, 200);
    assert.equal((await request("GET", "/api/careers/1", { auth: false })).status, 404);
    for (const [method, path] of [["POST", "/api/careers"], ["PUT", "/api/careers/1"], ["DELETE", "/api/careers/1"]]) {
      assert.equal((await request(method, path, { body: careerBody, auth: false, csrf: false })).status, 401);
    }
    assert.equal(pool.careers.size, 0);
  });

  await t.test("invalid login, session rotation, and cookie attributes", async () => {
    const initial = await request("GET", "/api/auth/session");
    assert.equal(initial.body.admin, null);
    assert.equal(initial.headers.get("cache-control"), "no-store");
    csrfToken = initial.body.csrfToken;
    const preLoginCookie = cookie;
    const credentials = { email: admin.email, password };
    assert.equal((await request("POST", "/api/auth/login", { body: credentials, csrf: false })).status, 403);
    assert.equal((await request("POST", "/api/auth/login", { body: { ...credentials, password: "incorrect" } })).status, 401);
    assert.equal((await request("POST", "/api/auth/login", { body: { ...credentials, email: "unknown@example.test" } })).status, 401);
    const login = await request("POST", "/api/auth/login", { body: credentials });
    assert.equal(login.status, 200);
    assert.deepEqual(login.body.admin, { id: admin.id, email: admin.email });
    assert.ok(login.body.expiresAt > Date.now());
    assert.notEqual(cookie, preLoginCookie);
    assert.notEqual(login.body.csrfToken, csrfToken);
    csrfToken = login.body.csrfToken;
    assert.match(login.setCookie, /HttpOnly/i);
    assert.match(login.setCookie, /SameSite=Lax/i);
    assert.doesNotMatch(login.setCookie, /; Secure/i);
    assert.equal(login.body.admin.password_hash, undefined);
    const sessionResult = await request("GET", "/api/auth/session");
    assert.deepEqual(sessionResult.body.admin, { id: admin.id, email: admin.email });
  });

  await t.test("authenticated writes require a trusted Origin and CSRF token", async () => {
    assert.equal((await request("POST", "/api/careers", { body: careerBody, csrf: false })).status, 403);
    assert.equal((await request("POST", "/api/careers", { body: careerBody, token: "é".repeat(64) })).status, 403);
    assert.equal((await request("POST", "/api/careers", { body: careerBody, token: "0".repeat(64) })).status, 403);
    assert.equal((await request("POST", "/api/careers", { body: careerBody, origin: "https://untrusted.example" })).status, 403);
    assert.equal(pool.careers.size, 0);
  });

  await t.test("authenticated add, read, update, and delete of a temporary career", async () => {
    const created = await request("POST", "/api/careers", { body: careerBody });
    assert.equal(created.status, 201);
    careerId = created.body.id;
    assert.equal((await request("GET", `/api/careers/${careerId}`, { auth: false })).body.name, careerBody.name);
    const changed = await request("PUT", `/api/careers/${careerId}`, { body: { name: "Updated Test Engineering", specializations: ["Automation"] } });
    assert.equal(changed.status, 200);
    assert.equal(changed.body.name, "Updated Test Engineering");
    assert.equal((await request("DELETE", `/api/careers/${careerId}`)).status, 204);
    assert.equal((await request("GET", `/api/careers/${careerId}`, { auth: false })).status, 404);
    assert.equal(pool.careers.size, 0);
  });

  await t.test("logout revokes the session and replaying its cookie fails", async () => {
    const oldCookie = cookie;
    assert.equal((await request("POST", "/api/auth/logout", { csrf: false })).status, 403);
    const logout = await request("POST", "/api/auth/logout");
    assert.equal(logout.status, 204);
    assert.match(logout.setCookie, /Expires=Thu, 01 Jan 1970/i);
    cookie = oldCookie;
    assert.equal((await request("POST", "/api/careers", { body: careerBody })).status, 401);
  });

  async function loginAgain() {
    const initial = await request("GET", "/api/auth/session");
    csrfToken = initial.body.csrfToken;
    const login = await request("POST", "/api/auth/login", { body: { email: admin.email, password } });
    assert.equal(login.status, 200);
    csrfToken = login.body.csrfToken;
  }

  await t.test("expired sessions cannot mutate careers", async () => {
    await loginAgain();
    for (const [sid, value] of Object.entries(store.sessions)) {
      const stored = JSON.parse(value);
      if (stored.adminId) {
        stored.loggedInAt = Date.now() - config.sessionMaxAge - 1000;
        store.sessions[sid] = JSON.stringify(stored);
      }
    }
    assert.equal((await request("POST", "/api/careers", { body: careerBody })).status, 401);
    assert.equal((await request("GET", "/api/auth/session")).body.admin, null);
    assert.equal((await request("GET", "/api/careers", { auth: false })).status, 200);
  });

  await t.test("removing an administrator revokes existing access", async () => {
    await loginAgain();
    pool.revokeAdmin();
    assert.equal((await request("DELETE", "/api/careers/1")).status, 401);
    assert.equal(pool.careers.size, 0);
  });

  await t.test("production cookies require HTTPS and use the Host prefix", async () => {
    const productionApp = createApp({ pool, config: { ...config, production: true, trustProxy: "loopback", frontendOrigin: "https://edupath.example" }, sessionStore: new session.MemoryStore() });
    const productionServer = productionApp.listen(0, "127.0.0.1");
    await new Promise(resolve => productionServer.once("listening", resolve));
    try {
      const url = `http://127.0.0.1:${productionServer.address().port}/api/auth/session`;
      const insecure = await fetch(url);
      assert.equal(insecure.headers.getSetCookie().length, 0);
      await insecure.json();
      const secure = await fetch(url, { headers: { "X-Forwarded-Proto": "https" } });
      await secure.json();
      const productionCookie = secure.headers.getSetCookie()[0];
      assert.match(productionCookie, /^__Host-edupath.sid=/);
      assert.match(productionCookie, /; Secure/i);
      assert.match(productionCookie, /HttpOnly/i);
      assert.match(productionCookie, /SameSite=Lax/i);
      assert.doesNotMatch(productionCookie, /Domain=/i);
    } finally {
      await new Promise(resolve => productionServer.close(resolve));
    }
  });

  await t.test("login attempts are rate limited", async () => {
    const initial = await request("GET", "/api/auth/session");
    csrfToken = initial.body.csrfToken;
    let response;
    for (let attempt = 0; attempt < 11; attempt++) {
      response = await request("POST", "/api/auth/login", { body: {} });
    }
    assert.equal(response.status, 429);
    assert.ok(response.headers.get("retry-after"));
  });
});
