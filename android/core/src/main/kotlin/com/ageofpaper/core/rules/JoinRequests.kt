package com.ageofpaper.core.rules

import com.ageofpaper.core.Constants
import com.ageofpaper.core.model.JoinRequest
import com.ageofpaper.core.model.JoinRequestStatus
import com.ageofpaper.core.model.Player
import com.ageofpaper.core.model.Room

/** Port of `src/game/joinRequests.js`. */
object JoinRequests {

    fun isExpired(request: JoinRequest?, now: Long): Boolean =
        (request?.expiresAt ?: 0L) <= now

    fun pickAvailablePlayerColor(players: Map<String, Player>): String? {
        val used = players.values.map { it.color }.toSet()
        return Constants.COLORS.firstOrNull { !used.contains(it) }
    }

    fun createRecord(
        room: Room,
        userId: String,
        name: String,
        createdAt: Long,
        expiresAt: Long = createdAt + Constants.JOIN_REQUEST_TTL,
    ): JoinRequest = JoinRequest(
        uid = userId,
        name = name.trim().take(32),
        createdAt = createdAt,
        expiresAt = expiresAt,
        updatedAt = createdAt,
        status = JoinRequestStatus.PENDING,
        requiredVoterIds = room.players.keys.filter { it != room.hostId && it != userId },
        approvals = emptyMap(),
        rejections = emptyMap(),
        decisionAt = null,
        decidedBy = null,
    )

    fun effectiveVoterIds(room: Room, request: JoinRequest?): List<String> =
        request?.requiredVoterIds.orEmpty()
            .distinct()
            .filter { it != room.hostId && it != request?.uid && room.players.containsKey(it) }

    data class VoteSummary(
        val voterIds: List<String>,
        val approvals: List<String>,
        val rejections: List<String>,
    ) {
        val approvedCount: Int get() = approvals.size
        val requiredCount: Int get() = voterIds.size
        val unanimous: Boolean
            get() = voterIds.isNotEmpty() && approvals.size == voterIds.size && rejections.isEmpty()
    }

    fun voteSummary(room: Room, request: JoinRequest?): VoteSummary {
        val voterIds = effectiveVoterIds(room, request)
        return VoteSummary(
            voterIds = voterIds,
            approvals = voterIds.filter { request?.approvals?.get(it) == true },
            rejections = voterIds.filter { request?.rejections?.get(it) == true },
        )
    }

    /** The host alone can accept; otherwise every other commander must agree. */
    fun mayAccept(room: Room, request: JoinRequest?, actorId: String, now: Long): Boolean {
        if (room.phase != Phases.CLAIMING) return false
        if (request == null || request.status != JoinRequestStatus.PENDING || isExpired(request, now)) return false
        if (room.players.containsKey(request.uid) || !room.players.containsKey(actorId)) return false
        if (room.players.size >= Constants.MAX_PLAYERS || pickAvailablePlayerColor(room.players) == null) return false
        val hasNeutralRegion = room.mapDefinition?.regionIds?.any { room.claims[it]?.ownerId == null } == true
        if (!hasNeutralRegion) return false
        return actorId == room.hostId || voteSummary(room, request).unanimous
    }

    class JoinVoteError(message: String) : IllegalStateException(message)

    fun castVote(room: Room, requesterId: String, voterId: String, approve: Boolean, updatedAt: Long): Room {
        val request = room.joinRequests[requesterId]
            ?: throw JoinVoteError("Katılma isteği artık beklemede değil.")
        if (request.status != JoinRequestStatus.PENDING) {
            throw JoinVoteError("Katılma isteği artık beklemede değil.")
        }
        if (!effectiveVoterIds(room, request).contains(voterId)) {
            throw JoinVoteError("Bu istek için oy kullanamazsın.")
        }
        val approvals = request.approvals.toMutableMap()
        val rejections = request.rejections.toMutableMap()
        if (approve) {
            approvals[voterId] = true
            rejections.remove(voterId)
        } else {
            rejections[voterId] = true
            approvals.remove(voterId)
        }
        return room.copy(
            joinRequests = room.joinRequests + (
                requesterId to request.copy(
                    approvals = approvals,
                    rejections = rejections,
                    updatedAt = updatedAt,
                )
                ),
        )
    }

    fun accept(room: Room, requesterId: String, actorId: String, now: Long): Room {
        val request = room.joinRequests[requesterId]
        if (!mayAccept(room, request, actorId, now)) {
            throw JoinVoteError("Katılma isteği kabul koşullarını karşılamıyor.")
        }
        val accepted = request!!
        val color = pickAvailablePlayerColor(room.players)
            ?: throw JoinVoteError("Kullanılabilir komutan rengi kalmadı.")
        val player = Player(
            id = accepted.uid,
            name = accepted.name,
            color = color,
            money = Constants.STARTING_MONEY,
            income = Constants.BASE_INCOME,
            regionIds = emptyList(),
            joinedAt = now,
            lastActive = now,
            lastIncomeTurn = 0,
            eliminated = false,
        )
        return room.copy(
            players = room.players + (accepted.uid to player),
            turnOrder = room.turnOrder + accepted.uid,
            joinRequests = room.joinRequests + (
                requesterId to accepted.copy(
                    status = JoinRequestStatus.ACCEPTED,
                    updatedAt = now,
                    decisionAt = now,
                    decidedBy = actorId,
                )
                ),
        )
    }
}
