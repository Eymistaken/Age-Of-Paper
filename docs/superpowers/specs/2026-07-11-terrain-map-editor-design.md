# Intelligent Persistent Terrain Map Editor Design

## Scope

Step 1 replaces the lobby's naval-route-first preparation flow with a reusable terrain preparation workspace. It imports ordinary SVG maps, produces deterministic terrain and coast data in root `viewBox` coordinates, lets the host correct the result, persists drafts in IndexedDB, exports safe round-trippable SVG metadata, and applies a compact compatibility map to the room. Existing claiming, mobilization, war, and legacy rooms continue to use `mapDefinition.version: 1`.

## Chosen analysis approach

The editor uses a hybrid viewBox topology. Browser SVG APIs are used only to extract each renderable element's four-corner CTM bounds and sampled boundary in root `viewBox` coordinates. Classification, graph derivation, component analysis, selection, history, validation, and metadata normalization operate on serializable data in focused `src/game/` modules.

Explicit validated Age of Paper metadata and `data-terrain` attributes have highest precedence, followed by existing region semantics, measured geometry, and weak semantic/fill hints. Weak hints contribute confidence but never become an unchangeable truth. Missing water is represented by a deterministic, aspect-aware viewBox grid. Candidate land occupancy is rasterized in world coordinates; exterior flood-fill components are ocean and enclosed components are lake. Stable synthetic water IDs derive from normalized component cells. Analysis is chunked, reports progress, accepts an `AbortSignal`, and yields between expensive phases.

Coasts are derived only from meaningful sampled boundary contact or land cells touching water components. Bounding-box overlap is an early rejection only. Every edit runs through one derivation pipeline that rebuilds playable land, pricing, land/claim adjacency, coast type, port eligibility, compatibility routes, and map validation without silently repairing invalid graphs.

## Terrain document

The local editor document uses `editorSchemaVersion: 1`, `metadataSchemaVersion: 1`, and `analysisAlgorithmVersion: "terrain-grid-v2"`. Version 2 adds deterministic owned-surface extraction for same-ID region geometry and auxiliary label/centroid artwork; version 1 drafts require explicit original-source reanalysis. Each surface stores a stable ID, optional SVG element ID, measured geometry, automatic result and confidence, optional imported metadata result, optional host override, effective terrain, coast type, adjacent surface IDs, and port preference. `classificationSource` is computed as `host_override`, `metadata`, or `automatic`.

Only effective land surfaces appear in the compatibility `mapDefinition`. Ocean, lake, and ignored surfaces never receive price, income, ownership, or claim edges. Coastal land defaults to `portAllowed: true`; explicit host disabling is preserved while the surface stays coastal. Inland or non-land surfaces are forced to false. Existing symmetric sea routes survive only when both endpoints remain coastal land; otherwise they are reported as invalidated.

The compatibility region keeps `coastal` as the derived geographic coast flag and adds `portAllowed`. War code and Firestore Rules use `portAllowed` when present and fall back to `coastal` for legacy rooms. Naval movement continues to use existing `coastal` and `seaNeighbors`; this step does not redesign naval combat.

## Content-addressed persistence and transport

IndexedDB is the source of truth for editor drafts and prepared maps. The versioned repository has stores for maps, base SVG assets, and compact metadata assets. A map record contains the original and normalized SVG, prepared export SVG, full editor document, automatic and imported analysis layers, overrides, effective terrain, reproducible water geometry, validation, thumbnail, timestamps, source label, and content hashes. Quota or transaction errors are surfaced while the active in-memory draft remains intact.

Three identities are distinct:

- `baseSvgHash` addresses sanitized normalized artwork with Age of Paper metadata removed.
- `metadataHash` addresses the complete current compact room metadata package and is paired with a monotonically increasing revision.
- `mapId` identifies the logical prepared map and survives revisions and export round trips.

The live room document stores only `mapManifest`, compact `mapDefinition`, and `mapValidation`; new prepared maps leave legacy `mapSvg` empty. Separate `rooms/{roomCode}/mapAssets/{assetId}` documents store one base SVG and one compact metadata package. Asset writes are host-only and lobby-only. Room players may read assets for rooms they belong to.

On a room snapshot, the client checks IndexedDB before Firestore. Matching base and metadata hashes require no asset read. A metadata-only change reads only that asset and reapplies it to cached base SVG. A missing base reads both. Any hash, revision, schema, reference, or composition mismatch discards the attempted composition and performs a full two-asset read. The verified result is archived in Recent Maps with a room source label. No JSON patch chain is used.

Full editor history, confidence evidence, thumbnail, original draft, and large reproducible water grid are never written to Firestore. The compact room metadata contains only the fields needed to reconstruct the rendered playable SVG and verify effective terrain. A remote editor can deterministically regenerate omitted analysis geometry locally.

Legacy rooms with inline `mapSvg` continue to render without asset loading. The first new host apply migrates the room to a manifest while retaining the existing room schema and compatibility definition.

## SVG metadata and security

Exports remain ordinary SVG. A single non-executable `<metadata id="age-of-paper-map">` node contains validated JSON text with schema versions, map identity and revision, geometry hash, surface layers, effective data, compact water components, coast relationships, port permissions, and compatibility routes. Temporary selection, editor overlays, badges, and controls are never serialized.

Import removes scripts, event handlers, executable animation, unsafe URLs, and external resources before metadata parsing. Metadata is bounded by size, normalized, checked against allowed keys and terrain values, and cross-checked against referenced SVG elements and the source geometry hash. Filename is never used for detection. Hash mismatch cannot silently apply metadata; the host chooses remapping, reanalysis, new copy, or cancellation. A matching local `mapId` similarly offers update, copy, or cancel.

## Editor interaction model

`TerrainMapEditor` is a `100dvh` modal workspace with exact overflow restoration, focus trap/restoration, and Turkish accessible names. Desktop uses a top command bar, left Hand/Select/Brush rail, central canvas, right Terrain Analysis and Coasts/Ports inspector, and bottom status bar. Mobile uses a compact safe-area header, large touch canvas, bottom tools, and one scrollable inspector sheet.

The canvas reuses canonical camera math and root-viewBox pointer conversion but has an editor-specific pure gesture state machine. Space temporarily activates Hand. H, V, and B choose tools. Ctrl disables panning for selection. Ctrl+Z and Ctrl+Y prevent browser history and operate command history. Escape cancels an active gesture/preview/confirmation, then clears selection, then closes.

Selection uses standard replacement: a normal click on another unselected surface immediately makes it the sole selection. Ctrl toggles membership and survives key release. Brush records a fixed add/subtract mode from its first surface and visits each surface once. Touch exposes explicit add/subtract modes. A Select drag that crosses the gesture threshold creates a viewBox marquee even when it starts on an explicit or synthetic surface; a below-threshold release remains a click. Polygon/segment and synthetic grid-run intersection use transformed world geometry rather than screen boxes.

Selection is persistent and drives a contextual action bar. Boundary analysis removes selected barrier nodes from the normalized surface topology, flood-fills from root-boundary water/outside nodes, and marks remaining disconnected components as interior only when the boundary is closed and the result is unambiguous. Batch and advanced outside overrides are previewed through the normal derivation pipeline, show count/adjacency/coast/port/route/validation deltas, require confirmation for full outside override, and commit as one history command.

## History, autosave, and room apply

History stores before/after patches for terrain overrides, selection batches, boundary operations, outside overrides, port preferences, reset-to-automatic, analysis reset, and display-name edits. Applying or reverting a command always reruns derivation.

Draft changes debounce-save to IndexedDB and expose Saving, Saved locally, Not applied to room, and failure states. Closing never discards the local draft. Apply to Room prevents duplicate submission, rebuilds and validates the complete compatibility map, sanitizes the base SVG again, validates compact metadata, computes both hashes, and writes the two assets plus manifest/mapDefinition/mapValidation in one Firestore transaction.

## Recent Maps and export

The lobby includes Recent Maps cards with thumbnail, name, update time, playable/ocean/lake/coast counts, validation state, and Use/Edit/Export/Duplicate/Delete actions. Delete is confirmed. Use performs full local validation before the same atomic room apply path.

Export opens a validation summary with editable display name, filename, and optional `_ageofpaper` suffix. Download is disabled while another export/apply runs. Reimporting a valid export produces the same effective terrain, compatibility map, ports, and coasts without repeating analysis.

## Error handling and verification

Analysis cancellation keeps the previous valid draft. Storage errors do not clear memory. Invalid metadata is reported and ordinary analysis remains available. Invalid or disconnected playable graphs block apply/start and are never automatically connected. Asset cache failures fall back to verified network reads; network failures show a map-unavailable state instead of rendering mismatched art.

Unit tests cover schema precedence, deterministic water components, coast/port derivation, compatibility routes, metadata round trip and mismatch, cache decisions, history, exact selection behavior, transformed marquee geometry, boundary flood fill, dialog keyboard/focus/overflow, recent maps, room transactions, and Rules. Geometry fixtures include non-zero viewBoxes, nested translated/scaled SVGs, rotation/skew, desktop/mobile scaling, and unavailable measurement. Verification runs lint, all unit tests, Firestore emulator tests, production build, and a synthetic local browser smoke test before commit/push and the explicitly authorized Rules-only deploy.
