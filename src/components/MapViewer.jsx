import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from 'react';
import { createCameraAnimator } from '../game/cameraAnimator';
import {
  cameraToTransform,
  clampCamera,
  fitBoundsCamera,
  fitFocusBoundsCamera,
  normalizeBounds,
  normalizeVisibleRect,
  panCamera,
  zoomCameraAt,
} from '../game/camera';
import { createFocusState, focusActionKey, reduceFocusAction } from '../game/cameraFocus';
import {
  POINTER_MODES,
  beginMapPointer,
  createMapPointerState,
  endMapPointer,
  moveMapPointer,
} from '../game/mapPointer';
import { sanitizeSvgMarkup } from '../game/mapImporter';
import { resolveRegionBoundsInRootViewBox } from '../game/svgGeometry';
import { CopyBtn } from './CopyBtn';
import { Icon, Icons } from './Icons';

const FOCUS_HOLD_MS = 850;
const CAMERA_ANIMATION_MS = 420;
const MAX_FOCUS_FIT_MULTIPLIER = 4;

function reducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

function copyCamera(camera) {
  if (!camera) return null;
  return {
    focusX: camera.focusX,
    focusY: camera.focusY,
    scale: camera.scale,
    anchorX: camera.anchorX ?? 0.5,
    anchorY: camera.anchorY ?? 0.5,
  };
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
  const pointerStateRef = useRef(createMapPointerState());
  const gestureRef = useRef(null);
  const capturedPointersRef = useRef(new Set());
  const renderCameraRef = useRef(() => {});
  const animatorRef = useRef(null);
  const focusSequenceRef = useRef(null);
  const focusTimerRef = useRef(null);
  const mapInitFrameRef = useRef(null);
  const focusMeasureRef = useRef({ token: 0, frameId: null });
  const initialFitPendingRef = useRef(true);
  const externalRectInitializedRef = useRef(false);
  const containerSizeRef = useRef({ width: 0, height: 0 });

  const safeMapSvg = useMemo(() => {
    try {
      return roomData.mapSvg ? sanitizeSvgMarkup(roomData.mapSvg) : '';
    } catch (error) {
      console.warn('Harita SVG güvenli biçimde açılamadı:', error);
      return '';
    }
  }, [roomData.mapSvg]);

  const viewBox = roomData.mapDefinition?.viewBox;
  const viewBoxKey = [viewBox?.x, viewBox?.y, viewBox?.width, viewBox?.height].join(':');
  const lastAction = roomData.lastAction || null;
  const lastActionKey = focusActionKey(lastAction);
  const actionType = lastAction?.type || null;
  const actionActorId = lastAction?.actorId || null;
  const actionRegionId = lastAction?.regionId || null;
  const actionRegionBounds = actionRegionId
    ? roomData.mapDefinition?.regionsById?.[actionRegionId]?.bounds || null
    : null;
  const actionBoundsKey = actionRegionBounds
    ? [actionRegionBounds.x, actionRegionBounds.y, actionRegionBounds.width, actionRegionBounds.height].join(':')
    : '';
  const geometryVersion = roomData.mapDefinition?.geometryVersion || 0;
  const boundsSpace = roomData.mapDefinition?.boundsSpace || '';
  const focusStateRef = useRef(createFocusState(lastAction));

  const paintFingerprint = useMemo(() => JSON.stringify((roomData.mapDefinition?.regionIds || []).map((id) => {
    const ownerId = roomData.claims?.[id]?.ownerId || '';
    return [id, ownerId, roomData.players?.[ownerId]?.color || ''];
  })), [roomData.claims, roomData.mapDefinition?.regionIds, roomData.players]);
  const legalFingerprint = useMemo(() => [...legalClaims].sort().join('|'), [legalClaims]);

  const renderCamera = (camera, { clamp = false } = {}) => {
    if (!camera || !transformRef.current) return;
    const next = clamp
      ? clampCamera(camera, mapBoundsRef.current, visibleRectRef.current)
      : copyCamera(camera);
    cameraRef.current = next;
    const transform = cameraToTransform(next, visibleRectRef.current);
    transformRef.current.style.transition = 'none';
    transformRef.current.style.transform = `translate3d(${transform.x}px, ${transform.y}px, 0) scale(${transform.scale})`;
  };
  renderCameraRef.current = renderCamera;

  if (!animatorRef.current) {
    animatorRef.current = createCameraAnimator({
      onFrame: (camera) => renderCameraRef.current(camera),
    });
  }

  const clearFocusTimer = () => {
    window.clearTimeout(focusTimerRef.current);
    focusTimerRef.current = null;
  };

  const cancelFocusMeasurement = () => {
    focusMeasureRef.current.token += 1;
    window.cancelAnimationFrame(focusMeasureRef.current.frameId);
    focusMeasureRef.current.frameId = null;
  };

  const cancelAutomationForManualInput = () => {
    cancelFocusMeasurement();
    clearFocusTimer();
    animatorRef.current.cancel();
    focusSequenceRef.current = null;
    if (cameraRef.current) {
      manualRef.current = true;
      baseCameraRef.current = copyCamera(cameraRef.current);
    }
  };

  const fitMap = (markManual = true) => {
    cancelFocusMeasurement();
    clearFocusTimer();
    animatorRef.current.cancel();
    focusSequenceRef.current = null;
    const camera = fitBoundsCamera(mapBoundsRef.current, visibleRectRef.current, 16);
    manualRef.current = markManual;
    initialFitPendingRef.current = false;
    baseCameraRef.current = copyCamera(camera);
    renderCamera(camera, { clamp: true });
  };

  const getRegionBounds = (regionId, preferredBounds, allowStored = false) => {
    const element = [...(svgRef.current?.querySelectorAll('[data-region-id]') || [])]
      .find((candidate) => candidate.getAttribute('data-region-id') === regionId);
    const rootSvg = svgRef.current?.querySelector('svg');
    return resolveRegionBoundsInRootViewBox({
      element,
      rootSvg,
      storedBounds: preferredBounds,
      mapBounds: mapBoundsRef.current,
      metadata: { geometryVersion, boundsSpace },
      allowStored,
    });
  };

  const startRemoteClaimFocus = (bounds, eventId) => {
    if (!bounds || !cameraRef.current) return;
    clearFocusTimer();
    animatorRef.current.cancel();
    const originalBase = focusSequenceRef.current?.baseCamera
      || copyCamera(baseCameraRef.current || cameraRef.current);
    const regionFit = fitFocusBoundsCamera(
      bounds,
      visibleRectRef.current,
      Math.min(36, visibleRectRef.current.width * 0.08),
    );
    if (!regionFit) return;
    const fullMapScale = fitBoundsCamera(mapBoundsRef.current, visibleRectRef.current, 16).scale;
    const maximumScale = Math.max(originalBase.scale, fullMapScale * MAX_FOCUS_FIT_MULTIPLIER);
    const targetCamera = { ...regionFit, scale: Math.min(regionFit.scale, maximumScale) };
    const sequence = { eventId, baseCamera: originalBase, targetCamera };
    focusSequenceRef.current = sequence;
    const duration = reducedMotion() ? 0 : CAMERA_ANIMATION_MS;
    animatorRef.current.animate(copyCamera(cameraRef.current), targetCamera, {
      duration,
      onComplete: () => {
        if (focusSequenceRef.current !== sequence) return;
        focusTimerRef.current = window.setTimeout(() => {
          if (focusSequenceRef.current !== sequence) return;
          animatorRef.current.animate(copyCamera(cameraRef.current), sequence.baseCamera, {
            duration,
            onComplete: () => {
              if (focusSequenceRef.current !== sequence) return;
              renderCamera(sequence.baseCamera);
              baseCameraRef.current = copyCamera(sequence.baseCamera);
              focusSequenceRef.current = null;
              focusTimerRef.current = null;
            },
          });
        }, reducedMotion() ? 60 : FOCUS_HOLD_MS);
      },
    });
  };

  const queueRemoteClaimFocus = (regionId, preferredBounds, eventId) => {
    cancelFocusMeasurement();
    const token = focusMeasureRef.current.token;
    const attempt = (retryCount) => {
      if (focusMeasureRef.current.token !== token) return;
      const allowStored = retryCount >= 2;
      const bounds = getRegionBounds(regionId, preferredBounds, allowStored);
      if (bounds) {
        focusMeasureRef.current.frameId = null;
        startRemoteClaimFocus(bounds, eventId);
        return;
      }
      if (retryCount >= 2) {
        focusMeasureRef.current.frameId = null;
        return;
      }
      focusMeasureRef.current.frameId = window.requestAnimationFrame(() => attempt(retryCount + 1));
    };
    attempt(0);
  };

  useImperativeHandle(forwardedRef, () => ({
    setVisibleMapRect(rect) {
      visibleRectRef.current = normalizeVisibleRect(rect);
      const firstExternalRect = !externalRectInitializedRef.current;
      externalRectInitializedRef.current = true;
      if (!cameraRef.current || initialFitPendingRef.current || (firstExternalRect && !manualRef.current)) {
        fitMap(false);
        return;
      }
      renderCamera(cameraRef.current);
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
    const bounds = normalizeBounds(viewBox);
    mapBoundsRef.current = bounds;
    if (svgRef.current) {
      svgRef.current.style.left = `${bounds.x}px`;
      svgRef.current.style.top = `${bounds.y}px`;
      svgRef.current.style.width = `${bounds.width}px`;
      svgRef.current.style.height = `${bounds.height}px`;
    }
    clearFocusTimer();
    cancelFocusMeasurement();
    animatorRef.current.cancel();
    focusSequenceRef.current = null;
    manualRef.current = false;
    cameraRef.current = null;
    baseCameraRef.current = null;
    initialFitPendingRef.current = true;
    externalRectInitializedRef.current = false;
    window.cancelAnimationFrame(mapInitFrameRef.current);
    mapInitFrameRef.current = window.requestAnimationFrame(() => {
      const rectangle = containerRef.current?.getBoundingClientRect();
      if (!rectangle || rectangle.width <= 0 || rectangle.height <= 0) return;
      if (!externalRectInitializedRef.current) {
        visibleRectRef.current = { x: 0, y: 0, width: rectangle.width, height: rectangle.height };
      }
      fitMap(false);
    });
    // Map identity uses primitive SVG/viewBox values and intentionally excludes room snapshots.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safeMapSvg, viewBoxKey]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    const resize = () => {
      const rectangle = container.getBoundingClientRect();
      if (rectangle.width <= 0 || rectangle.height <= 0) return;
      const previous = containerSizeRef.current;
      const changed = previous.width !== rectangle.width || previous.height !== rectangle.height;
      containerSizeRef.current = { width: rectangle.width, height: rectangle.height };
      if (!externalRectInitializedRef.current) {
        visibleRectRef.current = { x: 0, y: 0, width: rectangle.width, height: rectangle.height };
      }
      if (!cameraRef.current || initialFitPendingRef.current) {
        fitMap(false);
      } else if (changed && !manualRef.current && !focusSequenceRef.current && !externalRectInitializedRef.current) {
        fitMap(false);
      } else {
        renderCamera(cameraRef.current);
      }
    };
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;
    observer?.observe(container);
    resize();
    return () => observer?.disconnect();
    // Resize callbacks operate on canonical refs and never depend on room snapshots.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const action = lastActionKey ? {
      actionId: lastActionKey,
      type: actionType,
      actorId: actionActorId,
      regionId: actionRegionId,
    } : null;
    const result = reduceFocusAction(focusStateRef.current, action, localPlayerId);
    focusStateRef.current = result.state;
    if (result.effect?.type === 'remote_claim') {
      queueRemoteClaimFocus(result.effect.regionId, actionRegionBounds, result.effect.actionId);
    }
    // Event identity and primitive region bounds are the only focus dependencies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    lastActionKey,
    actionType,
    actionActorId,
    actionRegionId,
    actionBoundsKey,
    geometryVersion,
    boundsSpace,
    localPlayerId,
  ]);

  useEffect(() => () => {
    clearFocusTimer();
    cancelFocusMeasurement();
    // cancel() also supports React StrictMode's setup-cleanup-setup cycle.
    animatorRef.current.cancel();
    window.cancelAnimationFrame(mapInitFrameRef.current);
    capturedPointersRef.current.forEach((pointerId) => {
      try {
        containerRef.current?.releasePointerCapture?.(pointerId);
      } catch {
        // The browser may already have released capture during unmount.
      }
    });
    capturedPointersRef.current.clear();
  }, []);

  const localPoint = (event) => {
    const rectangle = containerRef.current.getBoundingClientRect();
    return { x: event.clientX - rectangle.left, y: event.clientY - rectangle.top };
  };

  const regionIdFromTarget = (target) => {
    const region = target?.closest?.('[data-region-id]');
    return region && svgRef.current?.contains(region)
      ? region.getAttribute('data-region-id')
      : null;
  };

  const capturePointers = (pointerIds) => {
    pointerIds.forEach((pointerId) => {
      if (capturedPointersRef.current.has(pointerId)) return;
      try {
        containerRef.current?.setPointerCapture?.(pointerId);
        capturedPointersRef.current.add(pointerId);
      } catch {
        // Pointer capture is best-effort on older touch browsers.
      }
    });
  };

  const releasePointers = (pointerIds) => {
    pointerIds.forEach((pointerId) => {
      if (!capturedPointersRef.current.has(pointerId)) return;
      try {
        containerRef.current?.releasePointerCapture?.(pointerId);
      } catch {
        // Capture can be released automatically before pointerup is delivered.
      }
      capturedPointersRef.current.delete(pointerId);
    });
  };

  const pointerInput = (event) => {
    const point = localPoint(event);
    return {
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      button: event.button,
      x: point.x,
      y: point.y,
      regionId: regionIdFromTarget(event.target),
    };
  };

  const startPointer = (event) => {
    const result = beginMapPointer(pointerStateRef.current, pointerInput(event));
    pointerStateRef.current = result.state;
    if (!result.accepted || !result.startedPinch) return;
    cancelAutomationForManualInput();
    capturePointers(result.captureIds);
    const pointers = Object.values(result.state.pointers);
    const [first, second] = pointers;
    gestureRef.current = {
      type: POINTER_MODES.PINCHING,
      camera: copyCamera(cameraRef.current),
      distance: Math.max(1, Math.hypot(first.x - second.x, first.y - second.y)),
    };
    containerRef.current?.classList.add('is-dragging');
  };

  const movePointer = (event) => {
    const result = moveMapPointer(pointerStateRef.current, pointerInput(event));
    pointerStateRef.current = result.state;
    if (!result.accepted || !cameraRef.current) return;
    if (result.startedPan) {
      cancelAutomationForManualInput();
      capturePointers(result.captureIds);
      gestureRef.current = { type: POINTER_MODES.PANNING, camera: copyCamera(cameraRef.current) };
      containerRef.current?.classList.add('is-dragging');
    }
    if (result.state.mode === POINTER_MODES.PANNING && result.delta && gestureRef.current?.camera) {
      const next = panCamera(gestureRef.current.camera, result.delta, mapBoundsRef.current, visibleRectRef.current);
      baseCameraRef.current = copyCamera(next);
      renderCamera(next);
    } else if (result.state.mode === POINTER_MODES.PINCHING && gestureRef.current?.camera) {
      const pointers = Object.values(result.state.pointers);
      if (pointers.length < 2) return;
      const [first, second] = pointers;
      const distance = Math.max(1, Math.hypot(first.x - second.x, first.y - second.y));
      const center = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
      const fitScale = fitBoundsCamera(mapBoundsRef.current, visibleRectRef.current, 0).scale;
      const nextScale = Math.min(
        fitScale * 8,
        Math.max(fitScale * 0.55, gestureRef.current.camera.scale * distance / gestureRef.current.distance),
      );
      const next = zoomCameraAt(
        gestureRef.current.camera,
        nextScale,
        center,
        visibleRectRef.current,
        mapBoundsRef.current,
      );
      baseCameraRef.current = copyCamera(next);
      renderCamera(next);
    }
  };

  const stopPointer = (event, cancelled = false) => {
    const result = endMapPointer(pointerStateRef.current, event.pointerId, { cancelled });
    pointerStateRef.current = result.state;
    if (!result.accepted) return;
    releasePointers(result.releaseIds);
    if (result.selectionRegionId) setSelectedId(result.selectionRegionId);
    if (result.continuedPan) {
      gestureRef.current = { type: POINTER_MODES.PANNING, camera: copyCamera(cameraRef.current) };
      return;
    }
    if (result.state.mode === POINTER_MODES.IDLE) {
      gestureRef.current = null;
      containerRef.current?.classList.remove('is-dragging');
    }
  };

  const handleWheel = (event) => {
    event.preventDefault();
    if (!cameraRef.current) return;
    cancelAutomationForManualInput();
    const point = localPoint(event);
    const fitScale = fitBoundsCamera(mapBoundsRef.current, visibleRectRef.current, 0).scale;
    const nextScale = Math.min(
      fitScale * 8,
      Math.max(fitScale * 0.55, cameraRef.current.scale * (event.deltaY > 0 ? 0.9 : 1.1)),
    );
    const next = zoomCameraAt(cameraRef.current, nextScale, point, visibleRectRef.current, mapBoundsRef.current);
    baseCameraRef.current = copyCamera(next);
    renderCamera(next);
  };

  const zoomBy = (factor) => {
    if (!cameraRef.current) return;
    cancelAutomationForManualInput();
    const rect = visibleRectRef.current;
    const point = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    const fitScale = fitBoundsCamera(mapBoundsRef.current, rect, 0).scale;
    const nextScale = Math.min(fitScale * 8, Math.max(fitScale * 0.55, cameraRef.current.scale * factor));
    const next = zoomCameraAt(cameraRef.current, nextScale, point, rect, mapBoundsRef.current);
    baseCameraRef.current = copyCamera(next);
    renderCamera(next);
  };

  return (
    <main
      ref={containerRef}
      className={`aop-map-surface aop-map-viewer ${className}`}
      onPointerDown={startPointer}
      onPointerMove={movePointer}
      onPointerUp={(event) => stopPointer(event)}
      onPointerCancel={(event) => stopPointer(event, true)}
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
