"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { REGIONS, normalizePhone, validateRegistration } = require("./validation");
const { RateLimiter, createOtpService, createSessions } = require("./auth");
const { DuplicateError } = require("./store");

const PUBLIC_DIR = path.join(__dirname, "..", "public");
const STATIC_FILES = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/styles.css", ["styles.css", "text/css; charset=utf-8"]],
  ["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
]);

const MINUTE = 60000;
const USER_SESSION_MS = 30 * MINUTE;
const ADMIN_SESSION_MS = 15 * MINUTE;
const MAX_BODY_BYTES = 10000;

class HttpError extends Error {
  constructor(status, message, fields) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

function createApp({ store, vault, sender, adminToken, isAllowedHost = () => true, secureCookies = false, now = Date.now }) {
  if (!adminToken || adminToken.length < 16) throw new Error("An admin token of at least 16 characters is required.");

  const limiter = new RateLimiter(now);
  const otp = createOtpService(vault, { now });
  const sessions = createSessions(vault, now);
  const sweeper = setInterval(() => {
    limiter.sweep();
    otp.sweep();
    sessions.sweep();
  }, MINUTE);
  sweeper.unref();

  const cookieFlags = `Path=/; HttpOnly; SameSite=Strict${secureCookies ? "; Secure" : ""}`;
  const setCookie = (name, token, ttlMs) => `${name}=${token}; ${cookieFlags}; Max-Age=${Math.floor(ttlMs / 1000)}`;
  const clearCookie = (name) => `${name}=; ${cookieFlags}; Max-Age=0`;

  function parseCookies(header = "") {
    const cookies = {};
    for (const part of header.split(";")) {
      const index = part.indexOf("=");
      if (index > 0) cookies[part.slice(0, index).trim()] = part.slice(index + 1).trim();
    }
    return cookies;
  }

  function send(res, status, body, extraHeaders = {}) {
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extraHeaders,
    });
    res.end(JSON.stringify(body));
  }

  async function readJson(req) {
    if (!(req.headers["content-type"] || "").startsWith("application/json")) {
      throw new HttpError(415, "Content-Type must be application/json.");
    }
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) throw new HttpError(413, "Request body is too large.");
      chunks.push(chunk);
    }
    try {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
      if (body === null || typeof body !== "object" || Array.isArray(body)) throw new Error("not an object");
      return body;
    } catch {
      throw new HttpError(400, "Request body must be a JSON object.");
    }
  }

  function requireUser(req) {
    const session = sessions.get("user", parseCookies(req.headers.cookie).sid);
    if (!session) throw new HttpError(401, "Please verify your phone number first.");
    return session;
  }

  function requireAdmin(req) {
    const session = sessions.get("admin", parseCookies(req.headers.cookie).aid);
    if (!session) throw new HttpError(401, "Admin sign-in required.");
    return session;
  }

  function requirePhone(value) {
    const phone = normalizePhone(value);
    if (!phone) throw new HttpError(400, "Enter a valid Kenyan mobile number, for example 0712 345 678.");
    return phone;
  }

  async function handleApi(req, res, url, ip) {
    const route = `${req.method} ${url.pathname}`;
    const cookies = parseCookies(req.headers.cookie);

    switch (route) {
      case "GET /api/config":
        return send(res, 200, { regions: REGIONS, devSms: sender.name === "console" });

      case "POST /api/otp/request": {
        const phone = requirePhone((await readJson(req)).phone);
        if (!limiter.allow(`otp-ip:${ip}`, 10, 15 * MINUTE) || !limiter.allow(`otp-phone:${phone}`, 3, 15 * MINUTE)) {
          throw new HttpError(429, "Too many code requests. Please wait a few minutes and try again.");
        }
        const code = otp.issue(phone);
        try {
          await sender.send(phone, code);
        } catch (error) {
          otp.cancel(phone);
          console.error("Failed to send verification code:", error.message);
          throw new HttpError(502, "We could not send the verification code. Please try again later.");
        }
        return send(res, 202, { message: "A 6-digit code has been sent. It expires in 5 minutes." });
      }

      case "POST /api/otp/verify": {
        const body = await readJson(req);
        const phone = requirePhone(body.phone);
        if (!limiter.allow(`verify-ip:${ip}`, 20, 15 * MINUTE)) throw new HttpError(429, "Too many attempts. Please wait and try again.");
        if (!otp.verify(phone, body.code)) throw new HttpError(401, "That code is invalid or has expired.");
        sessions.destroy(cookies.sid);
        const token = sessions.create("user", phone, USER_SESSION_MS);
        return send(res, 200, { ok: true }, { "Set-Cookie": setCookie("sid", token, USER_SESSION_MS) });
      }

      case "GET /api/me": {
        const { phone } = requireUser(req);
        const record = store.findForOwner(phone);
        return send(res, 200, { phone, registered: Boolean(record), record });
      }

      case "PUT /api/me": {
        const { phone } = requireUser(req);
        const { value, errors, valid } = validateRegistration(await readJson(req));
        if (!valid) throw new HttpError(400, "Please correct the highlighted details.", errors);
        const { created } = store.save(phone, value);
        return send(res, created ? 201 : 200, { created, record: store.findForOwner(phone) });
      }

      case "DELETE /api/me": {
        const { phone } = requireUser(req);
        const deleted = store.remove(phone);
        sessions.destroy(cookies.sid);
        return send(res, 200, { deleted }, { "Set-Cookie": clearCookie("sid") });
      }

      case "POST /api/logout":
        sessions.destroy(cookies.sid);
        sessions.destroy(cookies.aid);
        return send(res, 200, { ok: true }, { "Set-Cookie": [clearCookie("sid"), clearCookie("aid")] });

      case "POST /api/admin/login": {
        const body = await readJson(req);
        if (!limiter.allow(`admin-ip:${ip}`, 10, 15 * MINUTE)) throw new HttpError(429, "Too many sign-in attempts. Please wait and try again.");
        if (typeof body.token !== "string" || !vault.safeEqual(body.token, adminToken)) throw new HttpError(401, "Invalid admin token.");
        const token = sessions.create("admin", null, ADMIN_SESSION_MS);
        return send(res, 200, { ok: true }, { "Set-Cookie": setCookie("aid", token, ADMIN_SESSION_MS) });
      }

      case "POST /api/admin/search": {
        requireAdmin(req);
        if (!limiter.allow(`admin-search:${cookies.aid}`, 30, MINUTE)) throw new HttpError(429, "Search limit reached. Please wait a minute.");
        const phone = requirePhone((await readJson(req)).phone);
        const record = store.findMasked(phone);
        store.audit("phone_search", phone, Boolean(record));
        return send(res, 200, { found: Boolean(record), record });
      }

      case "GET /api/admin/summary":
        requireAdmin(req);
        return send(res, 200, { total: store.count(), audit: store.recentAudit() });

      default:
        throw new HttpError(404, "Not found.");
    }
  }

  function serveStatic(req, res) {
    const entry = STATIC_FILES.get(new URL(req.url, "http://localhost").pathname);
    if (!entry || !["GET", "HEAD"].includes(req.method)) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end("Not found");
    }
    fs.readFile(path.join(PUBLIC_DIR, entry[0]), (error, content) => {
      if (error) {
        console.error("Unable to read static file:", error.message);
        res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
        return res.end("Unable to load application.");
      }
      res.writeHead(200, { "Content-Type": entry[1], "Cache-Control": "no-store" });
      res.end(req.method === "HEAD" ? undefined : content);
    });
  }

  return async function handler(req, res) {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Content-Security-Policy", "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
    try {
      if (!isAllowedHost(req.headers.host)) throw new HttpError(403, "Host not allowed.");
      const url = new URL(req.url, "http://localhost");
      if (!url.pathname.startsWith("/api/")) return serveStatic(req, res);
      if (!["GET", "HEAD"].includes(req.method)) {
        const origin = req.headers.origin;
        if (origin !== `http://${req.headers.host}` && origin !== `https://${req.headers.host}`) {
          throw new HttpError(403, "Cross-origin requests are not allowed.");
        }
      }
      await handleApi(req, res, url, req.socket.remoteAddress || "unknown");
    } catch (error) {
      if (error instanceof HttpError) {
        return send(res, error.status, { error: error.message, fields: error.fields });
      }
      if (error instanceof DuplicateError) return send(res, 409, { error: error.message });
      console.error("Unhandled request error:", error);
      send(res, 500, { error: "Something went wrong. Please try again." });
    }
  };
}

module.exports = { createApp };
