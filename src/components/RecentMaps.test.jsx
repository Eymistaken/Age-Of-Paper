import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prepareSvgMap } from '../game/mapImporter';
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
  const prepared = await prepareSvgMap('<svg viewBox="0 0 100 50" xmlns="http://www.w3.org/2000/svg"><rect id="land_a" data-terrain="land" width="50" height="50"/><rect id="water_1" data-terrain="ocean" x="50" width="50" height="50"/></svg>', { mapId: 'map_a', displayName: 'Yerel Harita' });
  await repository.savePreparedMap(prepared);
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('Recent Maps library', () => {
  it('shows prepared summaries and opens a stored map without another upload', async () => {
    const onEdit = vi.fn();
    await act(async () => root.render(<RecentMaps repository={repository} onEdit={onEdit} onUse={vi.fn()} />));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
    expect(container.textContent).toContain('Yerel Harita');
    expect(container.textContent).toContain('1 kara');
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

  it('exports by rebuilding the trusted record without changing its mapId', async () => {
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:test'), revokeObjectURL: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const save = vi.spyOn(repository, 'savePreparedMap');
    await act(async () => root.render(<RecentMaps repository={repository} onEdit={vi.fn()} onUse={vi.fn()} />));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
    await act(async () => { [...container.querySelectorAll('button')].find((button) => button.textContent === 'Dışa Aktar').click(); await new Promise((resolve) => setTimeout(resolve, 20)); });
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ mapId: 'map_a' }));
    expect((await repository.listPreparedMaps()).map((record) => record.mapId)).toEqual(['map_a']);
  });
});
