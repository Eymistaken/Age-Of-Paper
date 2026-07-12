import { useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { auth, db } from './config/firebase';
import { HEARTBEAT_INTERVAL } from './constants';
import { GameRoom } from './components/GameRoom';
import { LoginScreen } from './components/LoginScreen';
import { JoinRequestWaiting } from './components/JoinRequestWaiting';
import { WaitingRoom } from './components/WaitingRoom';
import { MapImportConflictDialog } from './components/MapImportConflictDialog';
import { TerrainMapEditor } from './components/TerrainMapEditor';
import { MapMetadataConflictError, prepareSvgMap, rebuildPreparedMap, validatePreparedMapRecord } from './game/mapImporter';
import { EDITOR_SCHEMA_VERSION, METADATA_SCHEMA_VERSION, deriveTerrainDocument } from './game/terrainModel';
import { readSvgFile } from './game/svgUpload';
import { PHASES, resolvePhase } from './game/phases';
import { normalizeNavalRegions } from './game/navalRoutes';
import {
  createRoom as createRoomTransaction,
  cancelJoinRequest,
  expireJoinRequest,
  joinRoom as joinRoomTransaction,
  leaveRoom as leaveRoomTransaction,
  setRoomMap,
  startGame as startGameTransaction,
  updatePresence,
} from './services/roomService';
import { archiveResolvedRoomMap, resolveRoomMapAssets } from './services/mapAssetService';
import { openMapRepository } from './services/mapRepository';

let mapRepositoryPromise;
function localMapRepository() {
  if (!mapRepositoryPromise) mapRepositoryPromise = openMapRepository();
  return mapRepositoryPromise;
}

function normalizeLegacyRoom(room) {
  const phase = resolvePhase(room);
  const claims = room.claims || Object.fromEntries(
    Object.entries(room.gameData || {})
      .filter(([, value]) => value?.owner)
      .map(([regionId, value]) => [regionId, { ownerId: value.owner }]),
  );
  const mapDefinition = room.mapDefinition ? normalizeNavalRegions(room.mapDefinition) : null;
  const players = Object.fromEntries(Object.entries(room.players || {}).map(([id, player]) => [id, {
    ...player,
    eliminated: player.eliminated === true,
  }]));
  const safeClaims = Object.fromEntries(Object.entries(claims).map(([id, claim]) => [id, {
    ...claim,
    ...([PHASES.MOBILIZATION, PHASES.WAR, PHASES.FINISHED].includes(phase) ? {
      soldiers: Number.isSafeInteger(claim.soldiers) && claim.soldiers >= 0 ? claim.soldiers : 0,
      hasPort: claim.hasPort === true,
      ships: Number.isSafeInteger(claim.ships) && claim.ships >= 0 ? claim.ships : 0,
    } : {}),
  }]));
  return {
    ...room,
    phase,
    players,
    claims: safeClaims,
    mapDefinition,
    joinRequests: room.joinRequests || {},
    mobilizationPending: room.mobilizationPending || [],
    mobilizationTurnsRemaining: room.mobilizationTurnsRemaining || 0,
    winnerId: room.winnerId || null,
  };
}

function storedPendingRequest() {
  try {
    const value = JSON.parse(localStorage.getItem('aop_pending_request') || 'null');
    return value?.roomCode && value?.nickname ? value : null;
  } catch {
    localStorage.removeItem('aop_pending_request');
    return null;
  }
}

function App() {
  const [user, setUser] = useState(null);
  const [roomCode, setRoomCode] = useState(localStorage.getItem('aop_room') || '');
  const [roomData, setRoomData] = useState(null);
  const [nickname, setNickname] = useState(localStorage.getItem('aop_nickname') || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pendingRequest, setPendingRequest] = useState(storedPendingRequest);
  const [pendingRoomData, setPendingRoomData] = useState(null);
  const [mapRepository, setMapRepository] = useState(null);
  const [editorRecord, setEditorRecord] = useState(null);
  const [importConflict, setImportConflict] = useState(null);
  const [analysisProgress, setAnalysisProgress] = useState(null);
  const [recentMapsRevision, setRecentMapsRevision] = useState(0);
  const [roomAssetState, setRoomAssetState] = useState({ key: '', status: 'idle', svg: '', navigation: null, error: '' });
  const [roomAssetRetry, setRoomAssetRetry] = useState(0);
  const analysisAbortRef = useRef(null);
  const latestRoomDataRef = useRef(roomData);
  latestRoomDataRef.current = roomData;
  const roomManifestKey = roomData?.mapManifest
    ? `${roomData.mapManifest.baseSvgHash}:${roomData.mapManifest.metadataHash}:${roomData.mapManifest.revision}`
    : '';
  const legacyRoomSvg = roomData?.mapManifest ? '' : (roomData?.mapSvg || '');

  useEffect(() => {
    let active = true;
    localMapRepository().then((repository) => { if (active) setMapRepository(repository); })
      .catch((repositoryError) => setError(`Yerel harita arşivi açılamadı: ${repositoryError.message}`));
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      if (nextUser) setUser(nextUser);
      else signInAnonymously(auth).catch((authError) => setError(`Giriş hatası: ${authError.message}`));
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!user || !roomCode) return undefined;
    const unsubscribe = onSnapshot(doc(db, 'rooms', roomCode), (snapshot) => {
      if (!snapshot.exists() || !snapshot.data().players?.[user.uid]) {
        localStorage.removeItem('aop_room');
        setRoomCode('');
        setRoomData(null);
        setError(snapshot.exists() ? 'Bu odada artık yer almıyorsun.' : 'Oda artık mevcut değil.');
      } else {
        setRoomData(snapshot.data());
        localStorage.setItem('aop_room', roomCode);
      }
      setLoading(false);
    }, (snapshotError) => {
      console.error(snapshotError);
      setLoading(false);
      setError('Oda bağlantısı kurulamadı.');
    });
    return unsubscribe;
  }, [roomCode, user]);

  useEffect(() => {
    if (!user || roomCode || !pendingRequest?.roomCode) return undefined;
    const code = pendingRequest.roomCode;
    return onSnapshot(doc(db, 'rooms', code), (snapshot) => {
      if (!snapshot.exists()) {
        localStorage.removeItem('aop_pending_request');
        setPendingRequest(null);
        setPendingRoomData(null);
        setError('Oda artık mevcut değil.');
        setLoading(false);
        return;
      }
      const room = normalizeLegacyRoom(snapshot.data());
      const request = room.joinRequests?.[user.uid];
      if (room.players?.[user.uid]) {
        localStorage.removeItem('aop_pending_request');
        localStorage.setItem('aop_nickname', pendingRequest.nickname);
        localStorage.setItem('aop_room', code);
        setPendingRequest(null);
        setPendingRoomData(null);
        setRoomData(room);
        setRoomCode(code);
      } else if (!request) {
        localStorage.removeItem('aop_pending_request');
        setPendingRequest(null);
        setPendingRoomData(null);
        setError('Katılma isteği artık mevcut değil.');
      } else if (request.status === 'pending' && room.phase !== PHASES.CLAIMING) {
        cancelJoinRequest(code, user.uid).catch(() => {});
        localStorage.removeItem('aop_pending_request');
        setPendingRequest(null);
        setPendingRoomData(null);
        setError('Toprak edinme evresi tamamlandığı için istek kapatıldı.');
      } else if (request.status !== 'pending') {
        const messages = {
          rejected: 'Katılma isteğin kurucu tarafından reddedildi.',
          cancelled: 'Katılma isteğin iptal edildi.',
          expired: 'Katılma isteğinin süresi doldu.',
        };
        localStorage.removeItem('aop_pending_request');
        setPendingRequest(null);
        setPendingRoomData(null);
        setError(messages[request.status] || 'Katılma isteği kapandı.');
      } else {
        setPendingRoomData(room);
      }
      setLoading(false);
    }, () => {
      setLoading(false);
      setError('Katılma isteği bağlantısı kurulamadı.');
    });
  }, [pendingRequest, roomCode, user]);

  const isInRoom = Boolean(user && roomCode && roomData);
  useEffect(() => {
    if (!isInRoom) return undefined;
    const heartbeat = () => {
      if (document.visibilityState === 'visible') {
        updatePresence(roomCode, user.uid).catch((presenceError) => console.warn('Presence güncellenemedi:', presenceError));
      }
    };
    heartbeat();
    const interval = window.setInterval(heartbeat, HEARTBEAT_INTERVAL);
    document.addEventListener('visibilitychange', heartbeat);
    window.addEventListener('focus', heartbeat);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', heartbeat);
      window.removeEventListener('focus', heartbeat);
    };
  }, [isInRoom, roomCode, user]);

  useEffect(() => {
    const currentRoom = latestRoomDataRef.current;
    if (!currentRoom || !roomCode || !mapRepository) return undefined;
    const manifest = currentRoom.mapManifest;
    if (!manifest) {
      setRoomAssetState({ key: 'legacy', status: 'ready', svg: currentRoom.mapSvg || '', navigation: null, error: '' });
      return undefined;
    }
    const key = `${manifest.baseSvgHash}:${manifest.metadataHash}:${manifest.revision}`;
    let cancelled = false;
    setRoomAssetState((current) => current.key === key && current.status === 'ready'
      ? current
      : { key, status: 'loading', svg: '', navigation: null, error: '' });
    const fetchAsset = async (kind, hash) => {
      const reference = doc(db, 'rooms', roomCode, 'mapAssets', `${kind}_${hash}`);
      const snapshot = await getDoc(reference);
      if (!snapshot.exists()) throw new Error(`${kind === 'base' ? 'Temel SVG' : 'Metadata'} asset bulunamadı.`);
      return snapshot.data();
    };
    resolveRoomMapAssets({ manifest, repository: mapRepository, fetchAsset }).then(async (resolved) => {
      if (cancelled) return;
      const existing = await mapRepository.getPreparedMap(manifest.mapId);
      if (existing?.metadataHash === manifest.metadataHash && existing.terrainDocument) {
        await mapRepository.savePreparedMap({ ...existing, sanitizedSvg: resolved.svg, sourceLabel: `Oda ${roomCode}`, updatedAt: Date.now() });
      } else {
        await archiveResolvedRoomMap(mapRepository, resolved, currentRoom.mapDefinition, currentRoom.mapValidation, roomCode);
      }
      if (!cancelled) {
        setRoomAssetState({
          key,
          status: 'ready',
          svg: resolved.svg,
          navigation: resolved.metadataAsset.metadata.navigationMask || null,
          error: '',
        });
        setRecentMapsRevision((value) => value + 1);
      }
    }).catch((assetError) => {
      if (!cancelled) setRoomAssetState({ key, status: 'error', svg: '', navigation: null, error: assetError.message });
    });
    return () => { cancelled = true; };
  }, [legacyRoomSvg, mapRepository, roomAssetRetry, roomCode, roomManifestKey]);

  const effectiveRoom = useMemo(() => {
    if (!roomData) return null;
    const normalized = normalizeLegacyRoom(roomData);
    if (!normalized.mapManifest) return normalized;
    const key = `${normalized.mapManifest.baseSvgHash}:${normalized.mapManifest.metadataHash}:${normalized.mapManifest.revision}`;
    return {
      ...normalized,
      mapSvg: roomAssetState.key === key && roomAssetState.status === 'ready' ? roomAssetState.svg : '',
      mapNavigation: roomAssetState.key === key && roomAssetState.status === 'ready' ? roomAssetState.navigation : null,
    };
  }, [roomAssetState, roomData]);

  const resetApp = async () => {
    try {
      if (roomCode && user) await leaveRoomTransaction(roomCode, user.uid);
      else if (pendingRequest && user) await cancelJoinRequest(pendingRequest.roomCode, user.uid);
    } catch (resetError) {
      console.warn('Sıfırlama sırasında oda kaydı temizlenemedi:', resetError);
    } finally {
      localStorage.removeItem('aop_room');
      localStorage.removeItem('aop_nickname');
      localStorage.removeItem('aop_pending_request');
      window.location.reload();
    }
  };

  const createRoom = async () => {
    if (!user) return;
    setLoading(true);
    setError('');
    try {
      const code = await createRoomTransaction(user.uid, nickname);
      localStorage.setItem('aop_nickname', nickname.trim());
      setRoomCode(code);
    } catch (createError) {
      setError(createError.message);
      setLoading(false);
    }
  };

  const joinRoom = async (code) => {
    if (!user) return;
    setLoading(true);
    setError('');
    try {
      const result = await joinRoomTransaction(code, user.uid, nickname);
      localStorage.setItem('aop_nickname', nickname.trim());
      if (result.mode === 'requested') {
        const pending = { roomCode: result.code, nickname: nickname.trim() };
        localStorage.setItem('aop_pending_request', JSON.stringify(pending));
        setPendingRequest(pending);
        setPendingRoomData({ joinRequests: { [user.uid]: result.request } });
        setLoading(false);
      } else {
        setRoomCode(result.code);
      }
    } catch (joinError) {
      setError(joinError.message);
      setLoading(false);
    }
  };

  const cancelPending = async () => {
    if (!user || !pendingRequest) return;
    setLoading(true);
    let cancelled = false;
    try {
      cancelled = await cancelJoinRequest(pendingRequest.roomCode, user.uid);
    } catch (cancelError) {
      if (cancelError?.code !== 'REQUEST_NOT_PENDING') {
        setError(cancelError.message);
      } else {
        setLoading(false);
        return;
      }
    } finally {
      if (cancelled) {
        localStorage.removeItem('aop_pending_request');
        setPendingRequest(null);
        setPendingRoomData(null);
        setLoading(false);
      } else setLoading(false);
    }
  };

  const expirePending = async () => {
    if (!user || !pendingRequest) return;
    try {
      await expireJoinRequest(pendingRequest.roomCode, user.uid, user.uid);
    } catch (expireError) {
      if (!['REQUEST_ACTIVE', 'REQUEST_NOT_PENDING'].includes(expireError?.code)) setError(expireError.message);
    }
  };

  const leaveRoom = async () => {
    try {
      if (roomCode && user) await leaveRoomTransaction(roomCode, user.uid);
    } catch (leaveError) {
      console.warn('Odadan ayrılma tamamlanamadı:', leaveError);
      setError(leaveError.message);
    } finally {
      setRoomCode('');
      setRoomData(null);
      localStorage.removeItem('aop_room');
    }
  };

  const handleMapFile = async (file, directError = '') => {
    if (directError) {
      setError(directError);
      return;
    }
    if (!file || !user) return;
    setLoading(true);
    setError('');
    try {
      const repository = mapRepository || await localMapRepository();
      if (!mapRepository) setMapRepository(repository);
      const svgText = await readSvgFile(file);
      analysisAbortRef.current?.abort();
      const controller = new AbortController();
      analysisAbortRef.current = controller;
      const displayName = file.name.replace(/\.svg$/i, '').replace(/_ageofpaper$/i, '').replace(/[_-]+/g, ' ');
      const preparedMap = await prepareSvgMap(svgText, {
        displayName,
        signal: controller.signal,
        onProgress: setAnalysisProgress,
      });
      const existing = await repository.getPreparedMap(preparedMap.mapId);
      if (existing && preparedMap.metadataStatus === 'validated') {
        setImportConflict({ type: 'same_map', preparedMap, existing });
      } else {
        await repository.savePreparedMap(preparedMap);
        setEditorRecord(preparedMap);
        setRecentMapsRevision((value) => value + 1);
      }
    } catch (mapError) {
      if (mapError?.name === 'AbortError') {
        setError('Harita analizi iptal edildi; mevcut yerel taslaklar korunuyor.');
      } else if (mapError instanceof MapMetadataConflictError && mapError.code === 'SOURCE_GEOMETRY_MISMATCH') {
        setImportConflict({ type: 'geometry_mismatch', svgText: await file.text(), displayName: file.name.replace(/\.svg$/i, ''), error: mapError });
      } else setError(`Harita yüklenemedi: ${mapError.message}`);
    } finally {
      analysisAbortRef.current = null;
      setAnalysisProgress(null);
      setLoading(false);
    }
  };

  const handleMapUpload = async (event) => {
    const file = event.target.files?.[0];
    await handleMapFile(file);
    event.target.value = '';
  };

  const startGame = async () => {
    if (!user) return;
    setLoading(true);
    setError('');
    try {
      await startGameTransaction(roomCode, user.uid);
    } catch (startError) {
      setError(startError.message);
      setLoading(false);
    }
  };

  const openPreparedMap = async (record) => {
    setLoading(true);
    setError('');
    try {
      validatePreparedMapRecord(record, { allowOutdatedAnalysis: true });
      let opened = record;
      if (record.terrainDocument && (
        record.terrainDocument.editorSchemaVersion !== EDITOR_SCHEMA_VERSION
        || record.terrainDocument.metadataSchemaVersion !== METADATA_SCHEMA_VERSION
        || !record.terrainDocument.navalPolicy
      )) {
        opened = await rebuildPreparedMap(record, deriveTerrainDocument(record.terrainDocument));
        opened = await mapRepository.savePreparedMap(opened);
        setRecentMapsRevision((value) => value + 1);
      }
      setEditorRecord(opened);
    } catch (openError) {
      setError(`Yerel harita doğrulanamadı: ${openError.message}`);
    } finally {
      setLoading(false);
    }
  };

  const openRoomPreparedMap = async () => {
    const mapId = effectiveRoom?.mapManifest?.mapId;
    if (!mapRepository) return;
    setLoading(true);
    setError('');
    try {
      let local = mapId ? await mapRepository.getPreparedMap(mapId) : null;
      if (!local?.terrainDocument) {
        if (!effectiveRoom.mapSvg) throw new Error('Doğrulanmış oda SVG asset’i henüz hazır değil.');
        local = await prepareSvgMap(local?.preparedSvg || effectiveRoom.mapSvg, { sourceLabel: `Oda ${roomCode}` });
        await mapRepository.savePreparedMap(local);
      }
      if (local.terrainDocument && (
        local.terrainDocument.editorSchemaVersion !== EDITOR_SCHEMA_VERSION
        || local.terrainDocument.metadataSchemaVersion !== METADATA_SCHEMA_VERSION
        || !local.terrainDocument.navalPolicy
      )) {
        local = await rebuildPreparedMap(local, deriveTerrainDocument(local.terrainDocument));
        await mapRepository.savePreparedMap(local);
      }
      setEditorRecord(local);
    } catch (openError) {
      setError(`Oda haritası editörde açılamadı: ${openError.message}`);
    } finally {
      setLoading(false);
    }
  };

  const applyPreparedMap = async (record, closeEditor = true) => {
    if (!user) return null;
    setLoading(true);
    setError('');
    try {
      await setRoomMap(roomCode, user.uid, record);
      const saved = await mapRepository.savePreparedMap({ ...record, appliedToRoom: true, sourceLabel: `Oda ${roomCode}`, updatedAt: Date.now() });
      setRecentMapsRevision((value) => value + 1);
      if (closeEditor) setEditorRecord(null);
      return saved;
    } catch (applyError) {
      setError(applyError.message);
      throw applyError;
    } finally {
      setLoading(false);
    }
  };

  const importAsCopy = async (preparedMap) => {
    const mapId = `map_${globalThis.crypto?.randomUUID?.().replaceAll('-', '_') || Date.now()}`;
    const copied = await rebuildPreparedMap({ ...preparedMap, mapId, revision: 1 }, deriveTerrainDocument({
      ...preparedMap.terrainDocument, mapId, revision: 1,
    }));
    await mapRepository.savePreparedMap(copied);
    setEditorRecord(copied);
    setRecentMapsRevision((value) => value + 1);
  };

  const resolveImportConflict = async (choice) => {
    const conflict = importConflict;
    setImportConflict(null);
    if (!conflict || choice === 'cancel') return;
    setLoading(true);
    setError('');
    try {
      if (conflict.type === 'same_map') {
        if (choice === 'copy') await importAsCopy(conflict.preparedMap);
        else {
          await mapRepository.savePreparedMap(conflict.preparedMap);
          setEditorRecord(conflict.preparedMap);
          setRecentMapsRevision((value) => value + 1);
        }
      } else {
        const oldMetadata = conflict.error.details.metadata;
        let analyzed = await prepareSvgMap(conflict.svgText, {
          displayName: conflict.displayName,
          mapId: choice === 'copy' ? undefined : oldMetadata.mapId,
          metadataMismatch: 'reanalyze',
          onProgress: setAnalysisProgress,
        });
        if (choice === 'remap') {
          const oldById = Object.fromEntries(oldMetadata.surfaces.map((surface) => [surface.id, surface]));
          const remapped = deriveTerrainDocument({
            ...analyzed.terrainDocument,
            revision: oldMetadata.revision + 1,
            navalPolicy: oldMetadata.navalPolicy,
            allowedRoutes: oldMetadata.allowedRoutes,
            blockedRoutes: oldMetadata.blockedRoutes,
            surfaces: analyzed.terrainDocument.surfaces.map((surface) => oldById[surface.id]
              ? {
                ...surface,
                metadataTerrainType: oldById[surface.id].metadataTerrainType,
                hostOverride: oldById[surface.id].hostOverride,
                portPreference: oldById[surface.id].portPreference,
              }
              : surface),
          });
          analyzed = await rebuildPreparedMap(analyzed, remapped);
        }
        if (choice === 'copy') await importAsCopy(analyzed);
        else {
          await mapRepository.savePreparedMap(analyzed);
          setEditorRecord(analyzed);
          setRecentMapsRevision((value) => value + 1);
        }
      }
    } catch (conflictError) {
      setError(`Harita içe aktarılamadı: ${conflictError.message}`);
    } finally {
      setAnalysisProgress(null);
      setLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="h-screen flex flex-col items-center justify-center text-[var(--aop-gold)] aop-desk">
        <div className="aop-title text-3xl mb-2">Age of Paper</div>
        <div className="mb-4 text-[var(--aop-muted)]">Harita masasına bağlanıyor...</div>
        <button onClick={resetApp} className="aop-button-secondary min-h-11 px-3 py-2">Sıfırla</button>
      </div>
    );
  }

  if (!effectiveRoom) {
    if (pendingRequest) {
      return (
        <JoinRequestWaiting
          roomCode={pendingRequest.roomCode}
          nickname={pendingRequest.nickname}
          request={pendingRoomData?.joinRequests?.[user.uid]}
          loading={loading}
          onCancel={cancelPending}
          onExpire={expirePending}
        />
      );
    }
    return (
      <LoginScreen
        nickname={nickname}
        setNickname={setNickname}
        createRoom={createRoom}
        joinRoom={joinRoom}
        loading={loading}
        error={error}
        resetApp={resetApp}
      />
    );
  }

  if (effectiveRoom.phase === PHASES.LOBBY) {
    return (<>
      <WaitingRoom
        roomCode={roomCode}
        players={Object.values(effectiveRoom.players || {})}
        roomData={effectiveRoom}
        isHost={effectiveRoom.hostId === user.uid}
        handleMapUpload={handleMapUpload}
        handleMapFile={handleMapFile}
        startGame={startGame}
        leaveRoom={leaveRoom}
        resetApp={resetApp}
        loading={loading}
        error={error}
        mapRepository={mapRepository}
        onEditPreparedMap={openPreparedMap}
        onUsePreparedMap={(record) => applyPreparedMap(record, false)}
        onEditRoomMap={openRoomPreparedMap}
        recentMapsRevision={recentMapsRevision}
        analysisProgress={analysisProgress}
        cancelMapAnalysis={() => analysisAbortRef.current?.abort()}
        roomAssetState={roomAssetState}
      />
      {editorRecord && mapRepository && <TerrainMapEditor initialRecord={editorRecord} repository={mapRepository} onApply={(record) => applyPreparedMap(record, false)} onClose={() => setEditorRecord(null)} onDraftChange={() => setRecentMapsRevision((value) => value + 1)} readOnly={effectiveRoom.hostId !== user.uid} />}
      {importConflict && <MapImportConflictDialog conflict={importConflict} onChoice={resolveImportConflict} />}
    </>);
  }

  if (effectiveRoom.mapManifest && !effectiveRoom.mapSvg) {
    return <div className="aop-request-waiting aop-desk"><section className="aop-panel aop-request-waiting-card"><div className="aop-label">Harita Asset’i</div><h1 className="aop-title">{roomAssetState.status === 'error' ? 'Harita doğrulanamadı' : 'Harita hazırlanıyor'}</h1><p>{roomAssetState.status === 'error' ? roomAssetState.error : 'Yerel hash cache kontrol ediliyor; yalnız eksik asset indirilecek.'}</p>{roomAssetState.status === 'error' && <button className="aop-button-secondary" onClick={() => setRoomAssetRetry((value) => value + 1)}>Tekrar Dene</button>}</section></div>;
  }

  return (
    <GameRoom
      user={user}
      roomCode={roomCode}
      roomData={effectiveRoom}
      leaveRoom={leaveRoom}
      resetApp={resetApp}
    />
  );
}

export default App;
