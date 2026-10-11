import type { AgentProfile } from "./conversation.js";
import type { ModuleManifest } from "./modules.js";
import type { ThemeContract } from "./theme.js";

export type ProjectContract = {
  id: string;
  name: string;
  locale: string;
  domains?: {
    web?: string;
    api?: string;
  };
  modules: ModuleManifest;
  theme: ThemeContract;
  agents?: AgentProfile[];
  metadata?: Record<string, unknown>;
};

export function defineProject<const T extends ProjectContract>(project: T): T {
  return project;
}
