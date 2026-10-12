# Built artifact preparation (no release)

## Decision

Core 0.2.0 ships dist ESM + declaration files. It has no prepare, preinstall,
install or postinstall hook, and no Git dependency. Schema is an exact 0.2.0 peer.
The final registry/hosting, publication credentials and release procedure are
outside this PR. Do not deploy a source Git checkout as a consumer dependency.

Core's runtime imports only the Schema package name. Transport is independent
of Journey logic: a consumer may receive the approved compiled artifacts from a
future registry or versioned artifact service, without changing those primitives.

## Publisher-side preparation

Build the approved Schema separately, from immutable source commit
3cf56c55821cb9645578382ad0873078fea883c4, and pack its already-built output.
CI uses a separate checkout in .ci/content-schema; no workspace is copied into it.
This is build provenance/test setup, not a Vercel workaround or published channel.

```sh
# In the approved Schema checkout:
npm install --ignore-scripts
npm run build
npm pack --ignore-scripts --pack-destination /absolute/artifact-directory

# In the Core checkout, with that compiled Schema tarball:
npm install --ignore-scripts --no-save --package-lock=false /absolute/artifact-directory/atlashub-amf-content-schema-0.2.0.tgz
npm run typecheck
npm test
npm run build
npm run pack:artifact
AMF_SCHEMA_ARTIFACT=/absolute/artifact-directory/atlashub-amf-content-schema-0.2.0.tgz npm run verify:artifact
```

pack:artifact builds on the publisher side explicitly; it never runs in a
consumer install. npm pack executes with lifecycle scripts disabled. Output:
.artifacts/atlashub-amf-experience-core-0.2.0.tgz, .sha256 and core-artifact.json
(version, CI SHA, file list, schema version and checksum).
CI uploads review artifacts only, with separate Node 22/24 names.
No registry publish, GitHub release, tag, deployment, secret or hosting change.

## Consumer verification

verify:artifact creates a temporary clean consumer outside the source tree,
installs only the built Core and Schema archives with scripts disabled,
imports Core from node_modules, runs a Journey/progress smoke, and typechecks
public declarations without compiling the library. It asserts that the Core
archive contains dist/index.js/types, has no source/test files or consumer build
hooks, and has an exact Schema peer. No source aliases or Git dependency are used.

The approved Schema still has its earlier source prepare metadata; migrating
that package's publishing lifecycle is a separate packaging task. The Core CI
builds it before packing and proves consumption works without executing hooks.
This PR does not modify the Schema repository or pretend its registry release
is already available. Both archives must be supplied to satisfy the Core peer.

The repositories currently lack lockfiles; CI does not invent a handwritten
one. Artifacts/checksums are review evidence. A final distribution pipeline must
add its reproducible dependency locking, immutable hosting and provenance policy
before declaring production packaging complete.

## Compatibility / rollback

Journey additions are independent of distribution. Existing ContentSource
implementations remain supported; peer/version upgrade and public requiresAuth
enforcement are explicit review points. Consumers keep their old artifact until
they approve this change. No pilot pins, migrations or data were changed.
