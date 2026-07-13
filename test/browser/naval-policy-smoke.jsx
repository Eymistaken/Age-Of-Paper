/* eslint-disable react-refresh/only-export-components -- Dedicated browser entry, not a hot-reload module. */
import { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { MapViewer } from '../../src/components/MapViewer';
import { MobileGameRoom } from '../../src/components/MobileGameRoom';
import { WarCommandPanel } from '../../src/components/WarCommandPanel';
import { getClaimEligibility } from '../../src/game/rules';
import { applyAttack } from '../../src/game/warCombat';
import { applyBuildPort, grantTurnIncome } from '../../src/game/warEconomy';
import { applyTransfer } from '../../src/game/warMovement';
import {
  getNavalTargetEligibility,
  getPlayerNavalCapability,
  migrateLegacyNavalPolicy,
  normalizeRouteList,
} from '../../src/game/navalPolicy';
import {
  getWarHighlights,
  selectWarRegion,
  startWarPlan,
  WAR_INTERACTION_MODES,
} from '../../src/game/warUiState';
import { computeNavalPresentationPath, pathStaysOnWater } from '../../src/game/waterNavigation';
import '../../src/index.css';

const output = document.getElementById('smoke-result');
const resultList = document.getElementById('scenario-results');
const runtime = document.getElementById('smoke-runtime');
const mode = new URLSearchParams(window.location.search).get('mode');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const wait = (milliseconds) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));
const NOOP = () => {};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitFor(check, message, timeout = 5_000) {
  const started = performance.now();
  while (!check()) {
    if (performance.now() - started > timeout) throw new Error(message);
    await new Promise((resolve) => window.requestAnimationFrame(resolve));
  }
}

const ids = Object.freeze({
  oceanSource: 'region-1',
  oceanTarget: 'region-2',
  lakeSource: 'region-3',
  lakeTarget: 'region-4',
  inland: 'region-5',
});

function region(id, index, overrides) {
  return {
    id,
    name: `Sentetik Bölge ${index}`,
    price: 5_000,
    income: 500,
    landNeighbors: [],
    claimNeighbors: [],
    seaNeighbors: [],
    ...overrides,
  };
}

const regions = [
  region(ids.oceanSource, 1, { bounds: { x: 4, y: 20, width: 18, height: 20 }, coastal: true, coastType: 'ocean', portAllowed: true, landNeighbors: [ids.inland], claimNeighbors: [ids.inland] }),
  region(ids.oceanTarget, 2, { bounds: { x: 78, y: 20, width: 18, height: 20 }, coastal: true, coastType: 'ocean', portAllowed: true, landNeighbors: [ids.inland], claimNeighbors: [ids.inland] }),
  region(ids.lakeSource, 3, { bounds: { x: 38, y: 4, width: 14, height: 14 }, coastal: true, coastType: 'lake', portAllowed: true, landNeighbors: [ids.inland], claimNeighbors: [ids.inland] }),
  region(ids.lakeTarget, 4, { bounds: { x: 58, y: 4, width: 14, height: 14 }, coastal: true, coastType: 'lake', portAllowed: true, landNeighbors: [ids.inland], claimNeighbors: [ids.inland] }),
  region(ids.inland, 5, { bounds: { x: 40, y: 26, width: 20, height: 20 }, coastal: false, coastType: 'none', portAllowed: false, landNeighbors: [ids.oceanSource, ids.oceanTarget, ids.lakeSource, ids.lakeTarget], claimNeighbors: [ids.oceanSource, ids.oceanTarget, ids.lakeSource, ids.lakeTarget] }),
];
const regionsById = Object.fromEntries(regions.map((entry) => [entry.id, entry]));

const navigationMask = {
  version: 1,
  viewBox: { x: 0, y: 0, width: 100, height: 60 },
  columns: 10,
  rows: 6,
  components: [
    { id: 'water-1', runs: [[0, 9], [10, 19], [20, 29], [40, 43], [46, 49], [50, 59]], portalCell: 0 },
    { id: 'water-2', runs: [[34, 35]], portalCell: 34 },
  ],
  coasts: {
    [ids.oceanSource]: [{ componentId: 'water-1', cell: 20 }],
    [ids.oceanTarget]: [{ componentId: 'water-1', cell: 29 }],
    [ids.lakeSource]: [{ componentId: 'water-2', cell: 34 }],
    [ids.lakeTarget]: [{ componentId: 'water-2', cell: 35 }],
  },
};

const baseMap = {
  version: 1,
  geometryVersion: 2,
  boundsSpace: 'viewBox',
  viewBox: navigationMask.viewBox,
  regionIds: regions.map((entry) => entry.id),
  regions,
  regionsById,
  navalPolicy: 'all_coasts',
  allowedRoutes: [],
  blockedRoutes: [],
};

const mapSvg = `<svg viewBox="0 0 100 60" xmlns="http://www.w3.org/2000/svg">
  <rect width="100" height="60" fill="#285e72"/>
  ${regions.map((entry) => `<rect id="${entry.id}" data-region="true" data-region-id="${entry.id}" class="default-land" x="${entry.bounds.x}" y="${entry.bounds.y}" width="${entry.bounds.width}" height="${entry.bounds.height}"/>`).join('')}
</svg>`;

const baseRoom = {
  schemaVersion: 4,
  hostId: 'player-1',
  phase: 'war',
  mapDefinition: baseMap,
  mapNavigation: navigationMask,
  players: {
    'player-1': { id: 'player-1', name: 'Oyuncu 1', color: '#9b3b32', money: 100_000, income: 6_500, regionIds: [ids.oceanSource, ids.lakeSource, ids.inland], lastIncomeTurn: 7, eliminated: false, lastActive: Date.now() },
    'player-2': { id: 'player-2', name: 'Oyuncu 2', color: '#375f83', money: 100_000, income: 6_000, regionIds: [ids.oceanTarget, ids.lakeTarget], lastIncomeTurn: 7, eliminated: false, lastActive: Date.now() },
  },
  claims: {
    [ids.oceanSource]: { ownerId: 'player-1', soldiers: 4_000, hasPort: true, ships: 4 },
    [ids.oceanTarget]: { ownerId: 'player-2', soldiers: 1_000, hasPort: false, ships: 0 },
    [ids.lakeSource]: { ownerId: 'player-1', soldiers: 2_000, hasPort: true, ships: 2 },
    [ids.lakeTarget]: { ownerId: 'player-2', soldiers: 1_000, hasPort: false, ships: 0 },
    [ids.inland]: { ownerId: 'player-1', soldiers: 2_000, hasPort: false, ships: 0 },
  },
  turnOrder: ['player-1', 'player-2'],
  turnIndex: 0,
  turnNumber: 7,
  roundNumber: 3,
  chat: [],
  joinRequests: {},
  lastAction: { type: 'claim', actorId: 'player-1', regionId: ids.inland, actionId: 'initial', turnNumber: 6 },
  mapSvg,
};

const roots = {
  a: createRoot(document.getElementById('map-root-a')),
  b: createRoot(document.getElementById('map-root-b')),
  panel: createRoot(document.getElementById('panel-root')),
  mobile: createRoot(document.getElementById('mobile-root')),
};
const mapRefs = { a: { current: null }, b: { current: null } };

function renderMap(slot, room, props = {}) {
  flushSync(() => roots[slot].render(
    <MapViewer
      ref={mapRefs[slot]}
      roomData={room}
      roomCode="SMOKE"
      selectedId={null}
      setSelectedId={NOOP}
      currentPlayer={room.players['player-1']}
      localPlayerId={props.localPlayerId || 'player-2'}
      hideHud
      {...props}
    />,
  ));
  mapRefs[slot].current?.setVisibleMapRect({
    x: 0,
    y: 0,
    width: Math.max(320, document.getElementById(`map-root-${slot}`).clientWidth),
    height: Math.max(420, window.innerHeight * 0.7),
  });
}

function targetPlan(operation = 'attack') {
  return {
    ...startWarPlan(operation, 'naval'),
    sourceId: ids.oceanSource,
    mode: operation === 'attack'
      ? WAR_INTERACTION_MODES.SELECTING_ATTACK_TARGET
      : WAR_INTERACTION_MODES.SELECTING_MOVE_TARGET,
  };
}

function renderHighlights(slot, room, plan) {
  const highlights = getWarHighlights(room, 'player-1', plan);
  renderMap(slot, room, {
    highlightSourceIds: highlights.sources,
    highlightTargetIds: highlights.targets,
    highlightInvalidTargetIds: highlights.invalidTargets,
    showNavalRoutes: true,
  });
  return highlights;
}

function PointerSelection({ room }) {
  const [selectedId, setSelectedId] = useState(null);
  const [plan, setPlan] = useState(() => startWarPlan('attack', 'naval'));
  const [actionError, setActionError] = useState('');
  const me = room.players['player-1'];
  const currentPlayer = me;
  const highlights = useMemo(() => getWarHighlights(room, me.id, plan), [me.id, plan, room]);
  const selectRegion = (regionId) => {
    setPlan((current) => {
      const currentHighlights = getWarHighlights(room, me.id, current);
      const state = current.sourceId ? currentHighlights.targetStates?.[regionId] : null;
      if (state && !state.legal) {
        setSelectedId(regionId);
        setActionError(state.reason);
        return current;
      }
      const next = selectWarRegion(room, me.id, current, regionId);
      if (next !== current) {
        setSelectedId(regionId);
        setActionError('');
      }
      return next;
    });
  };
  const selectedRegion = selectedId ? room.mapDefinition.regionsById[selectedId] : null;
  const selectedClaim = selectedId ? room.claims[selectedId] : null;
  const selectedOwner = selectedClaim?.ownerId ? room.players[selectedClaim.ownerId] : null;
  return (
    <MobileGameRoom
      roomData={room}
      roomCode="SMOKE"
      me={me}
      currentIncome={me.income}
      currentPlayerId={me.id}
      currentPlayer={currentPlayer}
      isMyTurn
      isHost
      selectedId={selectedId}
      setSelectedId={selectRegion}
      selectedRegion={selectedRegion}
      selectedOwner={selectedOwner}
      selectedClaim={selectedClaim}
      eligibility={{ legal: false, reason: '' }}
      legalClaims={[]}
      actionError={actionError}
      actionPending={false}
      now={Date.now()}
      message=""
      setMessage={NOOP}
      submitMessage={NOOP}
      chatEndRef={{ current: null }}
      buySelected={NOOP}
      finishTurn={NOOP}
      skipPlayer={NOOP}
      leaveRoom={NOOP}
      pendingJoinRequests={[]}
      approveRequest={NOOP}
      rejectRequest={NOOP}
      unreadCount={0}
      onChatVisibilityChange={NOOP}
      warPlan={plan}
      setWarPlan={setPlan}
      beginWarPlan={(operation, routeType) => setPlan(startWarPlan(operation, routeType))}
      cancelWarPlan={() => setPlan(startWarPlan('attack', 'naval'))}
      recruitSelected={NOOP}
      buildSelectedPort={NOOP}
      buySelectedShip={NOOP}
      readyMobilization={NOOP}
      finishWarTurn={NOOP}
      executeWarOperation={NOOP}
      warHighlights={highlights}
    />
  );
}

function dispatchTouchSelection(element, pointerId) {
  const options = { bubbles: true, cancelable: true, pointerId, pointerType: 'touch', button: 0, clientX: 12, clientY: 12 };
  element.dispatchEvent(new PointerEvent('pointerdown', options));
  element.dispatchEvent(new PointerEvent('pointerup', options));
}

async function runMobileInteraction() {
  assert(window.innerWidth <= 500, `Dar viewport bekleniyordu, ölçülen ${window.innerWidth}px.`);
  const room = { ...baseRoom, mapDefinition: { ...baseMap, blockedRoutes: [[ids.oceanSource, ids.oceanTarget]] } };
  flushSync(() => roots.mobile.render(<PointerSelection room={room}/>));
  await waitFor(() => document.querySelector('#mobile-root .source-land'), 'Mobil kaynak hedefleri gösterilmedi.');
  const source = document.querySelector(`#mobile-root [data-region-id="${ids.oceanSource}"]`);
  dispatchTouchSelection(source, 41);
  await waitFor(() => document.querySelector(`#mobile-root [data-region-id="${ids.oceanTarget}"]`)?.classList.contains('invalid-target-land'), 'Engellenen mobil hedef kırmızı olmadı.');
  const target = document.querySelector(`#mobile-root [data-region-id="${ids.oceanTarget}"]`);
  dispatchTouchSelection(target, 42);
  await waitFor(() => document.querySelector('#mobile-root .aop-inline-error')?.textContent.includes('Rota engelli'), 'Mobil geçersizlik nedeni gösterilmedi.');
  const detail = `viewport=${window.innerWidth}x${window.innerHeight}; touch=${navigator.maxTouchPoints}; reason=Rota engelli`;
  flushSync(() => roots.mobile.render(null));
  return detail;
}

async function runMobileScenario() {
  if (window.innerWidth <= 500) return runMobileInteraction();
  const frame = document.createElement('iframe');
  frame.className = 'smoke-mobile-frame';
  frame.width = '390';
  frame.height = '844';
  frame.title = 'Dar mobil smoke bağlamı';
  frame.src = `${window.location.pathname}?mode=mobile-frame`;
  document.body.appendChild(frame);
  await waitFor(() => ['pass', 'fail'].includes(frame.contentDocument?.getElementById('smoke-result')?.dataset.status), 'Mobil iframe smoke tamamlanmadı.', 12_000);
  const childOutput = frame.contentDocument.getElementById('smoke-result');
  const childScenario = frame.contentDocument.querySelector('[data-scenario-id="mobile-target-reason"]');
  const childWidth = frame.contentWindow.innerWidth;
  const detail = `childViewport=${childWidth}x${frame.contentWindow.innerHeight}; ${childScenario?.querySelector('small')?.textContent || ''}`;
  const passed = childOutput.dataset.status === 'pass' && childWidth <= 500;
  frame.remove();
  assert(passed, childOutput.textContent || 'Mobil iframe başarısız.');
  return detail;
}

const scenarios = [
  {
    id: 'ocean-transfer',
    name: 'İzinli okyanus kıyıları arasında deniz nakli',
    run() {
      const friendly = {
        ...baseRoom,
        claims: { ...baseRoom.claims, [ids.oceanTarget]: { ...baseRoom.claims[ids.oceanTarget], ownerId: 'player-1' } },
      };
      const eligibility = getNavalTargetEligibility(friendly, 'player-1', 'move', ids.oceanSource, ids.oceanTarget, 1_000);
      const moved = applyTransfer(friendly, 'player-1', ids.oceanSource, ids.oceanTarget, 1_000, 'naval');
      assert(eligibility.legal && moved.eligibility.legal, eligibility.reason || 'Nakil reddedildi.');
      assert(moved.room.claims[ids.oceanTarget].soldiers === 2_000, 'Nakil askerleri hedefe ulaşmadı.');
      return '1.000 asker, 1 gemi kapasitesiyle taşındı.';
    },
  },
  {
    id: 'all-coasts-blocked',
    name: 'all_coasts engeli kırmızı ve erişilemez',
    async run() {
      const room = { ...baseRoom, mapDefinition: { ...baseMap, blockedRoutes: [[ids.oceanSource, ids.oceanTarget]] } };
      const highlights = renderHighlights('a', room, targetPlan());
      await waitFor(() => document.querySelector(`#map-root-a [data-region-id="${ids.oceanTarget}"]`)?.classList.contains('invalid-target-land'), 'Engellenen hedef kırmızı olmadı.');
      assert(highlights.targetStates[ids.oceanTarget].code === 'ROUTE_BLOCKED', 'Rota engeli nedeni kayboldu.');
      return highlights.targetStates[ids.oceanTarget].reason;
    },
  },
  {
    id: 'selected-routes',
    name: 'selected_routes izinli ve izinsiz hedef ayrımı',
    async run() {
      const room = { ...baseRoom, mapDefinition: { ...baseMap, navalPolicy: 'selected_routes', allowedRoutes: [[ids.oceanSource, ids.oceanTarget]] } };
      const highlights = renderHighlights('a', room, targetPlan());
      await waitFor(() => document.querySelector(`#map-root-a [data-region-id="${ids.oceanTarget}"]`)?.classList.contains('target-land'), 'İzinli hedef yeşil olmadı.');
      assert(document.querySelector(`#map-root-a [data-region-id="${ids.lakeTarget}"]`)?.classList.contains('invalid-target-land'), 'İzinsiz hedef kırmızı olmadı.');
      assert(highlights.targetStates[ids.lakeTarget].code === 'NO_SELECTED_ROUTE', 'Özel rota nedeni yanlış.');
      return 'İzinli hedef yeşil, özel rotasız hedef kırmızı.';
    },
  },
  {
    id: 'disabled-ui',
    name: 'disabled politikasında deniz arayüzü gizli',
    async run() {
      const room = { ...baseRoom, mapDefinition: { ...baseMap, navalPolicy: 'disabled' } };
      const capability = getPlayerNavalCapability(room, 'player-1');
      flushSync(() => roots.panel.render(
        <WarCommandPanel
          compact roomData={room} me={room.players['player-1']} currentPlayer={room.players['player-1']} isMyTurn
          selectedRegion={regionsById[ids.oceanSource]} selectedClaim={room.claims[ids.oceanSource]} selectedOwner={room.players['player-1']}
          plan={{ ...startWarPlan('attack', 'land'), mode: 'idle' }} setPlan={NOOP} beginPlan={NOOP} cancelPlan={NOOP}
          actionPending={false} actionError="" onRecruit={NOOP} onBuildPort={NOOP} onBuyShips={NOOP}
          onReady={NOOP} onExecuteOperation={NOOP} onEndTurn={NOOP}
        />,
      ));
      await waitFor(() => document.querySelector('#panel-root .aop-war-orders'), 'Savaş paneli render edilmedi.');
      assert(!capability.showNavalSection && !document.getElementById('panel-root').textContent.includes('Deniz'), 'Deniz kontrolleri disabled modunda görünür kaldı.');
      return 'Deniz başlıkları ve kontrolleri DOM dışında.';
    },
  },
  {
    id: 'lake-water-path',
    name: 'Göl kıyısından göl kıyısına su yolu',
    run() {
      const path = computeNavalPresentationPath(navigationMask, ids.lakeSource, ids.lakeTarget);
      assert(path.kind === 'water_path' && pathStaysOnWater(navigationMask, path), 'Göl yolu su maskesinde kalmadı.');
      return `${path.segments[0].cells.length} sadeleştirilmiş su hücresi.`;
    },
  },
  {
    id: 'remote-voyage',
    name: 'Ayrık göl ve okyanus arasında uzak sefer',
    run() {
      const path = computeNavalPresentationPath(navigationMask, ids.lakeSource, ids.oceanSource);
      assert(path.kind === 'remote_voyage' && path.segments.some((segment) => segment.kind === 'remote_transition'), 'Uzak sefer geçişi üretilmedi.');
      assert(pathStaysOnWater(navigationMask, path), 'Uzak sefer su segmenti karaya çıktı.');
      return path.segments.map((segment) => segment.kind).join(' → ');
    },
  },
  {
    id: 'inland-rejected',
    name: 'İç kara rota ve liman reddi',
    run() {
      const routes = normalizeRouteList([[ids.inland, ids.oceanSource]], { mapDefinition: baseMap });
      const port = applyBuildPort(baseRoom, 'player-1', ids.inland);
      assert(routes.length === 0, 'İç kara rota ucu kabul edildi.');
      assert(!port.eligibility.legal && port.eligibility.code === 'NOT_COASTAL', 'İç karada liman kurulabildi.');
      return port.eligibility.reason;
    },
  },
  { id: 'mobile-target-reason', name: 'Dar mobil kaynak/hedef ve geçersizlik nedeni', run: runMobileScenario },
  {
    id: 'shared-last-action',
    name: 'Aynı lastAction iki oyuncu görünümünde sunulur',
    async run() {
      renderMap('a', baseRoom, { localPlayerId: 'player-1' });
      renderMap('b', baseRoom, { localPlayerId: 'player-2' });
      const action = { type: 'naval_transfer', actorId: 'player-1', sourceId: ids.oceanSource, targetId: ids.oceanTarget, amount: 1_000, actionId: 'voyage-shared', turnNumber: 7 };
      renderMap('a', { ...baseRoom, lastAction: action }, { localPlayerId: 'player-1' });
      renderMap('b', { ...baseRoom, lastAction: action }, { localPlayerId: 'player-2' });
      await waitFor(() => document.querySelectorAll('[data-action-id="voyage-shared"]').length === 2, 'İki oyuncu ortak sunumu görmedi.');
      return 'Yerel aktör ve uzak oyuncu overlay’i aynı actionId ile hazır.';
    },
  },
  {
    id: 'last-action-once',
    name: 'Aynı lastAction yeniden render edilince tekrarlanmaz',
    async run() {
      await waitFor(() => !document.querySelector('[data-action-id="voyage-shared"]'), 'İlk lastAction sunumu tamamlanmadı.', 6_000);
      const actionRoom = { ...baseRoom, lastAction: { type: 'naval_transfer', actorId: 'player-1', sourceId: ids.oceanSource, targetId: ids.oceanTarget, amount: 1_000, actionId: 'voyage-shared', turnNumber: 7 } };
      renderMap('a', actionRoom, { localPlayerId: 'player-1' });
      await wait(180);
      assert(!document.querySelector('#map-root-a [data-action-id="voyage-shared"]'), 'Aynı lastAction ikinci kez oynadı.');
      return 'İkinci render overlay üretmedi.';
    },
  },
  {
    id: 'manual-camera-cancel',
    name: 'Pan, wheel ve pinch otomatik kamerayı bırakır',
    async run() {
      const pointer = (type, overrides = {}) => new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        pointerId: 71,
        pointerType: 'mouse',
        button: 0,
        clientX: 180,
        clientY: 180,
        ...overrides,
      });
      const verify = async (kind, turnNumber, interact) => {
        renderMap('a', baseRoom, { localPlayerId: 'player-2' });
        const actionId = `voyage-cancel-${kind}`;
        const action = { type: 'naval_transfer', actorId: 'player-1', sourceId: ids.oceanSource, targetId: ids.oceanTarget, amount: 1_000, actionId, turnNumber };
        renderMap('a', { ...baseRoom, turnNumber, lastAction: action }, { localPlayerId: 'player-2' });
        await waitFor(() => document.querySelector(`#map-root-a [data-action-id="${actionId}"]`), `${kind} kamera iptal seferi başlamadı.`);
        const surface = document.querySelector('#map-root-a .aop-map-viewer');
        interact(surface, pointer);
        const manualTransform = document.querySelector('#map-root-a .aop-map-transform').style.transform;
        await waitFor(() => !document.querySelector(`#map-root-a [data-action-id="${actionId}"]`), `${kind} kamera iptal seferi tamamlanmadı.`, 6_000);
        await wait(120);
        assert(document.querySelector('#map-root-a .aop-map-transform').style.transform === manualTransform, `Otomatik kamera kullanıcı ${kind} hareketini geri aldı.`);
      };
      await verify('wheel', 8, (surface) => {
        surface.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -120, clientX: 220, clientY: 180 }));
      });
      await verify('pan', 9, (surface, event) => {
        surface.dispatchEvent(event('pointerdown'));
        surface.dispatchEvent(event('pointermove', { clientX: 240 }));
        surface.dispatchEvent(event('pointerup', { clientX: 240 }));
      });
      await verify('pinch', 10, (surface, event) => {
        surface.dispatchEvent(event('pointerdown', { pointerType: 'touch' }));
        surface.dispatchEvent(event('pointerdown', { pointerId: 72, pointerType: 'touch', clientX: 260 }));
        surface.dispatchEvent(event('pointermove', { pointerId: 72, pointerType: 'touch', clientX: 310 }));
        surface.dispatchEvent(event('pointerup', { pointerId: 72, pointerType: 'touch', clientX: 310 }));
        surface.dispatchEvent(event('pointerup', { pointerType: 'touch' }));
      });
      return 'Pan, wheel ve pinch sonrası manuel kamera snapshot’ları korundu.';
    },
  },
  {
    id: 'water-mask-safe',
    name: 'Gemi rotasının bütün segmentleri su maskesinde',
    run() {
      const sameWater = computeNavalPresentationPath(navigationMask, ids.oceanSource, ids.oceanTarget);
      const remote = computeNavalPresentationPath(navigationMask, ids.lakeSource, ids.oceanTarget);
      assert(pathStaysOnWater(navigationMask, sameWater) && pathStaysOnWater(navigationMask, remote), 'Bir gemi segmenti kara hücresini kesti.');
      return 'Yerel ve uzak sefer segmentleri passable hücrelerde.';
    },
  },
  {
    id: 'no-straight-fallback',
    name: 'Yol yoksa kara üzerinden düz çizgi üretilmez',
    run() {
      const disconnected = {
        version: 1,
        viewBox: { x: 0, y: 0, width: 100, height: 20 },
        columns: 10,
        rows: 2,
        components: [{ id: 'broken-water', runs: [[0, 0], [9, 9]], portalCell: 0 }],
        coasts: {
          [ids.oceanSource]: [{ componentId: 'broken-water', cell: 0 }],
          [ids.oceanTarget]: [{ componentId: 'broken-water', cell: 9 }],
        },
      };
      const path = computeNavalPresentationPath(disconnected, ids.oceanSource, ids.oceanTarget);
      assert(path.kind === 'highlight_only' && path.segments.length === 0, 'Yol yokken düz çizgi fallback’i oluştu.');
      return 'highlight_only; 0 hareket segmenti.';
    },
  },
  {
    id: 'legacy-sea-neighbors',
    name: 'Legacy seaNeighbors selected_routes migrationı',
    run() {
      const legacy = {
        ...baseMap,
        navalPolicy: undefined,
        allowedRoutes: undefined,
        blockedRoutes: undefined,
        regionsById: {
          ...regionsById,
          [ids.oceanSource]: { ...regionsById[ids.oceanSource], seaNeighbors: [ids.oceanTarget] },
          [ids.oceanTarget]: { ...regionsById[ids.oceanTarget], seaNeighbors: [ids.oceanSource] },
        },
      };
      const migrated = migrateLegacyNavalPolicy(legacy, { mapDefinition: legacy });
      assert(migrated.navalPolicy === 'selected_routes' && migrated.allowedRoutes.length === 1, 'Legacy rota güvenli migrate edilmedi.');
      return `${migrated.navalPolicy}; ${migrated.allowedRoutes.length} normalize rota.`;
    },
  },
  {
    id: 'land-regressions',
    name: 'Claiming, ekonomi ve kara savaşı regresyonu',
    run() {
      const claim = getClaimEligibility({ phase: 'claiming', mapDefinition: baseMap, claims: {}, playerId: 'player-1', regionId: ids.inland, money: 5_000, isActive: true });
      const incomeRoom = { ...baseRoom, players: { ...baseRoom.players, 'player-1': { ...baseRoom.players['player-1'], lastIncomeTurn: 6 } } };
      const income = grantTurnIncome(incomeRoom, 'player-1');
      const landAttack = applyAttack(baseRoom, 'player-1', ids.inland, ids.oceanTarget, 2_000, 'land');
      assert(claim.legal, claim.reason || 'Claiming regresyonu.');
      assert(income.due && income.granted === 6_500, 'Ekonomi geliri değişti.');
      assert(landAttack.eligibility.legal, landAttack.eligibility.reason || 'Kara saldırısı regresyonu.');
      return 'Claim yasal; gelir 6.500; kara saldırısı yasal.';
    },
  },
  {
    id: 'motion-presentation',
    name: 'Hareket tercihi gemi sunumuna uygulanır',
    async run() {
      renderMap('b', baseRoom, { localPlayerId: 'player-2' });
      const action = { type: 'naval_transfer', actorId: 'player-1', sourceId: ids.oceanSource, targetId: ids.oceanTarget, amount: 1_000, actionId: 'voyage-motion', turnNumber: 9 };
      renderMap('b', { ...baseRoom, turnNumber: 9, lastAction: action }, { localPlayerId: 'player-2' });
      await waitFor(() => document.querySelector('#map-root-b [data-action-id="voyage-motion"]'), 'Hareket tercihi sunumu başlamadı.');
      if (!reducedMotion) {
        await waitFor(() => document.querySelector('#map-root-b .aop-voyage-ship'), 'Normal harekette gemi gösterilmedi.');
      }
      const ship = document.querySelector('#map-root-b .aop-voyage-ship');
      const highlight = document.querySelector('#map-root-b .aop-voyage-highlight');
      assert(highlight, 'Kaynak/hedef vurgusu görünmedi.');
      assert(reducedMotion ? !ship : Boolean(ship), reducedMotion ? 'Reduced-motion durumunda hareketli gemi gösterildi.' : 'Normal harekette gemi gösterilmedi.');
      return reducedMotion ? 'reduced-motion: hareketsiz kaynak/hedef vurgusu' : 'no-preference: hareketli gemi ve vurgu';
    },
  },
];

function renderRuntime() {
  const entries = [
    `viewport ${window.innerWidth}×${window.innerHeight}`,
    `touch ${navigator.maxTouchPoints}`,
    `reduced-motion ${reducedMotion}`,
    'firebase imports 0',
  ];
  runtime.replaceChildren(...entries.map((value) => {
    const node = document.createElement('span');
    node.textContent = value;
    return node;
  }));
  output.dataset.viewportWidth = String(window.innerWidth);
  output.dataset.viewportHeight = String(window.innerHeight);
  output.dataset.touchPoints = String(navigator.maxTouchPoints);
  output.dataset.reducedMotion = String(reducedMotion);
  output.dataset.firebaseRequests = '0';
  output.dataset.networkWrites = '0';
}

async function executeScenario(scenario, index) {
  const item = document.createElement('li');
  item.dataset.scenarioId = scenario.id;
  item.dataset.status = 'running';
  const number = document.createElement('b');
  number.textContent = String(index + 1).padStart(2, '0');
  const title = document.createElement('strong');
  title.textContent = scenario.name;
  const duration = document.createElement('time');
  const detail = document.createElement('small');
  detail.textContent = 'Çalışıyor…';
  item.append(number, title, duration, detail);
  resultList.appendChild(item);
  const started = performance.now();
  try {
    const message = await scenario.run();
    const elapsed = Math.round(performance.now() - started);
    item.dataset.status = 'pass';
    item.dataset.durationMs = String(elapsed);
    duration.textContent = `${elapsed} ms`;
    detail.textContent = message || 'Başarılı';
    return { id: scenario.id, status: 'pass', durationMs: elapsed, detail: detail.textContent };
  } catch (error) {
    const elapsed = Math.round(performance.now() - started);
    item.dataset.status = 'fail';
    item.dataset.durationMs = String(elapsed);
    duration.textContent = `${elapsed} ms`;
    detail.textContent = error?.message || String(error);
    return { id: scenario.id, status: 'fail', durationMs: elapsed, error: detail.textContent };
  }
}

async function run() {
  renderRuntime();
  const selectedScenarios = mode === 'mobile-frame'
    ? scenarios.filter((scenario) => scenario.id === 'mobile-target-reason')
    : scenarios;
  const report = [];
  for (let index = 0; index < selectedScenarios.length; index += 1) {
    report.push(await executeScenario(selectedScenarios[index], index));
  }
  const failures = report.filter((entry) => entry.status === 'fail');
  output.dataset.status = failures.length ? 'fail' : 'pass';
  output.dataset.passed = String(report.length - failures.length);
  output.dataset.failed = String(failures.length);
  output.dataset.total = String(report.length);
  output.textContent = failures.length
    ? `FAIL ${failures.length}/${report.length}: ${failures.map((entry) => entry.id).join(', ')}`
    : `PASS ${report.length}/${report.length}`;
  window.__AOP_SMOKE_REPORT__ = report;
}

run().catch((error) => {
  output.dataset.status = 'fail';
  output.dataset.failed = '1';
  output.textContent = `FAIL: ${error?.message || error}`;
});
