import assert from "node:assert/strict";
const base = "http://127.0.0.1:3000";
for (const path of ["/", "/records", "/benchmark"]) assert.equal((await fetch(base + path)).status, 200, path);
const { configured } = await (await fetch(base + "/api/status")).json();
const context = { country: "FJ", commodity: "tomatoes", stage: "transport", date: "2026-10-04", location: "Suva" };
const invalid = await fetch(base + "/api/extract", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ transcript: "", context }) });
assert.equal(invalid.status, 422);
const noAudio = await fetch(base + "/api/transcribe", { method: "POST", body: new FormData() });
assert.equal(noAudio.status, 422);
const response = await fetch(base + "/api/extract", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ transcript: "Started with 120 kg of tomatoes. After transport, 17 kg were rejected because of bruising. All 17 kg were composted. The quantities were weighed.", context }) });
if (!configured) {
  assert.equal(response.status, 503); assert.equal((await response.json()).code, "AI_NOT_CONFIGURED");
  console.log("Production pages and API validation/fallback passed. Live AI rehearsal skipped: no key configured.");
} else {
  assert.equal(response.status, 200, "Live extraction must succeed for rehearsal");
  const { extraction, issues } = await response.json();
  assert.equal(extraction.incoming.amount, 120); assert.equal(extraction.incoming.unit, "kg");
  assert.equal(extraction.affected.amount, 17); assert.equal(extraction.affected.unit, "kg");
  assert.equal(extraction.allocations.length, 1); assert.equal(extraction.allocations[0].destination, "composted"); assert.equal(extraction.allocations[0].quantity.amount, 17);
  assert.equal(extraction.measurement, "weighed"); assert.equal(issues.length, 0);
  console.log("Production pages, API validation and one live extraction rehearsal passed. Rehearse microphone transcription and five human benchmark pairs in the browser.");
}
