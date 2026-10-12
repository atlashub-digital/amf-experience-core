# AMF Experience Core

Headless, reusable product primitives for AMF-powered projects.

The core defines stable contracts for modules, theming, content sources, access resolution, WebReader state and conversational surfaces. It intentionally does **not** impose a visual design.

## v0.1 scope

- Project module registry
- Theme contract
- Content source adapter
- Access resolver contract
- Headless WebReader model
- Attendant / Companion profiles
- Pilot compatibility guidance

The first consumers are expected to be AtlasHub Editions and EspelhoMeu, followed by MyTrainX, LIA / LeveLab and MyPets.

## v0.2 — Program/Journey and explicit progress

- ProgramContentSource and validated manifest snapshots.
- JourneyModel with sorted units, resolved Publications/ReaderModels and activities.
- Shared AccessResolver boundary for Program + Publications, without paid-access inference.
- Project/member/program-scoped progress, idempotent completion and explicit atomic CAS adapter.
- No UI, project branding, persistence, response storage or implicit saving.

[Journey contracts and security boundaries](docs/JOURNEY.md).
[Compiled artifact preparation and consumer checks](docs/ARTIFACTS.md).

The package is prepared as a built archive (dist + types), with Schema **0.2.0**
as an exact peer. There is no Git dependency or consumer prepare/build hook.
CI tests and produces review artifacts; it does not publish a release.
