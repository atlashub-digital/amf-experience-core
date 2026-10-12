# AMF Experience Core Architecture

## Separation of concerns

```text
Content Schema
     |
Experience Core (headless)
     |
Project Template
     |
Project theme + project adapters
```

The core is not a multi-tenant application. Each generated project remains independently deployable, with isolated domains, secrets, databases and releases.

## Core modules

### Theme
Portable tokens only. Projects decide component composition.

### Content
A `ContentSource` can be Git, database, CMS or AMF-managed content.

### Access
The default resolver is deliberately conservative. Only public and free-account access can be resolved generically. Paid or campaign access requires an explicit adapter.

### WebReader
The reader model normalizes chapters, media and capabilities without prescribing React components.

### Conversation
Attendant and Companion are separate profiles. Companions are authenticated/private by default and may use consented memory.

## Future modules

Commerce, community, analytics and provisioning will be added behind explicit adapters after the first pilots validate the boundaries.

## Programs / Journey

Canonical Programs come from Content Schema v0.2. JourneyModel resolves a
validated, project-scoped manifest snapshot. Progress is a pure state value;
persistence is an explicit project/member-scoped atomic CAS adapter.
See [JOURNEY](JOURNEY.md) and [ARTIFACTS](ARTIFACTS.md).
