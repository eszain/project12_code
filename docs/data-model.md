
# CADS Event Data Model

## Overview

The Collision Avoidance Detection System (CADS) organizes
Conjunction Data Messages (CDMs) into conjunction events.

Each event represents a predicted close approach between
two space objects and contains the CDM revisions associated
with that encounter.

The data model supports event correlation, revision history,
archiving, searching, and persistent browser storage.

## 1. Event Entity

An Event represents one predicted close approach between
two space objects.

Implementation: `web/src/lib/cads/store.ts`

TypeScript entity: `CdmEvent`

Main attributes:
- `id`: Unique event identifier.
- `key`: Human-readable event key.
- `pairKey`: Identifier for the pair of space objects.
- `revisions`: Collection of CDM revisions.

Events are grouped using the object pair and a configurable
TCA correlation window.

The default correlation window is 60 seconds.

A later CDM can merge previously separate event groups
when it connects their predicted closest-approach times.

Two separate passes involving the same objects remain
different events when their TCA values are sufficiently
far apart.

## 2. Revision Entity

A Revision represents one CDM associated with an event.

Implementation: `web/src/lib/cads/store.ts`

TypeScript entity: `Revision`

Main attributes:
- `id`: Unique revision identifier.
- `cdm`: Original parsed CDM data.
- `sourceFile`: Source filename.
- `sourceLabel`: Data source description.
- `correlationNote`: Explanation of event association.

An event may contain multiple revisions.

Revisions are ordered by CDM creation date, allowing
operators to examine how the predicted encounter changes.

`revision-changes.ts` calculates differences between
consecutive revisions, including:

- Collision probability (Pc).
- Miss distance.
- Time of Closest Approach (TCA).

Missing Pc values remain distinct from an explicitly
reported zero probability.

## 3. Object Entity

Each CDM describes two space objects involved in a
predicted close approach.

These objects are represented by the `sat1` and `sat2`
properties of the parsed CDM.

Relevant information includes:
- Object name.
- Object designator or identifier.
- Tracking and observation information.
- Additional CDM object properties.

The system uses a normalized object-pair key when
correlating messages.

This allows messages to be grouped even if the order
of the two objects is reversed.

## 4. Entity Relationships

The logical relationships are:

- One Event contains one or more Revisions.
- Each Revision references one CDM.
- Each CDM describes two space objects.
- The same space object may appear in multiple events.

Conceptually:

Event (1) ---- (1..*) Revision

Revision (1) ---- (1) CDM

CDM (1) ---- (2) SpaceObject

These relationships correspond to the Event,
Revision/CDM, and Space Object concepts in the
project's UML class model.

The current browser implementation embeds object
information within CDMs rather than maintaining a
separate normalized object table.

## 5. Active and Archived Events

Events are automatically considered archived once
their Time of Closest Approach has passed.

Operators may manually archive or restore events.

Manual decisions are stored as event-ID-based
overrides and take priority over automatic archiving.

Relevant implementation:
`web/src/lib/cads/register.ts`

## 6. Persistent Storage

The dashboard uses IndexedDB for local browser storage.

Relevant implementations:
- `store.ts`: Exports and restores event state.
- `event-persistence.ts`: IndexedDB storage adapter.
- `use-cads-session.ts`: Loads and saves session data.

The persisted state includes:
- Events and complete revision histories.
- Alert rules and generated alerts.
- Event and revision identifier counters.
- Manual archive overrides.

The storage adapter implements the `EventPersistence`
interface, which defines:

- `load()`
- `save()`
- `clear()`

This separates dashboard logic from the storage
implementation and allows a future backend adapter
to use PostgreSQL.

IndexedDB is currently local to each browser and
does not synchronize data between operators.

## 7. Design Constraints

- Severity always comes from the source-reported Pc.
- Original CDM values are preserved.
- CADS provides decision support and does not
  command spacecraft.
- Real CSA data must not be committed to the repository.
- The current implementation uses sample and synthetic
  data for testing and demonstration.
