const test = require("node:test");
const assert = require("node:assert/strict");
const { createRecord, mergeRecords } = require("./data.js");

test("generated records are fictional, above 18, and have unique IDs", () => {
  const records = Array.from({ length: 1000 }, (_, index) => createRecord(index));
  assert.equal(new Set(records.map((record) => record.id)).size, 1000);
  assert.ok(records.every((record) => record.age > 18 && record.firstName === "Demo"));
  assert.ok(records.every((record) => record.contact === "Not collected"));
  assert.ok(records.every((record) => !("religion" in record) && !("nationalId" in record)));
});

test("merge blocks existing and within-batch duplicate IDs without mutating input", () => {
  const existing = [createRecord(0)];
  const result = mergeRecords(existing, [createRecord(0), createRecord(1), createRecord(1)]);
  assert.equal(result.records.length, 2);
  assert.equal(result.duplicates, 2);
  assert.equal(existing.length, 1);
});

test("different people can share names, employers and regions", () => {
  const first = createRecord(1);
  const second = { ...first, id: "DEMO-OTHER" };
  assert.equal(mergeRecords([first], [second]).records.length, 2);
});

test("invalid ages and missing identifiers are rejected", () => {
  for (const age of [18, 17, 0, 20.5, NaN]) {
    assert.throws(() => mergeRecords([], [{ ...createRecord(0), age }]), /above 18/);
  }
  assert.throws(() => mergeRecords([], [{ ...createRecord(0), id: "" }]), /ID/);
});

test("each simulated batch adds exactly eight records and blocks four duplicates", () => {
  let records = Array.from({ length: 24 }, (_, index) => createRecord(index));
  for (let batch = 0; batch < 3; batch += 1) {
    const incoming = [...records.slice(0, 4), ...Array.from({ length: 8 }, (_, index) => createRecord(24 + batch * 8 + index))];
    const result = mergeRecords(records, incoming);
    assert.equal(result.records.length, records.length + 8);
    assert.equal(result.duplicates, 4);
    records = result.records;
  }
});
