const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const pool = require("../db");
const { hashPassword } = require("../passwords");

async function createAdmin() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Set ADMIN_EMAIL to your administrator email address.");
  }
  if (!password || password.length < 12 || password.length > 1024) {
    throw new Error("Set ADMIN_PASSWORD to a password between 12 and 1024 characters.");
  }

  const passwordHash = await hashPassword(password);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(readFileSync(join(__dirname, "../auth-schema.sql"), "utf8"));
    const result = await client.query(
      `INSERT INTO administrators (email, password_hash)
       VALUES ($1, $2) ON CONFLICT (email) DO NOTHING RETURNING id`,
      [email, passwordHash]
    );
    await client.query("COMMIT");
    console.log(result.rows.length ? "Administrator created. You can now log in." : "This administrator already exists. Its password was preserved.");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

createAdmin().catch(error => {
  console.error("Administrator setup failed:", error.message);
  process.exitCode = 1;
}).finally(() => pool.end());
