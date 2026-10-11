import type { AccessPolicy } from "@atlashub/amf-content-schema";

export type AccessContext = {
  authenticated: boolean;
  userId?: string;
  entitlementRefs?: string[];
  productRefs?: string[];
  planRefs?: string[];
  campaignRefs?: string[];
  metadata?: Record<string, unknown>;
};

export type AccessDecision = {
  allowed: boolean;
  reason:
    | "public"
    | "authenticated"
    | "granted"
    | "authentication-required"
    | "resolver-required"
    | "denied";
  evidence?: string[];
};

export interface AccessResolver {
  resolve(policy: AccessPolicy, context: AccessContext): Promise<AccessDecision>;
}

export const conservativeAccessResolver: AccessResolver = {
  async resolve(policy, context) {
    if (policy.mode === "public") {
      return { allowed: true, reason: "public" };
    }

    if (policy.mode === "free-account") {
      return context.authenticated
        ? { allowed: true, reason: "authenticated" }
        : { allowed: false, reason: "authentication-required" };
    }

    // Paid, campaign, membership and manual grants must be verified by a
    // project adapter. The core never infers paid access.
    return { allowed: false, reason: "resolver-required" };
  },
};
