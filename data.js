(function (root) {
  "use strict";
  const regions = ["Nairobi", "Coast", "Central", "Eastern", "North Eastern", "Nyanza", "Rift Valley", "Western"];

  function createRecord(index) {
    const employed = index % 3 !== 0;
    return {
      id: `DEMO-${String(index + 1).padStart(4, "0")}`,
      firstName: "Demo",
      secondName: `Person ${String(index + 1).padStart(3, "0")}`,
      age: 19 + index % 43,
      region: regions[index % regions.length],
      employment: employed ? "Employed" : "Not employed",
      sector: employed ? (index % 2 ? "Private" : "Public") : "Not applicable",
      employer: employed ? (index % 2 ? "Example Company (fictional)" : "Example Public Office (fictional)") : "Not applicable",
      contact: "Not collected",
      source: "Synthetic generator",
    };
  }

  function mergeRecords(existing, incoming) {
    const ids = new Set(existing.map((record) => record.id));
    const records = [...existing];
    let duplicates = 0;
    for (const record of incoming) {
      if (!record.id || !Number.isInteger(record.age) || record.age <= 18) {
        throw new Error("Every record must have an ID and an age above 18.");
      }
      if (ids.has(record.id)) {
        duplicates += 1;
      } else {
        ids.add(record.id);
        records.push(record);
      }
    }
    return { records, duplicates };
  }

  const api = { regions, createRecord, mergeRecords };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.DemoData = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
