# Unmeasured Auxiliary Marker Design

## Scope

Fix SVG surface ownership when a `path` or `polygon` and an unmarked `circle`, `ellipse`, or `rect` share the same normalized identity, but the marker cannot be measured. The change is limited to candidate ownership and its focused regression coverage. It does not change SVG geometry measurement, explicit surface metadata, standalone shape handling, or duplicate `path`/`polygon` validation.

## Root cause

`basicShapeBounds` reads circle and ellipse radii and rectangle dimensions from presentation attributes. CSS-provided values therefore remain unavailable to the fallback geometry path. When browser geometry APIs are also unavailable, the marker bounds and area are `null`.

`isCredibleMarker` currently requires both candidate and owner areas before it will classify a same-identity marker as auxiliary. The unmeasured marker is consequently retained as a second region surface and produces a false duplicate.

## Ownership rule

Explicit surfaces remain protected and are never demoted. For an unmarked `circle`, `ellipse`, or `rect`, a same-identity primary `path` or `polygon` is sufficient evidence that the shape is auxiliary artwork. This classification does not depend on marker bounds, area ratio, containment, or centroid proximity.

When the primary is not a `path` or `polygon`, the existing measured-area and position heuristics remain unchanged. Standalone markers therefore continue to be supported as surfaces, and ambiguous groups without primary region geometry do not gain a new automatic ownership rule.

## Implementation

`isCredibleMarker` will first keep its explicit-surface and marker-tag guards. It will then return true when the owner tag is `path` or `polygon`. Existing area and position checks remain as the fallback for other owner types.

No CSS computed-style lookup will be added to `svgGeometry`: ownership should remain deterministic in environments where layout or stylesheet evaluation is unavailable.

## Verification

A focused regression fixture will pair primary region geometry with same-ID marker tags whose required geometry attributes are missing, making their measured bounds unavailable. It will assert one retained region record, auxiliary ownership for the markers, and no `DUPLICATE_ID` issue. Existing explicit-marker and duplicate-path tests will guard the unchanged protections.

Verification will run the focused surface-candidate test, the complete unit suite, ESLint, and the production build.
