import {
  ContentManifestSchema, findManifestProgram,
  type Program, type ProgramUnit, type Publication,
} from "@atlashub-digital/amf-content-schema";
import type { ContentSource } from "./content.js";
import {
  conservativeAccessResolver, type AccessContext, type AccessDecision, type AccessResolver,
} from "./access.js";
import { createReaderModel, type ReaderModel } from "./webreader.js";

export type JourneyUnitModel = {
  unit: ProgramUnit;
  publications: Publication[];
  readers: ReaderModel[];
};
export type JourneyModel = {
  projectId: string;
  program: Program;
  units: JourneyUnitModel[];
};

export function createJourneyModel(input: unknown, ref: string, projectId: string): JourneyModel | null {
  const manifest = ContentManifestSchema.parse(input);
  if (manifest.project !== projectId) throw new Error("Journey project scope mismatch.");
  const program = findManifestProgram(manifest, ref);
  if (!program) return null;
  const publications = new Map(manifest.publications.map(p => [p.id, p]));
  const units = [...program.units].sort((a, b) => a.order - b.order).map(unit => {
    const resolved = unit.publicationRefs.map(id => {
      const publication = publications.get(id);
      if (!publication) throw new Error("Unresolved Journey Publication.");
      return publication;
    });
    return { unit, publications: resolved, readers: resolved.map(p => createReaderModel(p)) };
  });
  return { projectId, program, units };
}

// Use one validated snapshot. Separate getProgram/getPublication calls could mix releases.
export async function loadJourneyModel(source: ContentSource, ref: string, projectId: string) {
  return createJourneyModel(await source.getManifest(), ref, projectId);
}

export type JourneyAccessResult =
  | { allowed: true; model: JourneyModel; programDecision: AccessDecision; publicationDecisions: Record<string, AccessDecision> }
  | { allowed: false; projectId: string; programId: string; programDecision: AccessDecision; publicationDecisions: Record<string, AccessDecision> };

export async function authorizeJourney(
  model: JourneyModel, context: AccessContext,
  resolver: AccessResolver = conservativeAccessResolver,
): Promise<JourneyAccessResult> {
  const denied = { allowed: false as const, projectId: model.projectId, programId: model.program.id };
  if (context.projectId !== undefined && context.projectId !== model.projectId) {
    return { ...denied, programDecision: { allowed: false, reason: "denied" }, publicationDecisions: {} };
  }
  const programDecision = await resolver.resolve(model.program.access, context);
  if (!programDecision.allowed) return { ...denied, programDecision, publicationDecisions: {} };
  const unique = new Map(model.units.flatMap(unit => unit.publications).map(p => [p.id, p]));
  const entries = await Promise.all([...unique].map(async ([id, publication]) =>
    [id, await resolver.resolve(publication.access, context)] as const));
  const publicationDecisions = Object.fromEntries(entries);
  if (entries.some(([, decision]) => !decision.allowed)) {
    return { ...denied, programDecision, publicationDecisions };
  }
  return { allowed: true, model, programDecision, publicationDecisions };
}
