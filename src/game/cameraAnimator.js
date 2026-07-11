export function easeInOutCubic(value) {
  const progress = Math.min(1, Math.max(0, value));
  return progress < 0.5
    ? 4 * progress * progress * progress
    : 1 - ((-2 * progress + 2) ** 3) / 2;
}

export function interpolateCamera(from, to, progress) {
  if (progress <= 0) return { ...from };
  if (progress >= 1) return { ...to };
  const eased = easeInOutCubic(progress);
  const positiveScales = from.scale > 0 && to.scale > 0;
  const scale = positiveScales
    ? from.scale * ((to.scale / from.scale) ** eased)
    : from.scale + (to.scale - from.scale) * eased;
  return {
    focusX: from.focusX + (to.focusX - from.focusX) * eased,
    focusY: from.focusY + (to.focusY - from.focusY) * eased,
    scale,
    anchorX: (from.anchorX ?? 0.5) + ((to.anchorX ?? 0.5) - (from.anchorX ?? 0.5)) * eased,
    anchorY: (from.anchorY ?? 0.5) + ((to.anchorY ?? 0.5) - (from.anchorY ?? 0.5)) * eased,
  };
}

export function createCameraAnimator({
  requestFrame = (callback) => window.requestAnimationFrame(callback),
  cancelFrame = (id) => window.cancelAnimationFrame(id),
  now = () => performance.now(),
  onFrame,
}) {
  let frameId = null;
  let token = 0;
  let disposed = false;

  const cancel = () => {
    token += 1;
    if (frameId !== null) cancelFrame(frameId);
    frameId = null;
  };

  const animate = (from, to, { duration = 420, onComplete } = {}) => {
    cancel();
    if (disposed) return token;
    const animationToken = token;
    const startedAt = now();
    onFrame({ ...from });
    if (duration <= 0) {
      onFrame({ ...to });
      onComplete?.();
      return animationToken;
    }
    const tick = (timestamp) => {
      if (disposed || animationToken !== token) return;
      const progress = Math.min(1, Math.max(0, (timestamp - startedAt) / duration));
      onFrame(interpolateCamera(from, to, progress));
      if (progress >= 1) {
        frameId = null;
        onComplete?.();
        return;
      }
      frameId = requestFrame(tick);
    };
    frameId = requestFrame(tick);
    return animationToken;
  };

  return {
    animate,
    cancel,
    isRunning: () => frameId !== null,
    dispose() {
      cancel();
      disposed = true;
    },
  };
}
