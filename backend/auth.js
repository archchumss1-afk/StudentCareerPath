const session = require("express-session");
const PgSession = require("connect-pg-simple")(session);
const { rateLimit } = require("express-rate-limit");
const { randomBytes, timingSafeEqual } = require("node:crypto");
const { verifyPassword } = require("./passwords");

function configureAuth(app, pool, config, sessionStore) {
  const cookieName = config.production ? "__Host-edupath.sid" : "edupath.sid";
  const cookieOptions = { httpOnly: true, secure: config.production, sameSite: "lax", path: "/" };
  const store = sessionStore || new PgSession({ pool, tableName: "admin_sessions" });
  store.on("error", error => console.error("Session store error:", error.message));

  const sessionMiddleware = session({
    name: cookieName,
    secret: config.sessionSecret,
    store,
    resave: false,
    saveUninitialized: false,
    rolling: false,
    cookie: { ...cookieOptions, maxAge: config.sessionMaxAge },
  });

  function clearCookie(res) {
    res.clearCookie(cookieName, cookieOptions);
  }

  async function readAdmin(req) {
    if (!req.session.adminId) return null;
    if (!req.session.loggedInAt || Date.now() - req.session.loggedInAt >= config.sessionMaxAge) return null;
    const result = await pool.query("SELECT id, email FROM administrators WHERE id = $1", [req.session.adminId]);
    return result.rows[0] || null;
  }

  async function requireAdmin(req, res, next) {
    const admin = await readAdmin(req);
    if (!admin) {
      await new Promise((resolve, reject) => req.session.destroy(error => error ? reject(error) : resolve()));
      clearCookie(res);
      return res.status(401).json({ error: "Your administrator session has ended. Please log in." });
    }
    req.admin = admin;
    next();
  }

  function requireCsrf(req, res, next) {
    const token = req.get("X-CSRF-Token");
    const expected = req.session.csrfToken;
    if (req.get("Origin") !== config.frontendOrigin || typeof token !== "string"
      || typeof expected !== "string" || !/^[a-f0-9]{64}$/.test(token) || token.length !== expected.length
      || !timingSafeEqual(Buffer.from(token), Buffer.from(expected))) {
      return res.status(403).json({ error: "Security check failed. Refresh the page and try again." });
    }
    next();
  }

  // Public career GET requests avoid session/database authentication work.
  app.use("/api/auth", sessionMiddleware, (req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });

  app.get("/api/auth/session", async (req, res) => {
    const admin = await readAdmin(req);
    if (req.session.adminId && !admin) {
      await new Promise((resolve, reject) => req.session.regenerate(error => error ? reject(error) : resolve()));
    }
    if (!req.session.csrfToken) req.session.csrfToken = randomBytes(32).toString("hex");
    res.json({ admin, csrfToken: req.session.csrfToken,
      expiresAt: admin ? req.session.loggedInAt + config.sessionMaxAge : null });
  });

  const limitLogin = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "Too many login attempts. Try again in 15 minutes." },
  });

  app.post("/api/auth/login", limitLogin, requireCsrf, async (req, res) => {
    const { email, password } = req.body || {};
    if (typeof email !== "string" || email.length > 254 || typeof password !== "string"
      || password.length === 0 || password.length > 1024) {
      return res.status(400).json({ error: "Enter your email and password." });
    }

    const result = await pool.query(
      "SELECT id, email, password_hash FROM administrators WHERE email = $1",
      [email.trim().toLowerCase()]
    );
    const admin = result.rows[0];
    if (!await verifyPassword(password, admin?.password_hash)) {
      return res.status(401).json({ error: "Email or password is incorrect." });
    }

    // A fresh session ID prevents the pre-login session being reused after login.
    await new Promise((resolve, reject) => req.session.regenerate(error => error ? reject(error) : resolve()));
    req.session.adminId = admin.id;
    req.session.loggedInAt = Date.now();
    req.session.csrfToken = randomBytes(32).toString("hex");
    await new Promise((resolve, reject) => req.session.save(error => error ? reject(error) : resolve()));
    res.json({ admin: { id: admin.id, email: admin.email }, csrfToken: req.session.csrfToken,
      expiresAt: req.session.loggedInAt + config.sessionMaxAge });
  });

  app.post("/api/auth/logout", requireCsrf, async (req, res) => {
    await new Promise((resolve, reject) => req.session.destroy(error => error ? reject(error) : resolve()));
    clearCookie(res);
    res.status(204).send();
  });

  return { sessionMiddleware, requireAdmin, requireCsrf };
}

module.exports = { configureAuth };
