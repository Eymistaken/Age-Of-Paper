# Mobile Camera and Turn Choices Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the mobile drawer and map camera cooperate smoothly, add action-aware focus and unread chat state, and enforce exactly one claim-or-save choice per turn in transactions and Firestore rules.

**Architecture:** Pure modules own drawer snapping, camera geometry, focus event selection, and unread bookkeeping. `MobileGameRoom` measures the visual viewport, HUD, and live sheet top and sends an imperative visible rectangle to `MapViewer`; `MapViewer` stores a canonical world-space base camera plus an optional temporary camera. Economy actions read and validate the room once inside a transaction, apply either claim or calculated income, and advance the turn atomically, with Firestore rules mirroring the allowed diffs.

**Tech Stack:** React 18, Vite, Vitest/JSDOM, Firebase Firestore transactions and security rules emulator.

---

### Task 1: Pure mobile interaction math

**Files:**
- Create: `src/game/drawer.js`
- Create: `src/game/drawer.test.js`
- Create: `src/game/camera.js`
- Create: `src/game/camera.test.js`

- [ ] Add failing tests for three snap heights, velocity-directed snapping, map fitting into `visibleMapRect`, canonical focus preservation across rect changes, pan clamping, portrait/landscape, and visual viewport changes.
- [ ] Run `npm test -- src/game/drawer.test.js src/game/camera.test.js` and confirm the missing exports fail.
- [ ] Implement deterministic rectangle, fit, transform, zoom-anchor, pan-clamp, bounds union, and snap selection helpers.
- [ ] Re-run the focused tests and confirm they pass.

### Task 2: Drawer and canonical camera integration

**Files:**
- Modify: `src/components/MobileGameRoom.jsx`
- Modify: `src/components/MapViewer.jsx`
- Modify: `src/index.css`

- [ ] Replace the two-state drawer with compact, half, and expanded snaps derived from `visualViewport`, safe layout bounds, and keyboard height.
- [ ] Process pointer movement through one `requestAnimationFrame`, keep the 48px handle as the only drag origin, lock body scrolling during drag, and use velocity on release.
- [ ] Measure HUD bottom and sheet top with `ResizeObserver`, `visualViewport`, orientation/resize listeners, and send the live `visibleMapRect` to the map without parent render-per-frame updates.
- [ ] Render SVG world coordinates through the canonical camera, refit only before manual interaction, and clamp against the real visible rectangle.
- [ ] Verify reduced-motion transitions and safe-area/keyboard chat input behavior.

### Task 3: Temporary action focus

**Files:**
- Create: `src/game/cameraFocus.js`
- Create: `src/game/cameraFocus.test.js`
- Modify: `src/components/MapViewer.jsx`
- Modify: `src/components/GameRoom.jsx`

- [ ] Add failing tests for local-turn focus/restore, manual cancellation, unique remote action focus, and heartbeat/chat non-events.
- [ ] Implement a pure focus event selector keyed by action identity and turn transition.
- [ ] Focus local owned bounds (or legal/all-map fallback), restore after the local completed action, focus remote completed claims/save actions for 0.8 to 1.2 seconds, and cancel all automation on manual map input.
- [ ] Recompute animated targets against a changing `visibleMapRect` while preserving the base camera.

### Task 4: Unread messages and HUD polish

**Files:**
- Create: `src/game/unreadMessages.js`
- Create: `src/game/unreadMessages.test.js`
- Modify: `src/components/GameRoom.jsx`
- Modify: `src/components/MobileGameRoom.jsx`
- Modify: `src/components/SidePanels/LeftPanel.jsx`
- Modify: `src/components/SidePanels/RightPanel.jsx`
- Modify: `src/components/MapViewer.jsx`
- Modify: `src/index.css`

- [ ] Add failing tests for deduplicated foreign messages, own-message exclusion, refresh baselines, and clearing when chat becomes visibly active.
- [ ] Persist room/user-scoped seen IDs and unread count in local storage and expose an accessible `1..99+` badge without shifting tabs.
- [ ] Update income copy to “Biriktirme getirisi” language and make the save action label explain the exact amount.
- [ ] Center desktop and mobile leave icons with grid alignment, zero padding, block SVG, 44px target, and preserved focus ring.

### Task 5: Atomic claim-or-save economy

**Files:**
- Modify: `src/game/economy.js`
- Modify: `src/game/economy.test.js`
- Modify: `src/game/rules.js`
- Modify: `src/game/rules.test.js`
- Modify: `src/services/roomService.js`
- Modify: `src/components/GameRoom.jsx`
- Modify: `src/components/appFlow.smoke.test.jsx`
- Modify: `src/game/joinRequests.test.js`

- [ ] Add failing regression tests proving start does not pay, claim does not pay income, save pays calculated income once, and final claim freezes without advancing.
- [ ] Remove automatic start/turn income calls and keep `lastIncomeTurn` only as a compatibility field.
- [ ] Make `claimRegion(roomCode, userId, regionId, expectedTurnNumber)` validate and update ownership, money, phase, last action, and turn state in one transaction.
- [ ] Add `saveIncome(roomCode, userId, expectedTurnNumber)` that calculates current income and advances in the same transaction.
- [ ] Pass snapshot turn numbers from UI so stale clicks fail cleanly and rename all user-facing end-turn language.

### Task 6: Firestore enforcement

**Files:**
- Modify: `firestore.rules`
- Modify: `test/firestore.rules.emulator.js`

- [ ] Add emulator cases for all claim/save cross-action, duplicate, inactive-player, correct advance, zero-start, zero-join, and final-claim requirements.
- [ ] Reject legacy `income` and `end_turn`; allow only `claim` or `save_income` with strict player/claims/turn/phase diffs.
- [ ] Require exact cached income increase for save, exact region price decrease for claim, no claim income payment, and unchanged claims/regions on save.
- [ ] Preserve join request, ten-player, presence, chat, pricing v2, and adjacency validation paths.
- [ ] Run `npm run test:rules` and fix only evidence-backed rule mismatches.

### Task 7: Full verification and delivery

**Files:**
- Review all modified files and generated `dist/` only as build output.

- [ ] Run focused viewport smoke tests at 412x915, 360x800, short landscape, and 768px tablet dimensions.
- [ ] Run `npm run lint`, `npm test`, `npm run build`, and `npm run test:rules`, reading every exit status.
- [ ] Inspect `git diff` and `git status`, stage only task files, and commit `fix: improve mobile camera and enforce turn choices`.
- [ ] Push the current branch to `origin` without force.
- [ ] Because rules change, deploy only rules with `npx firebase-tools deploy --only firestore:rules --project eymistaken` and report authentication or permission failures exactly.
