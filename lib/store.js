"use strict";

const { DatabaseSync } = require("node:sqlite");
const { CONSENT_VERSION } = require("./validation");

class DuplicateError extends Error {
  constructor() {
    super("This phone number is already registered.");
    this.name = "DuplicateError";
  }
}

function createStore(file, vault, now = () => new Date()) {
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS registrations (
      id INTEGER PRIMARY KEY,
      phone_hash TEXT NOT NULL UNIQUE,
      phone_enc TEXT NOT NULL,
      phone_last3 TEXT NOT NULL,
      first_name TEXT NOT NULL,
      second_name TEXT NOT NULL,
      region TEXT NOT NULL,
      employment TEXT NOT NULL CHECK (employment IN ('employed', 'not_employed')),
      sector TEXT CHECK (sector IN ('private', 'government')),
      employer TEXT,
      consent_version TEXT NOT NULL,
      consent_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      CHECK ((employment = 'employed' AND sector IS NOT NULL AND employer IS NOT NULL)
          OR (employment = 'not_employed' AND sector IS NULL AND employer IS NULL))
    );
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY,
      at TEXT NOT NULL,
      action TEXT NOT NULL,
      query_last3 TEXT,
      found INTEGER
    );
  `);

  const findRow = db.prepare("SELECT * FROM registrations WHERE phone_hash = ?");
  const insert = db.prepare(`
    INSERT INTO registrations (phone_hash, phone_enc, phone_last3, first_name, second_name, region, employment,
      sector, employer, consent_version, consent_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const update = db.prepare(`
    UPDATE registrations SET first_name = ?, second_name = ?, region = ?, employment = ?, sector = ?, employer = ?,
      updated_at = ? WHERE phone_hash = ?`);

  const shape = (row, phone) => ({
    phone,
    firstName: row.first_name,
    secondName: row.second_name,
    region: row.region,
    employment: row.employment,
    sector: row.sector,
    employer: row.employer,
    consentAt: row.consent_at,
    updatedAt: row.updated_at,
  });

  return {
    db,
    findForOwner(phone) {
      const row = findRow.get(vault.hashPhone(phone));
      return row ? shape(row, vault.decrypt(row.phone_enc)) : null;
    },
    findMasked(phone) {
      const row = findRow.get(vault.hashPhone(phone));
      return row ? shape(row, `+254******${row.phone_last3}`) : null;
    },
    save(phone, data) {
      const hash = vault.hashPhone(phone);
      const timestamp = now().toISOString();
      if (findRow.get(hash)) {
        update.run(data.firstName, data.secondName, data.region, data.employment, data.sector, data.employer, timestamp, hash);
        return { created: false };
      }
      try {
        insert.run(hash, vault.encrypt(phone), phone.slice(-3), data.firstName, data.secondName, data.region,
          data.employment, data.sector, data.employer, CONSENT_VERSION, timestamp, timestamp, timestamp);
      } catch (error) {
        if (/UNIQUE constraint failed/.test(error.message)) throw new DuplicateError();
        throw error;
      }
      return { created: true };
    },
    remove(phone) {
      return db.prepare("DELETE FROM registrations WHERE phone_hash = ?").run(vault.hashPhone(phone)).changes > 0;
    },
    count() {
      return db.prepare("SELECT COUNT(*) AS total FROM registrations").get().total;
    },
    audit(action, phone, found) {
      db.prepare("INSERT INTO audit_log (at, action, query_last3, found) VALUES (?, ?, ?, ?)")
        .run(now().toISOString(), action, phone ? phone.slice(-3) : null, found ? 1 : 0);
    },
    recentAudit(limit = 15) {
      return db.prepare("SELECT at, action, query_last3 AS queryLast3, found FROM audit_log ORDER BY id DESC LIMIT ?")
        .all(limit).map((row) => ({ ...row, found: Boolean(row.found) }));
    },
    close() {
      db.close();
    },
  };
}

module.exports = { createStore, DuplicateError };
