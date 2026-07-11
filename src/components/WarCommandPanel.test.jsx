import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PHASES } from '../game/phases';
import { WarCommandPanel } from './WarCommandPanel';

const regions = {
  a: { id: 'a', name: 'A', income: 500, coastal: false, seaNeighbors: [], landNeighbors: ['b'] },
  b: { id: 'b', name: 'B', income: 500, coastal: false, seaNeighbors: [], landNeighbors: ['a'] },
};
const me = { id: 'p1', name: 'P1', money: 5000, eliminated: false };
const roomData = {
  phase: PHASES.WAR,
  players: { p1: me, p2: { id: 'p2', name: 'P2', eliminated: false } },
  turnOrder: ['p1', 'p2'], turnIndex: 0,
  mapDefinition: { regionIds: ['a', 'b'], regionsById: regions },
  claims: {
    a: { ownerId: 'p1', soldiers: 3000, hasPort: false, ships: 0 },
    b: { ownerId: 'p2', soldiers: 1000, hasPort: false, ships: 0 },
  },
};

let container;
let root;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe('war command panel', () => {
  it('shows deterministic partial-attack confirmation and submits once', async () => {
    const execute = vi.fn();
    const plan = { mode: 'selecting_attack_target', operation: 'attack', routeType: 'land', sourceId: 'a', targetId: 'b', amount: 1000 };
    await act(async () => root.render(
      <WarCommandPanel
        roomData={roomData} me={me} currentPlayer={me} isMyTurn selectedRegion={regions.b}
        selectedClaim={roomData.claims.b} selectedOwner={roomData.players.p2} plan={plan} setPlan={() => {}}
        beginPlan={() => {}} cancelPlan={() => {}} actionPending={false} actionError=""
        onRecruit={() => {}} onBuildPort={() => {}} onBuyShips={() => {}} onReady={() => {}}
        onExecuteOperation={execute} onEndTurn={() => {}}
      />,
    ));
    expect(container.textContent).toContain('Saldırı Onayı');
    expect(container.textContent).toContain('Savunma sürer, 0 asker kalır.');
    const confirm = [...container.querySelectorAll('button')].find((button) => button.textContent.includes('Saldırıyı Onayla'));
    await act(async () => confirm.click());
    expect(execute).toHaveBeenCalledOnce();
  });

  it('keeps the compact mobile variant inside the shared command vocabulary', async () => {
    await act(async () => root.render(
      <WarCommandPanel
        compact roomData={roomData} me={me} currentPlayer={me} isMyTurn selectedRegion={regions.a}
        selectedClaim={roomData.claims.a} selectedOwner={me} plan={{ mode: 'idle', operation: null, routeType: 'land', sourceId: null, targetId: null, amount: 1000 }}
        setPlan={() => {}} beginPlan={() => {}} cancelPlan={() => {}} actionPending={false} actionError=""
        onRecruit={() => {}} onBuildPort={() => {}} onBuyShips={() => {}} onReady={() => {}}
        onExecuteOperation={() => {}} onEndTurn={() => {}}
      />,
    ));
    expect(container.querySelector('.aop-war-orders.is-compact')).not.toBeNull();
    expect(container.textContent).toContain('Harekât Yapmadan Turu Bitir');
  });
});
