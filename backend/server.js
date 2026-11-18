
const express = require("express");
const cors = require("cors");

const defaultPool = require("./db");
const { loadConfig } = require("./config");
const { configureAuth } = require("./auth");

function createApp({ pool = defaultPool, config = loadConfig(), sessionStore } = {}) {
  const app = express();

  app.disable("x-powered-by");
  if (config.trustProxy) app.set("trust proxy", config.trustProxy);
  app.use(cors({ origin: config.frontendOrigin, credentials: true }));
  app.use(express.json({ limit: "16kb" }));

  const { sessionMiddleware, requireAdmin, requireCsrf } = configureAuth(app, pool, config, sessionStore);

  // Authenticate writes before validating IDs or reading any career data.
  app.use("/api/careers", (req, res, next) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
    sessionMiddleware(req, res, error => {
      if (error) return next(error);
      Promise.resolve(requireAdmin(req, res, () => requireCsrf(req, res, next))).catch(next);
    });
  });

  // PostgreSQL INTEGER IDs must be whole numbers within this range.
  app.param("id", (req, res, next, value) => {
    const id = Number(value);
    if (!Number.isInteger(id) || id < 1 || id > 2147483647) {
      return res.status(404).json({ error: "Career not found" });
    }
    next();
  });

  // READ all careers
  app.get("/api/careers", async (req, res) => {
    try {
      const result = await pool.query(
        "SELECT id, name, specializations FROM careers ORDER BY id"
      );
      res.json(result.rows);
    } catch (error) {
      console.error("Could not load careers:", error.message);
      res.status(500).json({ error: "Could not load careers" });
    }
  });

  // READ one career
  app.get("/api/careers/:id", async (req, res) => {
    try {
      const result = await pool.query(
        "SELECT id, name, specializations FROM careers WHERE id = $1",
        [Number(req.params.id)]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Career not found" });
      }

      res.json(result.rows[0]);
    } catch (error) {
      console.error("Could not load career:", error.message);
      res.status(500).json({ error: "Could not load career" });
    }
  });

  // CREATE a career
  app.post("/api/careers", async (req, res) => {
    const { name, specializations } = req.body ?? {};

    if (
      typeof name !== "string" ||
      !name.trim() ||
      !Array.isArray(specializations) ||
      !specializations.every((item) => typeof item === "string")
    ) {
      return res.status(400).json({ error: "Invalid career data" });
    }

    try {
      const result = await pool.query(
        `INSERT INTO careers (name, specializations)
         VALUES ($1, $2)
         RETURNING id, name, specializations`,
        [name.trim(), specializations]
      );

      res.status(201).json(result.rows[0]);
    } catch (error) {
      console.error("Could not save career:", error.message);
      res.status(500).json({ error: "Could not save career" });
    }
  });
  // UPDATE a career
  app.put("/api/careers/:id", async (req, res) => {
    const { name, specializations } = req.body ?? {};

    if (
      typeof name !== "string" ||
      !name.trim() ||
      !Array.isArray(specializations) ||
      !specializations.every(
        s => typeof s === "string"
      )
    ) {
      return res.status(400).json({
        error: "Invalid career data"
      });
    }

    try {
      const result = await pool.query(
        `UPDATE careers
         SET name = $1, specializations = $2
         WHERE id = $3
         RETURNING id, name, specializations`,
        [name.trim(), specializations, Number(req.params.id)]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Career not found" });
      }

      res.json(result.rows[0]);
    } catch (error) {
      console.error("Could not update career:", error.message);
      res.status(500).json({ error: "Could not update career" });
    }
  });

  // DELETE a career
  app.delete("/api/careers/:id", async (req, res) => {
    try {
      const result = await pool.query(
        "DELETE FROM careers WHERE id = $1 RETURNING id",
        [Number(req.params.id)]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Career not found" });
      }

      res.status(204).send();
    } catch (error) {
      console.error("Could not delete career:", error.message);
      res.status(500).json({ error: "Could not delete career" });
    }
  });

  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    console.error("Request failed:", error.message);
    const status = error.status === 400 || error.status === 413 ? error.status : 500;
    res.status(status).json({ error: status === 500 ? "Request failed. Please try again." : "Invalid request body." });
  });

  return app;
}

if (require.main === module) {
  try {
    const config = loadConfig();
    createApp({ config }).listen(config.port, () => {
      console.log(`Backend running on port ${config.port}`);
    });
  } catch (error) {
    console.error("Backend setup required:", error.message);
    process.exitCode = 1;
    defaultPool.end();
  }
}

module.exports = { createApp };
