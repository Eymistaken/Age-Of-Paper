# Naval Route Dialog Implementation Plan

1. Strengthen pure naval route helpers with explicit atomic route creation/removal results and duplicate/self-route rejection.
2. Route lobby edits through the existing host-only Firestore transaction and expose useful mutation results to the editor.
3. Replace the inline editor with a portal dialog, explicit endpoint/preview/confirm state, read-only mode, focus management, and exact scroll cleanup.
4. Add lobby infrastructure summaries and make the lobby the single viewport-constrained scroll owner.
5. Add root-viewBox route preview rendering without changing the map pointer state machine.
6. Add pure, component, layout, accessibility, and transaction regression tests.
7. Verify lint, unit tests, rules emulator tests, production build, and synthetic browser viewports; then deploy Firestore rules, commit, and push.
