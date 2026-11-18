
const express = require("express");
const cors = require("cors");

const { Pool } = require("pg");

const pool = new Pool({
  host: "localhost",
  port: 5432,
  database: "edupath",
  user: "postgres",
  password: process.env.PGPASSWORD,
});

const app = express();

app.use(cors());
app.use(express.json());

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

app.listen(5000, () => {
  console.log("Backend running on port 5000");
});
