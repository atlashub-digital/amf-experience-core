# Journey primitives — v0.2

## Boundaries and compatibility

Programs are canonical Schema contracts, not Publications or UI components.
The approved Schema is 0.2.0 (source provenance:
5e4381ee896c8e468aeba876120d7816dcb63fcc). Core consumers supply that built peer artifact.
No content contract is copied/redefined here. No project-specific UI/copy,
storage, calendar unlocking, payments or provider logic is implemented.

ContentSource gains optional listPrograms/getProgram methods, preserving old
implementations. ProgramContentSource requires both. createManifestContentSource
validates supplied data and returns independent snapshots, without I/O or persistence.
Legacy manifests list no Programs. Git/CMS/database adapters can implement the
same interfaces; their transport does not change the Journey model.

## Resolution and ordering

createJourneyModel(input, ref, projectId) validates a full manifest and verifies
project scope. A missing Program returns null; invalid references or wrong
project throw. Program lookup uses stable id or slug; Publication refs are exact ids.
Units sort by order without changing source arrays. Publications retain the
unit's editorial reference order; ReaderModels sort each Publication's chapters.
Mission/reflection/check-in templates are exposed in unit, including required flags.

loadJourneyModel uses one validated getManifest snapshot, rather than making
separate calls that could mix releases. Models are trusted server-side editorial
data; never serialize them before checking access.

## Access — security-sensitive human review required

authorizeJourney applies the same AccessResolver to Program and every distinct
referenced Publication. The default conservative resolver handles public and
free-account only; it never infers paid/campaign/membership access from ids.
Explicit requiresAuth denies anonymous access even for public policy.

The default Journey boundary is all-or-nothing: a denied Program or Publication
returns decisions and ids only, with no model or content body. This does not
create a chapter preview or partial-access policy. A project can implement a
reviewed resolver; only a trusted server session may populate AccessContext.
A supplied mismatching projectId is denied. Schema status is editorial; the
project's publication/preview boundary must decide which statuses to expose.

## Progress and scope

JourneyScope has projectId, memberId and programId. Empty identifiers reject.
The scope key encodes an ordered JSON tuple, avoiding delimiter collisions.
JourneyProgress tracks:
- completed Publication reads per unit (a reused guide may be read on each day);
- completed activity ids (shared Program-wide namespace);
- completed unit ids;
- monotonic revision and updatedAt.

No reflection/check-in answer is stored. Marking an activity complete means
the caller asserts that it was completed; private answer validation/storage and
consent belong in a reviewed project adapter, not the content schema.

createJourneyProgress creates a value only. applyJourneyProgress is pure:
it validates scope/known ids and applies one explicit completion operation.
Repeating a completion returns equivalent state with the same revision/timestamp.
Unknown operations/ids, foreign progress, duplicates, invalid revisions or
unmet unit requirements fail closed. Unit completion requires every referenced
read and all required missions/reflections/check-ins; optional prompts do not block.
Journey progress is equal-weight completed units, not a beauty/health score.
The next unit is the first incomplete unit in canonical order; no hidden time gate.

Editorial changes keep stable ids. If a release removes ids or changes required
activities, the persistence adapter must reconcile/migrate old progress explicitly.
The core rejects incompatible stored completion instead of silently granting it.

## Explicit persistence and concurrency

There is no built-in persistent or browser-storage adapter, no global progress
map, automatic saving, timer or background job. JourneyProgressAdapter specifies
load(scope) and atomic compareAndSwap(scope, expectedRevision, next).
null expected revision means no existing row. CAS failure has no writes/events.

updateJourneyProgress is the only orchestration helper that invokes that adapter,
and only when explicitly called with it. It requires a trusted authenticated
AccessContext whose userId/memberId and projectId match the scope, then checks
Program/Publication access before reading/writing. Adapter output is validated
before a write. Duplicate operations do not call CAS. Concurrent changes reload
and retry boundedly (default 3, max 10) without overwriting another completion.

Adapters must enforce server authorization and project/member row isolation at
storage boundaries. Scope fields and pure completion helpers are not an auth
system or entitlement evidence. A storage implementation must provide genuine
atomic CAS; read-then-write is insufficient. Successful CAS events, if any, must
be idempotent/transactional in that adapter. No event bus is built into the core.

## Reproduce and review

CI tests Node 22/24 with the approved Schema built upstream on the publisher side,
then typecheck/tests/build and a clean-consumer artifact smoke/typecheck.
See ARTIFACTS.md for the explicit build/pack procedure.

Tests cover seven-day resolution/completion, legacy source compatibility,
ordering, unknown refs, required/optional activities, access denials,
member/project separation, duplicate operations, CAS retries and conflict limits.

This PR does not update any pilot, merge, publish packages or release production.
