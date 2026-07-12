import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { analyzeSelectedBoundary, previewBatchTerrainChange } from '../game/boundaryAnalysis';
import { createHistory, executeCommand, redo, undo } from '../game/editorHistory';
import { prepareSvgMap, rebuildPreparedMap } from '../game/mapImporter';
import { buildCompatibilityMapDefinition, deriveTerrainDocument } from '../game/terrainModel';
import { validateMapDefinition } from '../game/mapValidation';
import { TerrainInspector } from './TerrainInspector';
import { TerrainMapCanvas } from './TerrainMapCanvas';

const FOCUSABLE = 'button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[href],[tabindex]:not([tabindex="-1"])';

function fileSafeName(value) {
  return String(value || 'harita').trim().replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, '_').slice(0, 100) || 'harita';
}

function triggerSvgDownload(svg, filename) {
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename.endsWith('.svg') ? filename : `${filename}.svg`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function TerrainMapEditor({ initialRecord, repository, onApply, onClose, onDraftChange }) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef(null);
  const canvasRef = useRef(null);
  const saveTimerRef = useRef(null);
  const latestRecordRef = useRef(initialRecord);
  const [record, setRecord] = useState(initialRecord);
  const [history, setHistory] = useState(() => createHistory(initialRecord.terrainDocument));
  const [selectedIds, setSelectedIds] = useState([]);
  const [inspectedId, setInspectedId] = useState(null);
  const [tool, setTool] = useState('select');
  const [temporaryHand, setTemporaryHand] = useState(false);
  const [brushMode, setBrushMode] = useState('add');
  const [viewMode, setViewMode] = useState('final');
  const [zoom, setZoom] = useState(1);
  const [saveStatus, setSaveStatus] = useState('Kaydedildi — yerel');
  const [dirtyRoom, setDirtyRoom] = useState(initialRecord.appliedToRoom !== true);
  const [activeGesture, setActiveGesture] = useState(false);
  const [boundaryPreview, setBoundaryPreview] = useState(null);
  const [batchPreview, setBatchPreview] = useState(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [filename, setFilename] = useState(`${fileSafeName(initialRecord.displayName)}_ageofpaper.svg`);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [displayName, setDisplayName] = useState(initialRecord.displayName);
  const editorDocument = history.present;
  const previewDocument = batchPreview?.document || editorDocument;
  latestRecordRef.current = record;
  const currentValidation = useMemo(() => validateMapDefinition(buildCompatibilityMapDefinition(editorDocument)), [editorDocument]);

  useEffect(() => setDisplayName(editorDocument.displayName || record.displayName), [editorDocument.displayName, record.displayName]);

  const canvasRecord = useMemo(() => {
    if (viewMode === 'final') return { ...record, terrainDocument: previewDocument };
    const automatic = deriveTerrainDocument({
      ...previewDocument,
      surfaces: previewDocument.surfaces.map((surface) => ({ ...surface, metadataTerrainType: null, hostOverride: null })),
    });
    return { ...record, terrainDocument: automatic };
  }, [previewDocument, record, viewMode]);

  const persist = useCallback(async (nextDocument = editorDocument) => {
    setSaveStatus('Kaydediliyor…');
    try {
      const rebuilt = await rebuildPreparedMap(latestRecordRef.current, nextDocument, { displayName: nextDocument.displayName });
      await repository.savePreparedMap(rebuilt);
      latestRecordRef.current = rebuilt;
      setRecord(rebuilt);
      setSaveStatus('Kaydedildi — yerel');
      onDraftChange?.(rebuilt);
      return rebuilt;
    } catch (error) {
      setSaveStatus('Yerel kayıt başarısız');
      setFeedback(error?.name === 'QuotaExceededError'
        ? 'Tarayıcı depolama kotası dolu. Aktif taslak bellekte korunuyor.'
        : `Yerel kayıt başarısız: ${error.message}`);
      throw error;
    }
  }, [editorDocument, onDraftChange, repository]);

  useEffect(() => {
    window.clearTimeout(saveTimerRef.current);
    setSaveStatus('Kaydediliyor…');
    saveTimerRef.current = window.setTimeout(() => persist(history.present).catch(() => {}), 650);
    return () => window.clearTimeout(saveTimerRef.current);
  }, [history.present, persist]);

  const commitDocument = (next, label) => {
    setHistory((current) => executeCommand(current, deriveTerrainDocument(next), label));
    setDirtyRoom(true);
    setBoundaryPreview(null);
    setBatchPreview(null);
  };

  const requestClose = useCallback(async () => {
    if (pending) return;
    window.clearTimeout(saveTimerRef.current);
    try { await persist(history.present); } catch {
      setFeedback('Yerel taslak güvenle kaydedilemediği için editör açık tutuluyor. Depolama alanını boşaltıp yeniden dene veya SVG dışa aktar.');
      return;
    }
    if (dirtyRoom && !window.confirm('Yerel taslak kaydedildi ancak odaya uygulanmadı. Editörü kapatmak istiyor musun?')) return;
    onClose();
  }, [dirtyRoom, history.present, onClose, pending, persist]);

  useEffect(() => {
    const returnFocus = document.activeElement;
    const appRoot = document.getElementById('root');
    const previousRootInert = appRoot?.inert;
    const previousRootHidden = appRoot?.getAttribute('aria-hidden');
    const bodyOverflow = document.body.style.overflow;
    const htmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    if (appRoot) {
      appRoot.inert = true;
      appRoot.setAttribute('aria-hidden', 'true');
    }
    dialogRef.current?.focus();
    return () => {
      document.body.style.overflow = bodyOverflow;
      document.documentElement.style.overflow = htmlOverflow;
      if (appRoot) {
        appRoot.inert = previousRootInert;
        if (previousRootHidden === null) appRoot.removeAttribute('aria-hidden');
        else appRoot.setAttribute('aria-hidden', previousRootHidden);
      }
      returnFocus?.focus?.();
    };
  }, []);

  const cancelTopOperation = useCallback(() => {
    if (activeGesture || canvasRef.current?.hasActiveGesture()) {
      canvasRef.current?.cancelGesture();
      setActiveGesture(false);
      return true;
    }
    if (batchPreview) { setBatchPreview(null); return true; }
    if (exportOpen) { setExportOpen(false); return true; }
    return false;
  }, [activeGesture, batchPreview, exportOpen]);

  useEffect(() => {
    const onKeyDown = (event) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(event.target?.tagName);
      if (event.key === 'Tab') {
        const focusable = [...(dialogRef.current?.querySelectorAll(FOCUSABLE) || [])];
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        if (cancelTopOperation()) return;
        if (selectedIds.length) { setSelectedIds([]); setInspectedId(null); return; }
        requestClose();
        return;
      }
      if (event.ctrlKey && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        setHistory((current) => undo(current));
        setDirtyRoom(true);
        return;
      }
      if (event.ctrlKey && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        setHistory((current) => redo(current));
        setDirtyRoom(true);
        return;
      }
      if (typing) return;
      if (event.code === 'Space') { event.preventDefault(); setTemporaryHand(true); return; }
      const key = event.key.toLowerCase();
      if (key === 'h' || key === 'v' || key === 'b') {
        event.preventDefault();
        setTool({ h: 'hand', v: 'select', b: 'brush' }[key]);
      }
    };
    const onKeyUp = (event) => { if (event.code === 'Space') setTemporaryHand(false); };
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('keyup', onKeyUp, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('keyup', onKeyUp, true);
    };
  }, [cancelTopOperation, requestClose, selectedIds.length]);

  const classifySelection = (terrainType) => commitDocument({
    ...editorDocument,
    surfaces: editorDocument.surfaces.map((surface) => selectedIds.includes(surface.id)
      ? { ...surface, hostOverride: terrainType }
      : surface),
  }, `${selectedIds.length} yüzeyi ${terrainType} yap`);

  const resetSelection = () => commitDocument({
    ...editorDocument,
    surfaces: editorDocument.surfaces.map((surface) => selectedIds.includes(surface.id)
      ? { ...surface, hostOverride: null }
      : surface),
  }, 'Otomatik analize dön');

  const changePort = (surfaceId, allowed) => commitDocument({
    ...editorDocument,
    surfaces: editorDocument.surfaces.map((surface) => surface.id === surfaceId
      ? { ...surface, portPreference: allowed }
      : surface),
  }, allowed ? 'Liman iznini aç' : 'Liman iznini kapat');

  const analyzeBoundary = () => setBoundaryPreview(analyzeSelectedBoundary(editorDocument, selectedIds));

  const previewBoundaryBatch = (choices) => {
    const groups = [
      { ids: boundaryPreview.boundaryIds, terrainType: choices.boundaryTerrain },
      { ids: boundaryPreview.interiorIds, terrainType: choices.interiorTerrain },
      { ids: choices.advanced ? boundaryPreview.outsideIds : [], terrainType: choices.outsideTerrain },
    ];
    const preview = previewBatchTerrainChange(editorDocument, groups);
    const map = buildCompatibilityMapDefinition(preview.document);
    const validation = validateMapDefinition(map);
    setViewMode('final');
    setBatchPreview({ ...preview, validation, groups, advanced: choices.advanced });
  };

  const applyRoom = async () => {
    if (pending) return;
    setPending(true);
    setFeedback('');
    try {
      const local = await persist(editorDocument);
      const applied = await rebuildPreparedMap(local, editorDocument, { bumpRevision: true, displayName });
      await onApply(applied);
      await repository.savePreparedMap({ ...applied, appliedToRoom: true });
      latestRecordRef.current = applied;
      setRecord(applied);
      setDirtyRoom(false);
      setSaveStatus('Kaydedildi — odaya uygulandı');
    } catch (error) {
      setFeedback(error.message || 'Harita odaya uygulanamadı.');
    } finally {
      setPending(false);
    }
  };

  const exportMap = async () => {
    if (pending) return;
    setPending(true);
    try {
      const latest = await rebuildPreparedMap(latestRecordRef.current, editorDocument, { displayName });
      try {
        await repository.savePreparedMap(latest);
        latestRecordRef.current = latest;
        setRecord(latest);
        setSaveStatus('Kaydedildi — yerel');
      } catch {
        setSaveStatus('Yerel kayıt başarısız');
      }
      triggerSvgDownload(latest.preparedSvg, filename);
      setExportOpen(false);
    } catch (error) {
      setFeedback(error.message || 'SVG dışa aktarılamadı.');
    } finally {
      setPending(false);
    }
  };

  const resetAutomaticAnalysis = async () => {
    if (pending || !record.baseSvg) return;
    setPending(true);
    setFeedback('Otomatik terrain analizi yeniden çalıştırılıyor…');
    try {
      const fresh = await prepareSvgMap(record.baseSvg, {
        displayName,
        mapId: record.mapId,
        sourceLabel: record.sourceLabel,
      });
      commitDocument({ ...fresh.terrainDocument, revision: editorDocument.revision }, 'Otomatik analizi sıfırla');
      setFeedback('Otomatik analiz yenilendi; işlem geri alınabilir.');
    } catch (analysisError) {
      setFeedback(`Otomatik analiz yenilenemedi: ${analysisError.message}`);
    } finally {
      setPending(false);
    }
  };

  const commitName = () => {
    const next = displayName.trim() || 'İsimsiz Harita';
    setDisplayName(next);
    if (next !== editorDocument.displayName) commitDocument({ ...editorDocument, displayName: next }, 'Harita adını değiştir');
  };

  return createPortal(
    <div className="aop-terrain-editor-backdrop">
      <section ref={dialogRef} className="aop-terrain-editor" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} tabIndex={-1}>
        <header className="aop-terrain-editor-header">
          <div className="aop-editor-name">
            <span className="aop-label">Harita Hazırlık Masası</span>
            <input id={titleId} value={displayName} onChange={(event) => setDisplayName(event.target.value)} onBlur={commitName} aria-label="Harita görünen adı" />
          </div>
          <p id={descriptionId} className="sr-only">SVG yüzeylerini kara, okyanus, göl veya yoksayılan alan olarak hazırlayan tam ekran çalışma alanı.</p>
          <div className="aop-editor-save-state" aria-live="polite"><span className={saveStatus.includes('başarısız') ? 'is-error' : ''}>{saveStatus}</span>{dirtyRoom && <small>Odaya uygulanmadı</small>}</div>
          <div className="aop-editor-header-actions">
            <button type="button" onClick={() => setHistory((current) => undo(current))} disabled={!history.past.length || pending} aria-label="Geri al">↶ <span>Geri Al</span></button>
            <button type="button" onClick={() => setHistory((current) => redo(current))} disabled={!history.future.length || pending} aria-label="Yinele">↷ <span>Yinele</span></button>
            <button type="button" onClick={() => setExportOpen(true)} disabled={pending}>Dışa Aktar</button>
            <button type="button" onClick={resetAutomaticAnalysis} disabled={pending || !record.baseSvg}>Analizi Sıfırla</button>
            <button type="button" className="is-primary" onClick={applyRoom} disabled={pending || !currentValidation.valid}>Odaya Uygula</button>
            <button type="button" onClick={requestClose} disabled={pending} aria-label="Harita editörünü kapat">×</button>
          </div>
        </header>

        <div className="aop-terrain-editor-body">
          <nav className="aop-editor-tools" aria-label="Harita araçları">
            {[['hand', 'H', 'El / Kaydır'], ['select', 'V', 'Seç'], ['brush', 'B', 'Fırça']].map(([value, shortcut, label]) => (
              <button key={value} type="button" aria-pressed={tool === value} onClick={() => setTool(value)}><b>{shortcut}</b><span>{label}</span></button>
            ))}
            <div className="aop-editor-zoom-controls">
              <button type="button" onClick={() => canvasRef.current?.zoomIn()} aria-label="Yakınlaştır">+</button>
              <button type="button" onClick={() => canvasRef.current?.zoomOut()} aria-label="Uzaklaştır">−</button>
              <button type="button" onClick={() => canvasRef.current?.fit()} aria-label="Haritayı sığdır">⌗</button>
            </div>
          </nav>

          <main className="aop-editor-map-stage">
            <div className="aop-editor-view-toggle" role="group" aria-label="Harita veri görünümü">
              <button type="button" aria-pressed={viewMode === 'automatic'} onClick={() => setViewMode('automatic')}>Otomatik Analiz</button>
              <button type="button" aria-pressed={viewMode === 'final'} onClick={() => setViewMode('final')}>Nihai Oyun Verisi</button>
            </div>
            <TerrainMapCanvas
              ref={canvasRef}
              record={canvasRecord}
              selectedIds={selectedIds}
              onSelectionChange={setSelectedIds}
              onInspect={setInspectedId}
              tool={tool}
              temporaryHand={temporaryHand}
              brushMode={brushMode}
              onGestureChange={setActiveGesture}
              onZoomChange={setZoom}
              boundaryPreview={boundaryPreview?.valid ? boundaryPreview : null}
            />
            {tool === 'brush' && <div className="aop-touch-brush-mode" role="group" aria-label="Dokunmatik fırça modu"><button type="button" aria-pressed={brushMode === 'add'} onClick={() => setBrushMode('add')}>Ekle</button><button type="button" aria-pressed={brushMode === 'subtract'} onClick={() => setBrushMode('subtract')}>Çıkar</button></div>}
            {selectedIds.length > 0 && <div className="aop-selection-bar"><strong>{selectedIds.length} yüzey seçili</strong><button type="button" onClick={() => setInspectorOpen(true)}>Sınıflandır</button><button type="button" onClick={analyzeBoundary}>Sınır ve İçi Analiz Et</button><button type="button" onClick={() => { setSelectedIds([]); setInspectedId(null); }}>Temizle</button></div>}
          </main>

          <div className={`aop-editor-inspector-wrap ${inspectorOpen ? 'is-open' : ''}`}>
            <button type="button" className="aop-inspector-mobile-close" onClick={() => setInspectorOpen(false)}>Haritaya Dön</button>
            <TerrainInspector
              document={editorDocument}
              selectedIds={selectedIds}
              inspectedId={inspectedId}
              onClassify={classifySelection}
              onReset={resetSelection}
              onPortChange={changePort}
              onAnalyzeBoundary={analyzeBoundary}
              boundaryPreview={boundaryPreview}
              onApplyBoundaryBatch={previewBoundaryBatch}
            />
          </div>
        </div>

        <footer className="aop-terrain-statusbar"><span>Araç: {temporaryHand ? 'Geçici El' : tool === 'hand' ? 'El' : tool === 'select' ? 'Seç' : 'Fırça'}</span><span>{selectedIds.length} seçim</span><span>%{Math.round(zoom * 100)}</span><span>H/V/B · Boşluk: El · Ctrl+Z/Y · Esc</span></footer>

        {feedback && <div className="aop-editor-feedback" role="alert">{feedback}</div>}

        {batchPreview && <div className="aop-editor-confirm-backdrop"><section className="aop-editor-confirm" role="alertdialog" aria-modal="true" aria-label="Toplu arazi değişikliği onayı"><div className="aop-label">Toplu Değişiklik Önizlemesi</div><h2>{batchPreview.changedSurfaceCount} yüzey değişecek</h2><ul><li>Sınır: {batchPreview.groups[0].ids.length} · İç: {batchPreview.groups[1].ids.length} · Dış: {batchPreview.groups[2].ids.length}</li><li>Oynanabilir bölge farkı: {batchPreview.playableDelta >= 0 ? '+' : ''}{batchPreview.playableDelta}</li><li>Değişen/kaldırılan adjacency: {batchPreview.changedAdjacencyCount}</li><li>Değişen kıyı: {batchPreview.changedCoastIds.length}</li><li>Devre dışı liman: {batchPreview.disabledPortIds.length}</li><li>Geçersiz legacy rota: {batchPreview.invalidatedCompatibilityRoutes.length}</li><li>Doğrulama: {batchPreview.validation.errors.length} hata · {batchPreview.validation.warnings.length} uyarı</li></ul>{batchPreview.advanced && <p className="aop-validation-note is-warning">Gelişmiş dış alan override’ı mevcut otomatik, metadata ve kurucu sonuçlarını yüzde yüz değiştirecek.</p>}<div><button type="button" className="aop-button" onClick={() => { commitDocument(batchPreview.document, 'Sınır ve iç alan toplu sınıflandırması'); setBatchPreview(null); }}>Tek Komut Olarak Uygula</button><button type="button" onClick={() => setBatchPreview(null)}>Vazgeç</button></div></section></div>}

        {exportOpen && <div className="aop-editor-confirm-backdrop"><section className="aop-editor-confirm" role="dialog" aria-modal="true" aria-label="SVG dışa aktar"><div className="aop-label">Age of Paper SVG</div><h2>Dışa Aktar</h2><label>Harita adı<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label><label>Dosya adı<input value={filename} onChange={(event) => setFilename(event.target.value)} /></label><label className="aop-check-row"><input type="checkbox" checked={filename.includes('_ageofpaper')} onChange={(event) => setFilename((current) => event.target.checked ? `${current.replace(/\.svg$/i, '').replace(/_ageofpaper$/i, '')}_ageofpaper.svg` : `${current.replace(/_ageofpaper(?=\.svg$)/i, '')}`)} /> `_ageofpaper` son eki</label><p>{currentValidation.valid ? 'Harita doğrulandı.' : `${currentValidation.errors.length} doğrulama hatası var.`}</p><div><button type="button" className="aop-button" onClick={exportMap} disabled={pending || !currentValidation.valid}>SVG’yi Kaydet</button><button type="button" onClick={() => setExportOpen(false)} disabled={pending}>Vazgeç</button></div></section></div>}
      </section>
    </div>,
    document.body,
  );
}
