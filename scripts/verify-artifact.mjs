import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";

const root = process.cwd();
const report = JSON.parse(readFileSync(".artifacts/core-artifact.json", "utf8"));
const archive = path.resolve(".artifacts", report.filename);
assert.equal(createHash("sha256").update(readFileSync(archive)).digest("hex"), report.sha256);
assert.ok(report.files.includes("dist/index.js"));
assert.ok(report.files.includes("dist/index.d.ts"));
assert.ok(!report.files.some(file => file.startsWith("src/") || file.startsWith("tests/")));
const schema = process.env.AMF_SCHEMA_ARTIFACT;
if (!schema || !existsSync(schema)) throw new Error("AMF_SCHEMA_ARTIFACT must identify a prebuilt Schema tarball.");
const consumer = mkdtempSync(path.join(tmpdir(), "amf-core-consumer-"));
try {
  writeFileSync(path.join(consumer, "package.json"), JSON.stringify({ name: "artifact-consumer-test", version: "1.0.0", private: true, type: "module" }));
  execFileSync("npm", ["install", "--ignore-scripts", "--package-lock=false", "--no-audit", "--no-fund", archive, path.resolve(schema)], { cwd: consumer, stdio: "inherit" });
  const installed = JSON.parse(readFileSync(path.join(consumer, "node_modules/@atlashub-digital/amf-experience-core/package.json"), "utf8"));
  for (const hook of ["prepare", "preinstall", "install", "postinstall"]) assert.equal(installed.scripts?.[hook], undefined);
  assert.equal(installed.peerDependencies["@atlashub-digital/amf-content-schema"], "0.2.0");
  assert.ok(!JSON.stringify(installed.dependencies ?? {}).includes("github:"));
  writeFileSync(path.join(consumer, "smoke.mjs"), `
import assert from "node:assert/strict";
import { createManifestContentSource, loadJourneyModel, createJourneyProgress, applyJourneyProgress, authorizeJourney } from "@atlashub-digital/amf-experience-core";
import { readFileSync } from "node:fs";
const raw = JSON.parse(readFileSync(process.argv[2], "utf8"));
const source = createManifestContentSource(raw);
const model = await loadJourneyModel(source, "sample-journey", raw.project);
assert.equal(model.units.length, 7);
assert.equal((await authorizeJourney(model, { authenticated: false })).allowed, true);
const scope = { projectId: raw.project, memberId: "member", programId: model.program.id };
const progress = applyJourneyProgress(model, scope, createJourneyProgress(model, scope), { type: "complete-activity", unitId: "day-1", activityId: "mission-1" }, "2026-10-12T00:00:00Z");
assert.equal(progress.revision, 1);
console.log("PASS built artifact ESM import and Journey");
`);
  execFileSync(process.execPath, [path.join(consumer, "smoke.mjs"), path.join(root, "fixtures/journey-manifest.json")], { cwd: consumer, stdio: "inherit" });
  writeFileSync(path.join(consumer, "consumer.ts"), `
import type { JourneyModel, JourneyScope, JourneyProgressAdapter, ProgramContentSource } from "@atlashub-digital/amf-experience-core";
const scope: JourneyScope = { projectId: "project", memberId: "member", programId: "program" };
export type Contract = [JourneyModel, JourneyProgressAdapter, ProgramContentSource];
export { scope };
`);
  writeFileSync(path.join(consumer, "tsconfig.json"), JSON.stringify({ compilerOptions: { target: "ES2022", module: "NodeNext", moduleResolution: "NodeNext", strict: true, noEmit: true, skipLibCheck: false }, files: ["consumer.ts"] }));
  const require = createRequire(path.join(root, "package.json"));
  execFileSync(process.execPath, [require.resolve("typescript/bin/tsc"), "--project", path.join(consumer, "tsconfig.json")], { cwd: consumer, stdio: "inherit" });
  console.log("PASS built artifact types; no build or install hook executed in consumer");
} finally {
  rmSync(consumer, { recursive: true, force: true });
}
