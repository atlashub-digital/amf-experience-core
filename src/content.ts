import type {
  ContentManifest,
  Publication,
  Program,
} from "@atlashub/amf-content-schema";
import { ContentManifestSchema, findManifestProgram, listManifestPrograms } from "@atlashub/amf-content-schema";

export interface ContentSource {
  id: string;
  getManifest(): Promise<ContentManifest>;
  getPublication(ref: string): Promise<Publication | null>;
  listPrograms?(): Promise<Program[]>;
  getProgram?(ref: string): Promise<Program | null>;
  getTextAsset?(path: string): Promise<string>;
}

export type ContentSourceFactory<TConfig = unknown> = (
  config: TConfig,
) => ContentSource;

export function findPublication(
  manifest: ContentManifest,
  ref: string,
): Publication | null {
  return (
    manifest.publications.find(
      (publication) => publication.id === ref || publication.slug === ref,
    ) ?? null
  );
}

export interface ProgramContentSource extends ContentSource {
  listPrograms(): Promise<Program[]>;
  getProgram(ref: string): Promise<Program | null>;
}

export function createManifestContentSource(input: unknown, id = "manifest"): ProgramContentSource {
  const manifest = ContentManifestSchema.parse(input);
  return {
    id,
    async getManifest() { return structuredClone(manifest); },
    async getPublication(ref) { return structuredClone(findPublication(manifest, ref)); },
    async listPrograms() { return structuredClone(listManifestPrograms(manifest)); },
    async getProgram(ref) { return structuredClone(findManifestProgram(manifest, ref)); },
  };
}
