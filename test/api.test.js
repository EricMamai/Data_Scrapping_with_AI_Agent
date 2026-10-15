"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { createVault } = require("../lib/vault");
const { createStore } = require("../lib/store");
const { createApp } = require("../lib/app");
const { normalizePhone, validateRegistration } = require("../lib/validation");

const ADMIN_TOKEN = "test-admin-token-123456";
const validBody = {
  firstName: "Wanjiru",
  secondName: "Kamau",
  region: "Nairobi",
  employment: "employed",
  sector: "government",
  employer: "Kenya Revenue Authority",
  adultConfirmed: true,
  consent: true,
};

async function startApp() {
  const vault = createVault(Buffer.alloc(32, 7));
  const store = createStore(":memory:", vault);
  const codes = [];
  const handler = createApp({
    store,
    vault,
    adminToken: ADMIN_TOKEN,
    sender: { name: "test", send: async (phone, code) => codes.push({ phone, code }) },
  });
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  function client() {
    const jar = new Map();
    return async (method, path, body, { origin = base } = {}) => {
      const headers = {};
      if (origin) headers.Origin = origin;
      if (body !== undefined) headers["Content-Type"] = "application/json";
      if (jar.size) headers.Cookie = [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
      const response = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
      for (const cookie of response.headers.getSetCookie()) {
        const [pair] = cookie.split(";");
        const [name, value] = pair.split("=");
        if (value) jar.set(name, value);
        else jar.delete(name);
      }
      return { status: response.status, body: await response.json(), headers: response.headers };
    };
  }

  async function signIn(phone) {
    const api = client();
    assert.equal((await api("POST", "/api/otp/request", { phone })).status, 202);
    const { code } = codes.at(-1);
    assert.equal((await api("POST", "/api/otp/verify", { phone, code })).status, 200);
    return api;
  }

  return { store, codes, client, signIn, close: () => { server.close(); store.close(); } };
}

test("normalizes Kenyan mobile numbers and rejects others", () => {
  for (const input of ["0712345678", "+254712345678", "254 712 345 678", "0112-345-678"]) {
    assert.match(normalizePhone(input), /^\+254[17]\d{8}$/);
  }
  assert.equal(normalizePhone("0712345678"), normalizePhone("+254712345678"));
  for (const input of ["071234567", "0212345678", "+255712345678", "abc", "", null, 712345678]) {
    assert.equal(normalizePhone(input), null);
  }
});

test("validates registration rules for employment, adulthood and consent", () => {
  assert.equal(validateRegistration(validBody).valid, true);
  const unemployed = validateRegistration({ ...validBody, employment: "not_employed", employer: "Ignored" });
  assert.equal(unemployed.valid, true);
  assert.equal(unemployed.value.employer, null);
  assert.ok(validateRegistration({ ...validBody, employer: "" }).errors.employer);
  assert.ok(validateRegistration({ ...validBody, sector: "other" }).errors.sector);
  assert.ok(validateRegistration({ ...validBody, adultConfirmed: false }).errors.adultConfirmed);
  assert.ok(validateRegistration({ ...validBody, consent: "yes" }).errors.consent);
  assert.ok(validateRegistration({ ...validBody, firstName: "<script>" }).errors.firstName);
  assert.ok(validateRegistration({ ...validBody, region: "Mars" }).errors.region);
});

test("registration lifecycle: verify, create, update without duplicating, delete", async (t) => {
  const app = await startApp();
  t.after(app.close);
  const phone = "0712345678";
  const api = await app.signIn(phone);

  const empty = await api("GET", "/api/me");
  assert.equal(empty.body.registered, false);
  assert.equal(empty.body.phone, "+254712345678");

  const created = await api("PUT", "/api/me", validBody);
  assert.equal(created.status, 201);
  const updated = await api("PUT", "/api/me", { ...validBody, region: "Coast" });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.record.region, "Coast");
  assert.equal(app.store.count(), 1);

  const sameNameOtherPerson = await app.signIn("0722000111");
  assert.equal((await sameNameOtherPerson("PUT", "/api/me", validBody)).status, 201);
  assert.equal(app.store.count(), 2);

  const removed = await api("DELETE", "/api/me");
  assert.equal(removed.body.deleted, true);
  assert.equal(app.store.count(), 1);
  assert.equal((await api("GET", "/api/me")).status, 401);
});

test("database enforces unique phone numbers and never stores them in plain text", async (t) => {
  const app = await startApp();
  t.after(app.close);
  const api = await app.signIn("0712345678");
  await api("PUT", "/api/me", validBody);
  const raw = JSON.stringify(app.store.db.prepare("SELECT * FROM registrations").all());
  assert.ok(!raw.includes("712345678"));
  assert.throws(() => app.store.db.prepare(
    "INSERT INTO registrations (phone_hash, phone_enc, phone_last3, first_name, second_name, region, employment, consent_version, consent_at, created_at, updated_at) SELECT phone_hash, 'x', '1', 'A', 'B', 'Coast', 'not_employed', 'v', 't', 't', 't' FROM registrations"
  ).run(), /UNIQUE/);
});

test("registration requires a verified session, adult confirmation and consent", async (t) => {
  const app = await startApp();
  t.after(app.close);
  assert.equal((await app.client()("PUT", "/api/me", validBody)).status, 401);
  const api = await app.signIn("0712345678");
  assert.equal((await api("PUT", "/api/me", { ...validBody, adultConfirmed: false })).status, 400);
  assert.equal((await api("PUT", "/api/me", { ...validBody, consent: false })).status, 400);
  assert.equal(app.store.count(), 0);
});

test("one-time codes are single use, limited in attempts and limited in requests", async (t) => {
  const app = await startApp();
  t.after(app.close);
  const phone = "0733000222";
  const api = app.client();
  await api("POST", "/api/otp/request", { phone });
  const { code } = app.codes.at(-1);
  const wrong = code === "000000" ? "111111" : "000000";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    assert.equal((await api("POST", "/api/otp/verify", { phone, code: wrong })).status, 401);
  }
  assert.equal((await api("POST", "/api/otp/verify", { phone, code })).status, 401, "code is invalidated after 5 failures");

  const reuse = await app.signIn("0744000333");
  const { phone: reusedPhone, code: reusedCode } = app.codes.at(-1);
  assert.equal((await app.client()("POST", "/api/otp/verify", { phone: reusedPhone, code: reusedCode })).status, 401);
  assert.equal((await reuse("GET", "/api/me")).status, 200);

  const limited = app.client();
  const statuses = [];
  for (let request = 0; request < 4; request += 1) statuses.push((await limited("POST", "/api/otp/request", { phone: "0755000444" })).status);
  assert.deepEqual(statuses, [202, 202, 202, 429]);
});

test("admin can search by phone number, results are masked and searches are audited", async (t) => {
  const app = await startApp();
  t.after(app.close);
  const person = await app.signIn("0712345678");
  await person("PUT", "/api/me", validBody);

  const admin = app.client();
  assert.equal((await admin("POST", "/api/admin/search", { phone: "0712345678" })).status, 401);
  assert.equal((await admin("POST", "/api/admin/login", { token: "wrong-token" })).status, 401);
  assert.equal((await person("POST", "/api/admin/search", { phone: "0712345678" })).status, 401, "user session is not admin");
  assert.equal((await admin("POST", "/api/admin/login", { token: ADMIN_TOKEN })).status, 200);

  const hit = await admin("POST", "/api/admin/search", { phone: "+254 712 345 678" });
  assert.equal(hit.body.found, true);
  assert.equal(hit.body.record.phone, "+254******678");
  assert.equal(hit.body.record.firstName, "Wanjiru");
  assert.ok(!JSON.stringify(hit.body).includes("712345678"));

  const miss = await admin("POST", "/api/admin/search", { phone: "0799999999" });
  assert.equal(miss.body.found, false);
  assert.equal((await admin("POST", "/api/admin/search", { phone: "12345" })).status, 400);

  const summary = await admin("GET", "/api/admin/summary");
  assert.equal(summary.body.total, 1);
  assert.deepEqual(summary.body.audit.map((entry) => [entry.queryLast3, entry.found]), [["999", false], ["678", true]]);
});

test("rejects cross-origin writes and non-JSON bodies", async (t) => {
  const app = await startApp();
  t.after(app.close);
  const api = app.client();
  assert.equal((await api("POST", "/api/otp/request", { phone: "0712345678" }, { origin: "http://evil.example" })).status, 403);
  assert.equal((await api("POST", "/api/otp/request", { phone: "0712345678" }, { origin: null })).status, 403);
  assert.equal(app.codes.length, 0);
});
