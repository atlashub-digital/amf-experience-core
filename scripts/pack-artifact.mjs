import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

for (const file of ["dist/index.js", "dist/index.d.ts", "dist/journey.js", "dist/journey-progress.d.ts"]) {
  if (!existsSync(file)) throw new Error("Missing built artifact: " + file);
}
const output = path.resolve(".artifacts");
mkdirSync(output, { recursive: true });
const result = JSON.parse(execFileSync("npm", [
  "pack", "--ignore-scripts", "--json", "--pack-destination", output,
], { encoding: "utf8" }))[0];
const archive = path.join(output, result.filename);
const sha256 = createHash("sha256").update(readFileSync(archive)).digest("hex");
writeFileSync(path.join(output, result.filename + ".sha256"), sha256 + "  " + result.filename + "\n");
writeFileSync(path.join(output, "core-artifact.json"), JSON.stringify({
  name: result.name, version: result.version, filename: result.filename,
  sha256, gitSha: process.env.GITHUB_SHA ?? null, schemaVersion: "0.2.0",
  files: result.files.map(file => file.path),
}, null, 2) + "\n");
console.log("Built artifact: " + result.filename + " sha256=" + sha256);
