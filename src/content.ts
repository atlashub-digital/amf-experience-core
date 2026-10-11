import type {
  ContentManifest,
  Publication,
} from "@atlashub/amf-content-schema";

export interface ContentSource {
  id: string;
  getManifest(): Promise<ContentManifest>;
  getPublication(ref: string): Promise<Publication | null>;
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
