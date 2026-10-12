import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { ContentManifestSchema } from "@atlashub/amf-content-schema";
import {
  createManifestContentSource, createJourneyModel, loadJourneyModel,
  authorizeJourney, conservativeAccessResolver,
  createJourneyProgress, applyJourneyProgress, journeyProgressSummary,
  updateJourneyProgress, journeyScopeKey,
  type ContentSource, type JourneyScope, type JourneyProgress, type JourneyProgressAdapter,
} from "../src/index.js";

function rawFixture() {
  return JSON.parse(readFileSync(new URL("../fixtures/journey-manifest.json", import.meta.url), "utf8"));
}
function setup() {
  const raw = rawFixture();
  const model = createJourneyModel(raw, "sample-journey", raw.project)!;
  const scope = { projectId: raw.project, memberId: "member-a", programId: model.program.id };
  const context = { authenticated: true, userId: scope.memberId, projectId: scope.projectId };
  return { raw, model, scope, context };
}
const time = "2026-10-12T00:00:00Z";
function memoryAdapter() {
  const rows = new Map<string, JourneyProgress>();
  let writes = 0;
  const adapter: JourneyProgressAdapter = {
    async load(scope) { return structuredClone(rows.get(journeyScopeKey(scope)) ?? null); },
    async compareAndSwap(scope, expected, next) {
      const key = journeyScopeKey(scope);
      if ((rows.get(key)?.revision ?? null) !== expected) return false;
      assert.equal(journeyScopeKey(next.scope), key);
      rows.set(key, structuredClone(next)); writes++; return true;
    },
  };
  return { adapter, writes: () => writes };
}

test("ProgramContentSource lists/resolves Programs and returns independent snapshots", async () => {
  const raw = rawFixture();
  const source = createManifestContentSource(raw);
  assert.equal((await source.listPrograms()).length, 1);
  assert.equal((await source.getProgram("seven-days-of-observation"))?.id, "sample-journey");
  assert.equal(await source.getProgram("missing"), null);
  raw.programs[0].title = "changed original";
  const first = await source.getManifest();
  first.publications[0].title = "changed returned";
  assert.notEqual((await source.getManifest()).publications[0].title, "changed returned");
  assert.notEqual((await source.getProgram("sample-journey"))?.title, "changed original");
});

test("legacy ContentSource remains assignable and v0.1 lists no Programs", async () => {
  const legacy = createManifestContentSource({ schemaVersion: "0.1", project: "legacy", publications: [] });
  assert.deepEqual(await legacy.listPrograms(), []);
  const source: ContentSource = {
    id: "legacy", getManifest: () => legacy.getManifest(), async getPublication() { return null; },
  };
  assert.equal(await loadJourneyModel(source, "missing", "legacy"), null);
});

test("Journey sorts units and Reader chapters without mutating editorial input", () => {
  const raw = rawFixture();
  raw.programs[0].units.reverse();
  raw.publications[1].chapters.reverse();
  const model = createJourneyModel(raw, "sample-journey", raw.project)!;
  assert.deepEqual(model.units.map(u => u.unit.kind === "day" ? u.unit.day : null), [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(raw.programs[0].units[0].day, 7);
  assert.equal(raw.publications[1].chapters[0].order, 1);
  assert.deepEqual(model.units[1].readers[0].chapters.map(c => c.order), [0, 1]);
  assert.equal(model.units[0].unit.missions[0].id, "mission-1");
  assert.equal(model.units[0].unit.reflections[0].id, "reflection-1");
  assert.equal(model.units[0].unit.checkIns[0].id, "checkin-1");
});

test("Journey resolves publications in editorial reference order, from one snapshot", async () => {
  const raw = rawFixture();
  raw.programs[0].units[0].publicationRefs = ["sample-guide", "sample-article"];
  const source: ContentSource = {
    id: "snapshot", async getManifest() { return ContentManifestSchema.parse(raw); },
    async getPublication() { throw new Error("Must not mix catalog releases."); },
  };
  const model = (await loadJourneyModel(source, "sample-journey", raw.project))!;
  assert.deepEqual(model.units[0].publications.map(p => p.id), ["sample-guide", "sample-article"]);
});

test("Journey rejects wrong project and missing references", () => {
  const { raw } = setup();
  assert.throws(() => createJourneyModel(raw, "sample-journey", "other-project"), /scope/);
  raw.programs[0].units[0].publicationRefs = ["missing"];
  assert.throws(() => createJourneyModel(raw, "sample-journey", raw.project));
});

test("public Program and Publications authorize consistently", async () => {
  const { model } = setup();
  const decision = await authorizeJourney(model, { authenticated: false });
  assert.equal(decision.allowed, true);
  assert.equal(Object.keys(decision.publicationDecisions).length, 2);
});

test("requiresAuth overrides public for anonymous access", async () => {
  assert.equal((await conservativeAccessResolver.resolve({ mode: "public", requiresAuth: true }, { authenticated: false })).allowed, false);
  assert.equal((await conservativeAccessResolver.resolve({ mode: "public", requiresAuth: true }, { authenticated: true })).allowed, true);
});

test("denied Program reveals no model or publication bodies", async () => {
  const { raw } = setup(); raw.programs[0].access = { mode: "free-account" };
  const model = createJourneyModel(raw, "sample-journey", raw.project)!;
  const result = await authorizeJourney(model, { authenticated: false });
  assert.equal(result.allowed, false);
  assert.equal("model" in result, false);
  assert.deepEqual(result.publicationDecisions, {});
  assert.ok(!JSON.stringify(result).includes("Uma pequena pausa"));
});

test("one gated Publication denies the Journey without inferring entitlement", async () => {
  const { raw } = setup(); raw.publications[1].access = { mode: "one-time", productRefs: ["p"] };
  const model = createJourneyModel(raw, "sample-journey", raw.project)!;
  const result = await authorizeJourney(model, { authenticated: true, productRefs: ["p"] });
  assert.equal(result.allowed, false); assert.equal("model" in result, false);
});

test("wrong project context denies even public content", async () => {
  const { model } = setup();
  assert.equal((await authorizeJourney(model, { authenticated: true, projectId: "other" })).allowed, false);
});

test("all reference access is evaluated once and adapter grants are explicit", async () => {
  const { model } = setup();
  let calls = 0;
  const result = await authorizeJourney(model, { authenticated: true }, { async resolve() { calls++; return { allowed: true, reason: "granted" }; } });
  assert.equal(result.allowed, true); assert.equal(calls, 3);
});

test("completion is pure and idempotent, with stable revisions/timestamps", () => {
  const { model, scope } = setup();
  const initial = createJourneyProgress(model, scope);
  const command = { type: "complete-activity" as const, unitId: "day-1", activityId: "mission-1" };
  const first = applyJourneyProgress(model, scope, initial, command, time);
  const second = applyJourneyProgress(model, scope, first, command, "2026-10-13T00:00:00Z");
  assert.deepEqual(first, second); assert.equal(first.revision, 1);
  assert.deepEqual(initial.completedActivityIds, []);
});

test("unit requires its reads and all required activities; optional prompts do not block", () => {
  const { model, scope } = setup();
  let progress = createJourneyProgress(model, scope);
  assert.throws(() => applyJourneyProgress(model, scope, progress, { type: "complete-unit", unitId: "day-1" }, time), /incomplete/);
  progress = applyJourneyProgress(model, scope, progress, { type: "complete-publication", unitId: "day-1", publicationId: "sample-article" }, time);
  assert.throws(() => applyJourneyProgress(model, scope, progress, { type: "complete-unit", unitId: "day-1" }, time), /incomplete/);
  progress = applyJourneyProgress(model, scope, progress, { type: "complete-activity", unitId: "day-1", activityId: "mission-1" }, time);
  progress = applyJourneyProgress(model, scope, progress, { type: "complete-unit", unitId: "day-1" }, time);
  assert.equal(journeyProgressSummary(model, scope, progress).percentage, 14);
  assert.equal(journeyProgressSummary(model, scope, progress).nextUnitId, "day-2");
  assert.deepEqual(applyJourneyProgress(model, scope, progress, { type: "complete-unit", unitId: "day-1" }, time), progress);
});

test("seven-day completion reaches 100; reused reads are scoped to each unit", () => {
  const { model, scope } = setup(); let progress = createJourneyProgress(model, scope);
  for (const item of model.units) {
    for (const publication of item.publications) progress = applyJourneyProgress(model, scope, progress, { type: "complete-publication", unitId: item.unit.id, publicationId: publication.id }, time);
    for (const activity of [...item.unit.missions, ...item.unit.reflections, ...item.unit.checkIns]) {
      progress = applyJourneyProgress(model, scope, progress, { type: "complete-activity", unitId: item.unit.id, activityId: activity.id }, time);
    }
    progress = applyJourneyProgress(model, scope, progress, { type: "complete-unit", unitId: item.unit.id }, time);
  }
  assert.deepEqual(journeyProgressSummary(model, scope, progress), { percentage: 100, completed: true, nextUnitId: null });
  assert.equal(progress.completedReads.length, 7);
});

test("unknown unit/read/activity and invalid time cannot mutate progress", () => {
  const { model, scope } = setup(); const initial = createJourneyProgress(model, scope);
  assert.throws(() => applyJourneyProgress(model, scope, initial, { type: "complete-unit", unitId: "missing" }, time));
  assert.throws(() => applyJourneyProgress(model, scope, initial, { type: "complete-publication", unitId: "day-1", publicationId: "missing" }, time));
  assert.throws(() => applyJourneyProgress(model, scope, initial, { type: "complete-activity", unitId: "day-1", activityId: "mission-2" }, time));
  assert.throws(() => applyJourneyProgress(model, scope, initial, { type: "complete-activity", unitId: "day-1", activityId: "mission-1" }, "invalid"));
  assert.equal(initial.revision, 0);
});

test("scope keys do not collide on delimiter-like ids", () => {
  const a: JourneyScope = { projectId: "a:b", memberId: "c", programId: "d" };
  const b: JourneyScope = { projectId: "a", memberId: "b:c", programId: "d" };
  assert.notEqual(journeyScopeKey(a), journeyScopeKey(b));
  assert.throws(() => journeyScopeKey({ ...a, memberId: "" }));
});

test("explicit adapter writes once for duplicate completion and isolates members", async () => {
  const { model, scope, context } = setup(); const store = memoryAdapter();
  const command = { type: "complete-activity" as const, unitId: "day-1", activityId: "mission-1" };
  const first = await updateJourneyProgress(store.adapter, model, scope, command, { context, now: () => time });
  const duplicate = await updateJourneyProgress(store.adapter, model, scope, command, { context, now: () => "2026-10-13T00:00:00Z" });
  assert.deepEqual(first, duplicate); assert.equal(store.writes(), 1);
  const other = { ...scope, memberId: "member-b" };
  assert.equal(await store.adapter.load(other), null);
});

test("explicit adapter isolates projects with the same Program/member ids", async () => {
  const { model, scope, context, raw } = setup(); const store = memoryAdapter();
  await updateJourneyProgress(store.adapter, model, scope, { type: "complete-activity", unitId: "day-1", activityId: "mission-1" }, { context, now: () => time });
  raw.project = "project-b"; const otherModel = createJourneyModel(raw, "sample-journey", raw.project)!;
  const other = { ...scope, projectId: "project-b" };
  assert.equal(await store.adapter.load(other), null);
  assert.throws(() => applyJourneyProgress(otherModel, other, createJourneyProgress(model, scope), { type: "complete-unit", unitId: "day-1" }, time), /scope/);
});

test("wrong authenticated member, denied access and cross-scope adapter output never write", async () => {
  const { model, scope, context, raw } = setup(); const store = memoryAdapter();
  const command = { type: "complete-activity" as const, unitId: "day-1", activityId: "mission-1" };
  await assert.rejects(() => updateJourneyProgress(store.adapter, model, scope, command, { context: { ...context, userId: "other" }, now: () => time }));
  raw.programs[0].access = { mode: "subscription" };
  await assert.rejects(() => updateJourneyProgress(store.adapter, createJourneyModel(raw, "sample-journey", raw.project)!, scope, command, { context, now: () => time }), /denied/);
  const wrong = createJourneyProgress(model, { ...scope, memberId: "other" });
  const adapter = { ...store.adapter, async load() { return wrong; } };
  await assert.rejects(() => updateJourneyProgress(adapter, model, scope, command, { context, now: () => time }), /scope/);
  assert.equal(store.writes(), 0);
});

test("concurrent completion uses CAS retries without lost updates", async () => {
  const { model, scope, context } = setup(); const store = memoryAdapter();
  await Promise.all(["mission-1", "reflection-1"].map(activityId =>
    updateJourneyProgress(store.adapter, model, scope, { type: "complete-activity", unitId: "day-1", activityId }, { context, now: () => time })));
  const progress = (await store.adapter.load(scope))!;
  assert.deepEqual(new Set(progress.completedActivityIds), new Set(["mission-1", "reflection-1"]));
  assert.equal(progress.revision, 2);
});

test("CAS conflicts stop at the explicit retry bound", async () => {
  const { model, scope, context } = setup(); let attempts = 0;
  const adapter: JourneyProgressAdapter = { async load() { return null; }, async compareAndSwap() { attempts++; return false; } };
  await assert.rejects(() => updateJourneyProgress(adapter, model, scope, { type: "complete-activity", unitId: "day-1", activityId: "mission-1" }, { context, now: () => time, maxAttempts: 2 }), /concurrency/);
  assert.equal(attempts, 2);
});

test("required reflections/check-ins gate unit completion; contexts must name project", async () => {
  const { raw, scope, context } = setup();
  raw.programs[0].units[0].reflections[0].required = true;
  raw.programs[0].units[0].checkIns[0].required = true;
  const model = createJourneyModel(raw, "sample-journey", raw.project)!;
  let progress = applyJourneyProgress(model, scope, null, { type: "complete-publication", unitId: "day-1", publicationId: "sample-article" }, time);
  progress = applyJourneyProgress(model, scope, progress, { type: "complete-activity", unitId: "day-1", activityId: "mission-1" }, time);
  assert.throws(() => applyJourneyProgress(model, scope, progress, { type: "complete-unit", unitId: "day-1" }, time));
  progress = applyJourneyProgress(model, scope, progress, { type: "complete-activity", unitId: "day-1", activityId: "reflection-1" }, time);
  assert.throws(() => applyJourneyProgress(model, scope, progress, { type: "complete-unit", unitId: "day-1" }, time));
  progress = applyJourneyProgress(model, scope, progress, { type: "complete-activity", unitId: "day-1", activityId: "checkin-1" }, time);
  assert.equal(applyJourneyProgress(model, scope, progress, { type: "complete-unit", unitId: "day-1" }, time).completedUnitIds.length, 1);
  const store = memoryAdapter();
  await assert.rejects(() => updateJourneyProgress(store.adapter, model, scope, { type: "complete-activity", unitId: "day-1", activityId: "mission-1" }, { context: { authenticated: true, userId: context.userId }, now: () => time }));
  assert.equal(store.writes(), 0);
});

test("adapter progress cannot smuggle private answers into completion state", async () => {
  const { model, scope, context } = setup(); const store = memoryAdapter();
  const progress = createJourneyProgress(model, scope);
  const forged = Object.assign(progress, { answers: "private data outside this contract" });
  const adapter = { ...store.adapter, async load() { return forged; } };
  await assert.rejects(() => updateJourneyProgress(adapter, model, scope, { type: "complete-activity", unitId: "day-1", activityId: "mission-1" }, { context, now: () => time }), /Unknown Journey progress field/);
  assert.equal(store.writes(), 0);
});
