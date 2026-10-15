# AI Data Scrapper Ke - consent-based adult registry

A working local web app where adults (18+) register **their own** details and can
update or delete them at any time. It is not a scraper and it does not look up
other people's information.

## What is collected

First name, second name, region, employment status and, if employed, the
private company or government employer, plus a verified Kenyan mobile number.
Each person must confirm they are 18+ and give explicit consent.
**National ID numbers and religion are deliberately not collected.**

## Run it

Requires Node.js 22.13 or newer (no packages to install).

1. In VS Code choose **Terminal > Run Task > AI Data Scrapper Ke: Start localhost**, or run `npm start`.
2. Open <http://127.0.0.1:3000>.
3. The terminal prints an **admin token** for that run. Set the `ADMIN_TOKEN`
   environment variable (16+ characters) to use a fixed one.

The server only listens on the loopback interface and rejects unknown `Host` headers.

## How it works

- **Phone verification:** a 6-digit one-time code (5-minute expiry, 5 attempts,
  rate limited) must be entered before a record can be created, changed or deleted.
- **No duplicates:** the phone number is unique, enforced by a database constraint
  (checked on the number's keyed hash). Re-saving updates the same record. Names,
  regions and employers can repeat because different people share them.
- **Phone search:** the person can search for and manage their own record after
  verification. An admin (token sign-in) can search by an exact mobile number. Results
  mask the phone number, there is no bulk listing or export, and every search is
  written to an audit log.
- **Privacy:** phone numbers are stored AES-256-GCM encrypted, and looked up through
  an HMAC hash. Sessions use HttpOnly SameSite=Strict cookies. Writes require a
  same-origin `Origin` header and JSON bodies.
- **Storage:** SQLite at `%USERPROFILE%\.wazi-registry\registry.sqlite` (override with
  `DATA_DIR`). The encryption key is in `master.key` in the same folder (or set
  `APP_SECRET`, 32+ characters). Back up both together. They are kept outside the
  project so they are never committed.

## SMS

By default (`SMS_PROVIDER` unset) no real SMS is sent: the code is printed in the
server terminal for local development. For real delivery set
`SMS_PROVIDER=africastalking`, `AT_USERNAME`, `AT_API_KEY` and optionally
`AT_SENDER_ID`. That integration is not tested against the live gateway.

## Before using this with real people

This is a solid starting point, not a compliance guarantee. Under Kenya's Data
Protection Act, 2019 you will likely need to register with the Office of the Data
Protection Commissioner, publish a privacy notice stating your purpose and retention
period, and run the app over HTTPS (set `COOKIE_SECURE=1`) behind a reverse proxy.
Also add backups and a proper admin identity system (this uses one shared token).

## Tests

`npm test` runs the API tests (validation, verification flow, uniqueness, encryption at
rest, admin search and auditing, rate limits, cross-origin protection).
