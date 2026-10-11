# AGENTS.md

## Mission

Build reusable AMF product primitives without turning the core into a project-specific application.

## Codex may

- add backwards-compatible module contracts;
- improve headless reader behavior;
- add adapters behind explicit interfaces;
- add tests and pilot fixtures;
- improve theme and configuration contracts.

## Codex must not

- add brand-specific colors, copy or assets;
- embed domains or secrets;
- hardcode Stripe, XPayments, Supabase or Vercel into generic modules;
- grant paid access by inference;
- merge payment/auth/security changes without review;
- convert headless contracts into a single mandatory UI.

## Sensitive boundaries

Changes under access, commerce, auth, conversation safety and provisioning require explicit human review.

## Workflow

Branch -> tests -> CI -> PR -> review. Never auto-merge a security-sensitive change.
