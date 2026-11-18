const { existsSync } = require("node:fs");
const { join } = require("node:path");

const envPath = join(__dirname, ".env");
if (existsSync(envPath)) process.loadEnvFile(envPath);

function loadConfig() {
  const production = process.env.NODE_ENV === "production";
  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret || sessionSecret.length < 32) {
    throw new Error("Set SESSION_SECRET to at least 32 random characters. See backend/AUTH_SETUP.md.");
  }

  const frontendOrigin = process.env.FRONTEND_ORIGIN || "http://localhost:5173";
  const parsedOrigin = new URL(frontendOrigin);
  if (parsedOrigin.origin !== frontendOrigin || (production && parsedOrigin.protocol !== "https:")) {
    throw new Error("FRONTEND_ORIGIN must be an exact origin, using HTTPS in production.");
  }

  return {
    production,
    sessionSecret,
    frontendOrigin,
    trustProxy: process.env.TRUST_PROXY,
    port: Number(process.env.PORT || 5000),
    sessionMaxAge: 8 * 60 * 60 * 1000,
  };
}

module.exports = { loadConfig };
