export type ConversationMode = "attendant" | "companion";

export type AgentProfile = {
  id: string;
  mode: ConversationMode;
  provider: string;
  agentRef: string;
  public: boolean;
  memory: "none" | "session" | "consented";
  humanHandoff?: boolean;
  tools?: string[];
  safetyProfile?: string;
  metadata?: Record<string, unknown>;
};

export function defineAgent<const T extends AgentProfile>(profile: T): T {
  if (profile.mode === "companion" && profile.public) {
    throw new Error("Companion agents must not be public by default.");
  }
  return profile;
}
