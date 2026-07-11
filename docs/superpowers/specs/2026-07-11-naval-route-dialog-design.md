# Naval Route Dialog Design

## Problem

The lobby renders naval configuration after the complete lobby grid. Global page scrolling is disabled, while the lobby only has a minimum height. On short desktop and mobile viewports the editor can therefore sit outside the reachable visual viewport.

## Layout contract

- The lobby is the page's only scroll owner: `height: 100dvh` with vertical overflow and safe-area padding.
- Naval configuration is rendered through a portal as a modal dialog, never inline in the lobby flow.
- Desktop/tablet use a viewport-constrained two-column dialog. The map owns the larger column and the controls column is the only internal scroller.
- Mobile portrait uses a sticky compact header, a bounded map, and one scrolling controls section. Mobile landscape uses the same two-column contract at full-screen size.
- The dialog locks background scrolling, traps focus, closes with Escape when safe, and restores focus and previous overflow values exactly.

## Route workflow

The host starts an explicit three-step route operation: choose the source, choose the destination, then confirm. The map previews the proposed root-viewBox connection before confirmation. Confirmation performs one transaction that marks both endpoints coastal when needed and adds the symmetric route. Duplicate and self-routes are rejected. Coastal-only configuration remains available, while unmarking a routed coast keeps its destructive confirmation.

Non-host players receive the same infrastructure summary and may open a read-only dialog. All mutation controls remain host-only in both UI and Firestore rules.

## Accessibility and interaction

The dialog uses Turkish accessible title and description, `role="dialog"`, `aria-modal="true"`, a labelled close button, focus entry/restoration, focus trapping, and inert/hidden background content. Backdrop and close actions are blocked while a transaction or destructive confirmation is active. Map selection continues to use the existing press/pan/pinch threshold state machine, so panning cannot choose a route endpoint.
