package com.ageofpaper.android.data

import com.ageofpaper.core.model.Room
import com.ageofpaper.core.rules.NavalPolicy
import com.ageofpaper.core.svg.MapImporter
import kotlinx.coroutines.flow.Flow

/** Thrown for every rejected game action, mirroring `GameActionError` on the web. */
class GameActionException(
    message: String,
    val code: String = "GAME_ACTION_FAILED",
) : RuntimeException(message)

/** Result of asking to join a room: either seated immediately or queued. */
sealed interface JoinOutcome {
    data class Joined(val code: String) : JoinOutcome
    data class Requested(val code: String) : JoinOutcome
}

/**
 * Full action surface of `src/services/roomService.js`.
 *
 * Both the Firestore and the demo implementation run the same `core` rules, so
 * a rule change lands in online and offline play at once.
 */
interface RoomRepository {

    val currentUserId: String

    suspend fun signIn(): String

    fun observeRoom(roomCode: String): Flow<Room?>

    suspend fun createRoom(nickname: String): String

    suspend fun joinRoom(roomCode: String, nickname: String): JoinOutcome

    suspend fun leaveRoom(roomCode: String)

    suspend fun setRoomMap(roomCode: String, prepared: MapImporter.PreparedMap)

    /** Resolves the room artwork, verifying the content addressed assets. */
    suspend fun loadRoomSvg(roomCode: String, room: Room): String?

    suspend fun configureNaval(roomCode: String, edit: NavalPolicy.NavalEdit)

    suspend fun startGame(roomCode: String)

    suspend fun claimRegion(roomCode: String, regionId: String, expectedTurnNumber: Int)

    suspend fun saveIncome(roomCode: String, expectedTurnNumber: Int)

    suspend fun startMobilization(roomCode: String)

    suspend fun recruitSoldiers(roomCode: String, regionId: String, batches: Int, expectedTurnNumber: Int)

    suspend fun buildPort(roomCode: String, regionId: String, expectedTurnNumber: Int)

    suspend fun buyShips(roomCode: String, regionId: String, count: Int, expectedTurnNumber: Int)

    suspend fun finishMobilizationTurn(roomCode: String, expectedTurnNumber: Int)

    suspend fun transferTroops(
        roomCode: String,
        sourceId: String,
        targetId: String,
        amount: Int,
        naval: Boolean,
        expectedTurnNumber: Int,
    )

    suspend fun attackRegion(
        roomCode: String,
        sourceId: String,
        targetId: String,
        amount: Int,
        naval: Boolean,
        expectedTurnNumber: Int,
    )

    suspend fun endWarTurn(roomCode: String, expectedTurnNumber: Int)

    suspend fun skipOfflineTurn(roomCode: String)

    suspend fun sendChatMessage(roomCode: String, text: String)

    suspend fun updatePresence(roomCode: String)

    suspend fun voteJoinRequest(roomCode: String, requesterId: String, approve: Boolean)

    suspend fun acceptJoinRequest(roomCode: String, requesterId: String)

    suspend fun rejectJoinRequest(roomCode: String, requesterId: String)

    suspend fun cancelJoinRequest(roomCode: String)
}
