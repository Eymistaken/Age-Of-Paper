# Map Selection and Camera Focus Regression Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore reliable mouse/touch region selection and make remote-claim camera focus smooth, cancellable, and exactly reversible without changing game or Firebase behavior.

**Architecture:** A pure pointer reducer owns `idle`, `press-pending`, `panning`, and `pinching` transitions so selection never depends on the native click target after pointer capture. A pure action reducer emits focus only for a new remote claim, while one requestAnimationFrame controller interpolates canonical world cameras and cancels older work by token. `MapViewer` keeps the user base camera immutable for each temporary focus sequence and limits full-map fits to map identity, first valid layout, and explicit fit.

**Tech Stack:** React 18, Pointer Events, requestAnimationFrame, Vitest/JSDOM, Vite.

---

### Task 1: Pointer state regression coverage

**Files:**
- Create: `src/game/mapPointer.js`
- Create: `src/game/mapPointer.test.js`
- Create: `src/components/MapViewer.interactions.test.jsx`

- [ ] Write tests for mouse/touch tap, jitter, threshold pan, delayed capture, stored region selection, blank/control clicks, pinch ghost-click suppression, and non-primary mouse buttons.
- [ ] Run `npm test -- src/game/mapPointer.test.js src/components/MapViewer.interactions.test.jsx` and confirm failures against the eager-capture behavior.
- [ ] Implement deterministic pointer transitions and integrate their capture/select outputs into `MapViewer`.
- [ ] Re-run the focused tests and confirm selection occurs once only below threshold.

### Task 2: Remote-only action focus

**Files:**
- Modify: `src/game/cameraFocus.js`
- Modify: `src/game/cameraFocus.test.js`
- Modify: `src/components/MapViewer.jsx`

- [ ] Replace local-turn/local-restore/remote-save expectations with new remote-claim-only tests, including mount deduplication and repeated action IDs.
- [ ] Reduce dependencies to action ID, type, actor, and region ID.
- [ ] Snapshot the canonical user camera once per focus sequence, target only the claimed region with capped scale, and restore the immutable snapshot.
- [ ] Preserve the first snapshot when a second remote claim interrupts the first sequence.

### Task 3: Cancellable camera animator

**Files:**
- Create: `src/game/cameraAnimator.js`
- Create: `src/game/cameraAnimator.test.js`
- Modify: `src/components/MapViewer.jsx`

- [ ] Add deterministic fake-rAF tests for endpoints, midpoint, positive geometric scale, cancellation, single-loop ownership, and disposal.
- [ ] Implement one tokenized rAF controller with cubic easing and geometric scale interpolation.
- [ ] Render every frame directly through refs with CSS transition disabled.
- [ ] Cancel animation and restore timers on real pan threshold, pinch, wheel, zoom buttons, explicit fit, new focus, and unmount.

### Task 4: Fit lifecycle and verification

**Files:**
- Modify: `src/components/MapViewer.jsx`
- Modify: `src/game/camera.test.js`

- [ ] Key map initialization by primitive SVG/viewBox identity, not room snapshots or object references.
- [ ] Fit only on new map, first valid container size, explicit fit, or non-manual container layout change; preserve canonical camera for visible-rect changes.
- [ ] Run `npm run lint`, `npm test`, and `npm run build`.
- [ ] Confirm `firestore.rules`, economy, pricing, adjacency, join requests, drawer, and service files are unchanged.
- [ ] Commit `fix: restore map selection and tame camera focus` and push the current branch without force.
