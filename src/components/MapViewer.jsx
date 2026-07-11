import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from 'react';
import {
  cameraToTransform,
  clampCamera,
  fitBoundsCamera,
  normalizeBounds,
  normalizeVisibleRect,
  panCamera,
  unionBounds,
  zoomCameraAt,
} from '../game/camera';
import { createFocusState, reduceFocusSnapshot } from '../game/cameraFocus';
import { sanitizeSvgMarkup } from '../game/mapImporter';
import { CopyBtn } from './CopyBtn';
import { Icon, Icons } from './Icons';

const FOCUS_HOLD_MS = 1000;

function reducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

export const MapViewer = forwardRef(function MapViewer({
  roomData,
  roomCode,
  selectedId,
  setSelectedId,
  legalClaims = [],
  currentPlayer,
  leaveRoom,
  localPlayerId,
  hideHud = false,
  className = '',
}, forwardedRef) {
  const containerRef = useRef(null);
  const transformRef = useRef(null);
  const svgRef = useRef(null);
  const cameraRef = useRef(null);
  const baseCameraRef = useRef(null);
  const visibleRectRef = useRef({ x: 0, y: 0, width: 1, height: 1 });
  const mapBoundsRef = useRef({ x: 0, y: 0, width: 1000, height: 1000 });
  const manualRef = useRef(false);
  const pointersRef = useRef(new Map());
  const gestureRef = useRef(null);
  const significantDrag = useRef(false);
  const animationRef = useRef(null);
  const focusTimerRef = useRef(null);
  const localRestoreRef = useRef(null);
  const focusStateRef = useRef(createFocusState(roomData, { activePlayerId: null }));

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

  const stopTimers = () => {
    window.clearTimeout(focusTimerRef.current);
    focusTimerRef.current = null;
    animationRef.current = null;
  };

  const renderCamera = (camera, animate = false) => {
    if (!camera || !transformRef.current) return;
    const clamped = clampCamera(camera, mapBoundsRef.current, visibleRectRef.current);
    cameraRef.current = clamped;
    const transform = cameraToTransform(clamped, visibleRectRef.current);
    transformRef.current.style.transition = animate && !reducedMotion()
      ? 'transform 480ms cubic-bezier(.22,1,.36,1)'
      : 'none';
    transformRef.current.style.transform = `translate3d(${transform.x}px, ${transform.y}px, 0) scale(${transform.scale})`;
  };

  const fitMap = (markManual = true) => {
    const camera = fitBoundsCamera(mapBoundsRef.current, visibleRectRef.current, 16);
    manualRef.current = markManual;
    baseCameraRef.current = camera;
    localRestoreRef.current = null;
    stopTimers();
    renderCamera(camera, true);
  };

  const regionBounds = (regionIds) => {
    const definitions = roomData.mapDefinition?.regionsById || {};
    const values = regionIds.map((id) => {
      if (definitions[id]?.bounds) return definitions[id].bounds;
      const element = [...(svgRef.current?.querySelectorAll('[data-region-id]') || [])]
        .find((candidate) => candidate.getAttribute('data-region-id') === id);
      try {
        const bounds = element?.getBBox?.();
        return bounds && bounds.width >= 0 ? bounds : null;
      } catch {
        return null;
      }
    });
    return unionBounds(values, mapBoundsRef.current);
  };

  const focusBounds = (bounds, { restoreAfter = false, local = false, onRestored } = {}) => {
    if (!bounds) return;
    stopTimers();
    if (local) localRestoreRef.current = { ...baseCameraRef.current };
    const target = fitBoundsCamera(bounds, visibleRectRef.current, Math.min(42, visibleRectRef.current.width * 0.09));
    animationRef.current = { bounds, target, kind: 'focus' };
    renderCamera(target, true);
    if (restoreAfter) {
      focusTimerRef.current = window.setTimeout(() => {
        const base = baseCameraRef.current;
        animationRef.current = { target: base, kind: 'restore' };
        renderCamera(base, true);
        focusTimerRef.current = window.setTimeout(() => {
          animationRef.current = null;
          onRestored?.();
        }, reducedMotion() ? 0 : 500);
      }, reducedMotion() ? 40 : FOCUS_HOLD_MS);
    }
  };

  const cancelAutomationForManualInput = () => {
    stopTimers();
    manualRef.current = true;
    baseCameraRef.current = { ...cameraRef.current };
    localRestoreRef.current = null;
  };

  useImperativeHandle(forwardedRef, () => ({
    setVisibleMapRect(rect) {
      visibleRectRef.current = normalizeVisibleRect(rect);
      if (!cameraRef.current) {
        fitMap(false);
        return;
      }
      if (animationRef.current?.bounds) {
        const target = fitBoundsCamera(animationRef.current.bounds, visibleRectRef.current, 28);
        animationRef.current.target = target;
        renderCamera(target, false);
      } else if (!manualRef.current) {
        const fitted = fitBoundsCamera(mapBoundsRef.current, visibleRectRef.current, 16);
        baseCameraRef.current = fitted;
        renderCamera(fitted, false);
      } else {
        renderCamera(cameraRef.current, false);
        baseCameraRef.current = { ...cameraRef.current };
      }
    },
    fitMap() {
      fitMap(true);
    },
  }));

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

  useEffect(() => {
    const bounds = normalizeBounds(roomData.mapDefinition?.viewBox);
    mapBoundsRef.current = bounds;
    if (svgRef.current) {
      svgRef.current.style.left = `${bounds.x}px`;
      svgRef.current.style.top = `${bounds.y}px`;
      svgRef.current.style.width = `${bounds.width}px`;
      svgRef.current.style.height = `${bounds.height}px`;
    }
    manualRef.current = false;
    cameraRef.current = null;
    baseCameraRef.current = null;
    window.requestAnimationFrame(() => fitMap(false));
    // fitMap intentionally reads the latest camera refs without changing map identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomData.mapDefinition?.viewBox, safeMapSvg]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    const resize = () => {
      const rect = container.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      visibleRectRef.current = { x: 0, y: 0, width: rect.width, height: rect.height };
      if (!cameraRef.current || !manualRef.current) fitMap(false);
      else renderCamera(cameraRef.current, false);
    };
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;
    observer?.observe(container);
    resize();
    return () => observer?.disconnect();
    // Resize callbacks operate on refs so manual cameras survive React renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const result = reduceFocusSnapshot(focusStateRef.current, roomData, localPlayerId);
    focusStateRef.current = result.state;
    const effect = result.effect;
    if (!effect || !cameraRef.current) return;
    const focusLocalTurn = () => {
      const owned = roomData.players?.[localPlayerId]?.regionIds || [];
      const targets = owned.length ? owned : (legalClaims.length ? legalClaims : roomData.mapDefinition?.regionIds || []);
      focusBounds(regionBounds(targets), { local: true });
    };
    if (effect.type === 'local_turn') {
      focusLocalTurn();
    } else if (effect.type === 'local_restore') {
      if (!localRestoreRef.current) return;
      const base = localRestoreRef.current;
      localRestoreRef.current = null;
      animationRef.current = { target: base, kind: 'restore' };
      renderCamera(base, true);
      focusTimerRef.current = window.setTimeout(() => { animationRef.current = null; }, reducedMotion() ? 0 : 500);
    } else if (effect.type === 'remote_action') {
      const owned = roomData.players?.[effect.actorId]?.regionIds || [];
      if (effect.actionType === 'save_income' && owned.length === 0) return;
      let targets = owned;
      if (effect.actionType === 'claim' && effect.regionId) {
        const neighbors = roomData.mapDefinition?.regionsById?.[effect.regionId]?.claimNeighbors || [];
        targets = [effect.regionId, ...neighbors.filter((id) => roomData.claims?.[id]?.ownerId === effect.actorId)];
      }
      focusBounds(regionBounds(targets), {
        restoreAfter: true,
        onRestored: effect.localTurnStarted ? focusLocalTurn : undefined,
      });
    }
    // Focus helpers intentionally use current room data while event identity controls replays.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    legalFingerprint,
    localPlayerId,
    roomData,
  ]);

  useEffect(() => () => stopTimers(), []);

  const localPoint = (event) => {
    const rect = containerRef.current.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const startPointer = (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    cancelAutomationForManualInput();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    pointersRef.current.set(event.pointerId, localPoint(event));
    significantDrag.current = false;
    if (pointersRef.current.size === 1) {
      gestureRef.current = { type: 'pan', point: localPoint(event), camera: { ...cameraRef.current } };
    } else if (pointersRef.current.size === 2) {
      const [first, second] = [...pointersRef.current.values()];
      gestureRef.current = {
        type: 'pinch',
        distance: Math.hypot(first.x - second.x, first.y - second.y),
        camera: { ...cameraRef.current },
      };
    }
    containerRef.current.classList.add('is-dragging');
  };

  const movePointer = (event) => {
    if (!pointersRef.current.has(event.pointerId) || !gestureRef.current) return;
    pointersRef.current.set(event.pointerId, localPoint(event));
    if (pointersRef.current.size === 1 && gestureRef.current.type === 'pan') {
      const point = localPoint(event);
      const delta = { x: point.x - gestureRef.current.point.x, y: point.y - gestureRef.current.point.y };
      if (Math.hypot(delta.x, delta.y) > 8) significantDrag.current = true;
      const next = panCamera(gestureRef.current.camera, delta, mapBoundsRef.current, visibleRectRef.current);
      baseCameraRef.current = next;
      renderCamera(next, false);
    } else if (pointersRef.current.size >= 2) {
      const [first, second] = [...pointersRef.current.values()];
      const distance = Math.hypot(first.x - second.x, first.y - second.y);
      const center = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
      const fitScale = fitBoundsCamera(mapBoundsRef.current, visibleRectRef.current, 0).scale;
      const nextScale = Math.min(fitScale * 8, Math.max(fitScale * 0.55, gestureRef.current.camera.scale * distance / gestureRef.current.distance));
      const next = zoomCameraAt(gestureRef.current.camera, nextScale, center, visibleRectRef.current, mapBoundsRef.current);
      significantDrag.current = true;
      baseCameraRef.current = next;
      renderCamera(next, false);
    }
  };

  const stopPointer = (event) => {
    pointersRef.current.delete(event.pointerId);
    if (pointersRef.current.size === 1) {
      const point = [...pointersRef.current.values()][0];
      gestureRef.current = { type: 'pan', point, camera: { ...cameraRef.current } };
    } else if (pointersRef.current.size === 0) {
      gestureRef.current = null;
      containerRef.current?.classList.remove('is-dragging');
    }
  };

  const handleWheel = (event) => {
    event.preventDefault();
    cancelAutomationForManualInput();
    const point = localPoint(event);
    const fitScale = fitBoundsCamera(mapBoundsRef.current, visibleRectRef.current, 0).scale;
    const nextScale = Math.min(fitScale * 8, Math.max(fitScale * 0.55, cameraRef.current.scale * (event.deltaY > 0 ? 0.9 : 1.1)));
    const next = zoomCameraAt(cameraRef.current, nextScale, point, visibleRectRef.current, mapBoundsRef.current);
    baseCameraRef.current = next;
    renderCamera(next, false);
  };

  const zoomBy = (factor) => {
    cancelAutomationForManualInput();
    const rect = visibleRectRef.current;
    const point = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    const fitScale = fitBoundsCamera(mapBoundsRef.current, rect, 0).scale;
    const nextScale = Math.min(fitScale * 8, Math.max(fitScale * 0.55, cameraRef.current.scale * factor));
    const next = zoomCameraAt(cameraRef.current, nextScale, point, rect, mapBoundsRef.current);
    baseCameraRef.current = next;
    renderCamera(next, true);
  };

  const selectRegion = (event) => {
    if (significantDrag.current) return;
    const region = event.target.closest?.('[data-region-id]');
    if (region && svgRef.current?.contains(region)) {
      event.stopPropagation();
      setSelectedId(region.getAttribute('data-region-id'));
    }
  };

  return (
    <main
      ref={containerRef}
      className={`aop-map-surface aop-map-viewer ${className}`}
      onClick={selectRegion}
      onPointerDown={startPointer}
      onPointerMove={movePointer}
      onPointerUp={stopPointer}
      onPointerCancel={stopPointer}
      onWheel={handleWheel}
    >
      <div ref={transformRef} className="aop-map-transform">
        {safeMapSvg && (
          <div ref={svgRef} dangerouslySetInnerHTML={{ __html: safeMapSvg }}/>
        )}
      </div>

      {!hideHud && (
        <div className="aop-map-hud" onPointerDown={(event) => event.stopPropagation()}>
          <span><small>Oda</small><strong>{roomCode}</strong><CopyBtn code={roomCode}/></span>
          <span><small>Round</small><strong>{roomData.roundNumber || 1}</strong></span>
          <span><small>Aktif</small><strong>{currentPlayer?.name || 'Bekleniyor'}</strong></span>
          <button className="aop-map-leave" onClick={leaveRoom} aria-label="Odadan ayrıl"><Icon p={Icons.LogOut}/></button>
        </div>
      )}
      <div className="aop-map-controls" aria-label="Harita görünümü" onPointerDown={(event) => event.stopPropagation()}>
        <button onClick={() => zoomBy(1.25)} aria-label="Yakınlaştır"><Icon p={Icons.ZoomIn}/></button>
        <button onClick={() => zoomBy(0.8)} aria-label="Uzaklaştır"><Icon p={Icons.ZoomOut}/></button>
        <button onClick={() => fitMap(true)} aria-label="Haritayı sığdır"><Icon p={Icons.Fit}/></button>
      </div>
    </main>
  );
});
