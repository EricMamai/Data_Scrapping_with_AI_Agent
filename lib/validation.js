"use strict";

const REGIONS = ["Nairobi", "Coast", "Central", "Eastern", "North Eastern", "Nyanza", "Rift Valley", "Western"];
const EMPLOYMENT = ["employed", "not_employed"];
const SECTORS = ["private", "government"];
const CONSENT_VERSION = "2026-10";

const NAME_PATTERN = /^\p{L}[\p{L} '’-]{0,48}\p{L}$/u;
const EMPLOYER_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} .,&'’()/-]{1,99}$/u;

function normalizePhone(input) {
  if (typeof input !== "string") return null;
  const match = /^(?:\+254|254|0)([17]\d{8})$/.exec(input.replace(/[\s\-()]/g, ""));
  return match ? `+254${match[1]}` : null;
}

function clean(value) {
  return typeof value === "string" ? value.normalize("NFC").trim().replace(/\s+/g, " ") : "";
}

function validateRegistration(body) {
  const input = body && typeof body === "object" ? body : {};
  const errors = {};
  const value = {
    firstName: clean(input.firstName),
    secondName: clean(input.secondName),
    region: clean(input.region),
    employment: clean(input.employment),
    sector: null,
    employer: null,
  };

  if (!NAME_PATTERN.test(value.firstName)) errors.firstName = "Enter your first name (letters only, 2-50 characters).";
  if (!NAME_PATTERN.test(value.secondName)) errors.secondName = "Enter your second name (letters only, 2-50 characters).";
  if (!REGIONS.includes(value.region)) errors.region = "Choose your region.";
  if (!EMPLOYMENT.includes(value.employment)) errors.employment = "Choose your employment status.";

  if (value.employment === "employed") {
    const sector = clean(input.sector);
    const employer = clean(input.employer);
    if (!SECTORS.includes(sector)) errors.sector = "Choose private company or government.";
    else value.sector = sector;
    if (!EMPLOYER_PATTERN.test(employer)) errors.employer = "Enter the company or government employer (2-100 characters).";
    else value.employer = employer;
  }

  if (input.adultConfirmed !== true) errors.adultConfirmed = "You must confirm that you are 18 years or older.";
  if (input.consent !== true) errors.consent = "Consent is required to store your details.";

  return { value, errors, valid: Object.keys(errors).length === 0 };
}

module.exports = { REGIONS, EMPLOYMENT, SECTORS, CONSENT_VERSION, normalizePhone, validateRegistration };
