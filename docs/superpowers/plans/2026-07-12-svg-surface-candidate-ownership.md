# SVG Surface Candidate Ownership Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Repair Step 1 ordinary SVG import so region geometry owns same-ID label/centroid markers without losing artwork or admitting fake playable regions.

**Architecture:** Add one deterministic surface-candidate extractor that measures in root viewBox coordinates, groups identities, ranks explicit metadata and region geometry, and retains credible markers as uniquely identified auxiliary artwork. Feed its owned records into both analysis and legacy import, then make reset rebuild from the original source under a bumped explicit algorithm version.

**Tech Stack:** React 18, Vite, Vitest/JSDOM, SVG DOM/CTM geometry, deterministic game modules, Firebase transaction mocks.

---

### Task 1: Lock down ownership regressions

**Files:**
- Create: `src/game/surfaceCandidates.test.js`
- Modify: `src/game/terrainAnalysis.test.js`
- Modify: `src/game/mapImporter.test.js`

- [x] Add a failing path plus same-ID small circle fixture asserting one owned surface, retained auxiliary artwork, one bounded warning, and no duplicate error.
- [x] Add multiple touching region/marker pairs asserting only real land IDs and a connected claim graph.
- [x] Add same-size path duplicates and explicit circular-region fixtures asserting the former remains invalid and the latter remains playable.
- [x] Add a semantic label circle fixture asserting it receives no surface reference, price, claim identity, or metadata entry.
- [x] Add mocked-CTM nested-transform and non-zero-viewBox fixtures asserting stable ownership at different root screen scales.
- [x] Run `npm test -- src/game/surfaceCandidates.test.js src/game/terrainAnalysis.test.js src/game/mapImporter.test.js`; expect the new tests to fail against the duplicated enumerators.

### Task 2: Implement and wire shared extraction

**Files:**
- Create: `src/game/surfaceCandidates.js`
- Modify: `src/game/mapImporter.js`
- Modify: `src/game/terrainAnalysis.js`
- Modify: `src/game/mapMetadata.js`

- [x] Move safe identity normalization and candidate selectors into the shared module.
- [x] Measure temporary candidate references with `measureRegionGeometry`, group by normalized source identity, and classify explicit metadata and semantic decoration.
- [x] Demote only credible unmarked circle/ellipse/rect markers using a bounded area ratio plus containment/centroid test.
- [x] Assign owned surface IDs and collision-free `aop_aux_*` artwork IDs deterministically, update safe fragment references, and emit one grouped duplicate issue per ambiguous identity plus one bounded auxiliary warning.
- [x] Replace both independent selector loops with shared owned records and reuse their measured bounds/boundaries for pricing, adjacency, water, coast, selection, metadata, and validation.
- [x] Make metadata stripping invoke the same normalization so `baseSvg` preserves auxiliary artwork without duplicate DOM IDs.
- [x] Re-run the Task 1 focused command; expect all candidate regressions to pass.

### Task 3: Repair existing drafts explicitly

**Files:**
- Modify: `src/game/terrainModel.js`
- Modify: `src/game/mapImporter.js`
- Modify: `src/components/TerrainMapEditor.jsx`
- Modify: `src/components/TerrainMapEditor.test.jsx`
- Modify: `src/services/roomService.js`

- [x] Bump `ANALYSIS_ALGORITHM_VERSION` to `terrain-grid-v2` and use the constant at every analysis output boundary.
- [x] Add an explicit force-reanalysis option that ignores embedded editor analysis while still sanitizing and stripping it.
- [x] Make reset prefer `originalSvg`, preserve stable record identity/timestamps/revision, replace stale base artwork and terrain data, clear stale editor state, and persist the repaired record.
- [x] Mark previous-version drafts as requiring reset before apply/export instead of trusting their analysis.
- [x] Add a component regression proving a rewritten old base is repaired from the original duplicate-ID SVG with the same `mapId`.
- [x] Add service coverage proving the repaired prepared map passes validation and reaches the atomic room apply update.

### Task 4: Document and verify the Step 1 repair

**Files:**
- Modify: `docs/metadata.md`
- Modify: `README.md`

- [x] Document algorithm version 2, owned surfaces versus auxiliary artwork, bounded inference diagnostics, and original-source reset behavior.
- [x] Run `git diff --check` and inspect `git diff --stat` plus the complete scoped diff.
- [x] Run focused tests for candidate extraction, analysis, import, editor reset, and room apply.
- [x] Run `npm test`, `npm run lint`, and `npm run build`; expect zero failures/errors and a successful production bundle.
- [x] Confirm no Step 2, browser, Firestore Rules, credential, or deployment changes are present.
- [ ] Commit with `fix: ignore auxiliary svg region markers` and push `main` to `origin`.
