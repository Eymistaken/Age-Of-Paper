package com.ageofpaper.android.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.ageofpaper.android.data.AppContainer
import com.ageofpaper.android.data.BackendMode
import com.ageofpaper.android.data.GameActionException
import com.ageofpaper.android.data.JoinOutcome
import com.ageofpaper.android.data.RoomRepository
import com.ageofpaper.android.ui.map.MapParser
import com.ageofpaper.android.ui.map.RenderableMap
import com.ageofpaper.core.Constants
import com.ageofpaper.core.model.Player
import com.ageofpaper.core.model.Region
import com.ageofpaper.core.model.Room
import com.ageofpaper.core.rules.ClaimRules
import com.ageofpaper.core.rules.NavalPolicy
import com.ageofpaper.core.rules.Phases
import com.ageofpaper.core.rules.WarConstants
import com.ageofpaper.core.rules.WarEconomy
import com.ageofpaper.core.svg.MapImporter
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch

/** Which screen the app is currently on. */
enum class Route { LOGIN, JOIN_WAITING, ROOM }

/** The three step war order from the design. */
enum class WarStep { OPERATION, TARGET, CONFIRM }

enum class WarOperation(val label: String, val naval: Boolean, val attack: Boolean) {
    LAND_TRANSFER("Kara nakli", naval = false, attack = false),
    NAVAL_TRANSFER("Deniz nakli", naval = true, attack = false),
    LAND_ATTACK("Kara saldırısı", naval = false, attack = true),
    NAVAL_ATTACK("Deniz saldırısı", naval = true, attack = true),
}

data class WarPlan(
    val step: WarStep = WarStep.OPERATION,
    val operation: WarOperation? = null,
    val sourceId: String? = null,
    val targetId: String? = null,
    val amount: Int = WarConstants.SOLDIER_BATCH,
)

data class UiState(
    val route: Route = Route.LOGIN,
    val backendMode: BackendMode = BackendMode.DEMO,
    val userId: String = "",
    val nickname: String = "",
    val roomCode: String = "",
    val room: Room? = null,
    val map: RenderableMap? = null,
    val selectedRegionId: String? = null,
    val warPlan: WarPlan = WarPlan(),
    val chatVisible: Boolean = false,
    val unreadCount: Int = 0,
    val menuVisible: Boolean = false,
    val mapPrepareVisible: Boolean = false,
    val pendingImport: MapImporter.PreparedMap? = null,
    val busy: Boolean = false,
    val error: String? = null,
    val notice: String? = null,
) {
    val me: Player? get() = room?.players?.get(userId)
    val isHost: Boolean get() = room?.hostId == userId
    val isMyTurn: Boolean get() = room?.activePlayerId == userId
    val phase: String get() = room?.phase ?: Phases.LOBBY
    val selectedRegion: Region? get() = room?.region(selectedRegionId)

    val legalClaims: List<String>
        get() = if (phase == Phases.CLAIMING) {
            ClaimRules.legalClaims(room?.mapDefinition, room?.claims.orEmpty(), userId)
        } else {
            emptyList()
        }

    val orderedPlayers: List<Player>
        get() {
            val room = room ?: return emptyList()
            val ordered = room.turnOrder.mapNotNull { room.players[it] }
            return ordered.ifEmpty { room.players.values.sortedBy { it.joinedAt } }
        }
}

class GameViewModel(private val container: AppContainer) : ViewModel() {

    private val repository: RoomRepository = container.roomRepository
    private val _state = MutableStateFlow(UiState(backendMode = container.backendMode))
    val state: StateFlow<UiState> = _state.asStateFlow()

    private var roomJob: Job? = null
    private var presenceJob: Job? = null
    private var seenMessageIds = mutableSetOf<String>()

    init {
        viewModelScope.launch {
            runCatching { repository.signIn() }
                .onSuccess { _state.value = _state.value.copy(userId = it) }
                .onFailure { report(it) }
        }
    }

    fun setNickname(value: String) {
        _state.value = _state.value.copy(nickname = value)
    }

    fun dismissError() {
        _state.value = _state.value.copy(error = null, notice = null)
    }

    private fun report(error: Throwable) {
        val message = (error as? GameActionException)?.message ?: error.message ?: "Beklenmeyen bir hata oluştu."
        _state.value = _state.value.copy(error = message, busy = false)
    }

    private fun launchAction(block: suspend () -> Unit) {
        viewModelScope.launch {
            _state.value = _state.value.copy(busy = true, error = null)
            runCatching { block() }
                .onSuccess { _state.value = _state.value.copy(busy = false) }
                .onFailure { report(it) }
        }
    }

    // ------------------------------------------------------------- session

    fun createRoom() = launchAction {
        val code = repository.createRoom(_state.value.nickname)
        openRoom(code, Route.ROOM)
    }

    fun joinRoom(code: String) = launchAction {
        when (val outcome = repository.joinRoom(code, _state.value.nickname)) {
            is JoinOutcome.Joined -> openRoom(outcome.code, Route.ROOM)
            is JoinOutcome.Requested -> openRoom(outcome.code, Route.JOIN_WAITING)
        }
    }

    private fun openRoom(code: String, route: Route) {
        _state.value = _state.value.copy(roomCode = code, route = route)
        seenMessageIds = mutableSetOf()
        roomJob?.cancel()
        roomJob = viewModelScope.launch {
            repository.observeRoom(code).collectLatest { room -> onRoomUpdate(room) }
        }
        presenceJob?.cancel()
        presenceJob = viewModelScope.launch {
            while (true) {
                runCatching { repository.updatePresence(code) }
                delay(Constants.HEARTBEAT_INTERVAL)
            }
        }
    }

    private suspend fun onRoomUpdate(room: Room?) {
        val previous = _state.value
        if (room == null) {
            _state.value = previous.copy(room = null, map = null)
            return
        }
        val map = if (previous.room?.mapManifest != room.mapManifest ||
            previous.room?.mapSvg != room.mapSvg ||
            previous.map == null
        ) {
            runCatching { repository.loadRoomSvg(previous.roomCode, room) }
                .getOrNull()
                ?.let { MapParser.parse(it, room.mapDefinition) }
                ?: previous.map
        } else {
            previous.map
        }

        // Unread counting mirrors `src/game/unreadMessages.js`.
        var unread = if (previous.chatVisible) 0 else previous.unreadCount
        for (message in room.chat) {
            if (!seenMessageIds.add(message.id)) continue
            if (!previous.chatVisible && message.senderId != previous.userId) unread += 1
        }

        val route = if (room.players.containsKey(previous.userId)) Route.ROOM else previous.route
        _state.value = previous.copy(
            room = room,
            map = map,
            route = route,
            unreadCount = unread,
            selectedRegionId = previous.selectedRegionId?.takeIf {
                room.mapDefinition?.regionsById?.containsKey(it) == true
            },
        )
    }

    fun leaveRoom() = launchAction {
        val code = _state.value.roomCode
        if (code.isNotEmpty()) repository.leaveRoom(code)
        roomJob?.cancel()
        presenceJob?.cancel()
        _state.value = UiState(
            backendMode = container.backendMode,
            userId = _state.value.userId,
            nickname = _state.value.nickname,
        )
    }

    // ---------------------------------------------------------------- lobby

    fun importMap(svgText: String, displayName: String) = launchAction {
        val prepared = MapImporter.prepare(
            svgText,
            displayName = displayName,
            metadataMismatch = MapImporter.MetadataMismatch.REANALYZE,
        )
        _state.value = _state.value.copy(pendingImport = prepared)
    }

    fun applyPendingMap() = launchAction {
        val prepared = _state.value.pendingImport ?: return@launchAction
        repository.setRoomMap(_state.value.roomCode, prepared)
        _state.value = _state.value.copy(pendingImport = null, mapPrepareVisible = false)
    }

    fun discardPendingMap() {
        _state.value = _state.value.copy(pendingImport = null)
    }

    /**
     * Host override on a surface, rebuilt through the same pipeline the web
     * editor uses so coasts, ports and pricing are all recomputed.
     */
    fun setSurfaceTerrain(surfaceId: String, terrainType: String) = launchAction {
        val prepared = _state.value.pendingImport ?: return@launchAction
        val next = prepared.terrainDocument.copy(
            surfaces = prepared.terrainDocument.surfaces.map { surface ->
                if (surface.id == surfaceId) surface.copy(hostOverride = terrainType) else surface
            },
        )
        _state.value = _state.value.copy(pendingImport = MapImporter.rebuild(prepared, next))
    }

    fun setPortPreference(surfaceId: String, allowed: Boolean) = launchAction {
        val prepared = _state.value.pendingImport ?: return@launchAction
        val next = prepared.terrainDocument.copy(
            surfaces = prepared.terrainDocument.surfaces.map { surface ->
                if (surface.id == surfaceId) surface.copy(portPreference = allowed) else surface
            },
        )
        _state.value = _state.value.copy(pendingImport = MapImporter.rebuild(prepared, next))
    }

    fun setPendingNavalPolicy(policy: String) = launchAction {
        val prepared = _state.value.pendingImport ?: return@launchAction
        val next = prepared.terrainDocument.copy(navalPolicy = policy)
        _state.value = _state.value.copy(pendingImport = MapImporter.rebuild(prepared, next))
    }

    fun togglePendingRoute(firstId: String, secondId: String) = launchAction {
        val prepared = _state.value.pendingImport ?: return@launchAction
        val key = NavalPolicy.routeKey(firstId, secondId)
        if (key.isEmpty()) return@launchAction
        val document = prepared.terrainDocument
        val allowed = document.allowedRoutes.toMutableList()
        if (!allowed.remove(key)) allowed.add(key)
        _state.value = _state.value.copy(
            pendingImport = MapImporter.rebuild(prepared, document.copy(allowedRoutes = allowed)),
        )
    }

    fun setNavalPolicy(policy: String) = launchAction {
        repository.configureNaval(_state.value.roomCode, NavalPolicy.NavalEdit.Policy(policy))
    }

    fun toggleNavalRoute(firstId: String, secondId: String, allowed: Boolean) = launchAction {
        repository.configureNaval(
            _state.value.roomCode,
            NavalPolicy.NavalEdit.Route(firstId, secondId, allowed),
        )
    }

    fun startGame() = launchAction { repository.startGame(_state.value.roomCode) }

    fun startMobilization() = launchAction { repository.startMobilization(_state.value.roomCode) }

    // ------------------------------------------------------------ selection

    fun selectRegion(regionId: String) {
        val current = _state.value
        val plan = current.warPlan
        if (current.phase == Phases.WAR && plan.operation != null && plan.step != WarStep.OPERATION) {
            _state.value = current.copy(warPlan = applyTargetSelection(current, plan, regionId))
            return
        }
        _state.value = current.copy(
            selectedRegionId = if (current.selectedRegionId == regionId) null else regionId,
        )
    }

    private fun applyTargetSelection(state: UiState, plan: WarPlan, regionId: String): WarPlan {
        val room = state.room ?: return plan
        val ownedByMe = room.claims[regionId]?.ownerId == state.userId
        return when {
            plan.sourceId == null && ownedByMe -> plan.copy(sourceId = regionId)
            plan.sourceId == regionId -> plan.copy(sourceId = null, targetId = null)
            plan.sourceId != null -> {
                val next = plan.copy(targetId = regionId)
                if (next.sourceId != null) next.copy(step = WarStep.CONFIRM) else next
            }

            else -> plan
        }
    }

    // ------------------------------------------------------------- claiming

    fun buySelected() = launchAction {
        val state = _state.value
        val regionId = state.selectedRegionId ?: return@launchAction
        repository.claimRegion(state.roomCode, regionId, state.room?.turnNumber ?: 0)
        _state.value = _state.value.copy(selectedRegionId = null)
    }

    fun saveIncome() = launchAction {
        val state = _state.value
        repository.saveIncome(state.roomCode, state.room?.turnNumber ?: 0)
    }

    // ------------------------------------------------------------ logistics

    fun recruitSoldiers(regionId: String) = launchAction {
        val state = _state.value
        repository.recruitSoldiers(state.roomCode, regionId, 1, state.room?.turnNumber ?: 0)
    }

    fun buildPort(regionId: String) = launchAction {
        val state = _state.value
        repository.buildPort(state.roomCode, regionId, state.room?.turnNumber ?: 0)
    }

    fun buyShip(regionId: String) = launchAction {
        val state = _state.value
        repository.buyShips(state.roomCode, regionId, 1, state.room?.turnNumber ?: 0)
    }

    fun finishMobilizationTurn() = launchAction {
        val state = _state.value
        repository.finishMobilizationTurn(state.roomCode, state.room?.turnNumber ?: 0)
    }

    // ------------------------------------------------------------------ war

    fun beginWarOperation(operation: WarOperation) {
        _state.value = _state.value.copy(
            warPlan = WarPlan(step = WarStep.TARGET, operation = operation),
            selectedRegionId = null,
        )
    }

    fun cancelWarPlan() {
        _state.value = _state.value.copy(warPlan = WarPlan())
    }

    fun backToTargetStep() {
        _state.value = _state.value.copy(warPlan = _state.value.warPlan.copy(step = WarStep.TARGET, targetId = null))
    }

    fun changeWarAmount(delta: Int) {
        val state = _state.value
        val plan = state.warPlan
        val max = state.room?.claims?.get(plan.sourceId)?.soldiers ?: WarConstants.SOLDIER_BATCH
        val next = (plan.amount + delta * WarConstants.SOLDIER_BATCH)
            .coerceIn(WarConstants.SOLDIER_BATCH, maxOf(WarConstants.SOLDIER_BATCH, max))
        _state.value = state.copy(warPlan = plan.copy(amount = next))
    }

    fun submitWarPlan() = launchAction {
        val state = _state.value
        val plan = state.warPlan
        val operation = plan.operation ?: return@launchAction
        val sourceId = plan.sourceId ?: return@launchAction
        val targetId = plan.targetId ?: return@launchAction
        val turnNumber = state.room?.turnNumber ?: 0
        if (operation.attack) {
            repository.attackRegion(state.roomCode, sourceId, targetId, plan.amount, operation.naval, turnNumber)
        } else {
            repository.transferTroops(state.roomCode, sourceId, targetId, plan.amount, operation.naval, turnNumber)
        }
        _state.value = _state.value.copy(warPlan = WarPlan(), selectedRegionId = null)
    }

    fun endWarTurn() = launchAction {
        val state = _state.value
        repository.endWarTurn(state.roomCode, state.room?.turnNumber ?: 0)
        _state.value = _state.value.copy(warPlan = WarPlan())
    }

    fun skipOfflinePlayer() = launchAction { repository.skipOfflineTurn(_state.value.roomCode) }

    // ----------------------------------------------------------------- chat

    fun setChatVisible(visible: Boolean) {
        _state.value = _state.value.copy(
            chatVisible = visible,
            unreadCount = if (visible) 0 else _state.value.unreadCount,
            menuVisible = false,
        )
    }

    fun sendChat(text: String) = launchAction {
        repository.sendChatMessage(_state.value.roomCode, text)
    }

    fun setMenuVisible(visible: Boolean) {
        _state.value = _state.value.copy(menuVisible = visible)
    }

    fun setMapPrepareVisible(visible: Boolean) {
        _state.value = _state.value.copy(mapPrepareVisible = visible)
    }

    fun cancelJoinRequest() = launchAction {
        repository.cancelJoinRequest(_state.value.roomCode)
        leaveRoom()
    }

    fun acceptJoinRequest(requesterId: String) = launchAction {
        repository.acceptJoinRequest(_state.value.roomCode, requesterId)
    }

    fun rejectJoinRequest(requesterId: String) = launchAction {
        repository.rejectJoinRequest(_state.value.roomCode, requesterId)
    }

    fun voteJoinRequest(requesterId: String, approve: Boolean) = launchAction {
        repository.voteJoinRequest(_state.value.roomCode, requesterId, approve)
    }

    /** Cost preview for the logistics card, kept in sync with the war rules. */
    fun canBuildPort(regionId: String?): Boolean {
        val room = _state.value.room ?: return false
        val region = room.region(regionId) ?: return false
        return WarEconomy.canBuildPort(region, room.mapDefinition) && room.claims[regionId]?.hasPort != true
    }
}
