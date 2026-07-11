# Mobilization and War Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Add a secure, deterministic, map-driven mobilization and war campaign from lobby configuration through victory.

**Architecture:** Pure `src/game/` transitions own business rules and return complete immutable room states. Firestore transactions provide atomic stale-turn guarded mutation, rules validate client writes independently, and shared React command components adapt to the existing desktop panels and mobile drawer.

**Tech Stack:** React 18, Vite, Firebase Firestore transactions and rules, Vitest/JSDOM, Firebase rules emulator.

---

### Task 1: Phase and naval topology foundation

**Files:** `src/game/phases.js`, `src/game/navalRoutes.js`, `src/game/mapImporter.js`, `src/game/mapValidation.js`, colocated tests.

- [x] Add failing tests for all six phases, imported `data-sea-neighbors`, normalized arrays, invalid/self/duplicate/asymmetric/non-coastal routes, warning-only coastal maps without routes, and host editor add/remove behavior.
- [x] Implement phase transitions and canonical bidirectional naval normalization/editing.
- [x] Run focused Vitest files and confirm zero failures.

### Task 2: Deterministic war engine

**Files:** `src/game/warConstants.js`, `src/game/warEconomy.js`, `src/game/warMovement.js`, `src/game/warCombat.js`, `src/game/warState.js`, colocated tests.

- [x] Add failing tests for income-once, logistics costs, friendly pathfinding, land/naval transfers, capacity, deterministic combat cases, capture bookkeeping, elimination order, surrender, mobilization rotation, skip, and victory with neutral territory.
- [x] Implement immutable eligibility/application functions with finite non-negative integer invariants.
- [x] Run all war-focused tests and confirm zero failures.

### Task 3: Atomic service layer and schema 4

**Files:** `src/services/roomService.js`, `src/App.jsx`, service-facing smoke tests.

- [x] Initialize schema 4 fields and safe legacy read defaults.
- [x] Add atomic host naval edits, mobilization start, idempotent income, logistics, ready, movement, attack, end-turn, surrender, and extended offline skip transactions.
- [x] Require exact schema and expected turn for combat mutations; write stable action IDs and timestamps.
- [x] Run focused state/service smoke tests.

### Task 4: Responsive campaign interface

**Files:** `src/components/NavalRouteEditor.jsx`, `WaitingRoom.jsx`, `ClaimCompletePanel.jsx`, `WarCommandPanel.jsx`, `GameRoom.jsx`, `MobileGameRoom.jsx`, side panels, `MapViewer.jsx`, `cameraFocus.js`, `src/index.css`, component tests.

- [x] Add failing tests for editor selection, desktop/mobile command modes, attack confirmation, stale selection clearing, pending submission locks, pan safety, indicators, and remote operation focus.
- [x] Build the host editor and shared Turkish war command UI within existing panel/drawer structures.
- [x] Extend map painting with source/target highlights, root-viewBox badges/route lines, and strict remote target focus.
- [x] Run component tests and accessibility-oriented queries.

### Task 5: Firestore rules

**Files:** `firestore.rules`, `test/firestore.rules.emulator.js`.

- [x] Update room/player/claim schema predicates and action dispatch.
- [x] Add readable action-specific predicates for host routes, mobilization, income, purchases, operations, capture/elimination/victory, surrender, and skip.
- [x] Add emulator acceptance/rejection coverage for phase, actor, stale turn, arithmetic, topology, capacity, casualties, ownership, turn advancement, and frozen finished state.
- [x] Run `npm run test:rules` and confirm zero failures.

### Task 6: Documentation and release verification

**Files:** `README.md`, `AGENTS.md`.

- [x] Document phases, turn income, costs, movement/combat, naval editing, surrender/victory, schema 4, and security boundaries.
- [x] Record durable war, naval, and test invariants in `AGENTS.md`.
- [x] Search the diff for geography-specific IDs, prototype fields, direct writes, and unrelated changes.
- [x] Run `npm run lint`, `npm test`, `npm run test:rules`, and `npm run build`; record exact results.
- [x] Run synthetic desktop/mobile browser smoke scenarios without production Firebase data.
- [x] Commit all scoped files with `feat: add mobilization and war system` and push the current branch.
