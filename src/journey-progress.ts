import type { AccessContext, AccessResolver } from "./access.js";
import { authorizeJourney, type JourneyModel, type JourneyUnitModel } from "./journey.js";

export type JourneyScope = { projectId: string; memberId: string; programId: string };
export type JourneyProgress = {
  scope: JourneyScope;
  revision: number;
  completedReads: { unitId: string; publicationId: string }[];
  completedActivityIds: string[];
  completedUnitIds: string[];
  updatedAt: string | null;
};

export interface JourneyProgressAdapter {
  load(scope: JourneyScope): Promise<JourneyProgress | null>;
  // Atomic compare-and-swap. null means no row. Persist exactly this scope.
  // Failed comparison must have no writes/events. No default adapter is provided.
  compareAndSwap(scope: JourneyScope, expectedRevision: number | null, next: JourneyProgress): Promise<boolean>;
}

export type JourneyProgressCommand =
  | { type: "complete-publication"; unitId: string; publicationId: string }
  | { type: "complete-activity"; unitId: string; activityId: string }
  | { type: "complete-unit"; unitId: string };

export function journeyScopeKey(scope: JourneyScope): string {
  if (Object.keys(scope).some(key => !["projectId", "memberId", "programId"].includes(key))) throw new Error("Unknown Journey scope field.");
  if (![scope.projectId, scope.memberId, scope.programId].every(id => typeof id === "string" && id.trim().length > 0)) {
    throw new Error("Journey scope requires project, member and program.");
  }
  return JSON.stringify([scope.projectId, scope.memberId, scope.programId]);
}
function checkScope(model: JourneyModel, scope: JourneyScope) {
  journeyScopeKey(scope);
  if (scope.projectId !== model.projectId || scope.programId !== model.program.id) {
    throw new Error("Journey scope mismatch.");
  }
}
function activities(unit: JourneyUnitModel) {
  return [...unit.unit.missions, ...unit.unit.reflections, ...unit.unit.checkIns];
}
function requirementsMet(unit: JourneyUnitModel, progress: JourneyProgress): boolean {
  return unit.publications.every(p => progress.completedReads.some(r => r.unitId === unit.unit.id && r.publicationId === p.id)) &&
    activities(unit).filter(a => a.required).every(a => progress.completedActivityIds.includes(a.id));
}
export function createJourneyProgress(model: JourneyModel, scope: JourneyScope): JourneyProgress {
  checkScope(model, scope);
  return { scope: { ...scope }, revision: 0, completedReads: [], completedActivityIds: [], completedUnitIds: [], updatedAt: null };
}

// Treat adapter output as untrusted. No silent transfer between members/projects.
export function validateJourneyProgress(model: JourneyModel, scope: JourneyScope, progress: JourneyProgress): void {
  checkScope(model, scope);
  if (Object.keys(progress).some(key => !["scope", "revision", "completedReads", "completedActivityIds", "completedUnitIds", "updatedAt"].includes(key))) {
    throw new Error("Unknown Journey progress field.");
  }
  if (journeyScopeKey(progress.scope) !== journeyScopeKey(scope)) throw new Error("Stored Journey scope mismatch.");
  if (!Number.isSafeInteger(progress.revision) || progress.revision < 0) throw new Error("Invalid Journey revision.");
  if (!Array.isArray(progress.completedReads) || !Array.isArray(progress.completedActivityIds) || !Array.isArray(progress.completedUnitIds)) {
    throw new Error("Invalid Journey completion data.");
  }
  const units = new Map(model.units.map(unit => [unit.unit.id, unit]));
  const activityIds = new Set(model.units.flatMap(unit => activities(unit)).map(a => a.id));
  const reads = new Set<string>();
  for (const read of progress.completedReads) {
    if (Object.keys(read).some(key => !["unitId", "publicationId"].includes(key))) throw new Error("Unknown Journey read field.");
    if (!units.get(read.unitId)?.publications.some(p => p.id === read.publicationId)) throw new Error("Unknown completed Publication.");
    const key = JSON.stringify([read.unitId, read.publicationId]);
    if (reads.has(key)) throw new Error("Duplicate completed Publication.");
    reads.add(key);
  }
  if (new Set(progress.completedActivityIds).size !== progress.completedActivityIds.length ||
      progress.completedActivityIds.some(id => !activityIds.has(id))) throw new Error("Invalid completed activity.");
  if (new Set(progress.completedUnitIds).size !== progress.completedUnitIds.length ||
      progress.completedUnitIds.some(id => !units.has(id) || !requirementsMet(units.get(id)!, progress))) {
    throw new Error("Invalid completed unit or unmet requirements.");
  }
  if (progress.updatedAt !== null && (typeof progress.updatedAt !== "string" || !Number.isFinite(Date.parse(progress.updatedAt)))) {
    throw new Error("Invalid Journey timestamp.");
  }
}

export function applyJourneyProgress(
  model: JourneyModel, scope: JourneyScope, current: JourneyProgress | null,
  command: JourneyProgressCommand, at: string,
): JourneyProgress {
  const progress = current ?? createJourneyProgress(model, scope);
  validateJourneyProgress(model, scope, progress);
  const unit = model.units.find(item => item.unit.id === command.unitId);
  if (!unit) throw new Error("Unknown Journey unit.");
  const next = structuredClone(progress);
  switch (command.type) {
    case "complete-publication":
      if (!unit.publications.some(p => p.id === command.publicationId)) throw new Error("Unknown Journey Publication.");
      if (next.completedReads.some(read => read.unitId === command.unitId && read.publicationId === command.publicationId)) return structuredClone(progress);
      next.completedReads.push({ unitId: command.unitId, publicationId: command.publicationId }); break;
    case "complete-activity":
      if (!activities(unit).some(a => a.id === command.activityId)) throw new Error("Unknown Journey activity.");
      if (next.completedActivityIds.includes(command.activityId)) return structuredClone(progress);
      next.completedActivityIds.push(command.activityId); break;
    case "complete-unit":
      if (!requirementsMet(unit, next)) throw new Error("Journey unit requirements are incomplete.");
      if (next.completedUnitIds.includes(command.unitId)) return structuredClone(progress);
      next.completedUnitIds.push(command.unitId); break;
    default:
      throw new Error("Unknown Journey operation.");
  }
  if (typeof at !== "string" || !Number.isFinite(Date.parse(at))) throw new Error("Invalid operation timestamp.");
  next.revision++;
  if (!Number.isSafeInteger(next.revision)) throw new Error("Journey revision overflow.");
  next.updatedAt = at;
  validateJourneyProgress(model, scope, next);
  return next;
}

export function journeyProgressSummary(model: JourneyModel, scope: JourneyScope, progress: JourneyProgress) {
  validateJourneyProgress(model, scope, progress);
  return {
    percentage: Math.round(100 * progress.completedUnitIds.length / model.units.length),
    completed: progress.completedUnitIds.length === model.units.length,
    nextUnitId: model.units.find(unit => !progress.completedUnitIds.includes(unit.unit.id))?.unit.id ?? null,
  };
}

export async function updateJourneyProgress(
  adapter: JourneyProgressAdapter, model: JourneyModel, scope: JourneyScope,
  command: JourneyProgressCommand,
  options: { context: AccessContext; resolver?: AccessResolver; now: () => string; maxAttempts?: number },
): Promise<JourneyProgress> {
  checkScope(model, scope);
  if (!options.context.authenticated || options.context.userId !== scope.memberId ||
      options.context.projectId !== scope.projectId) {
    throw new Error("Authenticated Journey member scope required.");
  }
  if (!(await authorizeJourney(model, options.context, options.resolver)).allowed) throw new Error("Journey access denied.");
  const attempts = options.maxAttempts ?? 3;
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > 10) throw new Error("Invalid CAS retry limit.");
  for (let attempt = 0; attempt < attempts; attempt++) {
    const current = await adapter.load({ ...scope });
    const next = applyJourneyProgress(model, scope, current, command, options.now());
    if (current && next.revision === current.revision) return next;
    if (await adapter.compareAndSwap({ ...scope }, current?.revision ?? null, structuredClone(next))) return next;
  }
  throw new Error("Journey progress concurrency conflict.");
}
