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

## Testing Guidelines

Use Vitest with the shared JSDOM setup in `src/test/setup.js`. Add focused tests beside changed modules and regression coverage for turn, economy, claiming, map-import, or join-request behavior. Rules changes require emulator tests. There is no fixed coverage threshold, but every bug fix should include a regression case. Before submitting, run lint, unit tests, applicable rules tests, and the build.

## Commit & Pull Request Guidelines

Recent history uses Conventional Commit subjects such as `fix: rebalance automatic region pricing`. Use an imperative `type: summary` subject and keep commits scoped. Pull requests should explain behavior changes, list verification commands, link issues, and include desktop/mobile screenshots for UI work. Call out `firestore.rules` changes explicitly.

## Security & Configuration

Never use production Firebase data for tests or commit credentials. Prefer transactions for multiplayer state changes. Do not deploy Firestore rules or hosting unless the task explicitly requests deployment.
