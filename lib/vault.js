"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

function loadMasterKey(dataDir, envSecret) {
  if (envSecret) {
    if (envSecret.length < 32) throw new Error("APP_SECRET must be at least 32 characters.");
    return crypto.createHash("sha256").update(envSecret).digest();
  }
  const file = path.join(dataDir, "master.key");
  if (fs.existsSync(file)) {
    const key = Buffer.from(fs.readFileSync(file, "utf8").trim(), "hex");
    if (key.length !== 32) throw new Error(`Invalid key file: ${file}`);
    return key;
  }
  fs.mkdirSync(dataDir, { recursive: true });
  const key = crypto.randomBytes(32);
  fs.writeFileSync(file, key.toString("hex"), { mode: 0o600, flag: "wx" });
  return key;
}

function createVault(master) {
  const derive = (label) => crypto.createHmac("sha256", master).update(label).digest();
  const lookupKey = derive("phone-lookup");
  const encryptionKey = derive("phone-encryption");
  const secretKey = derive("secret-hash");
  const hmac = (key, value) => crypto.createHmac("sha256", key).update(String(value)).digest("hex");

  return {
    hashPhone: (phone) => hmac(lookupKey, phone),
    hashSecret: (value) => hmac(secretKey, value),
    safeEqual(a, b) {
      const left = crypto.createHash("sha256").update(String(a)).digest();
      const right = crypto.createHash("sha256").update(String(b)).digest();
      return crypto.timingSafeEqual(left, right);
    },
    encrypt(text) {
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey, iv);
      const body = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
      return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64");
    },
    decrypt(encoded) {
      const buffer = Buffer.from(encoded, "base64");
      const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey, buffer.subarray(0, 12));
      decipher.setAuthTag(buffer.subarray(12, 28));
      return Buffer.concat([decipher.update(buffer.subarray(28)), decipher.final()]).toString("utf8");
    },
  };
}

module.exports = { loadMasterKey, createVault };
