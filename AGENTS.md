# Repository Guidelines

## Project Structure & Module Organization

Age of Paper is a React 18/Vite multiplayer claiming game backed by Firebase. Entry points are `src/main.jsx` and `src/App.jsx`. Keep reusable UI in `src/components/`, Firestore transactions in `src/services/roomService.js`, and Firebase setup in `src/config/`. Pure game logic belongs in `src/game/` (phases, turns, economy, map import/validation, pricing, and SVG geometry). Global styling is in `src/index.css`; static files belong in `public/`. Security rules live in `firestore.rules`.

Unit tests are colocated as `*.test.js` or `*.test.jsx`. Firestore emulator tests live in `test/`. Treat `dist/` as generated build output.

## Build, Test, and Development Commands

- `npm run dev`: start the local Vite development server.
- `npm run lint`: run ESLint across JavaScript and JSX sources.
- `npm test`: run the Vitest suite once.
- `npm run test:watch`: run Vitest interactively while developing.
- `npm run test:rules`: execute Firestore rules tests against the local emulator.
- `npm run build`: create the production bundle in `dist/`.

## Coding Style & Naming Conventions

Use modern ES modules, functional React components, and two-space indentation. Follow the surrounding file’s semicolon convention; `eslint.config.js` is authoritative. Name component files in PascalCase (`MapViewer.jsx`), functions and variables in camelCase, and exported constants in UPPER_SNAKE_CASE. Keep business rules deterministic and DOM-independent in `src/game/`; UI components should consume rather than duplicate them. Preserve the Turkish UI language and Commander’s Desk visual identity.

## Map, SVG & Camera Invariants

Treat root SVG `viewBox` user coordinates as the only world-coordinate system for map bounds, region bounds, and camera focus. A region’s raw `getBBox()` is local to that element and must not be used directly when ancestor groups, nested SVGs, or element transforms may exist. Convert all four bbox corners with the element-to-root relative matrix (`root.getScreenCTM().inverse().multiply(element.getScreenCTM())`); do not mix CSS pixels, screen coordinates, `measurementScale`, or viewBox coordinates.

Imported maps with authoritative bounds use `geometryVersion: 2` and `boundsSpace: "viewBox"`. At runtime, prefer live root-viewBox measurement over stored bounds. Accept stored bounds only when their metadata and map-relative plausibility are valid. Remote claim focus must use strict region bounds: if measurement remains unavailable after a bounded retry, skip focus instead of falling back to the whole map or a synthetic `1000×1000` target.

Keep camera state canonical (`focusX`, `focusY`, `scale`, and normalized anchors), independent of the current mobile drawer rectangle. `visibleMapRect` is the usable area between the HUD and drawer and must drive transforms, fit, focus, and pan clamping. Automatic focus may react only to a new remote `claim`; it must snapshot an immutable base camera, briefly show the claimed region, and restore that exact snapshot. Manual pan, wheel, pinch, zoom controls, explicit fit, map replacement, or unmount must cancel pending animation, timers, and measurement retries. Do not reintroduce local-turn, heartbeat, chat, presence, join-request, `save_income`, or ordinary snapshot camera movement.

For map pointers, preserve the `idle` → `press-pending` → `panning`/`pinching` state machine. Do not capture the first pointer or cancel camera automation until the movement threshold is crossed. A press released below the threshold selects its recorded region exactly once; a pan or pinch must never produce a region selection or ghost click.

## Testing Guidelines

Use Vitest with the shared JSDOM setup in `src/test/setup.js`. Add focused tests beside changed modules and regression coverage for turn, economy, claiming, map-import, or join-request behavior. Rules changes require emulator tests. There is no fixed coverage threshold, but every bug fix should include a regression case. Before submitting, run lint, unit tests, applicable rules tests, and the build.

Camera or SVG geometry changes require fixtures for non-zero viewBoxes, translated/scaled and nested transforms, four-corner rotation/skew bounds, desktop/mobile CSS scaling, invalid legacy bounds, delayed DOM measurement, and exact base-camera restoration. JSDOM does not implement reliable SVG layout or pointer capture, so mock those APIs for deterministic unit tests and also perform a real-browser smoke test when changing CTM math, pointer gestures, or camera animation. Browser smoke tests must use synthetic/local room data, never production Firebase data.

Preserve the established regression contracts unless the task explicitly changes them: pricing v2, real SVG adjacency, at most 10 players, join requests, claim-complete, unread messages, mobile drawer snap behavior, and the one-action-per-turn `claim` versus `save_income` economy.

## Mobilization & War Invariants

Treat room schema version 4 as mandatory for combat mutations. The campaign phase order is `lobby` → `claiming` → `claim_complete` → `mobilization` → `war` → `finished`; the final claim freezes without advancing, and mobilization starts with the next active player. Keep naval topology map-driven with normalized `coastal` and symmetric `seaNeighbors` values. Never add geography-specific IDs or built-in routes.

The lobby owns page scrolling with a `100dvh` constrained container while global body scrolling remains disabled. Naval configuration belongs in a portal dialog, never at the bottom of lobby flow. Preserve exact overflow restoration, modal focus trapping/restoration, a single scrollable controls area, mobile full-screen sizing, and the atomic `create_route` contract that marks both endpoints coastal and adds both `seaNeighbors` edges in one transaction.

Grant mobilization/war income exactly once per `turnNumber` with `lastIncomeTurn`, inside every legal logistics/operation transaction as well as any optional feedback transaction. Logistics never advances the turn. Ready, transfer, attack, explicit war end, and offline skip advance once; skipped players receive no income. Use 1,000-soldier increments, persistent ship capacity, and deterministic subtraction combat only.

Captures must atomically update claim ownership, both players' region lists and incomes, preserved ports, destroyed target ships, elimination, turn order, and possible victory. Surrender neutralizes soldiers and ships but preserves ports. Finished rooms freeze economy and military actions while keeping results and chat readable.

War UI must keep explicit source/target interaction modes, inline attack confirmation, stale selection cancellation, and pending submission locks. Military badges and naval route lines use root SVG viewBox coordinates. Remote camera focus may react to remote transfers and attacks at the target region through the same strict bounded-measurement and exact-restoration pipeline used for claims; purchases, income, ready, chat, and presence never focus.

## Commit & Pull Request Guidelines

Recent history uses Conventional Commit subjects such as `fix: rebalance automatic region pricing`. Use an imperative `type: summary` subject and keep commits scoped. Pull requests should explain behavior changes, list verification commands, link issues, and include desktop/mobile screenshots for UI work. Call out `firestore.rules` changes explicitly.

## Security & Configuration

Never use production Firebase data for tests or commit credentials. Prefer transactions for multiplayer state changes. Changes to claiming, turn advancement, money, ownership, or room membership must be enforced atomically in `roomService` transactions and mirrored in `firestore.rules`; hiding a UI control is not security. Run `npm run test:rules` whenever `firestore.rules` changes. Do not deploy Firestore rules or hosting unless the task explicitly requests deployment, and never deploy unrelated Firebase targets.
