import type {
  Chapter,
  MediaAsset,
  Publication,
} from "@atlashub/amf-content-schema";

export type ReaderCapabilities = {
  toc?: boolean;
  progress?: boolean;
  resume?: boolean;
  print?: boolean;
  media?: boolean;
  annotations?: boolean;
};

export type ReaderProgress = {
  publicationId: string;
  chapterId?: string;
  completedChapterIds: string[];
  percentage: number;
  updatedAt: string;
};

export interface ReaderProgressAdapter {
  load(publicationId: string): Promise<ReaderProgress | null>;
  save(progress: ReaderProgress): Promise<void>;
}

export type ReaderModel = {
  publication: Publication;
  chapters: Chapter[];
  mediaById: Map<string, MediaAsset>;
  capabilities: Required<ReaderCapabilities>;
};

const DEFAULT_CAPABILITIES: Required<ReaderCapabilities> = {
  toc: true,
  progress: true,
  resume: true,
  print: true,
  media: true,
  annotations: false,
};

export function createReaderModel(
  publication: Publication,
  capabilities: ReaderCapabilities = {},
): ReaderModel {
  return {
    publication,
    chapters: [...publication.chapters].sort((a, b) => a.order - b.order),
    mediaById: new Map(publication.media.map((media) => [media.id, media])),
    capabilities: { ...DEFAULT_CAPABILITIES, ...capabilities },
  };
}

export function readerProgressPercentage(
  completedChapterIds: string[],
  chapters: Chapter[],
): number {
  if (chapters.length === 0) return completedChapterIds.length > 0 ? 100 : 0;
  const ids = new Set(chapters.map((chapter) => chapter.id));
  const completed = new Set(completedChapterIds.filter((id) => ids.has(id)));
  return Math.round((completed.size / chapters.length) * 100);
}
