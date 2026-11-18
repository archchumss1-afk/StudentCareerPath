require("./config");
const { Pool } = require("pg");

const pool = new Pool({
  host: process.env.PGHOST || "localhost",
  port: Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE || "edupath",
  user: process.env.PGUSER || "postgres",
  password: process.env.PGPASSWORD,
});

pool.on("error", error => console.error("Database pool error:", error.message));

module.exports = pool;
