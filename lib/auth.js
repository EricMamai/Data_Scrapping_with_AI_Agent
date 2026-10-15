"use strict";

const crypto = require("node:crypto");

class RateLimiter {
  constructor(now = Date.now) {
    this.now = now;
    this.hits = new Map();
  }

  allow(key, limit, windowMs) {
    const time = this.now();
    const recent = (this.hits.get(key) || []).filter((at) => time - at < windowMs);
    if (recent.length >= limit) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(time);
    this.hits.set(key, recent);
    return true;
  }

  sweep(maxAgeMs = 3600000) {
    const time = this.now();
    for (const [key, hits] of this.hits) {
      if (!hits.length || time - hits[hits.length - 1] > maxAgeMs) this.hits.delete(key);
    }
  }
}

function createOtpService(vault, { now = Date.now, ttlMs = 300000, maxAttempts = 5 } = {}) {
  const pending = new Map();
  return {
    issue(phone) {
      const code = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
      pending.set(phone, { hash: vault.hashSecret(`${phone}:${code}`), expires: now() + ttlMs, attempts: 0 });
      return code;
    },
    cancel(phone) {
      pending.delete(phone);
    },
    verify(phone, code) {
      const entry = pending.get(phone);
      if (!entry || entry.expires < now() || typeof code !== "string" || !/^\d{6}$/.test(code)) return false;
      entry.attempts += 1;
      if (vault.safeEqual(entry.hash, vault.hashSecret(`${phone}:${code}`))) {
        pending.delete(phone);
        return true;
      }
      if (entry.attempts >= maxAttempts) pending.delete(phone);
      return false;
    },
    sweep() {
      for (const [phone, entry] of pending) if (entry.expires < now()) pending.delete(phone);
    },
  };
}

function createSessions(vault, now = Date.now) {
  const sessions = new Map();
  return {
    create(kind, phone, ttlMs) {
      const token = crypto.randomBytes(32).toString("base64url");
      sessions.set(vault.hashSecret(token), { kind, phone, expires: now() + ttlMs });
      return token;
    },
    get(kind, token) {
      if (!token) return null;
      const key = vault.hashSecret(token);
      const session = sessions.get(key);
      if (!session || session.kind !== kind) return null;
      if (session.expires < now()) {
        sessions.delete(key);
        return null;
      }
      return session;
    },
    destroy(token) {
      if (token) sessions.delete(vault.hashSecret(token));
    },
    sweep() {
      for (const [key, session] of sessions) if (session.expires < now()) sessions.delete(key);
    },
  };
}

module.exports = { RateLimiter, createOtpService, createSessions };
