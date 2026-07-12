import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NavalRouteEditor } from './NavalRouteEditor';
import { WaitingRoom } from './WaitingRoom';

vi.mock('./MapViewer', () => ({
  MapViewer: ({ roomData, setSelectedId, previewNavalRoute }) => (
    <div data-testid="naval-map" data-preview={previewNavalRoute?.join(':') || ''}>
      {roomData.mapDefinition.regionIds.map((id) => (
        <button key={id} type="button" aria-label={`Haritada ${roomData.mapDefinition.regionsById[id].name}`} onClick={() => setSelectedId(id)}>
          {roomData.mapDefinition.regionsById[id].name}
        </button>
      ))}
    </div>
  ),
}));

function room(regionCount = 4, routed = false) {
  const regionIds = Array.from({ length: regionCount }, (_, index) => `region_${index + 1}`);
  const regions = regionIds.map((id, index) => ({
    id,
    name: `Bölge ${index + 1}`,
    price: 5000,
    income: 500,
    coastal: routed,
    seaNeighbors: routed
      ? [index % 2 === 0 ? regionIds[index + 1] : regionIds[index - 1]].filter(Boolean)
      : [],
    landNeighbors: [],
    claimNeighbors: [],
    bounds: { x: index * 30, y: 0, width: 20, height: 20 },
  }));
  return {
    phase: 'lobby',
    hostId: 'host',
    mapSvg: '<svg viewBox="0 0 400 100"></svg>',
    mapDefinition: {
      version: 1,
      geometryVersion: 2,
      boundsSpace: 'viewBox',
      viewBox: { x: 0, y: 0, width: 400, height: 100 },
      regionIds,
      regions,
      regionsById: Object.fromEntries(regions.map((region) => [region.id, region])),
    },
    mapValidation: {
      valid: true,
      regionCount,
      errors: [],
      warnings: [],
      pricingSummary: { minPrice: 5000, medianPrice: 5000, maxPrice: 5000, minIncome: 500, maxIncome: 500 },
    },
  };
}

const player = { id: 'host', name: 'Komutan', color: '#76592b' };
let container;
let root;

async function render(node) {
  await act(async () => root.render(node));
}

function button(text) {
  return [...document.querySelectorAll('button')].find((item) => item.textContent.includes(text));
}

async function click(element) {
  await act(async () => element.click());
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  document.body.style.overflow = '';
  document.documentElement.style.overflow = '';
});

describe('naval route dialog', () => {
  it('replaces unreachable inline content, opens as a modal portal, and restores focus on close', async () => {
    await render(
      <WaitingRoom
        roomCode="ABCD"
        players={[player]}
        roomData={room(4, true)}
        isHost
        handleMapUpload={() => {}}
        handleMapFile={() => {}}
        startGame={() => {}}
        editNavalMap={vi.fn()}
        leaveRoom={() => {}}
        resetApp={() => {}}
        loading={false}
        error=""
      />,
    );
    expect(container.querySelector('.aop-naval-editor')).toBeNull();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(button('Oda Haritasını Hazırlık Masasında Aç')).not.toBeUndefined();
    const opener = button('Legacy Deniz Rotalarını Gör');
    await click(opener);
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog.parentElement.parentElement).toBe(document.body);
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(document.activeElement.getAttribute('aria-label')).toContain('kapat');
    expect(container.querySelector('.aop-lobby-content').hasAttribute('inert')).toBe(true);
    await click(button('Kapat'));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('closes with Escape, traps focus, and restores exact overflow styles on cleanup', async () => {
    const opener = document.createElement('button');
    opener.textContent = 'Aç';
    document.body.appendChild(opener);
    opener.focus();
    document.body.style.overflow = 'clip';
    document.documentElement.style.overflow = 'scroll';
    const onClose = vi.fn();
    await render(<NavalRouteEditor roomData={room()} roomCode="ABCD" onEdit={vi.fn()} onClose={onClose} returnFocusRef={{ current: opener }} isHost />);
    expect(document.body.style.overflow).toBe('hidden');
    expect(document.documentElement.style.overflow).toBe('hidden');
    const buttons = [...document.querySelector('[role="dialog"]').querySelectorAll('button:not([disabled])')];
    buttons.at(-1).focus();
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    document.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(buttons[0]);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(onClose).toHaveBeenCalledOnce();
    await act(async () => root.unmount());
    expect(document.body.style.overflow).toBe('clip');
    expect(document.documentElement.style.overflow).toBe('scroll');
    expect(document.activeElement).toBe(opener);
    opener.remove();
    root = createRoot(container);
  });

  it('uses an explicit preview and one combined route mutation, with pending duplicate protection', async () => {
    let resolveEdit;
    const onEdit = vi.fn(() => new Promise((resolve) => { resolveEdit = resolve; }));
    const onClose = vi.fn();
    await render(<NavalRouteEditor roomData={room()} roomCode="ABCD" onEdit={onEdit} onClose={onClose} isHost />);
    await click(button('Yeni Rota Oluştur'));
    await click(document.querySelector('[aria-label="Haritada Bölge 1"]'));
    expect(document.body.textContent).toContain('Bölge 1 başlangıç seçildi');
    await click(document.querySelector('[aria-label="Haritada Bölge 2"]'));
    expect(document.querySelector('[data-testid="naval-map"]').dataset.preview).toBe('region_1:region_2');
    const confirm = button('Çift Yönlü Rotayı Oluştur');
    await act(async () => {
      confirm.click();
      confirm.click();
    });
    expect(onEdit).toHaveBeenCalledOnce();
    expect(onEdit).toHaveBeenCalledWith({ type: 'create_route', firstId: 'region_1', secondId: 'region_2' });
    const backdrop = document.querySelector('[data-testid="naval-dialog-backdrop"]');
    expect(backdrop).not.toBeNull();
    backdrop.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => resolveEdit({ ok: true, autoMarkedCoastal: true }));
    expect(document.body.textContent).toContain('gerekli bölgeler kıyı olarak işaretlendi');
  });

  it('cancels a self endpoint locally and keeps destructive coastal confirmation blocking Escape', async () => {
    const onClose = vi.fn();
    const onEdit = vi.fn(async () => ({ ok: true }));
    await render(<NavalRouteEditor roomData={room(4, true)} roomCode="ABCD" onEdit={onEdit} onClose={onClose} isHost />);
    await click(button('Yeni Rota Oluştur'));
    const firstRegion = document.querySelector('[aria-label="Haritada Bölge 1"]');
    await click(firstRegion);
    await click(firstRegion);
    expect(document.body.textContent).toContain('Rota uç seçimi iptal edildi');
    expect(onEdit).not.toHaveBeenCalled();
    await click(firstRegion);
    await click(button('Tüm Seçimi Temizle'));
    await click(firstRegion);
    await click(button('Kıyı İşaretini Kaldır'));
    expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(onClose).not.toHaveBeenCalled();
    await click(button('Kıyıyı ve Rotaları Kaldır'));
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ type: 'coastal', regionId: 'region_1', coastal: false, removeRoutes: true }));
  });

  it('shows all routes in one reachable controls scroller and renders non-host mode read-only', async () => {
    const manyRoutes = room(20, true);
    await render(<NavalRouteEditor roomData={manyRoutes} roomCode="ABCD" onEdit={vi.fn()} onClose={() => {}} isHost={false} />);
    expect(document.querySelectorAll('[data-testid="naval-route-item"]')).toHaveLength(10);
    expect(document.querySelector('[data-testid="naval-route-item"]:last-child').textContent).toContain('Bölge 20');
    expect(document.querySelector('[data-testid="naval-controls-scroll"]').contains(document.querySelector('[data-testid="naval-route-item"]:last-child'))).toBe(true);
    expect(button('Yeni Rota Oluştur')).toBeUndefined();
    expect(button('Rotayı Kaldır')).toBeUndefined();
    expect(document.body.textContent).toContain('Deniz Bağlantılarını Gör');
    expect(document.body.textContent).toContain('yeterli gemi kapasitesi gerekir');
  });
});
