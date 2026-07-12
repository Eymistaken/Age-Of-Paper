import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import {
  applyMarqueeSelection,
  applySurfaceClick,
  beginBrush,
  finishBrush,
  surfacesIntersectingMarquee,
  visitBrushSurface,
} from '../game/editorSelection';

function gridPath(surface, viewBox) {
  if (surface.geometry?.type !== 'grid_runs') return '';
  const { columns, rows, runs } = surface.geometry;
  const width = viewBox.width / columns;
  const height = viewBox.height / rows;
  return runs.map(([start, end]) => {
    const row = Math.floor(start / columns);
    const firstColumn = start % columns;
    const lastColumn = end % columns;
    return `M ${viewBox.x + firstColumn * width} ${viewBox.y + row * height} h ${(lastColumn - firstColumn + 1) * width} v ${height} h ${-(lastColumn - firstColumn + 1) * width} Z`;
  }).join(' ');
}

function normalizedRect(start, end) {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
}

function capturePointer(element, pointerId) {
  try { element.setPointerCapture?.(pointerId); } catch { /* Synthetic and older SVG engines may reject capture. */ }
}

function releasePointer(element, pointerId) {
  try { element.releasePointerCapture?.(pointerId); } catch { /* Capture may already be gone. */ }
}

export const TerrainMapCanvas = forwardRef(function TerrainMapCanvas({
  record,
  selectedIds,
  onSelectionChange,
  onInspect,
  tool,
  temporaryHand,
  brushMode,
  onGestureChange,
  onZoomChange,
  boundaryPreview,
}, forwardedRef) {
  const containerRef = useRef(null);
  const pointerRef = useRef(null);
  const selectedRef = useRef(selectedIds);
  const [marquee, setMarquee] = useState(null);
  const world = record.terrainDocument.viewBox;
  const [camera, setCamera] = useState(world);
  const effectiveTool = temporaryHand ? 'hand' : tool;
  selectedRef.current = selectedIds;

  const zoom = world.width / camera.width;
  useEffect(() => onZoomChange?.(zoom), [onZoomChange, zoom]);

  useImperativeHandle(forwardedRef, () => ({
    fit: () => setCamera(world),
    zoomIn: () => setCamera((current) => zoomCamera(current, 1.25, world)),
    zoomOut: () => setCamera((current) => zoomCamera(current, 0.8, world)),
    cancelGesture: () => {
      pointerRef.current = null;
      setMarquee(null);
      onGestureChange?.(false);
    },
    hasActiveGesture: () => Boolean(pointerRef.current || marquee),
  }), [marquee, onGestureChange, world]);

  useEffect(() => {
    const svg = containerRef.current?.querySelector('.aop-terrain-art > svg');
    if (!svg) return;
    svg.setAttribute('viewBox', `${camera.x} ${camera.y} ${camera.width} ${camera.height}`);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.querySelectorAll('[data-editor-terrain]').forEach((element) => {
      element.removeAttribute('data-editor-terrain');
      element.removeAttribute('data-editor-selected');
      element.removeAttribute('data-editor-confidence');
      element.removeAttribute('data-editor-source');
      element.removeAttribute('data-editor-coast');
      element.removeAttribute('data-boundary-group');
    });
    record.terrainDocument.surfaces.forEach((surface) => {
      if (!surface.elementId) return;
      const element = svg.getElementById?.(surface.elementId) || svg.querySelector(`[id="${surface.elementId}"]`);
      if (!element) return;
      element.setAttribute('data-surface-id', surface.id);
      element.setAttribute('data-editor-terrain', surface.terrainType);
      element.setAttribute('data-editor-confidence', surface.confidence < 0.65 ? 'low' : 'normal');
      element.setAttribute('data-editor-source', surface.classificationSource);
      element.setAttribute('data-editor-coast', surface.coastType);
      const boundaryGroup = boundaryPreview?.boundaryIds?.includes(surface.id) ? 'boundary'
        : boundaryPreview?.interiorIds?.includes(surface.id) ? 'interior'
          : boundaryPreview?.outsideIds?.includes(surface.id) ? 'outside' : null;
      if (boundaryGroup) element.setAttribute('data-boundary-group', boundaryGroup);
      if (selectedIds.includes(surface.id)) element.setAttribute('data-editor-selected', 'true');
    });
  }, [boundaryPreview, camera, record, selectedIds]);

  const synthetic = useMemo(() => record.terrainDocument.surfaces.filter((surface) => surface.synthetic), [record]);

  const worldPoint = (event) => {
    const bounds = containerRef.current.getBoundingClientRect();
    return {
      x: camera.x + ((event.clientX - bounds.left) / Math.max(1, bounds.width)) * camera.width,
      y: camera.y + ((event.clientY - bounds.top) / Math.max(1, bounds.height)) * camera.height,
    };
  };

  const surfaceAtEvent = (event) => {
    const element = event.target?.closest?.('[data-surface-id]');
    const id = element?.getAttribute('data-surface-id');
    return record.terrainDocument.surfacesById[id] ? id : null;
  };

  const onPointerDown = (event) => {
    if (event.button !== 0) return;
    const activePointer = pointerRef.current;
    if (activePointer && activePointer.pointerId !== event.pointerId) {
      if (activePointer.kind === 'brush') return;
      const first = activePointer.lastClient || activePointer.startClient;
      const second = { x: event.clientX, y: event.clientY };
      const center = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
      const bounds = containerRef.current.getBoundingClientRect();
      pointerRef.current = {
        kind: 'pinch',
        pointerId: activePointer.pointerId,
        secondPointerId: event.pointerId,
        points: new Map([[activePointer.pointerId, first], [event.pointerId, second]]),
        initialDistance: Math.max(1, Math.hypot(first.x - second.x, first.y - second.y)),
        initialCamera: camera,
        initialWorldCenter: {
          x: camera.x + ((center.x - bounds.left) / Math.max(1, bounds.width)) * camera.width,
          y: camera.y + ((center.y - bounds.top) / Math.max(1, bounds.height)) * camera.height,
        },
      };
      capturePointer(event.currentTarget, activePointer.pointerId);
      capturePointer(event.currentTarget, event.pointerId);
      setMarquee(null);
      onGestureChange?.(true);
      event.preventDefault();
      return;
    }
    if (activePointer) return;
    const surfaceId = surfaceAtEvent(event);
    const point = worldPoint(event);
    if (effectiveTool === 'brush') {
      const stroke = beginBrush(selectedRef.current, surfaceId, {
        ctrl: event.ctrlKey,
        mode: event.pointerType === 'touch' ? brushMode : null,
      });
      pointerRef.current = { kind: 'brush', pointerId: event.pointerId, stroke };
      capturePointer(event.currentTarget, event.pointerId);
      onSelectionChange(finishBrush(stroke));
      onGestureChange?.(true);
      event.preventDefault();
      return;
    }
    if (effectiveTool === 'hand' && event.ctrlKey) return;
    pointerRef.current = {
      kind: effectiveTool === 'hand' ? 'press-hand' : surfaceId ? 'press-select' : 'press-marquee',
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      surfaceId,
      ctrl: event.ctrlKey,
      startClient: { x: event.clientX, y: event.clientY },
      lastClient: { x: event.clientX, y: event.clientY },
      startWorld: point,
    };
  };

  const onPointerMove = (event) => {
    const pointer = pointerRef.current;
    if (!pointer) return;
    if (pointer.kind === 'pinch') {
      if (event.pointerId !== pointer.pointerId && event.pointerId !== pointer.secondPointerId) return;
      pointer.points.set(event.pointerId, { x: event.clientX, y: event.clientY });
      const [first, second] = [...pointer.points.values()];
      if (!first || !second) return;
      const distance = Math.max(1, Math.hypot(first.x - second.x, first.y - second.y));
      const scale = distance / pointer.initialDistance;
      const center = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
      const bounds = containerRef.current.getBoundingClientRect();
      const width = pointer.initialCamera.width / scale;
      const height = pointer.initialCamera.height / scale;
      setCamera(clampCamera({
        x: pointer.initialWorldCenter.x - ((center.x - bounds.left) / Math.max(1, bounds.width)) * width,
        y: pointer.initialWorldCenter.y - ((center.y - bounds.top) / Math.max(1, bounds.height)) * height,
        width,
        height,
      }, world));
      return;
    }
    if (pointer.pointerId !== event.pointerId) return;
    if (pointer.kind === 'brush') {
      const under = document.elementFromPoint?.(event.clientX, event.clientY);
      const id = under?.closest?.('[data-surface-id]')?.getAttribute('data-surface-id');
      pointer.stroke = visitBrushSurface(pointer.stroke, id);
      onSelectionChange(finishBrush(pointer.stroke));
      return;
    }
    const distance = Math.hypot(event.clientX - pointer.startClient.x, event.clientY - pointer.startClient.y);
    const threshold = pointer.pointerType === 'touch' ? 10 : 5;
    if (pointer.kind === 'press-hand' && distance > threshold) {
      pointer.kind = 'pan';
      capturePointer(event.currentTarget, event.pointerId);
      onGestureChange?.(true);
    } else if (pointer.kind === 'press-marquee' && distance > threshold) {
      pointer.kind = 'marquee';
      capturePointer(event.currentTarget, event.pointerId);
      onGestureChange?.(true);
    }
    if (pointer.kind === 'pan') {
      const bounds = containerRef.current.getBoundingClientRect();
      const dx = ((event.clientX - pointer.lastClient.x) / Math.max(1, bounds.width)) * camera.width;
      const dy = ((event.clientY - pointer.lastClient.y) / Math.max(1, bounds.height)) * camera.height;
      setCamera((current) => clampCamera({ ...current, x: current.x - dx, y: current.y - dy }, world));
      pointer.lastClient = { x: event.clientX, y: event.clientY };
    } else if (pointer.kind === 'marquee') {
      const rect = normalizedRect(pointer.startWorld, worldPoint(event));
      const ids = surfacesIntersectingMarquee(record.terrainDocument.surfaces, rect);
      setMarquee({ rect, ids });
    }
  };

  const finishPointer = (event, cancelled = false) => {
    const pointer = pointerRef.current;
    if (!pointer) return;
    if (pointer.kind === 'pinch') {
      if (event.pointerId !== pointer.pointerId && event.pointerId !== pointer.secondPointerId) return;
      releasePointer(event.currentTarget, pointer.pointerId);
      releasePointer(event.currentTarget, pointer.secondPointerId);
      pointerRef.current = null;
      setMarquee(null);
      onGestureChange?.(false);
      return;
    }
    if (pointer.pointerId !== event.pointerId) return;
    if (!cancelled) {
      if (pointer.kind === 'press-select') {
        const next = applySurfaceClick(selectedRef.current, pointer.surfaceId, { ctrl: pointer.ctrl });
        onSelectionChange(next);
        onInspect?.(pointer.surfaceId);
      } else if (pointer.kind === 'press-marquee') {
        onSelectionChange(applySurfaceClick(selectedRef.current, null, { ctrl: pointer.ctrl }));
      } else if (pointer.kind === 'marquee') {
        const mode = pointer.ctrl ? 'add' : brushMode === 'subtract' ? 'subtract' : 'replace';
        onSelectionChange(applyMarqueeSelection(selectedRef.current, marquee?.ids || [], mode));
      }
    }
    pointerRef.current = null;
    setMarquee(null);
    onGestureChange?.(false);
    releasePointer(event.currentTarget, event.pointerId);
  };

  const onWheel = (event) => {
    event.preventDefault();
    const factor = event.deltaY < 0 ? 1.16 : 0.86;
    const anchor = worldPoint(event);
    setCamera((current) => zoomCamera(current, factor, world, anchor));
  };

  return (
    <div
      ref={containerRef}
      className={`aop-terrain-canvas is-${effectiveTool}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(event) => finishPointer(event)}
      onPointerCancel={(event) => finishPointer(event, true)}
      onWheel={onWheel}
      role="application"
      aria-label="Arazi sınıflandırma haritası"
      tabIndex={0}
    >
      <div className="aop-terrain-art" dangerouslySetInnerHTML={{ __html: record.baseSvg }} />
      <svg className="aop-terrain-overlay" viewBox={`${camera.x} ${camera.y} ${camera.width} ${camera.height}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        {synthetic.map((surface) => (
          <path
            key={surface.id}
            d={gridPath(surface, world)}
            data-surface-id={surface.id}
            data-editor-terrain={surface.terrainType}
            data-editor-selected={selectedIds.includes(surface.id) ? 'true' : undefined}
            data-editor-confidence={surface.confidence < 0.65 ? 'low' : 'normal'}
            data-editor-source={surface.classificationSource}
            data-editor-coast={surface.coastType}
            data-boundary-group={boundaryPreview?.boundaryIds?.includes(surface.id) ? 'boundary' : boundaryPreview?.interiorIds?.includes(surface.id) ? 'interior' : boundaryPreview?.outsideIds?.includes(surface.id) ? 'outside' : undefined}
            className="aop-synthetic-water"
          />
        ))}
        {record.terrainDocument.surfaces.filter((surface) => surface.portAllowed && surface.bounds).map((surface) => (
          <text key={`port-${surface.id}`} className="aop-port-marker" x={surface.bounds.x + surface.bounds.width / 2} y={surface.bounds.y + surface.bounds.height / 2}>
            ⚓
          </text>
        ))}
        {record.terrainDocument.surfaces.filter((surface) => surface.terrainType === 'land' && surface.coastType !== 'none' && !surface.portAllowed && surface.bounds).map((surface) => (
          <text key={`no-port-${surface.id}`} className="aop-port-marker is-disabled" x={surface.bounds.x + surface.bounds.width / 2} y={surface.bounds.y + surface.bounds.height / 2}>
            ⚓̸
          </text>
        ))}
        {marquee && <rect className="aop-marquee" {...marquee.rect} />}
      </svg>
    </div>
  );
});

function clampCamera(camera, world) {
  const width = Math.min(world.width, Math.max(world.width / 12, camera.width));
  const height = Math.min(world.height, Math.max(world.height / 12, camera.height));
  return {
    x: Math.min(world.x + world.width - width, Math.max(world.x, camera.x)),
    y: Math.min(world.y + world.height - height, Math.max(world.y, camera.y)),
    width,
    height,
  };
}

function zoomCamera(camera, factor, world, anchor = null) {
  const point = anchor || { x: camera.x + camera.width / 2, y: camera.y + camera.height / 2 };
  const width = camera.width / factor;
  const height = camera.height / factor;
  const ratioX = (point.x - camera.x) / camera.width;
  const ratioY = (point.y - camera.y) / camera.height;
  return clampCamera({ x: point.x - width * ratioX, y: point.y - height * ratioY, width, height }, world);
}
