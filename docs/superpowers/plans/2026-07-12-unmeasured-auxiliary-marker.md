# Unmeasured Auxiliary Marker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent unmeasured same-ID SVG marker shapes from becoming false region surfaces when a primary path or polygon exists.

**Architecture:** Keep candidate ownership centralized in `surfaceCandidates.js`. Add a primary-geometry short circuit to marker classification while preserving explicit-surface protection and the existing measured heuristic for non-path/polygon owners.

**Tech Stack:** React 18 project, JavaScript ES modules, Vitest/JSDOM, ESLint, Vite

---

### Task 1: Reproduce and fix unmeasured marker ownership

**Files:**
- Modify: `src/game/surfaceCandidates.test.js`
- Modify: `src/game/surfaceCandidates.js`

- [x] **Step 1: Write the failing regression test**

Add a test containing a same-ID path plus CSS-sized `circle`, `ellipse`, and `rect` elements without geometry presentation attributes:

```js
it('treats unmeasured same-id marker tags as auxiliary when a path is primary', () => {
  const svg = parseSvg(`<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <path id="shared" d="M0 0H100V100H0Z"/>
    <circle id="shared" cx="50" cy="50" style="r: 3px"/>
    <ellipse id="shared" cx="50" cy="50" style="rx: 4px; ry: 2px"/>
    <rect id="shared" x="48" y="48" style="width: 4px; height: 4px"/>
  </svg>`);
  const result = extractSurfaceCandidates(svg, { viewBox: { x: 0, y: 0, width: 100, height: 100 } });
  expect(result.records.map((record) => record.tagName)).toEqual(['path']);
  expect(result.auxiliary.map((candidate) => candidate.tagName)).toEqual(['circle', 'ellipse', 'rect']);
  expect(result.importIssues.some((issue) => issue.code === 'DUPLICATE_ID')).toBe(false);
});
```

- [x] **Step 2: Run the focused test and verify the regression fails**

Run: `npm test -- src/game/surfaceCandidates.test.js`

Expected: FAIL because the three unmeasured marker tags remain in `records` and trigger `DUPLICATE_ID`.

- [x] **Step 3: Add the primary geometry ownership rule**

Update `isCredibleMarker` after its existing guard:

```js
function isCredibleMarker(candidate, owner) {
  if (candidate.explicit || !MARKER_TAGS.has(candidate.tagName)) return false;
  if (REGION_GEOMETRY_TAGS.has(owner.tagName)) return true;
  const candidateArea = area(candidate.bounds);
  const ownerArea = area(owner.bounds);
  if (candidateArea === null || ownerArea === null || candidateArea / ownerArea > MAX_MARKER_AREA_RATIO) return false;
  return containsBounds(owner.bounds, candidate.bounds) || nearCentroid(owner.bounds, candidate.bounds);
}
```

- [x] **Step 4: Run the focused test and verify it passes**

Run: `npm test -- src/game/surfaceCandidates.test.js`

Expected: all tests in `surfaceCandidates.test.js` pass.

### Task 2: Verify and commit the change

**Files:**
- Verify: `src/game/surfaceCandidates.js`
- Verify: `src/game/surfaceCandidates.test.js`

- [x] **Step 1: Run the complete verification suite**

Run:

```bash
npm run lint
npm test
npm run build
```

Expected: each command exits with status 0 and reports no failures.

- [x] **Step 2: Inspect the final diff**

Run: `git diff --check && git diff -- src/game/surfaceCandidates.js src/game/surfaceCandidates.test.js`

Expected: no whitespace errors; the diff contains only the focused regression and ownership short circuit.

- [x] **Step 3: Commit the implementation**

```bash
git add docs/superpowers/plans/2026-07-12-unmeasured-auxiliary-marker.md src/game/surfaceCandidates.js src/game/surfaceCandidates.test.js
git commit -m "fix: classify same-id svg markers as auxiliary"
```
