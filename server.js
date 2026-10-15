"use strict";

const crypto = require("node:crypto");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs");
const { loadMasterKey, createVault } = require("./lib/vault");
const { createStore } = require("./lib/store");
const { createSenderFromEnv } = require("./lib/sms");
const { createApp } = require("./lib/app");

const port = Number(process.env.PORT || 3000);
const host = "127.0.0.1";
const dataDir = process.env.DATA_DIR || path.join(os.homedir(), ".wazi-registry");

fs.mkdirSync(dataDir, { recursive: true });
const vault = createVault(loadMasterKey(dataDir, process.env.APP_SECRET));
const store = createStore(path.join(dataDir, "registry.sqlite"), vault);
const sender = createSenderFromEnv(process.env);

let adminToken = process.env.ADMIN_TOKEN;
let generatedAdminToken = false;
if (!adminToken) {
  adminToken = crypto.randomBytes(18).toString("base64url");
  generatedAdminToken = true;
}

const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
const handler = createApp({
  store,
  vault,
  sender,
  adminToken,
  isAllowedHost: (value) => allowedHosts.has(value),
  secureCookies: process.env.COOKIE_SECURE === "1",
});

const server = http.createServer(handler);
server.on("error", (error) => {
  console.error("Server failed:", error.message);
  process.exitCode = 1;
});
server.listen(port, host, () => {
  console.log(`Wazi registry is available at http://127.0.0.1:${port}`);
  console.log(`Data directory: ${dataDir}`);
  console.log(`SMS provider: ${sender.name}${sender.name === "console" ? " (codes are printed here, no real SMS is sent)" : ""}`);
  if (generatedAdminToken) console.log(`Admin token for this run: ${adminToken}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => { store.close(); process.exit(0); }));
}
