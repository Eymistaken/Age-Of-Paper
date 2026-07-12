import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { MapViewer } from '../../src/components/MapViewer';
import { WarCommandPanel } from '../../src/components/WarCommandPanel';
import { getClaimEligibility } from '../../src/game/rules';
import { grantTurnIncome } from '../../src/game/warEconomy';
import { applyAttack } from '../../src/game/warCombat';
import {
  getNavalTargetEligibility,
  getPlayerNavalCapability,
  isNavalRouteAllowed,
  migrateLegacyNavalPolicy,
  normalizeRouteList,
} from '../../src/game/navalPolicy';
import { computeNavalPresentationPath, pathStaysOnWater } from '../../src/game/waterNavigation';
import '../../src/index.css';

// Headless --dump-dom does not produce compositor frames. Keep this real-browser
// smoke deterministic by driving the same frame callbacks from browser timers.
window.requestAnimationFrame = (callback) => window.setTimeout(() => callback(performance.now()), 16);
window.cancelAnimationFrame = (id) => window.clearTimeout(id);

const output = document.getElementById('smoke-result');
const scenarios = [];
const assert = (condition, message) => { if (!condition) throw new Error(message); scenarios.push(message); };
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitFor(check, message, timeout = 3_000) {
  const started = performance.now();
  while (!check()) {
    if (performance.now() - started > timeout) throw new Error(message);
    await wait(25);
  }
}

const regions = [
  { id: 'ocean_a', name: 'Okyanus A', price: 5000, income: 500, bounds: { x: 4, y: 20, width: 18, height: 20 }, coastal: true, coastType: 'ocean', portAllowed: true, landNeighbors: ['inland'], claimNeighbors: ['inland'], seaNeighbors: [] },
  { id: 'ocean_b', name: 'Okyanus B', price: 5000, income: 500, bounds: { x: 78, y: 20, width: 18, height: 20 }, coastal: true, coastType: 'ocean', portAllowed: true, landNeighbors: ['inland'], claimNeighbors: ['inland'], seaNeighbors: [] },
  { id: 'lake_c', name: 'Büyük Göl C', price: 5000, income: 500, bounds: { x: 40, y: 4, width: 20, height: 14 }, coastal: true, coastType: 'lake', portAllowed: true, landNeighbors: ['inland'], claimNeighbors: ['inland'], seaNeighbors: [] },
  { id: 'inland', name: 'İç Kara', price: 5000, income: 500, bounds: { x: 40, y: 24, width: 20, height: 20 }, coastal: false, coastType: 'none', portAllowed: false, landNeighbors: ['ocean_a', 'ocean_b', 'lake_c'], claimNeighbors: ['ocean_a', 'ocean_b', 'lake_c'], seaNeighbors: [] },
];
const byId = Object.fromEntries(regions.map((region) => [region.id, region]));
const oceanRuns = [[0, 9], [10, 19], [20, 29], [40, 43], [46, 49], [50, 59]];
const mapNavigation = {
  version: 1, viewBox: { x: 0, y: 0, width: 100, height: 60 }, columns: 10, rows: 6,
  components: [{ id: 'ocean', runs: oceanRuns, portalCell: 0 }, { id: 'lake', runs: [[34, 35]], portalCell: 34 }],
  coasts: {
    ocean_a: [{ componentId: 'ocean', cell: 20 }],
    ocean_b: [{ componentId: 'ocean', cell: 29 }],
    lake_c: [{ componentId: 'lake', cell: 35 }],
  },
};
const baseMap = {
  version: 1, geometryVersion: 2, boundsSpace: 'viewBox', viewBox: mapNavigation.viewBox,
  regionIds: regions.map((region) => region.id), regions, regionsById: byId,
  navalPolicy: 'all_coasts', allowedRoutes: [], blockedRoutes: [],
};
const baseRoom = {
  schemaVersion: 4, phase: 'war', mapDefinition: baseMap, mapNavigation,
  players: {
    p1: { id: 'p1', name: 'Bir', color: '#9b3b32', money: 100000, income: 6000, regionIds: ['ocean_a', 'lake_c', 'inland'], lastIncomeTurn: 7, eliminated: false },
    p2: { id: 'p2', name: 'İki', color: '#375f83', money: 100000, income: 5500, regionIds: ['ocean_b'], lastIncomeTurn: 7, eliminated: false },
  },
  claims: {
    ocean_a: { ownerId: 'p1', soldiers: 4000, hasPort: true, ships: 4 },
    ocean_b: { ownerId: 'p2', soldiers: 1000, hasPort: false, ships: 0 },
    lake_c: { ownerId: 'p1', soldiers: 2000, hasPort: true, ships: 2 },
    inland: { ownerId: 'p1', soldiers: 2000, hasPort: false, ships: 0 },
  },
  turnOrder: ['p1', 'p2'], turnIndex: 0, turnNumber: 7, roundNumber: 3,
  lastAction: { type: 'claim', actorId: 'p1', regionId: 'inland', actionId: 'initial', turnNumber: 6 },
  mapSvg: `<svg viewBox="0 0 100 60" xmlns="http://www.w3.org/2000/svg">
    <rect width="100" height="60" fill="#285e72"/>
    <rect id="ocean_a" data-region="true" data-region-id="ocean_a" class="default-land" x="4" y="20" width="18" height="20"/>
    <rect id="ocean_b" data-region="true" data-region-id="ocean_b" class="default-land" x="78" y="20" width="18" height="20"/>
    <rect id="lake_c" data-region="true" data-region-id="lake_c" class="default-land" x="40" y="4" width="20" height="14"/>
    <rect id="inland" data-region="true" data-region-id="inland" class="default-land" x="40" y="24" width="20" height="20"/>
  </svg>`,
};

function renderMap(room) {
  flushSync(() => {
    mapRoot.render(<MapViewer ref={mapViewerRef} roomData={room} roomCode="SMOKE" selectedId={null} setSelectedId={() => {}} currentPlayer={room.players.p1} localPlayerId="p2" hideHud />);
  });
}

const mapRoot = createRoot(document.getElementById('map-root'));
const panelRoot = createRoot(document.getElementById('panel-root'));
const mapViewerRef = { current: null };

async function run() {
  assert(getNavalTargetEligibility(baseRoom, 'p1', 'attack', 'ocean_a', 'ocean_b', 1000).legal, '1 izinli okyanus saldırısı');
  const friendlyRoom = { ...baseRoom, claims: { ...baseRoom.claims, ocean_b: { ...baseRoom.claims.ocean_b, ownerId: 'p1' } } };
  assert(getNavalTargetEligibility(friendlyRoom, 'p1', 'move', 'ocean_a', 'ocean_b', 1000).legal, '1 izinli okyanus nakli');

  const blockedMap = { ...baseMap, blockedRoutes: [['ocean_a', 'ocean_b']] };
  assert(isNavalRouteAllowed(blockedMap, 'ocean_a', 'ocean_b').code === 'ROUTE_BLOCKED', '2 engellenmiş kıyı reddi');
  const selectedMap = { ...baseMap, navalPolicy: 'selected_routes', allowedRoutes: [['lake_c', 'ocean_a']] };
  assert(isNavalRouteAllowed(selectedMap, 'ocean_a', 'lake_c').allowed && !isNavalRouteAllowed(selectedMap, 'ocean_a', 'ocean_b').allowed, '3 seçili rota ayrımı');
  assert(!getPlayerNavalCapability({ ...baseRoom, mapDefinition: { ...baseMap, navalPolicy: 'disabled' } }, 'p1').showNavalSection, '4 disabled menü gizleme');

  const lakePath = computeNavalPresentationPath({ ...mapNavigation, coasts: { lake_one: [{ componentId: 'lake', cell: 34 }], lake_two: [{ componentId: 'lake', cell: 35 }] } }, 'lake_one', 'lake_two');
  assert(lakePath.kind === 'water_path' && pathStaysOnWater({ ...mapNavigation, coasts: { lake_one: [{ componentId: 'lake', cell: 34 }], lake_two: [{ componentId: 'lake', cell: 35 }] } }, lakePath), '5 göl içi su yolu');
  const remotePath = computeNavalPresentationPath(mapNavigation, 'lake_c', 'ocean_a');
  assert(remotePath.kind === 'remote_voyage' && pathStaysOnWater(mapNavigation, remotePath), '6 Büyük Göller–okyanus uzak seferi');
  assert(normalizeRouteList([['inland', 'ocean_a']], { mapDefinition: baseMap }).length === 0, '7 iç kara rota reddi');
  assert(getClaimEligibility({ phase: 'claiming', mapDefinition: baseMap, claims: {}, playerId: 'p1', regionId: 'inland', money: 5000, isActive: true }).legal, '13 claiming regresyonu');
  assert(grantTurnIncome({ ...baseRoom, players: { ...baseRoom.players, p1: { ...baseRoom.players.p1, lastIncomeTurn: 6 } } }, 'p1').granted === 6500, '13 ekonomi regresyonu');
  assert(applyAttack(baseRoom, 'p1', 'inland', 'ocean_b', 2000, 'land').eligibility.legal, '13 kara saldırısı regresyonu');
  const legacy = { ...baseMap, navalPolicy: undefined, allowedRoutes: undefined, blockedRoutes: undefined, regionsById: {
    ...byId,
    ocean_a: { ...byId.ocean_a, seaNeighbors: ['ocean_b'] }, ocean_b: { ...byId.ocean_b, seaNeighbors: ['ocean_a'] },
  } };
  assert(migrateLegacyNavalPolicy(legacy, { mapDefinition: legacy }).allowedRoutes.length === 1, '12 legacy seaNeighbors migrationı');

  panelRoot.render(<WarCommandPanel compact roomData={baseRoom} me={baseRoom.players.p1} currentPlayer={baseRoom.players.p1} isMyTurn selectedRegion={byId.ocean_a} selectedClaim={baseRoom.claims.ocean_a} selectedOwner={baseRoom.players.p1} plan={{ mode: 'idle', operation: null, routeType: 'land', sourceId: null, targetId: null, amount: 1000 }} setPlan={() => {}} beginPlan={() => {}} cancelPlan={() => {}} actionPending={false} actionError="" onRecruit={() => {}} onBuildPort={() => {}} onBuyShips={() => {}} onReady={() => {}} onExecuteOperation={() => {}} onEndTurn={() => {}} />);
  await waitFor(() => document.querySelector('.aop-war-orders'), '8 savaş paneli render edilmedi');
  assert(document.body.textContent.includes('Deniz Nakli') && document.body.textContent.includes('Deniz Saldırısı'), '8 mobil/masaüstü deniz kontrolleri');

  renderMap(baseRoom);
  await waitFor(() => document.querySelector('.aop-map-transform'), 'harita render edilmedi');
  mapViewerRef.current.setVisibleMapRect({ x: 0, y: 0, width: window.innerWidth, height: Math.max(420, window.innerHeight * 0.72) });
  const actionRoom = { ...baseRoom, lastAction: { type: 'naval_transfer', actorId: 'p1', sourceId: 'ocean_a', targetId: 'ocean_b', amount: 1000, actionId: 'voyage-1', turnNumber: 7 } };
  renderMap(actionRoom);
  await waitFor(() => document.querySelector('.aop-voyage-ship'), '9 uzak oyuncu gemi sunumunu görmedi');
  assert(Boolean(document.querySelector('.aop-voyage-ship')), '9 lastAction ortak sunumu');
  const surface = document.querySelector('.aop-map-viewer');
  surface.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -100, clientX: 300, clientY: 220 }));
  const manualTransform = document.querySelector('.aop-map-transform').style.transform;
  await waitFor(() => !document.querySelector('.aop-voyage-ship'), '9 ilk gemi animasyonu tamamlanmadı', 5_000);
  assert(document.querySelector('.aop-map-transform').style.transform === manualTransform, '10 pan/zoom kamera otomasyonunu bıraktı');
  renderMap(actionRoom);
  await wait(250);
  assert(!document.querySelector('.aop-voyage-ship'), '9 aynı lastAction ikinci kez oynamadı');
  assert(pathStaysOnWater(mapNavigation, computeNavalPresentationPath(mapNavigation, 'ocean_a', 'ocean_b')), '11 gemi yolu kara maskesini kesmedi');

  const focusBase = document.querySelector('.aop-map-transform').style.transform;
  let sawFocusVoyage = false;
  let sawFocusTarget = false;
  let sawFocusRestore = false;
  const captureFocusSequence = () => {
    sawFocusVoyage ||= Boolean(document.querySelector('[data-action-id="voyage-focus"]'));
    const transform = document.querySelector('.aop-map-transform')?.style.transform;
    if (transform && transform !== focusBase) sawFocusTarget = true;
    if (sawFocusTarget && transform === focusBase) sawFocusRestore = true;
  };
  const focusObserver = new MutationObserver(captureFocusSequence);
  focusObserver.observe(document.getElementById('map-root'), { attributes: true, childList: true, subtree: true });
  renderMap({ ...actionRoom, lastAction: { ...actionRoom.lastAction, actionId: 'voyage-focus' } });
  await waitFor(() => sawFocusVoyage, 'hedef odaklama seferi başlamadı');
  await waitFor(() => sawFocusTarget, 'animasyon sonrası hedef kamerası çalışmadı', 4_000);
  await waitFor(() => sawFocusRestore, 'hedef kamerası exact base snapshot’a dönmedi', 3_000);
  focusObserver.disconnect();
  assert(true, 'animasyon sonrası hedef odağı ve exact kamera restorasyonu');

  const nativeMatchMedia = window.matchMedia.bind(window);
  window.matchMedia = (query) => query.includes('prefers-reduced-motion')
    ? { matches: true, media: query, addEventListener() {}, removeEventListener() {} }
    : nativeMatchMedia(query);
  renderMap({ ...actionRoom, lastAction: { ...actionRoom.lastAction, actionId: 'voyage-reduced' } });
  await wait(180);
  assert(!document.querySelector('.aop-voyage-ship') && document.querySelector('.aop-voyage-highlight'), 'reduced motion yalnız vurgu gösterdi');
  window.matchMedia = nativeMatchMedia;

  if (window.innerWidth <= 500) {
    const buttons = [...document.querySelectorAll('.aop-war-orders button')];
    assert(buttons.every((button) => button.getBoundingClientRect().height >= 32), '8 dar mobil dokunma kontrolleri');
  }
  output.textContent = `PASS ${scenarios.length}`;
  output.dataset.status = 'pass';
  output.dataset.scenarios = JSON.stringify(scenarios);
}

run().catch((error) => {
  output.textContent = `FAIL: ${error.message}`;
  output.dataset.status = 'fail';
  console.error(error);
});
