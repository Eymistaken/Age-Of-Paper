# SVG Surface Candidate Ownership Design

## Scope

This is a Step 1 stabilization change. It repairs ordinary SVG import when a region geometry element and a label or centroid marker reuse the same source identity. It does not begin Step 2, change combat, add geography-specific knowledge, or alter the room map schema.

## Root cause

Both `terrainAnalysis` and the legacy `mapImporter` independently enumerate every renderable `path`, `polygon`, `rect`, `circle`, `ellipse`, and `polyline`. Each enumerator rewrites duplicate IDs before deciding which element owns the region identity. `stripEditorMetadata` also uniquifies those IDs before a later reset can recover the original pairing. A region polygon plus its same-ID centroid circle therefore becomes two land surfaces, two duplicate diagnostics, and usually a disconnected claim node.

## Candidate ownership

A shared `src/game/surfaceCandidates.js` module owns enumeration, root-viewBox measurement, identity grouping, ownership, auxiliary artwork retention, DOM ID assignment, and bounded diagnostics. Both terrain analysis and legacy import consume its final owned surface records.

Candidates are grouped by their source ID, or by `data-region-id` when no source ID exists, after safe normalization. Ownership precedence is deterministic:

1. Valid explicit `data-region="true"` or supported `data-terrain` metadata.
2. `path` and `polygon` region geometry.
3. Other supported shapes in document order, with measured area used only to identify the primary shape inside that last rank.

An unmarked `circle`, `ellipse`, or `rect` can be auxiliary only when it shares the owner's identity, is substantially smaller in measured root-viewBox area, and its bounds are contained by the owner or its center lies in the owner's centroid zone. Size alone is insufficient. Explicitly marked shapes are never demoted. Paths, polygons, significant peers, and geometrically unsupported ambiguous duplicates remain surfaces and produce a real grouped `DUPLICATE_ID` error.

Semantic decoration such as labels and legends remains artwork but is not a surface unless explicit validated metadata opts it in. Standalone meaningful circles and ellipses remain supported surfaces.

## SVG and downstream data

Owned surfaces receive safe deterministic IDs and surface references. Auxiliary artwork remains in the SVG with all presentation geometry and styling attributes intact, but receives a collision-free `aop_aux_*` DOM ID and no surface metadata. Source fragment references continue to resolve to the owning surface when an ID is normalized.

Only final owned surfaces reach classification, negative-space occupancy, inferred water/coasts, automatic adjacency, pricing, selection, compact metadata, compatibility map construction, and validation. Auxiliary inference emits one `AUXILIARY_ARTWORK` warning containing a total and a bounded sample instead of per-marker errors.

All geometric comparisons use measured root SVG viewBox coordinates. Nested transforms, non-zero viewBoxes, and CSS scale therefore follow the existing CTM invariants.

## Reanalysis and versioning

The analysis algorithm advances from `terrain-grid-v1` to `terrain-grid-v2`. Version 1 embedded metadata remains explicitly unsupported; it is never silently trusted. Stored version 1 drafts remain editable only so the host can run `Analizi Sıfırla`, while room apply/export are identified as requiring current analysis.

`Analizi Sıfırla` force-reanalyzes `record.originalSvg` when it is present and falls back to `record.baseSvg` only when the original is unavailable. It preserves `mapId`, `createdAt`, display name, source label, and revision, replaces the normalized base artwork with the newly owned candidate result, clears stale selection/history, and saves the repaired record locally. This deliberately avoids carrying forward IDs assigned by the previous importer.

## Verification

Neutral synthetic fixtures cover same-ID path markers, multiple connected pairs, significant duplicate paths, explicit circles, independent labels, nested transforms, non-zero viewBoxes, reset source preference and identity stability, and application of the repaired prepared map to a mocked local room transaction. Verification is command-line only: focused Vitest, full Vitest, ESLint, production build, and Git checks. No browser is opened.
