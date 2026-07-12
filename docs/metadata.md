# Age of Paper SVG Metadata

## Purpose and guarantees

Age of Paper metadata turns an ordinary, sanitized SVG into a reusable prepared map without making the file dependent on the game. Browsers and SVG editors can still render the artwork. The metadata records terrain analysis, host corrections, derived coasts, port permissions, stable identity, and enough water topology to reproduce the same effective game map on reimport.

Detection never depends on the filename or the optional `_ageofpaper` suffix. Importers look for one inert SVG node:

```xml
<metadata id="age-of-paper-map" data-aop-schema-version="2">
  {"schemaVersion":2,"mapId":"map_neutral_1","revision":3}
</metadata>
```

The node contains JSON text, not executable markup. JSON is serialized with recursively sorted object keys so the compact package can be content-addressed.

## Versions and identity

- `schemaVersion: 2` is the exported metadata schema. Version 1 packages migrate explicitly on import.
- `editorVersion: 2` identifies the local editor document contract.
- `analysisAlgorithmVersion: "terrain-grid-v2"` identifies the automatic classification, owned-surface extraction, and negative-space algorithm. Version 1 drafts require explicit reanalysis.
- `mapId` is the stable logical map identity. Editing and exporting preserves it.
- `revision` is a positive integer. Applying a changed draft to a room increments it.
- `sourceGeometryHash` is the hash of sanitized, normalized base artwork after Age of Paper metadata and game attributes are removed.
- `baseSvgHash` addresses the same normalized base SVG used by the room asset cache.

Hashes detect mismatches and cache identity; they are not signatures and do not establish authorship.

## Surface records

Every explicit SVG surface and inferred water component has a normalized, unique ID. IDs match:

```text
^[A-Za-z_][A-Za-z0-9_-]{0,79}$
```

Use neutral identifiers such as `land_a`, `land_b`, `water_1`, and `lake_1`. Application logic must not depend on geography-specific IDs.

A full local IndexedDB surface record is equivalent to:

```json
{
  "id": "land_a",
  "elementId": "land_a",
  "name": "Land A",
  "automatic": {
    "terrainType": "land",
    "confidence": 0.82,
    "evidence": ["explicit_region"]
  },
  "metadataTerrainType": "land",
  "hostOverride": null,
  "terrainType": "land",
  "classificationSource": "metadata",
  "confidence": 0.82,
  "coastType": "lake",
  "portAllowed": true,
  "portPreference": null,
  "adjacentSurfaceIds": ["lake_1"],
  "claimNeighborIds": ["land_b"],
  "landNeighborIds": ["land_b"],
  "touchesRootBoundary": false,
  "synthetic": false,
  "bounds": { "x": 20, "y": 10, "width": 40, "height": 30 },
  "boundary": [[{"x":20,"y":10},{"x":60,"y":10}]],
  "geometry": null,
  "price": 10000,
  "income": 1000
}
```

Terrain is one of `land`, `ocean`, `lake`, or `ignored`. Effective precedence is:

1. `hostOverride`
2. `metadataTerrainType`
3. `automatic.terrainType`

`classificationSource` must agree with that precedence. Confidence is clamped to `0.0…1.0`; it describes the automatic result and is not promoted to certainty by viewport size.

Only effective `land` surfaces enter the playable compatibility map. Other terrain is never priced, owned, claimed, or income-producing.

### Owned surfaces and auxiliary artwork

Ordinary SVGs often reuse a region ID on a path/polygon and a small circle, ellipse, or rectangle used as a label or centroid anchor. Version 2 groups candidates by source/normalized identity and chooses ownership deterministically: valid `data-region`/`data-terrain` metadata first, path/polygon region geometry second, and other supported shapes last.

An unmarked circle, ellipse, or rectangle is auxiliary only when root-viewBox measurement proves it is substantially smaller and contained by or centered on the owner. Size alone never demotes a shape. Explicitly marked circular regions remain surfaces, standalone meaningful circular regions remain supported, and similarly significant duplicate paths/polygons remain a blocking `DUPLICATE_ID` error.

Auxiliary nodes are not deleted. Their visual SVG attributes remain intact, they receive collision-free deterministic `aop_aux_*` DOM IDs, and they do not enter selection, pricing, adjacency, compact metadata, compatibility regions, or validation. A batch of inferred markers produces one bounded `AUXILIARY_ARTWORK` warning with a count and short sample.

## Water geometry

Explicit ocean and lake SVG elements use `elementId` and normal transformed boundary data. Water missing from the artwork is derived from root `viewBox` negative space. It uses a deterministic aspect-aware grid independent of CSS size, device pixels, camera zoom, or viewport width.

Synthetic components use compact row runs:

```json
{
  "id": "water_1",
  "elementId": null,
  "geometry": {
    "type": "grid_runs",
    "columns": 112,
    "rows": 112,
    "runs": [[0, 17], [112, 124]]
  }
}
```

Each pair is an inclusive linear cell range and never crosses a row. A component touching the root grid boundary is initially `ocean`; a fully enclosed component is initially `lake`. Stable synthetic IDs derive from normalized component cells. IndexedDB drafts retain full surface geometry. Compact SVG export and Firestore metadata omit editor evidence and per-surface boundary detail, but retain the smaller component-run navigation mask required for deterministic ship presentation.

## Coasts, adjacency, and ports

`coastType` is derived and must be `none`, `ocean`, `lake`, or `both`. It is never a host-selected terrain type. A final land surface becomes coastal only through a meaningful sampled boundary or tightly bounded grid contact with final ocean/lake water.

`portAllowed: true` is valid only when effective terrain is land and `coastType` is not `none`. New coastal land defaults to true. The host may set `portPreference: false`; inland and non-land surfaces are forced to `portAllowed: false` regardless of stale metadata.

Deniz erişimi üç seyrek alan kullanır: `navalPolicy`, `allowedRoutes`, and `blockedRoutes`. `all_coasts` bütün nihai kıyı kara çiftlerini açar ve yalnız `blockedRoutes` istisnalarını saklar; complete graph üretilmez. `selected_routes` yalnız `allowedRoutes` çiftlerini açar. `disabled` bütün deniz harekâtını kapatırken iki listeyi korur. Çiftler sırasız semantiğe sahip, leksikografik normalize edilmiş ve benzersizdir. Rota eklemek terrain veya kıyı üretmez. Legacy `compatibilityRoutes`/`seaNeighbors` verisi `selected_routes` + `allowedRoutes` olarak migrate edilir.

SVG/IndexedDB metadata çiftleri iki elemanlı diziler olarak tutar. Firestore nested-array kabul etmediği için canlı `mapDefinition` aynı çiftleri güvenli bölge kimliklerinden üretilmiş `first::second` anahtarlarıyla saklar; importer ve saf politika katmanı iki biçimi aynı canonical çifte normalize eder. Metadata room asset’i, navigasyon koşullarını da güvenli taşımak için canonical JSON string olarak yazılır ve hash/size/schema doğrulamasından sonra parse edilir.

Compact metadata ayrıca yalnız görsel gemi rotası için gerekli deterministik `navigationMask` kaydını taşır: root viewBox grid boyutu, bileşen bazlı sıkıştırılmış su hücre koşuları ve kıyı yaklaşım hücreleri. Kara ve ignored hücreleri geçilemez; final ocean/lake hücreleri geçilebilirdir. Bu maske transaction kararlarına katılmaz ve canlı room belgesine kopyalanmaz. Current claiming uses the derived land-only `landNeighbors` and `claimNeighbors` graph; a disconnected playable graph remains a blocking validation error.

## Full local document versus compact export/package

The full IndexedDB editor document preserves:

- automatic classifications and confidence evidence;
- imported metadata classifications;
- host overrides and effective terrain;
- transformed bounds and sampled boundaries;
- synthetic water geometry;
- coasts, adjacency, port permissions, naval policy/route exceptions, and the compact visual navigation mask;
- map/editor/analysis versions and hashes.

SVG exports and room metadata use the same compact, versioned representation. It preserves `mapId`, revision, classifications, host overrides, effective terrain, coast/port results, game adjacency, naval policy, sparse route exceptions, prices, hashes, and the compressed visual navigation mask. It omits history, thumbnail, original draft, detailed confidence evidence, and transformed boundary samples. This keeps the authoritative room document small while allowing every client to present the same viewBox-stable ship route.

## Content-addressed room transport

New room maps do not keep the large SVG inline in the live room document. The room stores:

```json
{
  "mapManifest": {
    "version": 1,
    "mapId": "map_neutral_1",
    "displayName": "Neutral Map",
    "revision": 3,
    "baseSvgHash": "…",
    "metadataHash": "…",
    "metadataSchemaVersion": 2,
    "analysisAlgorithmVersion": "terrain-grid-v2",
    "mapDefinitionVersion": 1
  },
  "mapDefinition": { "version": 1 },
  "mapValidation": { "valid": true },
  "mapSvg": ""
}
```

Hash-addressed documents live under `rooms/{roomCode}/mapAssets/`:

- `base_<baseSvgHash>` stores sanitized normalized base SVG.
- `metadata_<metadataHash>` stores the complete current compact metadata package.

Asset creation/deletion is host-only and lobby-only. Assets are immutable after creation. Only current room players may read them.

The client first checks the IndexedDB asset stores:

1. Matching base and metadata hashes: no Firestore asset read.
2. Matching base, changed/missing metadata: read only the metadata document.
3. Missing/different base: read both documents.
4. Any hash, schema, revision, reference, or composition mismatch: discard the attempted composition and fetch both documents safely.

There is no JSON-patch or revision-chain protocol. A compact metadata package is transferred in full when it changes.

Legacy rooms with inline `mapSvg` still render. The next host apply migrates the map to the manifest/asset layout.

## IndexedDB local repository

The version 1 local repository uses three object stores:

- `maps`, keyed by `mapId`;
- `baseAssets`, keyed by `baseSvgHash`;
- `metadataAssets`, keyed by `metadataHash`.

A full map record retains display name, original SVG, normalized base SVG, prepared export SVG, compatibility definition, automatic analysis, imported classifications, host overrides, effective terrain, water geometry, coasts, port permissions, versions, hashes, thumbnail/preview data, source label, validation, and timestamps. `mapId` and `createdAt` are immutable across edit/save/close/reopen; only explicit import-as-copy and duplicate actions allocate another identity.

The editor opens a trusted repository record directly after structural validation; it does not reparse its prepared SVG as a new upload. A logical edit marks `Kaydedilmemiş değişiklikler`, one 650 ms debounce changes the state to `Kaydediliyor…`, and a successful upsert ends at `Yerel olarak kaydedildi`. A quota/storage failure remains in memory as `Yerel kayıt başarısız — yeniden deneyin`; `Yerel Kaydet` immediately retries. Opening or closing an unchanged record performs no upsert. No local save path writes Firestore.

Previous-analysis records are shown as requiring reanalysis and cannot be exported or applied to a room. `Analizi Sıfırla` force-reanalyzes the retained `originalSvg` when present, falls back to `baseSvg` only when necessary, and preserves `mapId`, `createdAt`, revision, display name, and source label while replacing IDs normalized by the old importer.

## Validation and security

Untrusted SVG input has a strict 1,000,000-byte absolute cap. Normalized base room assets remain limited to 650,000 characters and compact metadata to 450,000 characters. Import performs these checks before applying metadata:

- supported schema/editor versions and bounded JSON size;
- valid field types, terrain/coast enums, confidence and revision;
- normalized unique surface IDs;
- referenced SVG element existence;
- known adjacency references;
- source geometry hash;
- port/coast/land invariants;
- playable compatibility map, prices, income, and graph connectivity;
- compact package hash and room manifest identity.

Before parsing metadata, the SVG sanitizer removes scripts, executable animation, `foreignObject`, frames/objects/embeds, inline event handlers, unsafe external `href`/`src`, CSS imports, and unsafe URL values. Editor overlays, selection rectangles, badges, controls, and preview UI are DOM-only and never enter export.

## Round trip, mismatch, and migration

A valid compact-metadata SVG export reimports to the same map ID, effective terrain, host overrides, coasts, port permissions, water components, and compatibility definition. Filename changes do not affect detection. A near-limit source can therefore round-trip without embedding a second copy of sampled geometry.

When a local record already has the same `mapId`, the importer asks to update it, import a new copy, or cancel. When source geometry differs, it asks to remap matching IDs, rerun analysis, import a new map, or cancel. Remapping copies only metadata for IDs that actually exist after fresh analysis. Mismatched metadata is never applied silently.

Future schemas must add an explicit migration from the previous supported version. Metadata/editor version 1 migrates to version 2 by preserving valid legacy route pairs in `selected_routes`; a route-less prepared map receives the new `all_coasts` default. Unknown versions remain rejected and require an explicit migration or force-reanalysis path.
