# Terrain Editor Interaction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make low-confidence review, classification, and boundary-ring analysis discoverable, consistent, accessible, and deterministic without starting Step 2.

**Architecture:** Parent-own inspector section and contextual commands in `TerrainMapEditor`; expose a bounded viewBox reveal command from `TerrainMapCanvas`; keep deterministic review sorting and boundary diagnostics in focused `src/game/` modules. Both desktop and mobile entry points consume the same callbacks and state.

**Tech Stack:** React 18, SVG viewBox camera state, deterministic game modules, Vitest/JSDOM, CSS Commander’s Desk tokens.

---

### Task 1: Deterministic review list

**Files:**
- Create: `src/game/terrainReview.js`
- Create: `src/game/terrainReview.test.js`
- Modify: `src/components/TerrainInspector.jsx`
- Modify: `src/components/TerrainInspector.test.jsx`

- [x] Add a failing test with more than eight low-confidence surfaces and confidence/name ties; assert the complete deterministic order.
- [x] Implement `lowConfidenceReviewSurfaces(document)` using automatic confidence, Turkish name ordering, and stable ID tie-breaking.
- [x] Render all results in a bounded-scroll list of buttons with `aria-pressed` and an `onReviewSurface(id)` callback.
- [x] Run `npm test -- src/game/terrainReview.test.js src/components/TerrainInspector.test.jsx` and expect all focused tests to pass.

### Task 2: Selection and viewBox reveal

**Files:**
- Create: `src/game/editorCamera.js`
- Create: `src/game/editorCamera.test.js`
- Modify: `src/components/TerrainMapCanvas.jsx`
- Modify: `src/components/TerrainMapEditor.jsx`
- Modify: `src/components/TerrainMapEditor.test.jsx`

- [x] Add failing tests proving a visible target preserves the exact camera and an outside target is centered/clamped in viewBox coordinates.
- [x] Add `revealBounds(camera, bounds, world)` and expose `revealSurface(surfaceId)` through the canvas ref.
- [x] Route review-row activation through one replacement-selection handler that clears stale inspected/boundary state, then sets the reviewed surface and reveals it.
- [x] Assert row activation highlights the SVG surface without changing terrain or history.

### Task 3: Shared classification focus

**Files:**
- Modify: `src/components/TerrainInspector.jsx`
- Modify: `src/components/TerrainMapEditor.jsx`
- Modify: `src/components/TerrainMapEditor.test.jsx`
- Modify: `src/index.css`

- [x] Add failing desktop/mobile tests for the renamed contextual action, active terrain tab, scroll request, focus target, and temporary emphasis.
- [x] Control the inspector tab from the editor and use a monotonic focus request token to focus the classification section after render.
- [x] Rename the contextual action to `Seçileni Sınıflandır` and keep the button visible on desktop and mobile.
- [x] Select multiple surfaces, classify once, undo once, and assert both host overrides revert together.

### Task 4: Boundary-ring contract and diagnostics

**Files:**
- Modify: `src/game/boundaryAnalysis.js`
- Modify: `src/game/boundaryAnalysis.test.js`
- Modify: `src/components/TerrainInspector.jsx`
- Modify: `src/components/TerrainMapEditor.jsx`
- Modify: `src/components/TerrainMapEditor.test.jsx`

- [x] Add failing tests for a valid five-surface ring, disconnected selection, selected endpoints, filled-area/no-interior selection, and all-surfaces-selected/no-outside selection.
- [x] Preserve barrier flood fill while returning deterministic reason codes and concrete Turkish explanations.
- [x] Rename both action entry points to `Seçimi Sınır Halkası Olarak Analiz Et` and show the connected-ring instruction before execution.
- [x] Ensure both entry points call the same parent callback and observe the same preview/reason state.

### Task 5: Documentation and verification

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-07-12-terrain-editor-interaction-design.md`

- [x] Document review navigation, controlled classification focus, reveal-only-when-hidden camera behavior, and boundary-ring diagnostics.
- [x] Run `git diff --check`, `npm run lint`, `npm test`, and `npm run build` without opening a browser.
- [x] Commit with a scoped Conventional Commit subject and push the current branch.
