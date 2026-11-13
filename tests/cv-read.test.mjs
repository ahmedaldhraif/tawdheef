import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmdirSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readConnectedCv, validateCvResponse } from "../server/cv-read.mjs";

const goodResult = {
  structuredContent: { data: { cv: { name: "Fixture Candidate", skills: ["Research"], experience: [{ title: "Analyst", status: "in_progress" }] } } },
};
const makeFixture = t => {
  const dataDir = mkdtempSync(join(tmpdir(), "apply-tracker-cv-"));
  t.after(() => { for (const file of readdirSync(dataDir)) unlinkSync(join(dataDir, file)); rmdirSync(dataDir); });
  return { store: { dataDir }, cache: join(dataDir, "cv-cache.json") };
};

test("CV response guard refuses empty content and explicit empty structured results", () => {
  for (const result of [{}, { content: [] }, { content: [{ type: "text", text: "  " }] }, { structuredContent: {} }, { structuredContent: [] }, { structuredContent: { data: {} } }, { content: [{ type: "text", text: "{}" }] }]) {
    assert.throws(() => validateCvResponse(result), /empty response/);
  }
});

test("CV response guard refuses explicit pending and approval envelopes in structured or JSON text output", () => {
  for (const payload of [{ status: "pending" }, { data: { state: "approval_required" } }, { response: { status: "waiting for approval" } }, { approvalRequired: true }, { approval: { required: true } }]) {
    assert.throws(() => validateCvResponse({ structuredContent: payload }), /waiting for approval/);
    assert.throws(() => validateCvResponse({ content: [{ type: "text", text: JSON.stringify(payload) }] }), /waiting for approval/);
  }
});

test("CV response guard refuses provider errors without claiming usable CV data", () => {
  for (const result of [{ isError: true, content: [{ type: "text", text: "Denied" }] }, { structuredContent: { ok: false, error: "Not authorized" } }, { structuredContent: { data: { success: false } } }]) {
    assert.throws(() => validateCvResponse(result), /could not return/);
  }
});

test("a structured response cannot hide an explicit pending JSON text envelope", () => {
  assert.throws(() => validateCvResponse({...goodResult,content:[{type:'text',text:JSON.stringify({status:'pending_approval'})}]}), /waiting for approval/);
  assert.strictEqual(validateCvResponse(goodResult),goodResult);
});

test("a nonempty structured response is retained exactly without inspecting arbitrary CV history", async t => {
  const { store, cache } = makeFixture(t);
  let calls = 0;
  const result = await readConnectedCv({ store, connections: { callMapped: async (...args) => { calls++; assert.deepEqual(args, ["tabbio", "readCV", {}]); return goodResult; } }, clock: () => new Date("2026-11-13T08:00:00Z") });
  assert.strictEqual(result, goodResult);
  assert.equal(calls, 1);
  assert.deepEqual(JSON.parse(readFileSync(cache, "utf8")), { fetchedAt: "2026-11-13T08:00:00.000Z", result: goodResult });
  assert.deepEqual(readdirSync(store.dataDir), ["cv-cache.json"]);
});

test("nonempty plain text and JSON CV responses remain supported without a guessed CV schema", () => {
  for (const text of ["Fixture Candidate\nSkills: research", JSON.stringify({ cv: { name: "Fixture Candidate" } })]) {
    const result = { content: [{ type: "text", text }] };
    assert.strictEqual(validateCvResponse(result), result);
  }
});

test("failed or pending reads preserve the last good response and timestamp", async t => {
  const { store, cache } = makeFixture(t);
  await readConnectedCv({ store, connections: { callMapped: async () => goodResult } });
  const saved = readFileSync(cache, "utf8");
  for (const response of [{ content: [] }, { structuredContent: { status: "pending", approvalId: "fixture-only" } }, { isError: true }]) {
    await assert.rejects(readConnectedCv({ store, connections: { callMapped: async () => response } }));
    assert.equal(readFileSync(cache, "utf8"), saved);
  }
  await assert.rejects(readConnectedCv({ store, connections: { callMapped: async () => { throw new Error("Fixture connection failure"); } } }), /Fixture connection failure/);
  assert.equal(readFileSync(cache, "utf8"), saved);
});

test("an empty first read creates no misleading cache", async t => {
  const { store, cache } = makeFixture(t);
  await assert.rejects(readConnectedCv({ store, connections: { callMapped: async () => ({ content: [] }) } }), /empty response/);
  assert.equal(existsSync(cache), false);
  assert.deepEqual(readdirSync(store.dataDir), []);
});
