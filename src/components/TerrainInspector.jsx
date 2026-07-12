import { useEffect, useMemo, useRef, useState } from 'react';
import { lowConfidenceReviewSurfaces } from '../game/terrainReview';
import { NAVAL_POLICIES, isNavalRouteAllowed } from '../game/navalPolicy';

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
  onReviewSurface,
  section: controlledSection,
  onSectionChange,
  classificationFocusRequest = 0,
  readOnly = false,
  navalSourceId,
  onNavalSourceChange,
  onNavalPolicyChange,
  onNavalRouteToggle,
  onResetNavalRoutes,
}) {
  const [internalSection, setInternalSection] = useState('terrain');
  const [classificationEmphasis, setClassificationEmphasis] = useState(false);
  const classificationRef = useRef(null);
  const section = controlledSection || internalSection;
  const setSection = (nextSection) => {
    if (!controlledSection) setInternalSection(nextSection);
    onSectionChange?.(nextSection);
  };
  const [boundaryTerrain, setBoundaryTerrain] = useState('');
  const [interiorTerrain, setInteriorTerrain] = useState('');
  const [outsideEnabled, setOutsideEnabled] = useState(false);
  const [outsideTerrain, setOutsideTerrain] = useState('land');
  const selected = document.surfacesById[inspectedId] || document.surfacesById[selectedIds.at(-1)];
  const selectedSurfaces = useMemo(() => selectedIds.map((id) => document.surfacesById[id]).filter(Boolean), [document, selectedIds]);
  const lowConfidence = useMemo(() => lowConfidenceReviewSurfaces(document), [document]);
  const coastalLands = useMemo(() => document.surfaces.filter((surface) => surface.terrainType === 'land' && surface.coastType !== 'none'), [document]);
  const disabledPorts = useMemo(() => coastalLands.filter((surface) => !surface.portAllowed), [coastalLands]);
  const navalMap = useMemo(() => ({
    navalPolicy: document.navalPolicy,
    allowedRoutes: document.allowedRoutes || [],
    blockedRoutes: document.blockedRoutes || [],
    regionIds: coastalLands.map((surface) => surface.id),
    regionsById: Object.fromEntries(coastalLands.map((surface) => [surface.id, surface])),
  }), [coastalLands, document.allowedRoutes, document.blockedRoutes, document.navalPolicy]);
  const navalSource = navalMap.regionsById[navalSourceId] || null;

  useEffect(() => {
    if (!classificationFocusRequest || section !== 'terrain') return undefined;
    const panel = classificationRef.current;
    panel?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    panel?.querySelector('button:not([disabled])')?.focus();
    setClassificationEmphasis(true);
    const timer = window.setTimeout(() => setClassificationEmphasis(false), 1_200);
    return () => window.clearTimeout(timer);
  }, [classificationFocusRequest, section]);

  return (
    <aside className="aop-terrain-inspector" aria-label="Harita düzenleyici denetçisi">
      <div className="aop-inspector-tabs" role="tablist" aria-label="Denetçi bölümü">
        <button type="button" role="tab" aria-selected={section === 'terrain'} onClick={() => setSection('terrain')}>Arazi Analizi</button>
        <button type="button" role="tab" aria-selected={section === 'coasts'} onClick={() => setSection('coasts')}>Kıyılar ve Limanlar</button>
        <button type="button" role="tab" aria-selected={section === 'naval'} onClick={() => setSection('naval')}>Deniz Erişimi</button>
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
          <section className="aop-analysis-review">
            <div className="aop-label">Düşük güvenli yüzeyler</div>
            <p><strong>{lowConfidence.length}</strong> otomatik sonuç inceleme eşiğinin altında.</p>
            {lowConfidence.length > 0 && (
              <ul className="aop-review-list" aria-label="Düşük güvenli yüzey inceleme listesi">
                {lowConfidence.map((surface) => {
                  const isSelected = selectedIds.includes(surface.id);
                  return (
                    <li key={surface.id}>
                      <button
                        type="button"
                        className="aop-review-surface"
                        data-surface-id={surface.id}
                        aria-pressed={isSelected}
                        onClick={() => { setSection('terrain'); onReviewSurface?.(surface.id); }}
                      >
                        <span aria-hidden="true" className="aop-review-marker">{isSelected ? '◆' : '◇'}</span>
                        <span>{surface.name}</span>
                        <small>%{Math.round(surface.automatic.confidence * 100)}</small>
                        {isSelected && <strong>Seçili</strong>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
          <section ref={classificationRef} className={`aop-classification-panel ${classificationEmphasis ? 'is-emphasized' : ''}`}>
            <div className="aop-label">Seçimi Sınıflandır</div>
            <div className="aop-terrain-choice-grid">
              {Object.entries(TERRAIN_LABELS).map(([value, label]) => (
                <button key={value} type="button" disabled={readOnly || !selectedIds.length} onClick={() => onClassify(value)}>{label}</button>
              ))}
            </div>
            <button type="button" className="aop-editor-text-button" disabled={readOnly || !selectedSurfaces.some((surface) => surface.hostOverride)} onClick={onReset}>
              Otomatik sonuca dön
            </button>
          </section>
          {selected ? <AnalysisFacts surface={selected} document={document} /> : <p className="aop-inspector-empty">Analiz ayrıntıları için bir yüzey seç. Düşük güvenli sonuçları haritadaki tarama deseniyle de ayırt edebilirsin.</p>}
          {!readOnly && selectedIds.length > 0 && (
            <section className="aop-boundary-panel">
              <div className="aop-label">Kalıcı Seçim</div>
              <p>{selectedIds.length} yüzey seçili. İçini doldurmak istediğin alanın tamamını değil, bitişik yüzeylerden oluşan bağlı bir halka seçmelisin.</p>
              <button type="button" className="aop-button-secondary" onClick={onAnalyzeBoundary}>Seçimi Sınır Halkası Olarak Analiz Et</button>
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
      ) : section === 'coasts' ? (
        <div className="aop-inspector-scroll">
          <section>
            <div className="aop-label">Kıyı Özeti</div>
            <div className="aop-terrain-summary-grid">
              <span><strong>{document.summary.coastalLandCount}</strong>Kıyı kara</span>
              <span><strong>{document.summary.portAllowedCount}</strong>Liman izni</span>
              <span><strong>{disabledPorts.length}</strong>Devre dışı</span>
            </div>
          </section>
          <section className="aop-coastal-eligibility">
            <div className="aop-label">Liman kurulabilir kıyılar</div>
            {coastalLands.length ? <ul>{coastalLands.map((surface) => <li key={surface.id}><span>{surface.name}</span><strong>{surface.portAllowed ? 'İzinli' : 'Devre dışı'}</strong></li>)}</ul> : <p>Final terrain verisinde kıyı kara yüzeyi yok.</p>}
            {disabledPorts.length > 0 && <p className="aop-validation-note is-warning">{disabledPorts.length} kıyı kara yüzeyinde liman izni kurucu tarafından devre dışı bırakılmış.</p>}
          </section>
          {selected?.terrainType === 'land' ? (
            <section className="aop-port-permission">
              <div className="aop-label">Seçili kıyı karası</div>
              <h3>{selected.name}</h3>
              <CoastFacts surface={selected} document={document} />
              <label className="aop-check-row">
                <input
                  type="checkbox"
                  checked={selected.portAllowed}
                  disabled={readOnly || selected.terrainType !== 'land' || selected.coastType === 'none'}
                  onChange={(event) => onPortChange(selected.id, event.target.checked)}
                />
                Bu kıyıda liman kurulabilir
              </label>
              {selected.terrainType === 'land' && selected.coastType === 'none' && <p className="aop-validation-note">İç bölgeler liman kurulabilir olarak işaretlenemez.</p>}
              {selected.coastType !== 'none' && !selected.portAllowed && <p className="aop-validation-note is-warning">Liman izni devre dışı. Bu kıyıda yeni liman kurulamaz.</p>}
            </section>
          ) : <p className="aop-inspector-empty">Kıyı ayrıntıları için bir kara yüzeyi seç. Su ve yoksayılan yüzeylerde liman izni bulunmaz.</p>}
          {document.invalidatedCompatibilityRoutes?.length > 0 && <p className="aop-validation-note is-warning">{document.invalidatedCompatibilityRoutes.length} eski deniz rotası terrain değişikliği nedeniyle geçersiz.</p>}
        </div>
      ) : (
        <div className="aop-inspector-scroll aop-naval-access-panel">
          <section className="aop-naval-policy-card">
            <div className="aop-label">Deniz Doktrini</div>
            <h3>Deniz Erişimi</h3>
            <p>Rotalar yalnız nihai kıyı kara bölgeleri arasında çalışır. Bir rota kıyı üretmez.</p>
            <label>Politika modu
              <select
                aria-label="Deniz politikası"
                value={document.navalPolicy}
                disabled={readOnly}
                onChange={(event) => onNavalPolicyChange?.(event.target.value)}
              >
                <option value={NAVAL_POLICIES.ALL_COASTS}>Bütün kıyılar</option>
                <option value={NAVAL_POLICIES.SELECTED_ROUTES}>Yalnız seçili rotalar</option>
                <option value={NAVAL_POLICIES.DISABLED}>Deniz harekâtı kapalı</option>
              </select>
            </label>
            {readOnly && <p className="aop-validation-note">Salt okunur görünüm — ayarları yalnız oda kurucusu değiştirebilir.</p>}
          </section>

          {document.navalPolicy === NAVAL_POLICIES.DISABLED ? (
            <section className="aop-naval-disabled-card">
              <strong>Deniz harekâtı devre dışı</strong>
              <p>Liman, gemi, deniz nakli ve deniz saldırısı savaş masasında gösterilmeyecek. Mevcut rota listeleri korunuyor.</p>
            </section>
          ) : (
            <>
              <section>
                <div className="aop-label">1 · Kaynak Kıyı</div>
                <div className="aop-naval-source-list">
                  {coastalLands.map((surface) => (
                    <button
                      type="button"
                      key={surface.id}
                      className={surface.id === navalSourceId ? 'is-selected' : ''}
                      aria-pressed={surface.id === navalSourceId}
                      onClick={() => onNavalSourceChange?.(surface.id)}
                    >
                      <span>{surface.name}</span>
                      <small>{COAST_LABELS[surface.coastType]} · {surface.portAllowed ? 'Liman açık' : 'Liman kurulamaz'}</small>
                    </button>
                  ))}
                </div>
              </section>

              {navalSource ? (
                <section>
                  <div className="aop-label">2 · Hedef Erişimi</div>
                  <h3>{navalSource.name}</h3>
                  <div className="aop-naval-target-list">
                    {coastalLands.filter((surface) => surface.id !== navalSource.id).map((target) => {
                      const access = isNavalRouteAllowed(navalMap, navalSource.id, target.id);
                      return (
                        <button
                          type="button"
                          key={target.id}
                          className={access.allowed ? 'is-allowed' : 'is-blocked'}
                          disabled={readOnly}
                          onClick={() => onNavalRouteToggle?.(navalSource.id, target.id, access.allowed)}
                        >
                          <span>{target.name}</span>
                          <strong>{access.allowed ? 'ERİŞİLEBİLİR' : document.navalPolicy === NAVAL_POLICIES.ALL_COASTS ? 'ENGELLİ' : 'İZİNSİZ'}</strong>
                          <small>{target.portAllowed ? COAST_LABELS[target.coastType] : `${COAST_LABELS[target.coastType]} · Liman kurulamaz`}</small>
                        </button>
                      );
                    })}
                  </div>
                </section>
              ) : <p className="aop-inspector-empty">Bağlantılarını görmek için nihai bir kıyı kara bölgesi seç.</p>}
            </>
          )}

          {!readOnly && (
            <section className="aop-route-reset-card">
              <div className="aop-label">Rota Hafızası</div>
              <p>{document.allowedRoutes?.length || 0} izin · {document.blockedRoutes?.length || 0} engel kayıtlı.</p>
              <button type="button" className="aop-button-secondary" onClick={onResetNavalRoutes}>Rota Ayarlarını Sıfırla</button>
            </section>
          )}
        </div>
      )}
    </aside>
  );
}

function AnalysisFacts({ surface, document }) {
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
        <div><dt>Güven</dt><dd>%{Math.round(surface.confidence * 100)}{surface.confidence < 0.65 ? ' · İnceleme önerilir' : ''}</dd></div>
        {surface.metadataTerrainType && <div><dt>Metadata tahmini</dt><dd>{TERRAIN_LABELS[surface.metadataTerrainType]}</dd></div>}
        <div><dt>Sınıflandırma kaynağı</dt><dd>{SOURCE_LABELS[surface.classificationSource]}</dd></div>
        <div><dt>Komşu kara</dt><dd>{adjacentLand.length ? adjacentLand.map((item) => item.name).join(', ') : 'Yok'}</dd></div>
        <div><dt>Komşu su</dt><dd>{adjacentWater.length ? adjacentWater.map((item) => item.name).join(', ') : 'Yok'}</dd></div>
      </dl>
    </section>
  );
}

function CoastFacts({ surface, document }) {
  const touchingWater = surface.adjacentSurfaceIds
    .map((id) => document.surfacesById[id])
    .filter((candidate) => candidate?.terrainType === 'ocean' || candidate?.terrainType === 'lake');
  const eligible = surface.terrainType === 'land' && surface.coastType !== 'none';
  return (
    <dl>
      <div><dt>Kıyı türü</dt><dd>{COAST_LABELS[surface.coastType]}</dd></div>
      <div><dt>Temas eden su</dt><dd>{touchingWater.length ? touchingWater.map((item) => `${item.name} (${TERRAIN_LABELS[item.terrainType]})`).join(', ') : 'Yok'}</dd></div>
      <div><dt>Liman uygunluğu</dt><dd>{eligible ? 'Kıyı kara — değiştirilebilir' : 'Uygun değil'}</dd></div>
      <div><dt>Liman izni</dt><dd>{surface.portAllowed ? 'Açık' : 'Devre dışı'}</dd></div>
    </dl>
  );
}
