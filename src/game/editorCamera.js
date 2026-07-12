function validBounds(bounds) {
  return bounds && [bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite)
    && bounds.width >= 0 && bounds.height >= 0;
}

function fullyContains(camera, bounds) {
  return bounds.x >= camera.x
    && bounds.y >= camera.y
    && bounds.x + bounds.width <= camera.x + camera.width
    && bounds.y + bounds.height <= camera.y + camera.height;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function revealEditorBounds(camera, bounds, world, paddingFactor = 1.2) {
  if (!validBounds(camera) || !validBounds(bounds) || !validBounds(world)) return camera;
  if (fullyContains(camera, bounds)) return camera;

  const expansion = Math.max(
    1,
    bounds.width * paddingFactor / Math.max(camera.width, Number.EPSILON),
    bounds.height * paddingFactor / Math.max(camera.height, Number.EPSILON),
  );
  const width = Math.min(world.width, camera.width * expansion);
  const height = Math.min(world.height, camera.height * expansion);
  const targetX = bounds.x + bounds.width / 2 - width / 2;
  const targetY = bounds.y + bounds.height / 2 - height / 2;
  return {
    x: clamp(targetX, world.x, world.x + world.width - width),
    y: clamp(targetY, world.y, world.y + world.height - height),
    width,
    height,
  };
}
