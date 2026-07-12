import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openMapRepository } from '../services/mapRepository';
import { RecentMaps } from './RecentMaps';

let container;
let root;
let repository;

beforeEach(async () => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  repository = await openMapRepository({ indexedDB: null });
  await repository.savePreparedMap({
    mapId: 'map_a', displayName: 'Yerel Harita', updatedAt: Date.now(), sanitizedSvg: '<svg/>', preparedSvg: '<svg/>',
    terrainDocument: { summary: { playableLandCount: 2, oceanCount: 1, lakeCount: 1, coastalLandCount: 2 } },
    mapDefinition: { regionIds: ['a', 'b'] }, validation: { valid: true, errors: [] },
  });
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); });

describe('Recent Maps library', () => {
  it('shows prepared summaries and opens a stored map without another upload', async () => {
    const onEdit = vi.fn();
    await act(async () => root.render(<RecentMaps repository={repository} onEdit={onEdit} onUse={vi.fn()} />));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
    expect(container.textContent).toContain('Yerel Harita');
    expect(container.textContent).toContain('2 kara');
    await act(async () => [...container.querySelectorAll('button')].find((button) => button.textContent === 'Düzenle').click());
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ mapId: 'map_a' }));
  });

  it('requires confirmation before deleting', async () => {
    await act(async () => root.render(<RecentMaps repository={repository} onEdit={vi.fn()} onUse={vi.fn()} />));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
    await act(async () => { [...container.querySelectorAll('button')].find((button) => button.textContent === 'Sil').click(); await Promise.resolve(); });
    expect(window.confirm).toHaveBeenCalled();
    expect(await repository.getPreparedMap('map_a')).toBeNull();
  });
});
