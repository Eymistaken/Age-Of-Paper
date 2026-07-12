import { useCallback, useEffect, useState } from 'react';
import { prepareSvgMap, sanitizeSvgMarkup } from '../game/mapImporter';

function safePreview(record) {
  try { return sanitizeSvgMarkup(record.thumbnail || record.sanitizedSvg || record.baseSvg || '<svg/>'); }
  catch { return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 60"><rect width="100" height="60" fill="#4b4433"/></svg>'; }
}

function downloadMap(record) {
  const blob = new Blob([record.preparedSvg || record.sanitizedSvg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${String(record.displayName || 'harita').replace(/\s+/g, '_')}_ageofpaper.svg`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function relativeTime(value) {
  const minutes = Math.max(0, Math.round((Date.now() - Number(value || 0)) / 60_000));
  if (minutes < 1) return 'Az önce';
  if (minutes < 60) return `${minutes} dk önce`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} sa önce`;
  return new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium' }).format(new Date(value));
}

export function RecentMaps({ repository, onEdit, onUse, refreshToken = 0 }) {
  const [maps, setMaps] = useState([]);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  const refresh = useCallback(async () => {
    try { setMaps(await repository.listPreparedMaps()); }
    catch (loadError) { setError(`Yerel haritalar okunamadı: ${loadError.message}`); }
  }, [repository]);

  useEffect(() => { refresh(); }, [refresh, refreshToken]);

  const duplicate = async (record) => {
    setBusyId(record.mapId);
    setError('');
    try { await repository.duplicatePreparedMap(record.mapId); await refresh(); }
    catch (copyError) { setError(copyError.message); }
    finally { setBusyId(null); }
  };

  const remove = async (record) => {
    if (!window.confirm(`“${record.displayName}” yerel arşivden silinsin mi?`)) return;
    setBusyId(record.mapId);
    try { await repository.deletePreparedMap(record.mapId); await refresh(); }
    catch (deleteError) { setError(deleteError.message); }
    finally { setBusyId(null); }
  };

  const exportPrepared = async (record) => {
    setBusyId(record.mapId);
    setError('');
    try {
      const exportRecord = await prepareSvgMap(record.preparedSvg || record.sanitizedSvg, {
        displayName: record.displayName,
        sourceLabel: record.sourceLabel,
      });
      await repository.savePreparedMap(exportRecord);
      await refresh();
      downloadMap(exportRecord);
    } catch (exportError) {
      setError(`SVG dışa aktarılamadı: ${exportError.message}`);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="aop-recent-maps" aria-labelledby="recent-maps-title">
      <div className="aop-recent-maps-heading"><div><div className="aop-label">Yerel Harita Arşivi</div><h3 id="recent-maps-title" className="aop-title">Son Haritalar</h3></div><span>{maps.length} kayıt</span></div>
      {error && <p className="aop-validation-note is-error" role="alert">{error}</p>}
      {maps.length ? <div className="aop-recent-map-grid">{maps.map((record) => {
        const summary = record.terrainDocument?.summary || {};
        const validation = record.validation;
        return (
          <article key={record.mapId} className="aop-recent-map-card">
            <div className="aop-recent-map-preview" aria-hidden="true" dangerouslySetInnerHTML={{ __html: safePreview(record) }} />
            <div className="aop-recent-map-copy"><div className="aop-label">{record.sourceLabel || 'Yerel taslak'}</div><h4>{record.displayName}</h4><p>{relativeTime(record.updatedAt)} · {summary.playableLandCount ?? record.mapDefinition?.regionIds?.length ?? 0} kara</p><p>{summary.oceanCount || 0} okyanus · {summary.lakeCount || 0} göl · {summary.coastalLandCount || 0} kıyı</p><strong className={validation?.valid ? 'is-valid' : 'is-invalid'}>{validation?.valid ? 'Doğrulandı' : `${validation?.errors?.length || 0} hata`}</strong></div>
            <div className="aop-recent-map-actions">
              <button type="button" disabled={busyId === record.mapId || !validation?.valid} onClick={() => onUse(record)}>Bu Odada Kullan</button>
              <button type="button" disabled={busyId === record.mapId} onClick={() => onEdit(record)}>Düzenle</button>
              <button type="button" disabled={busyId === record.mapId || !record.preparedSvg} onClick={() => exportPrepared(record)}>Dışa Aktar</button>
              <button type="button" disabled={busyId === record.mapId} onClick={() => duplicate(record)}>Çoğalt</button>
              <button type="button" disabled={busyId === record.mapId} onClick={() => remove(record)}>Sil</button>
            </div>
          </article>
        );
      })}</div> : <p className="aop-recent-map-empty">Hazırladığın haritalar burada çevrimdışı kullanılabilir şekilde saklanacak.</p>}
    </section>
  );
}
