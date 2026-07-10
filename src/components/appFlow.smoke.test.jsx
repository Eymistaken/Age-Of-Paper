import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PHASES } from '../game/phases';
import { ClaimCompletePanel } from './ClaimCompletePanel';
import { GameRoom } from './GameRoom';
import { LoginScreen } from './LoginScreen';
import { WaitingRoom } from './WaitingRoom';

const serviceMocks = vi.hoisted(() => ({
  acceptJoinRequest: vi.fn().mockResolvedValue(true),
  clearClosedJoinRequest: vi.fn().mockResolvedValue(false),
  claimRegion: vi.fn().mockResolvedValue('claiming'),
  endTurn: vi.fn().mockResolvedValue(true),
  ensureTurnIncome: vi.fn().mockResolvedValue(false),
  expireJoinRequest: vi.fn().mockResolvedValue(false),
  rejectJoinRequest: vi.fn().mockResolvedValue(true),
  sendChatMessage: vi.fn().mockResolvedValue(true),
  skipOfflineTurn: vi.fn().mockResolvedValue(true),
  voteJoinRequest: vi.fn().mockResolvedValue(false),
}));

vi.mock('../services/roomService', () => serviceMocks);

const region = {
  id: 'paper_valley',
  name: 'Kâğıt Vadisi',
  price: 4000,
  income: 500,
  landNeighbors: [],
  claimNeighbors: [],
  coastal: false,
};
const mapDefinition = {
  version: 1,
  regionIds: [region.id],
  regions: [region],
  regionsById: { [region.id]: region },
};
const player = {
  id: 'p1', name: 'Ada', color: '#2F6FA3', money: 5000, income: 5000,
  regionIds: [], lastIncomeTurn: 1, lastActive: Date.now(),
};
const claimingRoom = {
  phase: PHASES.CLAIMING,
  hostId: 'p1',
  players: { p1: player },
  mapDefinition,
  mapSvg: '<svg viewBox="0 0 10 10"><rect id="paper_valley" data-region="true" data-region-id="paper_valley" width="10" height="10"/></svg>',
  claims: {},
  turnOrder: ['p1'],
  turnIndex: 0,
  turnNumber: 1,
  roundNumber: 1,
  chat: [],
  joinRequests: {},
};

let container;
let root;

async function render(element) {
  await act(async () => {
    root.render(element);
  });
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  serviceMocks.claimRegion.mockClear();
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe('local application flow smoke', () => {
  it('renders application entry and lobby validation state', async () => {
    await render(<LoginScreen nickname="" setNickname={() => {}} createRoom={() => {}} joinRoom={() => {}} loading={false} error="" resetApp={() => {}}/>);
    expect(container.textContent).toContain('Yeni Harita Masası Kur');

    const startGame = vi.fn();
    await render(<WaitingRoom
      roomCode="ABCD"
      players={[player]}
      roomData={{
        hostId: 'p1',
        mapSvg: claimingRoom.mapSvg,
        mapValidation: {
          valid: true,
          regionCount: 1,
          errors: [],
          warnings: [],
          pricingSummary: { minPrice: 5_000, medianPrice: 10_000, maxPrice: 20_000, minIncome: 500, maxIncome: 2_000 },
        },
      }}
      isHost
      handleMapUpload={() => {}}
      handleMapFile={() => {}}
      startGame={startGame}
      leaveRoom={() => {}}
      resetApp={() => {}}
      loading={false}
      error=""
    />);
    expect(container.textContent).toContain('1 oynanabilir bölge');
    expect(container.textContent).toContain('Fiyat Aralığı');
    expect(container.textContent).toContain('5.000–20.000');
    const startButton = [...container.querySelectorAll('button')].find((button) => button.textContent.includes('Toprak Edinmeyi Başlat'));
    await act(async () => startButton.click());
    expect(startGame).toHaveBeenCalledOnce();
  });

  it('routes drag-and-drop through the same SVG file handler and prevents navigation', async () => {
    const handleMapFile = vi.fn();
    await render(<WaitingRoom
      roomCode="ABCD"
      players={[player]}
      roomData={{ hostId: 'p1', mapSvg: '', mapValidation: { valid: false, regionCount: 0, errors: [], warnings: [] } }}
      isHost
      handleMapUpload={() => {}}
      handleMapFile={handleMapFile}
      startGame={() => {}}
      leaveRoom={() => {}}
      resetApp={() => {}}
      loading={false}
      error=""
    />);
    const dropzone = container.querySelector('.aop-map-dropzone');
    const svgFile = new File(['<svg/>'], 'map.svg', { type: 'image/svg+xml' });
    const dragEnter = new Event('dragenter', { bubbles: true, cancelable: true });
    Object.defineProperty(dragEnter, 'dataTransfer', { value: { files: [svgFile] } });
    await act(async () => dropzone.dispatchEvent(dragEnter));
    expect(dragEnter.defaultPrevented).toBe(true);
    expect(dropzone.classList.contains('is-dragging')).toBe(true);
    const drop = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(drop, 'dataTransfer', { value: { files: [svgFile] } });
    await act(async () => dropzone.dispatchEvent(drop));
    expect(drop.defaultPrevented).toBe(true);
    expect(handleMapFile).toHaveBeenCalledWith(svgFile);
  });

  it('renders claiming, selects a region, and submits the purchase transaction', async () => {
    await render(<GameRoom user={{ uid: 'p1' }} roomCode="ABCD" roomData={claimingRoom} leaveRoom={() => {}} resetApp={() => {}}/>);
    const mapRegion = container.querySelector('[data-region-id="paper_valley"]');
    await act(async () => mapRegion.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(container.textContent).toContain('Kâğıt Vadisi');
    expect(container.textContent).toContain('Bu tarafsız bölge satın alınabilir.');
    const buyButton = [...container.querySelectorAll('button')].find((button) => button.textContent.includes('Satın Al'));
    await act(async () => buyButton.click());
    expect(serviceMocks.claimRegion).toHaveBeenCalledWith('ABCD', 'p1', 'paper_valley');
  });

  it('centers accessible chat send controls and shows host join-request actions', async () => {
    const requestRoom = {
      ...claimingRoom,
      joinRequests: {
        newcomer: {
          uid: 'newcomer', name: 'Bora', status: 'pending', requiredVoterIds: [],
          approvals: {}, rejections: {}, createdAt: Date.now(), expiresAt: Date.now() + 600_000,
        },
      },
    };
    await render(<GameRoom user={{ uid: 'p1' }} roomCode="ABCD" roomData={requestRoom} leaveRoom={() => {}} resetApp={() => {}}/>);
    const sendButton = container.querySelector('.aop-chat-send');
    expect(sendButton?.getAttribute('aria-label')).toBe('Mesaj gönder');
    expect(sendButton?.querySelector('svg')).not.toBeNull();
    const acceptButton = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Kabul Et');
    expect(acceptButton).toBeTruthy();
    await act(async () => acceptButton.click());
    expect(serviceMocks.acceptJoinRequest).toHaveBeenCalledWith('ABCD', 'p1', 'newcomer');

    await render(<GameRoom
      user={{ uid: 'p1' }}
      roomCode="ABCD"
      roomData={{
        ...requestRoom,
        joinRequests: {
          newcomer: { ...requestRoom.joinRequests.newcomer, status: 'cancelled' },
        },
      }}
      leaveRoom={() => {}}
      resetApp={() => {}}
    />);
    expect(container.textContent).not.toContain('Oyuna katılmak istiyor');
  });

  it('highlights exactly the legal claims stored in mapDefinition', async () => {
    const regions = [
      { id: 'owned', name: 'Owned', price: 5000, income: 500, claimNeighbors: ['legal'] },
      { id: 'legal', name: 'Legal', price: 5000, income: 500, claimNeighbors: ['owned'] },
      { id: 'far', name: 'Far', price: 5000, income: 500, claimNeighbors: [] },
    ];
    const room = {
      ...claimingRoom,
      mapDefinition: {
        version: 1,
        regionIds: regions.map(({ id }) => id),
        regions,
        regionsById: Object.fromEntries(regions.map((item) => [item.id, item])),
      },
      mapSvg: '<svg viewBox="0 0 30 10"><rect id="owned" data-region-id="owned" data-region="true" width="10" height="10"/><rect id="legal" data-region-id="legal" data-region="true" x="10" width="10" height="10"/><rect id="far" data-region-id="far" data-region="true" x="20" width="10" height="10"/></svg>',
      claims: { owned: { ownerId: 'p1' } },
      players: { p1: { ...player, money: 10_000, regionIds: ['owned'] } },
    };
    await render(<GameRoom user={{ uid: 'p1' }} roomCode="ABCD" roomData={room} leaveRoom={() => {}} resetApp={() => {}}/>);
    expect([...container.querySelectorAll('.legal-land')].map((element) => element.id)).toEqual(['legal']);
  });

  it('uses the bottom-sheet game layout at a 768px tablet viewport', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 768 });
    window.matchMedia = vi.fn().mockImplementation((query) => ({
      matches: query === '(max-width: 1023px)',
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    await render(<GameRoom user={{ uid: 'p1' }} roomCode="ABCD" roomData={claimingRoom} leaveRoom={() => {}} resetApp={() => {}}/>);
    expect(container.querySelector('.aop-mobile-game')).not.toBeNull();
    expect(container.textContent).toContain('Hazine');
    expect(container.textContent).toContain('Gelir');
    expect(container.textContent).toContain('Round');
  });

  it('renders the frozen claim complete result ledger', async () => {
    const completed = {
      ...claimingRoom,
      phase: PHASES.CLAIM_COMPLETE,
      claims: { paper_valley: { ownerId: 'p1', claimedAtTurn: 1 } },
      players: { p1: { ...player, money: 1000, income: 5500, regionIds: ['paper_valley'] } },
    };
    await render(<ClaimCompletePanel roomData={completed} roomCode="ABCD" leaveRoom={() => {}}/>);
    expect(container.textContent).toContain('Toprak edinme evresi tamamlandı');
    expect(container.textContent).toContain('5.500');
    expect(container.textContent).toContain('ileride savaş evresi');
  });
});
