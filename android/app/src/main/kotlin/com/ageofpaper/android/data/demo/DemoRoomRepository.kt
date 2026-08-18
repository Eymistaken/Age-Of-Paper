package com.ageofpaper.android.data.demo

import com.ageofpaper.android.data.GameActionException
import com.ageofpaper.android.data.JoinOutcome
import com.ageofpaper.android.data.RoomRepository
import com.ageofpaper.core.Constants
import com.ageofpaper.core.model.ChatMessage
import com.ageofpaper.core.model.Claim
import com.ageofpaper.core.model.Eligibility
import com.ageofpaper.core.model.LastAction
import com.ageofpaper.core.model.Player
import com.ageofpaper.core.model.Room
import com.ageofpaper.core.model.RoomResult
import com.ageofpaper.core.rules.ClaimRules
import com.ageofpaper.core.rules.JoinRequests
import com.ageofpaper.core.rules.NavalPolicy
import com.ageofpaper.core.rules.Phases
import com.ageofpaper.core.rules.Turns
import com.ageofpaper.core.rules.WarConstants
import com.ageofpaper.core.rules.WarEconomy
import com.ageofpaper.core.rules.WarState
import com.ageofpaper.core.svg.MapImporter
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.util.UUID

/**
 * In-memory repository that runs the same `core` rules as Firestore.
 *
 * It lets the whole flow be played without any Firebase setup, and the bot
 * commanders take their turn automatically so the mobilisation and war screens
 * can be reached in a single session.
 */
class DemoRoomRepository : RoomRepository {

    private val userId = "demo-commander"
    private val mutex = Mutex()
    private val rooms = MutableStateFlow<Map<String, Room>>(emptyMap())

    override val currentUserId: String get() = userId

    override suspend fun signIn(): String = userId

    override fun observeRoom(roomCode: String): Flow<Room?> = rooms.map { it[roomCode] }

    private suspend fun mutate(roomCode: String, block: (Room) -> Room) {
        mutex.withLock {
            val current = rooms.value[roomCode]
                ?: throw GameActionException("Oda bulunamadı.", "ROOM_NOT_FOUND")
            rooms.value = rooms.value + (roomCode to block(current))
        }
    }

    private fun throwIfIllegal(eligibility: Eligibility) {
        if (!eligibility.legal) {
            throw GameActionException(eligibility.reason ?: "Emir uygulanamadı.", eligibility.code)
        }
    }

    private fun action(type: String, actorId: String, room: Room, regionId: String? = null): LastAction =
        LastAction(
            id = "$type:${room.turnNumber}:$actorId",
            type = type,
            actorId = actorId,
            regionId = regionId,
            turnNumber = room.turnNumber,
            at = System.currentTimeMillis(),
        )

    override suspend fun createRoom(nickname: String): String {
        val code = DemoContent.ROOM_CODE
        mutex.withLock {
            rooms.value = rooms.value + (code to DemoContent.lobby(userId, nickname.trim().take(32)))
        }
        return code
    }

    override suspend fun joinRoom(roomCode: String, nickname: String): JoinOutcome {
        val code = roomCode.trim().uppercase()
        mutex.withLock {
            if (rooms.value[code] == null) {
                rooms.value = rooms.value + (code to DemoContent.lobby(userId, nickname.trim().take(32)))
            }
        }
        return JoinOutcome.Joined(code)
    }

    override suspend fun leaveRoom(roomCode: String) {
        mutex.withLock { rooms.value = rooms.value - roomCode }
    }

    override suspend fun setRoomMap(roomCode: String, prepared: MapImporter.PreparedMap) {
        mutate(roomCode) { room ->
            if (room.hostId != userId) {
                throw GameActionException("Haritayı yalnızca kurucu değiştirebilir.", "HOST_ONLY")
            }
            room.copy(
                mapSvg = prepared.sanitizedSvg,
                mapDefinition = prepared.mapDefinition,
                mapValidation = prepared.validation,
                mapManifest = null,
            )
        }
    }

    override suspend fun loadRoomSvg(roomCode: String, room: Room): String? = room.mapSvg.ifBlank { null }

    override suspend fun configureNaval(roomCode: String, edit: NavalPolicy.NavalEdit) {
        mutate(roomCode) { room ->
            val definition = room.mapDefinition
                ?: throw GameActionException("Önce geçerli bir harita yükle.", "INVALID_MAP")
            val result = NavalPolicy.applyEdit(definition, edit)
            if (!result.ok) throw GameActionException(result.reason.orEmpty(), result.code.orEmpty())
            room.copy(mapDefinition = result.mapDefinition)
        }
    }

    override suspend fun startGame(roomCode: String) {
        mutate(roomCode) { room ->
            if (room.phase != Phases.LOBBY) throw GameActionException("Oyun zaten başlatılmış.", "ROOM_STARTED")
            if (room.mapDefinition == null) {
                throw GameActionException("Geçerli bir harita yüklenmeden oyun başlatılamaz.", "INVALID_MAP")
            }
            // The human commander opens the campaign so the design flow reads naturally.
            val turnOrder = listOf(userId) + room.players.keys.filter { it != userId }
            room.copy(
                phase = Phases.CLAIMING,
                players = room.players.mapValues { (_, player) ->
                    player.copy(
                        money = Constants.STARTING_MONEY,
                        income = Constants.BASE_INCOME,
                        regionIds = emptyList(),
                        lastIncomeTurn = 0,
                        eliminated = false,
                    )
                },
                claims = emptyMap(),
                turnOrder = turnOrder,
                turnIndex = 0,
                turnNumber = 1,
                roundNumber = 1,
                lastAction = LastAction(id = "start", type = "start", actorId = userId, turnNumber = 1),
            )
        }
        // Demo rooms hand out a starting treasury so the first purchase is possible.
        mutate(roomCode) { room ->
            room.copy(players = room.players.mapValues { (_, player) -> player.copy(money = 60_000) })
        }
    }

    override suspend fun claimRegion(roomCode: String, regionId: String, expectedTurnNumber: Int) {
        mutate(roomCode) { room ->
            val result = ClaimRules.applyClaim(room, userId, regionId)
            throwIfIllegal(result.eligibility)
            runBots(result.room.copy(lastAction = action("claim", userId, room, regionId)))
        }
    }

    override suspend fun saveIncome(roomCode: String, expectedTurnNumber: Int) {
        mutate(roomCode) { room ->
            val result = ClaimRules.applySaveIncome(room, userId)
            throwIfIllegal(result.eligibility)
            runBots(result.room.copy(lastAction = action("save_income", userId, room)))
        }
    }

    override suspend fun startMobilization(roomCode: String) {
        mutate(roomCode) { room ->
            val result = WarState.startMobilization(room, room.hostId)
            throwIfIllegal(result.eligibility)
            runBots(result.room)
        }
    }

    override suspend fun recruitSoldiers(
        roomCode: String,
        regionId: String,
        batches: Int,
        expectedTurnNumber: Int,
    ) = logistics(roomCode) { room -> WarEconomy.applyRecruitSoldiers(room, userId, regionId, batches) }

    override suspend fun buildPort(roomCode: String, regionId: String, expectedTurnNumber: Int) =
        logistics(roomCode) { room -> WarEconomy.applyBuildPort(room, userId, regionId) }

    override suspend fun buyShips(roomCode: String, regionId: String, count: Int, expectedTurnNumber: Int) =
        logistics(roomCode) { room -> WarEconomy.applyBuyShips(room, userId, regionId, count) }

    private suspend fun logistics(roomCode: String, apply: (Room) -> RoomResult) {
        mutate(roomCode) { room ->
            val result = apply(room)
            throwIfIllegal(result.eligibility)
            result.room
        }
    }

    override suspend fun finishMobilizationTurn(roomCode: String, expectedTurnNumber: Int) {
        mutate(roomCode) { room ->
            val result = WarState.applyMobilizationReady(room, userId)
            throwIfIllegal(result.eligibility)
            runBots(result.room)
        }
    }

    override suspend fun transferTroops(
        roomCode: String,
        sourceId: String,
        targetId: String,
        amount: Int,
        naval: Boolean,
        expectedTurnNumber: Int,
    ) {
        mutate(roomCode) { room ->
            val result = WarState.applyWarTransfer(room, userId, sourceId, targetId, amount, naval)
            throwIfIllegal(result.eligibility)
            runBots(result.room)
        }
    }

    override suspend fun attackRegion(
        roomCode: String,
        sourceId: String,
        targetId: String,
        amount: Int,
        naval: Boolean,
        expectedTurnNumber: Int,
    ) {
        mutate(roomCode) { room ->
            val result = WarState.applyWarAttack(room, userId, sourceId, targetId, amount, naval)
            throwIfIllegal(result.eligibility)
            runBots(result.room)
        }
    }

    override suspend fun endWarTurn(roomCode: String, expectedTurnNumber: Int) {
        mutate(roomCode) { room ->
            val result = WarState.applyWarEndTurn(room, userId)
            throwIfIllegal(result.eligibility)
            runBots(result.room)
        }
    }

    override suspend fun skipOfflineTurn(roomCode: String) {
        mutate(roomCode) { room -> runBots(WarState.skipWarTurn(room).room) }
    }

    override suspend fun sendChatMessage(roomCode: String, text: String) {
        val message = text.trim().take(Constants.CHAT_MESSAGE_LIMIT)
        if (message.isEmpty()) return
        mutate(roomCode) { room ->
            val player = room.players[userId] ?: return@mutate room
            room.copy(
                chat = (
                    room.chat + ChatMessage(
                        id = UUID.randomUUID().toString(),
                        senderId = userId,
                        name = player.name,
                        color = player.color,
                        text = message,
                        createdAt = System.currentTimeMillis(),
                    )
                    ).takeLast(Constants.CHAT_HISTORY_LIMIT),
            )
        }
    }

    override suspend fun updatePresence(roomCode: String) = Unit

    override suspend fun voteJoinRequest(roomCode: String, requesterId: String, approve: Boolean) {
        mutate(roomCode) { room ->
            JoinRequests.castVote(room, requesterId, userId, approve, System.currentTimeMillis())
        }
    }

    override suspend fun acceptJoinRequest(roomCode: String, requesterId: String) {
        mutate(roomCode) { room ->
            JoinRequests.accept(room, requesterId, userId, System.currentTimeMillis())
        }
    }

    override suspend fun rejectJoinRequest(roomCode: String, requesterId: String) {
        mutate(roomCode) { room -> room.copy(joinRequests = room.joinRequests - requesterId) }
    }

    override suspend fun cancelJoinRequest(roomCode: String) {
        mutate(roomCode) { room -> room.copy(joinRequests = room.joinRequests - userId) }
    }

    /**
     * Plays every bot turn until it is the human commander turn again, so the
     * demo never stalls waiting for another device.
     */
    private fun runBots(room: Room): Room {
        var current = room
        var guard = 0
        while (guard < 64) {
            guard++
            val activeId = current.activePlayerId ?: return current
            if (activeId == userId || current.phase == Phases.FINISHED) return current
            current = when (current.phase) {
                Phases.CLAIMING -> botClaim(current, activeId)
                Phases.MOBILIZATION -> WarState.applyMobilizationReady(current, activeId).room
                Phases.WAR -> botWarTurn(current, activeId)
                else -> return current
            }
        }
        return current
    }

    private fun botClaim(room: Room, botId: String): Room {
        val player = room.players[botId] ?: return Turns.advanceTurn(room)
        val affordable = ClaimRules.legalClaims(room.mapDefinition, room.claims, botId)
            .mapNotNull { room.region(it) }
            .filter { it.price <= player.money }
            .minByOrNull { it.price }
        if (affordable == null) {
            val result = ClaimRules.applySaveIncome(room, botId)
            return if (result.eligibility.legal) result.room else Turns.advanceTurn(room)
        }
        val result = ClaimRules.applyClaim(room, botId, affordable.id)
        return if (result.eligibility.legal) result.room else Turns.advanceTurn(room)
    }

    private fun botWarTurn(room: Room, botId: String): Room {
        val owned = room.claims.filterValues { it.ownerId == botId }
        val source = owned.entries
            .filter { it.value.soldiers > WarConstants.SOLDIER_BATCH }
            .maxByOrNull { it.value.soldiers }
        if (source != null) {
            val target = room.region(source.key)?.landNeighbors
                ?.firstOrNull { room.claims[it]?.ownerId != null && room.claims[it]?.ownerId != botId }
            if (target != null) {
                val defenders = room.claims[target]?.soldiers ?: 0
                val amount = ((defenders + WarConstants.SOLDIER_BATCH) / WarConstants.SOLDIER_BATCH) *
                    WarConstants.SOLDIER_BATCH
                if (amount in 1..source.value.soldiers) {
                    val attack = WarState.applyWarAttack(room, botId, source.key, target, amount, naval = false)
                    if (attack.eligibility.legal) return attack.room
                }
            }
        }
        val end = WarState.applyWarEndTurn(room, botId)
        return if (end.eligibility.legal) end.room else Turns.advanceTurn(room)
    }
}
