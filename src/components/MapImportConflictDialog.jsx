import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';

export function MapImportConflictDialog({ conflict, onChoice }) {
  const titleId = useId();
  const firstRef = useRef(null);
  useEffect(() => { firstRef.current?.focus(); }, []);
  const geometry = conflict.type === 'geometry_mismatch';
  const choices = geometry ? [
    ['remap', 'Metadata’yı eşleştir', 'Aynı kimlikli yüzey düzeltmelerini yeni analiz üzerine güvenle taşır.'],
    ['reanalyze', 'Otomatik analizi yeniden çalıştır', 'Eski metadata’yı kullanmadan yeni bir terrain sonucu üretir.'],
    ['copy', 'Yeni harita olarak içe aktar', 'Yeni mapId ile bağımsız bir yerel kayıt oluşturur.'],
  ] : [
    ['update', 'Mevcut haritayı güncelle', 'Aynı mapId kayıt ve revision zincirini sürdürür.'],
    ['copy', 'Yeni kopya olarak içe aktar', 'Metadata aynı kalır ancak yeni bir mapId oluşturulur.'],
  ];
  return createPortal(
    <div className="aop-editor-confirm-backdrop">
      <section className="aop-import-conflict" role="alertdialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="aop-label">Güvenli İçe Aktarım</div>
        <h2 id={titleId}>{geometry ? 'Kaynak geometri değişmiş' : 'Bu mapId yerel arşivde var'}</h2>
        <p>{geometry ? 'Metadata geometri hash’i bu SVG ile eşleşmiyor. Eski yüzey verileri sessizce uygulanmayacak.' : 'Mevcut kaydı güncelleyebilir veya bağımsız bir kopya oluşturabilirsin.'}</p>
        <div className="aop-import-conflict-actions">
          {choices.map(([value, label, description], index) => <button ref={index === 0 ? firstRef : undefined} key={value} type="button" onClick={() => onChoice(value)}><strong>{label}</strong><small>{description}</small></button>)}
          <button type="button" onClick={() => onChoice('cancel')}><strong>İptal</strong><small>Dosyada ve yerel arşivde değişiklik yapma.</small></button>
        </div>
      </section>
    </div>,
    document.body,
  );
}
