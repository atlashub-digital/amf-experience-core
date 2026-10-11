export const AMF_MODULE_KEYS = [
  "library",
  "webreader",
  "auth",
  "commerce",
  "community",
  "programs",
  "attendant",
  "companion",
  "analytics",
] as const;

export type AmfModuleKey = (typeof AMF_MODULE_KEYS)[number];

export type ModuleState =
  | boolean
  | {
      enabled: boolean;
      adapter?: string;
      options?: Record<string, unknown>;
    };

export type ModuleManifest = Partial<Record<AmfModuleKey, ModuleState>>;

export function moduleEnabled(manifest: ModuleManifest, key: AmfModuleKey) {
  const value = manifest[key];
  return typeof value === "boolean" ? value : Boolean(value?.enabled);
}

export function defineModules<const T extends ModuleManifest>(modules: T): T {
  return modules;
}
