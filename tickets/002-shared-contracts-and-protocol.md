# 002: Shared Contracts and Protocol

## Goal

Define the shared data contracts, runtime schemas, protocol version, and stable
machine-readable errors used by the client and server.

## Scope

- Protocol version and shared constants.
- Room, match, player, input, and snapshot types.
- Client/server message unions.
- Runtime validation with one selected schema library.
- Display-name and room-code validation.
- Snapshot validation and protocol fixtures.
- Unix-millisecond protocol time semantics.

## Acceptance Criteria

- Every inbound client message has runtime validation.
- Invalid, oversized, unknown, and incompatible messages are rejected safely.
- Valid message and snapshot fixtures validate correctly.
- Protocol version and error codes are stable and documented.
- Schemas reject unexpected fields where practical.

## Dependencies

- 001.
