function gridDimensions(viewBox) {
  const ratio = Math.max(0.1, Math.min(10, viewBox.width / viewBox.height));
  return {
    columns: Math.max(40, Math.min(192, Math.round(112 * Math.sqrt(ratio)))),
    rows: Math.max(40, Math.min(192, Math.round(112 / Math.sqrt(ratio)))),
  };
}

function pointInLine(point, line) {
  let inside = false;
  for (let first = 0, second = line.length - 1; first < line.length; second = first, first += 1) {
    const a = line[first];
    const b = line[second];
    const crosses = ((a.y > point.y) !== (b.y > point.y))
      && point.x < ((b.x - a.x) * (point.y - a.y)) / ((b.y - a.y) || Number.EPSILON) + a.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

function pointInSurface(point, surface) {
  const boundaries = (surface?.boundary || []).filter((line) => line.length > 2);
  if (boundaries.length) return boundaries.reduce((inside, line) => pointInLine(point, line) ? !inside : inside, false);
  const bounds = surface?.bounds;
  return Boolean(bounds && point.x >= bounds.x && point.x <= bounds.x + bounds.width
    && point.y >= bounds.y && point.y <= bounds.y + bounds.height);
}

function cellsFromRuns(runs = []) {
  const cells = [];
  for (const run of runs) {
    if (!Array.isArray(run) || run.length !== 2) continue;
    for (let cell = run[0]; cell <= run[1]; cell += 1) cells.push(cell);
  }
  return cells;
}

function cellsToRuns(cells, columns) {
  const sorted = [...cells].sort((a, b) => a - b);
  const runs = [];
  let start = null;
  let previous = null;
  for (const cell of sorted) {
    const consecutive = previous !== null && cell === previous + 1
      && Math.floor(previous / columns) === Math.floor(cell / columns);
    if (start === null || !consecutive) {
      if (start !== null) runs.push([start, previous]);
      start = cell;
    }
    previous = cell;
  }
  if (start !== null) runs.push([start, previous]);
  return runs;
}

function cardinalNeighbors(cell, columns, rows) {
  const column = cell % columns;
  const row = Math.floor(cell / columns);
  return [
    column > 0 ? cell - 1 : -1,
    column < columns - 1 ? cell + 1 : -1,
    row > 0 ? cell - columns : -1,
    row < rows - 1 ? cell + columns : -1,
  ].filter((value) => value >= 0);
}

function stableComponentId(cells) {
  let hash = 2166136261;
  for (const cell of cells) {
    hash ^= cell + 1;
    hash = Math.imul(hash, 16777619);
  }
  return `nav_${(hash >>> 0).toString(36).padStart(7, '0')}`;
}

export function buildNavigationMask(document) {
  const viewBox = document?.viewBox;
  if (!viewBox || ![viewBox.x, viewBox.y, viewBox.width, viewBox.height].every(Number.isFinite)) return null;
  const synthetic = (document.surfaces || []).find((surface) => surface.synthetic && surface.geometry?.type === 'grid_runs');
  const dimensions = synthetic?.geometry || gridDimensions(viewBox);
  const columns = dimensions.columns;
  const rows = dimensions.rows;
  const size = columns * rows;
  const stepX = viewBox.width / columns;
  const stepY = viewBox.height / rows;
  const passable = new Uint8Array(size);
  const landOwner = new Array(size).fill(null);
  const explicit = (document.surfaces || []).filter((surface) => !surface.synthetic);

  for (const surface of document.surfaces || []) {
    if (!surface.synthetic || !['ocean', 'lake'].includes(surface.terrainType) || surface.geometry?.type !== 'grid_runs') continue;
    for (const cell of cellsFromRuns(surface.geometry.runs)) if (cell >= 0 && cell < size) passable[cell] = 1;
  }

  for (let cell = 0; cell < size; cell += 1) {
    const column = cell % columns;
    const row = Math.floor(cell / columns);
    const point = { x: viewBox.x + (column + 0.5) * stepX, y: viewBox.y + (row + 0.5) * stepY };
    const containing = explicit.find((surface) => pointInSurface(point, surface));
    if (!containing) continue;
    if (containing.terrainType === 'ocean' || containing.terrainType === 'lake') passable[cell] = 1;
    else {
      passable[cell] = 0;
      if (containing.terrainType === 'land') landOwner[cell] = containing.id;
    }
  }

  const componentByCell = new Array(size).fill(null);
  const components = [];
  for (let seed = 0; seed < size; seed += 1) {
    if (!passable[seed] || componentByCell[seed]) continue;
    const queue = [seed];
    const cells = [];
    componentByCell[seed] = '@pending';
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const cell = queue[cursor];
      cells.push(cell);
      for (const neighbor of cardinalNeighbors(cell, columns, rows)) {
        if (passable[neighbor] && !componentByCell[neighbor]) {
          componentByCell[neighbor] = '@pending';
          queue.push(neighbor);
        }
      }
    }
    cells.sort((a, b) => a - b);
    const id = stableComponentId(cells);
    cells.forEach((cell) => { componentByCell[cell] = id; });
    const boundaryCells = cells.filter((cell) => {
      const column = cell % columns;
      const row = Math.floor(cell / columns);
      return column === 0 || row === 0 || column === columns - 1 || row === rows - 1;
    });
    components.push({
      id,
      runs: cellsToRuns(cells, columns),
      portalCell: (boundaryCells.length ? boundaryCells : cells)[0],
    });
  }
  components.sort((a, b) => a.id.localeCompare(b.id));

  const coastCandidates = {};
  for (let cell = 0; cell < size; cell += 1) {
    const landId = landOwner[cell];
    if (!landId) continue;
    for (const neighbor of cardinalNeighbors(cell, columns, rows)) {
      const componentId = componentByCell[neighbor];
      if (!componentId) continue;
      coastCandidates[landId] ||= {};
      coastCandidates[landId][componentId] = Math.min(coastCandidates[landId][componentId] ?? neighbor, neighbor);
    }
  }
  const coasts = Object.fromEntries(Object.entries(coastCandidates).map(([regionId, candidates]) => [
    regionId,
    Object.entries(candidates).sort(([first], [second]) => first.localeCompare(second))
      .map(([componentId, cell]) => ({ componentId, cell })),
  ]));
  return { version: 1, viewBox, columns, rows, components, coasts };
}

export function normalizeNavigationMask(mask) {
  if (!mask || mask.version !== 1 || !Number.isInteger(mask.columns) || !Number.isInteger(mask.rows)
    || mask.columns <= 0 || mask.rows <= 0 || mask.columns * mask.rows > 40_000
    || !Array.isArray(mask.components) || mask.components.length > 10_000
    || !mask.viewBox || ![mask.viewBox.x, mask.viewBox.y, mask.viewBox.width, mask.viewBox.height].every(Number.isFinite)
    || mask.viewBox.width <= 0 || mask.viewBox.height <= 0 || !mask.coasts || typeof mask.coasts !== 'object') return null;
  const passableByComponent = new Map();
  const componentByCell = new Map();
  for (const component of mask.components) {
    if (typeof component?.id !== 'string' || !component.id || passableByComponent.has(component.id)
      || !Array.isArray(component.runs) || !Number.isInteger(component.portalCell)) return null;
    for (const run of component.runs) {
      if (!Array.isArray(run) || run.length !== 2 || !Number.isInteger(run[0]) || !Number.isInteger(run[1])
        || run[0] < 0 || run[1] < run[0] || run[1] >= mask.columns * mask.rows
        || Math.floor(run[0] / mask.columns) !== Math.floor(run[1] / mask.columns)) return null;
    }
    const cells = new Set(cellsFromRuns(component.runs).filter((cell) => cell >= 0 && cell < mask.columns * mask.rows));
    if (!cells.size || !cells.has(component.portalCell)) return null;
    passableByComponent.set(component.id, cells);
    for (const cell of cells) {
      if (componentByCell.has(cell)) return null;
      componentByCell.set(cell, component.id);
    }
  }
  for (const entries of Object.values(mask.coasts)) {
    if (!Array.isArray(entries)) return null;
    for (const entry of entries) {
      if (typeof entry?.componentId !== 'string' || !Number.isInteger(entry.cell)
        || !passableByComponent.get(entry.componentId)?.has(entry.cell)) return null;
    }
  }
  return { ...mask, passableByComponent, componentByCell };
}

function heuristic(cell, target, columns) {
  const dx = Math.abs((cell % columns) - (target % columns));
  const dy = Math.abs(Math.floor(cell / columns) - Math.floor(target / columns));
  return Math.max(dx, dy);
}

function navigableNeighbors(cell, allowed, columns, rows) {
  const column = cell % columns;
  const row = Math.floor(cell / columns);
  const result = [];
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (!dx && !dy) continue;
      const x = column + dx;
      const y = row + dy;
      if (x < 0 || y < 0 || x >= columns || y >= rows) continue;
      const neighbor = y * columns + x;
      if (!allowed.has(neighbor)) continue;
      if (dx && dy && (!allowed.has(row * columns + x) || !allowed.has(y * columns + column))) continue;
      result.push({ cell: neighbor, cost: dx && dy ? Math.SQRT2 : 1 });
    }
  }
  return result.sort((a, b) => a.cell - b.cell);
}

export function findWaterCellPath(maskInput, componentId, start, target) {
  const mask = maskInput?.passableByComponent ? maskInput : normalizeNavigationMask(maskInput);
  const allowed = mask?.passableByComponent.get(componentId);
  if (!allowed?.has(start) || !allowed.has(target)) return null;
  const open = new Set([start]);
  const cameFrom = new Map();
  const g = new Map([[start, 0]]);
  const f = new Map([[start, heuristic(start, target, mask.columns)]]);
  while (open.size) {
    const current = [...open].sort((first, second) => (f.get(first) - f.get(second)) || first - second)[0];
    if (current === target) {
      const path = [current];
      while (cameFrom.has(path[0])) path.unshift(cameFrom.get(path[0]));
      return path;
    }
    open.delete(current);
    for (const neighbor of navigableNeighbors(current, allowed, mask.columns, mask.rows)) {
      const tentative = g.get(current) + neighbor.cost;
      if (tentative >= (g.get(neighbor.cell) ?? Infinity)) continue;
      cameFrom.set(neighbor.cell, current);
      g.set(neighbor.cell, tentative);
      f.set(neighbor.cell, tentative + heuristic(neighbor.cell, target, mask.columns));
      open.add(neighbor.cell);
    }
  }
  return null;
}

function lineCells(first, second, columns) {
  let x0 = first % columns;
  let y0 = Math.floor(first / columns);
  const x1 = second % columns;
  const y1 = Math.floor(second / columns);
  const dx = Math.abs(x1 - x0);
  const sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0);
  const sy = y0 < y1 ? 1 : -1;
  let error = dx + dy;
  const cells = [];
  while (true) {
    cells.push(y0 * columns + x0);
    if (x0 === x1 && y0 === y1) break;
    const twice = 2 * error;
    if (twice >= dy) { error += dy; x0 += sx; }
    if (twice <= dx) { error += dx; y0 += sy; }
  }
  const supercover = [cells[0]];
  for (let index = 1; index < cells.length; index += 1) {
    const previous = cells[index - 1];
    const current = cells[index];
    const previousColumn = previous % columns;
    const previousRow = Math.floor(previous / columns);
    const currentColumn = current % columns;
    const currentRow = Math.floor(current / columns);
    if (previousColumn !== currentColumn && previousRow !== currentRow) {
      supercover.push(previousRow * columns + currentColumn, currentRow * columns + previousColumn);
    }
    supercover.push(current);
  }
  return [...new Set(supercover)];
}

export function simplifyWaterCellPath(path, allowed, columns) {
  if (!path || path.length < 3) return path ? [...path] : null;
  const result = [path[0]];
  let anchor = 0;
  while (anchor < path.length - 1) {
    let next = path.length - 1;
    while (next > anchor + 1 && !lineCells(path[anchor], path[next], columns).every((cell) => allowed.has(cell))) next -= 1;
    result.push(path[next]);
    anchor = next;
  }
  return result;
}

export function navigationCellPoint(mask, cell) {
  const column = cell % mask.columns;
  const row = Math.floor(cell / mask.columns);
  return {
    x: mask.viewBox.x + (column + 0.5) * mask.viewBox.width / mask.columns,
    y: mask.viewBox.y + (row + 0.5) * mask.viewBox.height / mask.rows,
  };
}

function waterSegment(mask, componentId, start, target) {
  const cells = findWaterCellPath(mask, componentId, start, target);
  if (!cells) return null;
  const simplified = simplifyWaterCellPath(cells, mask.passableByComponent.get(componentId), mask.columns);
  return { kind: 'water', componentId, cells: simplified, points: simplified.map((cell) => navigationCellPoint(mask, cell)) };
}

export function computeNavalPresentationPath(maskInput, sourceId, targetId) {
  const mask = normalizeNavigationMask(maskInput);
  if (!mask) return { kind: 'highlight_only', segments: [] };
  const sources = mask.coasts?.[sourceId] || [];
  const targets = mask.coasts?.[targetId] || [];
  const targetByComponent = new Map(targets.map((entry) => [entry.componentId, entry]));
  for (const source of sources) {
    const target = targetByComponent.get(source.componentId);
    if (!target) continue;
    const segment = waterSegment(mask, source.componentId, source.cell, target.cell);
    if (segment) return { kind: 'water_path', segments: [segment] };
  }
  for (const source of sources) {
    const sourceComponent = mask.components.find((component) => component.id === source.componentId);
    if (!sourceComponent) continue;
    for (const target of targets) {
      const targetComponent = mask.components.find((component) => component.id === target.componentId);
      if (!targetComponent || target.componentId === source.componentId) continue;
      const departure = waterSegment(mask, source.componentId, source.cell, sourceComponent.portalCell);
      const arrival = waterSegment(mask, target.componentId, targetComponent.portalCell, target.cell);
      if (departure && arrival) return {
        kind: 'remote_voyage',
        segments: [departure, { kind: 'remote_transition' }, arrival],
      };
    }
  }
  return { kind: 'highlight_only', segments: [] };
}

export function pathStaysOnWater(maskInput, presentation) {
  const mask = normalizeNavigationMask(maskInput);
  if (!mask) return false;
  return presentation.segments.filter((segment) => segment.kind === 'water').every((segment) => (
    segment.cells.every((cell) => mask.passableByComponent.get(segment.componentId)?.has(cell))
  ));
}
