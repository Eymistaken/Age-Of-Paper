import { useEffect, useMemo, useRef, useState } from 'react';
import { sanitizeSvgMarkup } from '../game/mapImporter';
import { CopyBtn } from './CopyBtn';
import { Icon, Icons } from './Icons';

const MIN_SCALE = 0.75;
const MAX_SCALE = 6;

export const MapViewer = ({
  roomData,
  roomCode,
  selectedId,
  setSelectedId,
  legalClaims = [],
  currentPlayer,
  leaveRoom,
  hideHud = false,
  className = '',
}) => {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const containerRef = useRef(null);
  const svgRef = useRef(null);
  const dragRef = useRef(null);
  const touchRef = useRef(null);
  const significantDrag = useRef(false);
  const safeMapSvg = useMemo(() => {
    try {
      return roomData.mapSvg ? sanitizeSvgMarkup(roomData.mapSvg) : '';
    } catch (error) {
      console.warn('Harita SVG güvenli biçimde açılamadı:', error);
      return '';
    }
  }, [roomData.mapSvg]);

  const paintFingerprint = useMemo(() => JSON.stringify((roomData.mapDefinition?.regionIds || []).map((id) => {
    const ownerId = roomData.claims?.[id]?.ownerId || '';
    return [id, ownerId, roomData.players?.[ownerId]?.color || ''];
  })), [roomData.claims, roomData.mapDefinition?.regionIds, roomData.players]);
  const legalFingerprint = useMemo(() => [...legalClaims].sort().join('|'), [legalClaims]);

  const clampPosition = (next, nextScale = scale) => {
    const rectangle = containerRef.current?.getBoundingClientRect();
    if (!rectangle) return next;
    if (nextScale <= 1) {
      return { x: (rectangle.width * (1 - nextScale)) / 2, y: (rectangle.height * (1 - nextScale)) / 2 };
    }
    return {
      x: Math.min(0, Math.max(rectangle.width * (1 - nextScale), next.x)),
      y: Math.min(0, Math.max(rectangle.height * (1 - nextScale), next.y)),
    };
  };

  const zoomTo = (nextScale, anchor) => {
    const normalizedScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, nextScale));
    const rectangle = containerRef.current?.getBoundingClientRect();
    if (!rectangle) return;
    const point = anchor || { x: rectangle.width / 2, y: rectangle.height / 2 };
    const worldX = (point.x - position.x) / scale;
    const worldY = (point.y - position.y) / scale;
    setPosition(clampPosition({ x: point.x - worldX * normalizedScale, y: point.y - worldY * normalizedScale }, normalizedScale));
    setScale(normalizedScale);
  };

  const fitMap = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  };

  useEffect(() => {
    const root = svgRef.current;
    if (!root) return;
    const legal = new Set(legalFingerprint ? legalFingerprint.split('|') : []);
    const paints = new Map(JSON.parse(paintFingerprint).map(([id, ownerId, color]) => [id, { ownerId, color }]));
    root.querySelectorAll('[data-region-id]').forEach((element) => {
      const id = element.getAttribute('data-region-id');
      const paint = paints.get(id);
      element.classList.toggle('selected-land', id === selectedId);
      element.classList.toggle('legal-land', legal.has(id));
      element.classList.toggle('owned-land', Boolean(paint?.ownerId));
      element.style.fill = paint?.color || '#b7a370';
    });
  }, [legalFingerprint, paintFingerprint, safeMapSvg, selectedId]);

  const selectRegion = (event) => {
    if (significantDrag.current) return;
    const region = event.target.closest?.('[data-region-id]');
    if (region && svgRef.current?.contains(region)) {
      event.stopPropagation();
      setSelectedId(region.getAttribute('data-region-id'));
    }
  };

  const startPointer = (x, y) => {
    setDragging(true);
    dragRef.current = { x, y, position };
    significantDrag.current = false;
  };
  const movePointer = (x, y) => {
    if (!dragRef.current) return;
    const dx = x - dragRef.current.x;
    const dy = y - dragRef.current.y;
    if (Math.hypot(dx, dy) > 8) significantDrag.current = true;
    setPosition(clampPosition({ x: dragRef.current.position.x + dx, y: dragRef.current.position.y + dy }));
  };
  const stopPointer = () => {
    setDragging(false);
    dragRef.current = null;
  };

  const handleWheel = (event) => {
    event.preventDefault();
    const rectangle = event.currentTarget.getBoundingClientRect();
    zoomTo(scale * (event.deltaY > 0 ? 0.9 : 1.1), { x: event.clientX - rectangle.left, y: event.clientY - rectangle.top });
  };
  const handleTouchStart = (event) => {
    if (event.touches.length === 1) startPointer(event.touches[0].clientX, event.touches[0].clientY);
    if (event.touches.length === 2) {
      stopPointer();
      touchRef.current = Math.hypot(
        event.touches[0].clientX - event.touches[1].clientX,
        event.touches[0].clientY - event.touches[1].clientY,
      );
    }
  };
  const handleTouchMove = (event) => {
    if (event.touches.length === 1) movePointer(event.touches[0].clientX, event.touches[0].clientY);
    if (event.touches.length === 2 && touchRef.current) {
      const distance = Math.hypot(
        event.touches[0].clientX - event.touches[1].clientX,
        event.touches[0].clientY - event.touches[1].clientY,
      );
      const rectangle = event.currentTarget.getBoundingClientRect();
      const center = {
        x: (event.touches[0].clientX + event.touches[1].clientX) / 2 - rectangle.left,
        y: (event.touches[0].clientY + event.touches[1].clientY) / 2 - rectangle.top,
      };
      significantDrag.current = true;
      zoomTo(scale * (distance / touchRef.current), center);
      touchRef.current = distance;
    }
  };
  const handleTouchEnd = (event) => {
    if (event.touches.length < 2) touchRef.current = null;
    if (event.touches.length === 0) stopPointer();
  };

  return (
    <main
      ref={containerRef}
      className={`aop-map-surface aop-map-viewer ${dragging ? 'is-dragging' : ''} ${className}`}
      onClick={selectRegion}
      onMouseDown={(event) => { if (event.button === 0) startPointer(event.clientX, event.clientY); }}
      onMouseMove={(event) => movePointer(event.clientX, event.clientY)}
      onMouseUp={stopPointer}
      onMouseLeave={stopPointer}
      onWheel={handleWheel}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >
      <div
        className="aop-map-transform"
        style={{
          transform: `translate3d(${position.x}px, ${position.y}px, 0) scale(${scale})`,
          transition: dragging || touchRef.current ? 'none' : 'transform 180ms cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        {safeMapSvg && (
          <div ref={svgRef} dangerouslySetInnerHTML={{ __html: safeMapSvg }}/>
        )}
      </div>

      {!hideHud && (
        <div className="aop-map-hud">
          <span><small>Oda</small><strong>{roomCode}</strong><CopyBtn code={roomCode}/></span>
          <span><small>Round</small><strong>{roomData.roundNumber || 1}</strong></span>
          <span><small>Aktif</small><strong>{currentPlayer?.name || 'Bekleniyor'}</strong></span>
          <button onClick={leaveRoom} aria-label="Odadan ayrıl"><Icon p={Icons.LogOut}/></button>
        </div>
      )}
      <div className="aop-map-controls" aria-label="Harita görünümü">
        <button onClick={() => zoomTo(scale * 1.25)} aria-label="Yakınlaştır"><Icon p={Icons.ZoomIn}/></button>
        <button onClick={() => zoomTo(scale / 1.25)} aria-label="Uzaklaştır"><Icon p={Icons.ZoomOut}/></button>
        <button onClick={fitMap} aria-label="Haritayı sığdır"><Icon p={Icons.Fit}/></button>
      </div>
    </main>
  );
};
