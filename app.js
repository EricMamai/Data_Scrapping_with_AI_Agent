"use strict";

const { regions, createRecord, mergeRecords } = globalThis.DemoData;
const byId = (id) => document.getElementById(id);
const pageSize = 6;
let records = [];
let duplicates = 0;
let page = 1;
let running = false;
let nextIndex = 24;

for (const region of regions) {
  const option = document.createElement("option");
  option.value = region;
  option.textContent = region;
  byId("region").append(option);
}

function filteredRecords() {
  const query = byId("search").value.trim().toLowerCase();
  return records.filter((record) =>
    (!byId("region").value || record.region === byId("region").value) &&
    (!byId("employment").value || record.employment === byId("employment").value) &&
    `${record.firstName} ${record.secondName} ${record.id} ${record.employer}`.toLowerCase().includes(query)
  );
}

function cell(row, text, className) {
  const element = document.createElement("td");
  element.textContent = text;
  if (className) element.className = className;
  row.append(element);
  return element;
}

function render() {
  const filtered = filteredRecords();
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  page = Math.min(page, pages);
  byId("total-count").textContent = records.length;
  byId("region-count").textContent = new Set(records.map((record) => record.region)).size;
  byId("employed-count").textContent = records.filter((record) => record.employment === "Employed").length;
  byId("duplicate-count").textContent = duplicates;
  byId("record-badge").textContent = `${records.length} records`;
  byId("records").replaceChildren();
  for (const record of filtered.slice((page - 1) * pageSize, page * pageSize)) {
    const row = document.createElement("tr");
    const personCell = cell(row, "");
    const person = document.createElement("div");
    person.className = "person";
    const icon = document.createElement("span");
    icon.className = "person-icon";
    icon.textContent = "DP";
    icon.setAttribute("aria-hidden", "true");
    const identity = document.createElement("div");
    const name = document.createElement("strong");
    name.textContent = `${record.firstName} ${record.secondName}`;
    const id = document.createElement("small");
    id.textContent = record.id;
    identity.append(name, id);
    person.append(icon, identity);
    personCell.append(person);
    cell(row, record.region);
    cell(row, String(record.age));
    const employmentCell = cell(row, "");
    const badge = document.createElement("span");
    badge.className = `employment-pill${record.employment === "Not employed" ? " unemployed" : ""}`;
    badge.textContent = record.employment;
    employmentCell.append(badge);
    const employer = cell(row, record.employer);
    const sector = document.createElement("small");
    sector.className = "employer-sector";
    sector.textContent = record.sector;
    employer.append(sector);
    cell(row, record.contact);
    byId("records").append(row);
  }
  if (!filtered.length) {
    const row = document.createElement("tr");
    const empty = cell(row, "No demo records match these filters.", "empty");
    empty.colSpan = 6;
    byId("records").append(row);
  }
  byId("results-summary").textContent = filtered.length
    ? `Showing ${(page - 1) * pageSize + 1}-${Math.min(page * pageSize, filtered.length)} of ${filtered.length} fictional records`
    : "0 matching records";
  byId("page-label").textContent = `${page} / ${pages}`;
  byId("previous").disabled = page === 1;
  byId("next").disabled = page === pages;
}

function log(message) {
  const item = document.createElement("li");
  const time = document.createElement("time");
  time.dateTime = new Date().toISOString();
  time.textContent = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const text = document.createElement("span");
  text.textContent = message;
  item.append(time, text);
  byId("activity-log").prepend(item);
  while (byId("activity-log").children.length > 6) {
    byId("activity-log").lastElementChild.remove();
  }
}

function reset() {
  records = Array.from({ length: 24 }, (_, index) => createRecord(index));
  duplicates = 0;
  nextIndex = 24;
  page = 1;
  byId("search").value = "";
  byId("region").value = "";
  byId("employment").value = "";
  byId("activity-log").replaceChildren();
  log("Created 24 fictional adult records locally.");
  byId("status").textContent = "Ready. Run the demo agent to generate 8 new records and test 4 duplicates.";
  render();
}

byId("run-agent").addEventListener("click", async () => {
  if (running) return;
  running = true;
  byId("run-agent").disabled = true;
  byId("reset").disabled = true;
  byId("run-agent").textContent = "Simulating...";
  byId("status").textContent = "Generating a synthetic batch locally. No websites or AI services are contacted.";
  try {
    await new Promise((resolve) => setTimeout(resolve, 650));
    const incoming = [
      ...records.slice(0, 4),
      ...Array.from({ length: 8 }, (_, index) => createRecord(nextIndex + index)),
    ];
    const result = mergeRecords(records, incoming);
    records = result.records;
    duplicates += result.duplicates;
    nextIndex += 8;
    log(`Batch complete: 8 new records, ${result.duplicates} duplicate IDs blocked.`);
    byId("status").textContent = "Simulation complete. All records are fictional and above 18; no personal information was collected.";
    render();
  } catch (error) {
    console.error("Demo simulation failed:", error);
    byId("status").textContent = `Simulation failed: ${error.message}`;
  } finally {
    running = false;
    byId("run-agent").disabled = false;
    byId("reset").disabled = false;
    byId("run-agent").textContent = "Run demo agent";
  }
});

for (const id of ["search", "region", "employment"]) {
  byId(id).addEventListener(id === "search" ? "input" : "change", () => {
    page = 1;
    render();
  });
}
byId("previous").addEventListener("click", () => { page -= 1; render(); });
byId("next").addEventListener("click", () => { page += 1; render(); });
byId("reset").addEventListener("click", reset);
byId("export").addEventListener("click", () => {
  const fields = ["id", "firstName", "secondName", "age", "region", "employment", "sector", "employer", "contact", "source"];
  const quote = (value) => `"${String(value).replaceAll('"', '""')}"`;
  const content = [fields.map(quote).join(","), ...filteredRecords().map((record) => fields.map((field) => quote(record[field])).join(","))].join("\r\n");
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "wazi-fictional-records.csv";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  log("Exported the current filtered view as synthetic CSV.");
  byId("status").textContent = "Synthetic CSV download requested for the current filtered view.";
});

reset();
