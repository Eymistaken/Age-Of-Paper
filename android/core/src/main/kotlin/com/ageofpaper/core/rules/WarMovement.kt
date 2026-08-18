package com.ageofpaper.core.rules

import com.ageofpaper.core.model.Claim
import com.ageofpaper.core.model.Eligibility
import com.ageofpaper.core.model.MapDefinition
import com.ageofpaper.core.model.Region
import com.ageofpaper.core.model.Room
import com.ageofpaper.core.model.RoomResult

/** Port of `src/game/warMovement.js`. */
object WarMovement {

    data class MovementBase(
        val eligibility: Eligibility,
        val sourceClaim: Claim? = null,
        val targetClaim: Claim? = null,
        val sourceRegion: Region? = null,
        val targetRegion: Region? = null,
    )

    private fun baseEligibility(
        room: Room,
        playerId: String,
        sourceId: String?,
        targetId: String?,
        amount: Int,
    ): MovementBase {
        if (room.phase != Phases.WAR) {
            return MovementBase(Eligibility.illegal("WRONG_PHASE", WarMessages.OPERATION_WRONG_PHASE))
        }
        if (room.activePlayerId != playerId) {
            return MovementBase(Eligibility.illegal("NOT_ACTIVE", WarMessages.NOT_ACTIVE))
        }
        if (room.players[playerId]?.eliminated == true) {
            return MovementBase(Eligibility.illegal("ELIMINATED", WarMessages.ELIMINATED_ORDER))
        }
        if (sourceId.isNullOrEmpty() || targetId.isNullOrEmpty() || sourceId == targetId) {
            return MovementBase(Eligibility.illegal("SAME_REGION", WarMessages.SAME_REGION))
        }
        if (!WarConstants.isSoldierAmount(amount)) {
            return MovementBase(Eligibility.illegal("INVALID_AMOUNT", WarMessages.INVALID_TRANSFER_AMOUNT))
        }
        val sourceClaim = room.claims[sourceId]
        val targetClaim = room.claims[targetId]
        if (sourceClaim?.ownerId != playerId) {
            return MovementBase(Eligibility.illegal("INVALID_SOURCE", WarMessages.INVALID_SOURCE))
        }
        if (sourceClaim.soldiers < amount) {
            return MovementBase(Eligibility.illegal("INSUFFICIENT_SOLDIERS", WarMessages.INSUFFICIENT_SOLDIERS))
        }
        return MovementBase(
            eligibility = Eligibility(true, "AVAILABLE"),
            sourceClaim = sourceClaim,
            targetClaim = targetClaim,
            sourceRegion = room.region(sourceId),
            targetRegion = room.region(targetId),
        )
    }

    /** Breadth-first search across land neighbours the player already owns. */
    fun findFriendlyLandPath(
        mapDefinition: MapDefinition?,
        claims: Map<String, Claim>,
        playerId: String,
        sourceId: String,
        targetId: String,
    ): List<String>? {
        if (sourceId == targetId) return listOf(sourceId)
        val seen = mutableSetOf(sourceId)
        val queue = ArrayDeque<List<String>>()
        queue.add(listOf(sourceId))
        while (queue.isNotEmpty()) {
            val path = queue.removeFirst()
            val current = path.last()
            for (neighbor in mapDefinition?.regionsById?.get(current)?.landNeighbors.orEmpty()) {
                if (seen.contains(neighbor) || claims[neighbor]?.ownerId != playerId) continue
                val nextPath = path + neighbor
                if (neighbor == targetId) return nextPath
                seen.add(neighbor)
                queue.add(nextPath)
            }
        }
        return null
    }

    fun hasFriendlyLandPath(
        mapDefinition: MapDefinition?,
        claims: Map<String, Claim>,
        playerId: String,
        sourceId: String,
        targetId: String,
    ): Boolean = findFriendlyLandPath(mapDefinition, claims, playerId, sourceId, targetId) != null

    fun landTransferEligibility(
        room: Room,
        playerId: String,
        sourceId: String?,
        targetId: String?,
        amount: Int,
    ): MovementBase {
        val base = baseEligibility(room, playerId, sourceId, targetId, amount)
        if (!base.eligibility.legal) return base
        if (base.targetClaim?.ownerId != playerId) {
            return MovementBase(Eligibility.illegal("INVALID_TARGET", WarMessages.INVALID_TARGET))
        }
        val path = findFriendlyLandPath(room.mapDefinition, room.claims, playerId, sourceId!!, targetId!!)
            ?: return MovementBase(Eligibility.illegal("NO_FRIENDLY_PATH", WarMessages.NO_FRIENDLY_PATH))
        return base.copy(eligibility = base.eligibility.copy(path = path))
    }

    fun navalTransferEligibility(
        room: Room,
        playerId: String,
        sourceId: String?,
        targetId: String?,
        amount: Int,
    ): MovementBase {
        val naval = NavalPolicy.navalTargetEligibility(room, playerId, "move", sourceId, targetId, amount)
        return MovementBase(
            eligibility = naval.eligibility,
            sourceClaim = naval.sourceClaim,
            targetClaim = naval.targetClaim,
            sourceRegion = naval.sourceRegion,
            targetRegion = naval.targetRegion,
        )
    }

    fun transferEligibility(
        room: Room,
        playerId: String,
        sourceId: String?,
        targetId: String?,
        amount: Int,
        naval: Boolean,
    ): MovementBase = if (naval) {
        navalTransferEligibility(room, playerId, sourceId, targetId, amount)
    } else {
        landTransferEligibility(room, playerId, sourceId, targetId, amount)
    }

    fun applyTransfer(
        room: Room,
        playerId: String,
        sourceId: String,
        targetId: String,
        amount: Int,
        naval: Boolean,
    ): RoomResult {
        val base = transferEligibility(room, playerId, sourceId, targetId, amount, naval)
        if (!base.eligibility.legal) return RoomResult(room, base.eligibility)
        val sourceClaim = base.sourceClaim!!
        val targetClaim = base.targetClaim ?: com.ageofpaper.core.model.Claim()
        val claims = room.claims +
            (sourceId to sourceClaim.copy(soldiers = sourceClaim.soldiers - amount)) +
            (targetId to targetClaim.copy(soldiers = targetClaim.soldiers + amount))
        return RoomResult(room.copy(claims = claims), base.eligibility)
    }
}
