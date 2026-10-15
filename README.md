# Wazi - synthetic data workspace

A responsive, local-only UI demonstration using fictional adult records.
This is not a scraper or an AI integration. It does not collect real personal
information, visit external websites, or require credentials.

## Start in VS Code

Requires Node.js 20 or newer. There are no third-party dependencies to install.

1. Open this folder in VS Code.
2. Select **Terminal > Run Task > Wazi: Start localhost**, or run `npm start`.
3. Open <http://127.0.0.1:3000>.
4. Stop the server with **Terminal > Terminate Task**, or Ctrl+C in its terminal.

The server binds only to the local loopback interface, not your local network.
Port 3000 must be available. Startup failures are printed in the terminal.

## Features and boundaries

- Responsive dashboard, search, region/employment filters, and pagination.
- 24 initial fictional records; all ages are strictly above 18.
- Run demo agent simulates a batch of 12 records: 8 new, 4 duplicates.
- Duplicate checks use synthetic record IDs, including duplicates within a batch.
  Names, regions, and employers are not unique: people can legitimately share them.
- Fictional public/private employers, with no real contact numbers.
- Religion and national ID numbers are deliberately excluded.
- Export CSV downloads the current filtered fictional records, across all pages.
- Reset restores the initial dataset. Refreshing clears all changes.
- No database, browser storage, analytics, remote assets, or AI API calls.

## Tests

Run `npm test`, or select **Wazi: Test synthetic data** in VS Code.
Tests cover adult-only generation, unique IDs, duplicate handling, legitimate
shared details, input rejection, and exact simulated batch counts.

## Future consent-based application

Real data collection is outside this prototype. Any future opt-in service needs
a defined lawful purpose, appropriate legal/privacy review, explicit notices,
data minimization, verified consent where applicable, access controls, retention
limits, and correction/deletion workflows before collecting personal data.
Never deploy this demonstration as a real personal-information database.

The files are already in the current VS Code workspace. Publishing to GitHub
is separate; no repository is initialized or code pushed by this demo.
"# Data_Scrapping_with_AI_Agent" 
