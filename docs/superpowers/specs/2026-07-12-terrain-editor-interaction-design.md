# Terrain Editor Interaction and Discoverability Design

## Scope

This is a focused Step 1 interaction pass. It does not add Step 2 game systems, geography-specific behavior, remote editor writes, or a new camera model.

## Review workflow

“Düşük güvenli yüzeyler” is a complete, bounded-scroll list of every surface whose automatic confidence is below the review threshold. Entries sort by confidence ascending, then Turkish display name, then stable surface ID. Each entry is a real button with `aria-pressed`, keyboard activation, visible focus, confidence text, and a non-color selected marker.

Activating an entry is navigation, not mutation. It replaces selection with that surface, makes it the inspected surface, activates Arazi Analizi, opens the mobile inspector sheet, clears stale boundary/batch previews, and asks the canvas to reveal it. The canvas preserves the camera when the surface bounds are already fully visible. Otherwise it centers the target in root `viewBox` coordinates while preserving the current zoom when practical and clamping to world bounds.

## Shared contextual actions

The bottom selection bar and the right-side Kalıcı Seçim panel call the same parent-owned actions.

“Seçileni Sınıflandır” activates Arazi Analizi, opens the mobile sheet, scrolls the classification section to the center, focuses its first enabled terrain button, and briefly applies a non-color emphasis outline. Each terrain button maps every selected surface to one host override and commits the entire mapping as one history command.

“Seçimi Sınır Halkası Olarak Analiz Et” remains an advanced operation. Before activation, both entry points explain that the user must select a connected ring of adjacent surfaces—not the filled desired area.

## Boundary diagnostics

The deterministic barrier flood fill remains authoritative. Validation reports one concrete failure in priority order:

1. selection has disconnected components;
2. selected endpoints have fewer than two selected neighbors;
3. every surface is selected, leaving no outside area;
4. no outside component can be established;
5. no enclosed interior is detectable.

Invalid analysis always returns an empty interior and never fabricates a group. A valid five-surface ring can enclose an interior while leaving a root/ocean-connected outside component.

## State consistency and accessibility

Inspector section state is controlled by the editor so review rows and contextual actions can activate the correct tab without DOM click simulation. All selection changes pass through one editor handler. If the inspected surface is no longer selected, it is cleared; any changed selection clears boundary and batch previews. Pointer click may immediately set the newly inspected surface after replacement.

Review buttons and classification controls retain native keyboard behavior. Focus uses a high-contrast outline and offset plus a textual/shape marker; color is supplementary. No interaction in this pass opens a browser or changes terrain merely by revealing a surface.

## Verification

Vitest/JSDOM covers deterministic review ordering and full access, keyboard activation, selected map highlighting, reveal-only-when-hidden camera behavior, desktop/mobile classification focus, one-command multi-surface classification, shared boundary actions, valid five-surface rings, filled-area rejection, and all-surfaces-selected diagnostics. Final verification is lint, the complete unit suite, and production build.
