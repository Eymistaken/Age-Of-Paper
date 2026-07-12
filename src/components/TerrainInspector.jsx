import { useMemo, useState } from 'react';

const TERRAIN_LABELS = {
  land: 'Kara', ocean: 'Okyanus', lake: 'Göl', ignored: 'Yoksay',
};

const SOURCE_LABELS = {
  automatic: 'Otomatik analiz', metadata: 'İçe aktarılan metadata', host_override: 'Kurucu düzeltmesi',
};

const COAST_LABELS = {
  none: 'Kıyı değil', ocean: 'Okyanus kıyısı', lake: 'Göl kıyısı', both: 'Okyanus ve göl kıyısı',
};

export function TerrainLegend() {
  return (
    <div className="aop-terrain-legend" aria-label="Arazi göstergeleri">
      <span><i className="is-land" /> Kara</span>
      <span><i className="is-ocean" /> Okyanus</span>
      <span><i className="is-lake" /> Göl</span>
      <span><i className="is-ignored" /> Yoksay</span>
      <span><i className="is-low" /> Düşük güven</span>
      <span><i className="is-override" /> Kurucu düzeltmesi</span>
      <span><i className="is-ocean-coast" /> Okyanus kıyısı</span>
      <span><i className="is-lake-coast" /> Göl kıyısı</span>
      <span><i className="is-both-coast" /> İki kıyı türü</span>
      <span><b aria-hidden="true">⚓</b> Liman açık</span>
      <span><b aria-hidden="true">⚓̸</b> Liman kapalı</span>
    </div>
  );
}

export function TerrainInspector({
  document,
  selectedIds,
  inspectedId,
  onClassify,
  onReset,
  onPortChange,
  onAnalyzeBoundary,
  boundaryPreview,
  onApplyBoundaryBatch,
}) {
  const [section, setSection] = useState('terrain');
  const [boundaryTerrain, setBoundaryTerrain] = useState('');
  const [interiorTerrain, setInteriorTerrain] = useState('');
  const [outsideEnabled, setOutsideEnabled] = useState(false);
  const [outsideTerrain, setOutsideTerrain] = useState('land');
  const selected = document.surfacesById[inspectedId] || document.surfacesById[selectedIds.at(-1)];
  const selectedSurfaces = useMemo(() => selectedIds.map((id) => document.surfacesById[id]).filter(Boolean), [document, selectedIds]);

  return (
    <aside className="aop-terrain-inspector" aria-label="Harita düzenleyici denetçisi">
      <div className="aop-inspector-tabs" role="tablist" aria-label="Denetçi bölümü">
        <button type="button" role="tab" aria-selected={section === 'terrain'} onClick={() => setSection('terrain')}>Arazi Analizi</button>
        <button type="button" role="tab" aria-selected={section === 'coasts'} onClick={() => setSection('coasts')}>Kıyılar ve Limanlar</button>
      </div>

      {section === 'terrain' ? (
        <div className="aop-inspector-scroll">
          <section>
            <div className="aop-label">Analiz Özeti</div>
            <div className="aop-terrain-summary-grid">
              <span><strong>{document.summary.playableLandCount}</strong>Kara</span>
              <span><strong>{document.summary.oceanCount}</strong>Okyanus</span>
              <span><strong>{document.summary.lakeCount}</strong>Göl</span>
              <span><strong>{document.summary.ignoredCount}</strong>Yoksay</span>
            </div>
          </section>
          <TerrainLegend />
          <section>
            <div className="aop-label">Seçimi Sınıflandır</div>
            <div className="aop-terrain-choice-grid">
              {Object.entries(TERRAIN_LABELS).map(([value, label]) => (
                <button key={value} type="button" disabled={!selectedIds.length} onClick={() => onClassify(value)}>{label}</button>
              ))}
            </div>
            <button type="button" className="aop-editor-text-button" disabled={!selectedSurfaces.some((surface) => surface.hostOverride)} onClick={onReset}>
              Otomatik sonuca dön
            </button>
          </section>
          {selected ? <SurfaceFacts surface={selected} document={document} /> : <p className="aop-inspector-empty">Ayrıntıları görmek için bir yüzey seç.</p>}
          {selectedIds.length > 0 && (
            <section className="aop-boundary-panel">
              <div className="aop-label">Kalıcı Seçim</div>
              <p>{selectedIds.length} yüzey seçili. Seçimi önerilen bir sınır olarak inceleyebilirsin.</p>
              <button type="button" className="aop-button-secondary" onClick={onAnalyzeBoundary}>Sınır ve İç Alanı Analiz Et</button>
              {boundaryPreview && (
                <div className={`aop-boundary-result ${boundaryPreview.valid ? 'is-valid' : 'is-invalid'}`}>
                  {boundaryPreview.valid ? (
                    <>
                      <p>{boundaryPreview.boundaryIds.length} sınır · {boundaryPreview.interiorIds.length} iç · {boundaryPreview.outsideIds.length} dış yüzey</p>
                      <label>Sınır
                        <select value={boundaryTerrain} onChange={(event) => setBoundaryTerrain(event.target.value)}>
                          <option value="">Değiştirme</option>
                          {Object.entries(TERRAIN_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </select>
                      </label>
                      <label>İç alan
                        <select value={interiorTerrain} onChange={(event) => setInteriorTerrain(event.target.value)}>
                          <option value="">Değiştirme</option>
                          {Object.entries(TERRAIN_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </select>
                      </label>
                      <details>
                        <summary>Gelişmiş: seçim dışındaki her yüzeyi geçersiz kıl</summary>
                        <label className="aop-check-row"><input type="checkbox" checked={outsideEnabled} onChange={(event) => setOutsideEnabled(event.target.checked)} /> Dış alanın tamamını değiştir</label>
                        {outsideEnabled && <select value={outsideTerrain} onChange={(event) => setOutsideTerrain(event.target.value)}>{Object.entries(TERRAIN_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>}
                      </details>
                      <button type="button" className="aop-button" disabled={!boundaryTerrain && !interiorTerrain && !outsideEnabled} onClick={() => onApplyBoundaryBatch({
                        boundaryTerrain, interiorTerrain, outsideTerrain: outsideEnabled ? outsideTerrain : '', advanced: outsideEnabled,
                      })}>Önizle ve Uygula</button>
                    </>
                  ) : <p role="alert">{boundaryPreview.reason}</p>}
                </div>
              )}
            </section>
          )}
        </div>
      ) : (
        <div className="aop-inspector-scroll">
          <section>
            <div className="aop-label">Kıyı Özeti</div>
            <div className="aop-terrain-summary-grid">
              <span><strong>{document.summary.coastalLandCount}</strong>Kıyı kara</span>
              <span><strong>{document.summary.portAllowedCount}</strong>Liman izni</span>
            </div>
          </section>
          <TerrainLegend />
          {selected ? (
            <section className="aop-port-permission">
              <div className="aop-label">Seçili Yüzey</div>
              <h3>{selected.name}</h3>
              <dl><div><dt>Kıyı türü</dt><dd>{COAST_LABELS[selected.coastType]}</dd></div><div><dt>Liman izni</dt><dd>{selected.portAllowed ? 'Açık' : 'Kapalı'}</dd></div></dl>
              <label className="aop-check-row">
                <input
                  type="checkbox"
                  checked={selected.portAllowed}
                  disabled={selected.terrainType !== 'land' || selected.coastType === 'none'}
                  onChange={(event) => onPortChange(selected.id, event.target.checked)}
                />
                Bu kıyıda liman kurulabilir
              </label>
              {selected.terrainType === 'land' && selected.coastType === 'none' && <p className="aop-validation-note">İç bölgeler liman kurulabilir olarak işaretlenemez.</p>}
            </section>
          ) : <p className="aop-inspector-empty">Kıyı ve liman iznini görmek için bir yüzey seç.</p>}
          {document.invalidatedCompatibilityRoutes?.length > 0 && <p className="aop-validation-note is-warning">{document.invalidatedCompatibilityRoutes.length} eski deniz rotası terrain değişikliği nedeniyle geçersiz.</p>}
        </div>
      )}
    </aside>
  );
}

function SurfaceFacts({ surface, document }) {
  const adjacent = surface.adjacentSurfaceIds.map((id) => document.surfacesById[id]).filter(Boolean);
  const adjacentLand = adjacent.filter((item) => item.terrainType === 'land');
  const adjacentWater = adjacent.filter((item) => item.terrainType === 'ocean' || item.terrainType === 'lake');
  return (
    <section className="aop-surface-facts">
      <div className="aop-label">Seçili Yüzey</div>
      <h3>{surface.name}</h3>
      <dl>
        <div><dt>Nihai tür</dt><dd>{TERRAIN_LABELS[surface.terrainType]}</dd></div>
        <div><dt>Otomatik tahmin</dt><dd>{TERRAIN_LABELS[surface.automatic.terrainType]} · %{Math.round(surface.automatic.confidence * 100)}</dd></div>
        {surface.metadataTerrainType && <div><dt>Metadata tahmini</dt><dd>{TERRAIN_LABELS[surface.metadataTerrainType]}</dd></div>}
        <div><dt>Kaynak</dt><dd>{SOURCE_LABELS[surface.classificationSource]}</dd></div>
        <div><dt>Kıyı</dt><dd>{COAST_LABELS[surface.coastType]}</dd></div>
        <div><dt>Kara komşular</dt><dd>{adjacentLand.length ? adjacentLand.map((item) => item.name).join(', ') : 'Yok'}</dd></div>
        <div><dt>Su komşular</dt><dd>{adjacentWater.length ? adjacentWater.map((item) => item.name).join(', ') : 'Yok'}</dd></div>
      </dl>
    </section>
  );
}
