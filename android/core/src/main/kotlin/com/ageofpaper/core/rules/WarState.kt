package com.ageofpaper.core.rules

import com.ageofpaper.core.model.Eligibility
import com.ageofpaper.core.model.Room
import com.ageofpaper.core.model.RoomResult

/** Port of `src/game/warState.js`. */
object WarState {

    private val CONTESTED_PHASES = setOf(Phases.CLAIM_COMPLETE, Phases.MOBILIZATION, Phases.WAR)

    private fun owningPlayerIds(room: Room): List<String> {
        val owners = room.claims.values.mapNotNull { it.ownerId }.toSet()
        return room.players.keys.filter { owners.contains(it) && room.players[it]?.eliminated != true }
    }

    private fun nextSurvivingId(oldOrder: List<String>, oldIndex: Int, survivingIds: List<String>): String? {
        val surviving = survivingIds.toSet()
        if (oldOrder.isEmpty()) return survivingIds.firstOrNull()
        for (step in 1..oldOrder.size) {
            val candidate = oldOrder[(oldIndex + step) % oldOrder.size]
            if (surviving.contains(candidate)) return candidate
        }
        return survivingIds.firstOrNull()
    }

    fun resolveVictory(room: Room): Room {
        if (!CONTESTED_PHASES.contains(room.phase)) return room
        val contenders = owningPlayerIds(room)
        if (contenders.size != 1) return room.copy(winnerId = null)
        return room.copy(
            phase = Phases.FINISHED,
            winnerId = contenders.first(),
            mobilizationTurnsRemaining = 0,
            mobilizationPending = emptyList(),
        )
    }

    fun startMobilization(room: Room, hostId: String): RoomResult {
        if (room.phase != Phases.CLAIM_COMPLETE) {
            return RoomResult(room, Eligibility.illegal("WRONG_PHASE", WarMessages.MOBILIZATION_WRONG_PHASE))
        }
        if (room.hostId != hostId) {
            return RoomResult(room, Eligibility.illegal("HOST_ONLY", WarMessages.HOST_ONLY_MOBILIZATION))
        }
        val oldOrder = room.turnOrder
        val ownerIds = room.claims.values.mapNotNull { it.ownerId }.toSet()
        val turnOrder = oldOrder.filter { room.players[it] != null && ownerIds.contains(it) }
        if (turnOrder.isEmpty()) {
            return RoomResult(room, Eligibility.illegal("NO_ACTIVE_PLAYERS", WarMessages.NO_ACTIVE_PLAYERS))
        }
        val nextId = nextSurvivingId(oldOrder, room.turnIndex, turnOrder)
        val wrapped = oldOrder.indexOf(nextId) <= room.turnIndex

        val claims = room.claims.mapValues { (_, claim) ->
            claim.copy(
                soldiers = WarConstants.INITIAL_REGION_SOLDIERS,
                hasPort = false,
                ships = 0,
            )
        }
        val players = room.players.mapValues { (id, player) ->
            player.copy(
                eliminated = !ownerIds.contains(id),
                income = Economy.calculateIncome(room.mapDefinition, room.claims, id),
            )
        }

        var next = room.copy(
            phase = Phases.MOBILIZATION,
            players = players,
            claims = claims,
            turnOrder = turnOrder,
            turnIndex = maxOf(0, turnOrder.indexOf(nextId)),
            turnNumber = maxOf(0, room.turnNumber) + 1,
            roundNumber = maxOf(1, room.roundNumber) + if (wrapped) 1 else 0,
            mobilizationTurnsRemaining = turnOrder.size,
            mobilizationPending = turnOrder,
            winnerId = null,
            completedAt = null,
        )
        next = WarEconomy.grantTurnIncome(next).room
        return RoomResult(next, Eligibility(true, "AVAILABLE"))
    }

    fun applyMobilizationReady(room: Room, playerId: String?, grantIncome: Boolean = true): RoomResult {
        val working = if (grantIncome) WarEconomy.grantTurnIncome(room, playerId).room else room
        if (working.phase != Phases.MOBILIZATION) {
            return RoomResult(room, Eligibility.illegal("WRONG_PHASE", WarMessages.READY_WRONG_PHASE))
        }
        if (working.activePlayerId != playerId || playerId == null) {
            return RoomResult(room, Eligibility.illegal("NOT_ACTIVE", WarMessages.NOT_ACTIVE))
        }
        if (!working.mobilizationPending.contains(playerId)) {
            return RoomResult(room, Eligibility.illegal("ALREADY_READY", WarMessages.ALREADY_READY))
        }
        val pending = working.mobilizationPending.filter { it != playerId }
        var next = Turns.advanceTurn(working).copy(
            phase = if (pending.isNotEmpty()) Phases.MOBILIZATION else Phases.WAR,
            mobilizationPending = pending,
            mobilizationTurnsRemaining = pending.size,
        )
        if (pending.isEmpty()) next = resolveVictory(next)
        if (next.phase != Phases.FINISHED) next = WarEconomy.grantTurnIncome(next).room
        return RoomResult(next, Eligibility(true, "AVAILABLE"))
    }

    /**
     * Shared tail for transfer and attack: elimination, victory, then exactly one
     * turn advance with income for the next player.
     */
    private fun finalizeOperation(playerId: String, result: RoomResult): RoomResult {
        if (!result.eligibility.legal) return result
        var next = result.room
        val previousOwnerId = result.eligibility.previousOwnerId
        if (previousOwnerId != null && next.players[previousOwnerId]?.regionIds?.isEmpty() == true) {
            val loser = next.players.getValue(previousOwnerId)
            next = next.copy(players = next.players + (previousOwnerId to loser.copy(eliminated = true)))
            next = Turns.removePlayerFromTurnState(next, previousOwnerId).room
        }
        next = resolveVictory(next)
        next = if (next.phase == Phases.FINISHED) {
            next.copy(turnNumber = maxOf(0, next.turnNumber) + 1)
        } else {
            WarEconomy.grantTurnIncome(Turns.advanceTurn(next)).room
        }
        return RoomResult(next, result.eligibility)
    }

    fun applyWarTransfer(
        room: Room,
        playerId: String,
        sourceId: String,
        targetId: String,
        amount: Int,
        naval: Boolean,
    ): RoomResult {
        val working = WarEconomy.grantTurnIncome(room, playerId).room
        return finalizeOperation(
            playerId,
            WarMovement.applyTransfer(working, playerId, sourceId, targetId, amount, naval),
        )
    }

    fun applyWarAttack(
        room: Room,
        playerId: String,
        sourceId: String,
        targetId: String,
        amount: Int,
        naval: Boolean,
    ): RoomResult {
        val working = WarEconomy.grantTurnIncome(room, playerId).room
        return finalizeOperation(
            playerId,
            WarCombat.applyAttack(working, playerId, sourceId, targetId, amount, naval),
        )
    }

    fun applyWarEndTurn(room: Room, playerId: String?, grantIncome: Boolean = true): RoomResult {
        val working = if (grantIncome) WarEconomy.grantTurnIncome(room, playerId).room else room
        if (working.phase != Phases.WAR) {
            return RoomResult(room, Eligibility.illegal("WRONG_PHASE", WarMessages.END_TURN_WRONG_PHASE))
        }
        if (working.activePlayerId != playerId || playerId == null) {
            return RoomResult(room, Eligibility.illegal("NOT_ACTIVE", WarMessages.NOT_ACTIVE))
        }
        val next = WarEconomy.grantTurnIncome(Turns.advanceTurn(working)).room
        return RoomResult(next, Eligibility(true, "AVAILABLE"))
    }

    data class Surrender(val room: Room, val surrendered: Boolean)

    /** Surrender neutralises soldiers and ships but preserves ports. */
    fun surrenderPlayer(room: Room, playerId: String): Surrender {
        if (!CONTESTED_PHASES.contains(room.phase) || room.players[playerId] == null) {
            return Surrender(room, false)
        }
        val players = room.players - playerId
        val claims = room.claims.mapValues { (_, claim) ->
            if (claim.ownerId == playerId) claim.copy(ownerId = null, soldiers = 0, ships = 0) else claim
        }
        val pending = room.mobilizationPending.filter { it != playerId }
        var next = room.copy(
            players = players,
            claims = claims,
            mobilizationPending = pending,
            mobilizationTurnsRemaining = pending.size,
        )
        next = Turns.removePlayerFromTurnState(next, playerId).room
        if (next.phase == Phases.MOBILIZATION && next.mobilizationTurnsRemaining == 0) {
            next = next.copy(phase = Phases.WAR)
        }
        next = resolveVictory(next)
        return Surrender(next, true)
    }

    /** Skipped players receive no income. */
    fun skipWarTurn(room: Room): RoomResult {
        val activeId = room.activePlayerId
        return when (room.phase) {
            Phases.MOBILIZATION -> applyMobilizationReady(room, activeId, grantIncome = false)
            Phases.WAR -> applyWarEndTurn(room, activeId, grantIncome = false)
            else -> RoomResult(Turns.advanceTurn(room), Eligibility(true, "AVAILABLE"))
        }
    }
}
