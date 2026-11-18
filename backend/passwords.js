const { randomBytes, scrypt, timingSafeEqual } = require("node:crypto");
const { promisify } = require("node:util");

const deriveKey = promisify(scrypt);
const options = { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };

async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const key = await deriveKey(password, salt, 64, options);
  return `scrypt-v1$${salt}$${key.toString("hex")}`;
}

async function verifyPassword(password, storedHash) {
  const [version, salt, hash] = (storedHash || "").split("$");
  const validHash = version === "scrypt-v1" && /^[a-f0-9]{32}$/.test(salt)
    && /^[a-f0-9]{128}$/.test(hash);
  // Unknown accounts also perform the expensive password calculation.
  const key = await deriveKey(password, validHash ? salt : randomBytes(16).toString("hex"), 64, options);
  const expected = validHash ? Buffer.from(hash, "hex") : Buffer.alloc(64);
  return timingSafeEqual(key, expected) && validHash;
}

module.exports = { hashPassword, verifyPassword };
