package com.ageofpaper.core.rules

import com.ageofpaper.core.model.Claim
import com.ageofpaper.core.model.CombatResult
import com.ageofpaper.core.model.Eligibility
import com.ageofpaper.core.model.Room
import com.ageofpaper.core.model.RoomResult

/** Port of `src/game/warCombat.js`. Combat is deterministic subtraction only. */
object WarCombat {

    fun resolveDeterministicCombat(attacking: Int, defending: Int): CombatResult? {
        if (!WarConstants.isSoldierAmount(attacking) || defending < 0) return null
        return if (attacking > defending) {
            CombatResult(captured = true, attackersRemaining = attacking - defending, defendersRemaining = 0)
        } else {
            CombatResult(captured = false, attackersRemaining = 0, defendersRemaining = defending - attacking)
        }
    }

    private fun attackBase(
        room: Room,
        playerId: String,
        sourceId: String?,
        targetId: String?,
        amount: Int,
    ): WarMovement.MovementBase {
        if (room.phase != Phases.WAR) {
            return WarMovement.MovementBase(Eligibility.illegal("WRONG_PHASE", WarMessages.ATTACK_WRONG_PHASE))
        }
        if (room.activePlayerId != playerId) {
            return WarMovement.MovementBase(Eligibility.illegal("NOT_ACTIVE", WarMessages.NOT_ACTIVE))
        }
        if (room.players[playerId]?.eliminated == true) {
            return WarMovement.MovementBase(Eligibility.illegal("ELIMINATED", WarMessages.ELIMINATED_ATTACK))
        }
        if (sourceId.isNullOrEmpty() || targetId.isNullOrEmpty() || sourceId == targetId) {
            return WarMovement.MovementBase(Eligibility.illegal("SAME_REGION", WarMessages.SAME_REGION))
        }
        if (!WarConstants.isSoldierAmount(amount)) {
            return WarMovement.MovementBase(Eligibility.illegal("INVALID_AMOUNT", WarMessages.INVALID_ATTACK_AMOUNT))
        }
        val sourceClaim = room.claims[sourceId]
        val targetClaim = room.claims[targetId]
        if (sourceClaim?.ownerId != playerId) {
            return WarMovement.MovementBase(Eligibility.illegal("INVALID_SOURCE", WarMessages.INVALID_SOURCE))
        }
        if (targetClaim?.ownerId == playerId) {
            return WarMovement.MovementBase(Eligibility.illegal("FRIENDLY_TARGET", WarMessages.FRIENDLY_TARGET))
        }
        if (sourceClaim.soldiers < amount) {
            return WarMovement.MovementBase(
                Eligibility.illegal("INSUFFICIENT_SOLDIERS", WarMessages.INSUFFICIENT_SOLDIERS),
            )
        }
        return WarMovement.MovementBase(
            eligibility = Eligibility(true, "AVAILABLE"),
            sourceClaim = sourceClaim,
            targetClaim = targetClaim ?: Claim(),
            sourceRegion = room.region(sourceId),
            targetRegion = room.region(targetId),
        )
    }

    fun landAttackEligibility(
        room: Room,
        playerId: String,
        sourceId: String?,
        targetId: String?,
        amount: Int,
    ): WarMovement.MovementBase {
        val base = attackBase(room, playerId, sourceId, targetId, amount)
        if (!base.eligibility.legal) return base
        if (base.sourceRegion?.landNeighbors?.contains(targetId) != true) {
            return WarMovement.MovementBase(Eligibility.illegal("NOT_ADJACENT", WarMessages.NOT_ADJACENT))
        }
        return base
    }

    fun navalAttackEligibility(
        room: Room,
        playerId: String,
        sourceId: String?,
        targetId: String?,
        amount: Int,
    ): WarMovement.MovementBase {
        val naval = NavalPolicy.navalTargetEligibility(room, playerId, "attack", sourceId, targetId, amount)
        return WarMovement.MovementBase(
            eligibility = naval.eligibility,
            sourceClaim = naval.sourceClaim,
            targetClaim = naval.targetClaim,
            sourceRegion = naval.sourceRegion,
            targetRegion = naval.targetRegion,
        )
    }

    fun attackEligibility(
        room: Room,
        playerId: String,
        sourceId: String?,
        targetId: String?,
        amount: Int,
        naval: Boolean,
    ): WarMovement.MovementBase = if (naval) {
        navalAttackEligibility(room, playerId, sourceId, targetId, amount)
    } else {
        landAttackEligibility(room, playerId, sourceId, targetId, amount)
    }

    fun applyAttack(
        room: Room,
        playerId: String,
        sourceId: String,
        targetId: String,
        amount: Int,
        naval: Boolean,
    ): RoomResult {
        val base = attackEligibility(room, playerId, sourceId, targetId, amount, naval)
        if (!base.eligibility.legal) return RoomResult(room, base.eligibility)

        val sourceClaim = base.sourceClaim!!
        val targetClaim = base.targetClaim ?: Claim()
        val previousOwnerId = targetClaim.ownerId
        val result = resolveDeterministicCombat(amount, targetClaim.soldiers)!!

        val claims = room.claims +
            (sourceId to sourceClaim.copy(soldiers = sourceClaim.soldiers - amount)) +
            (
                targetId to targetClaim.copy(
                    ownerId = if (result.captured) playerId else previousOwnerId,
                    soldiers = if (result.captured) result.attackersRemaining else result.defendersRemaining,
                    ships = if (result.captured) 0 else targetClaim.ships,
                )
                )

        var players = room.players
        if (result.captured) {
            val attacker = players[playerId]
            if (attacker != null) {
                players = players + (
                    playerId to attacker.copy(
                        regionIds = (attacker.regionIds + targetId).distinct(),
                    )
                    )
            }
            if (previousOwnerId != null && players[previousOwnerId] != null) {
                val loser = players.getValue(previousOwnerId)
                players = players + (
                    previousOwnerId to loser.copy(
                        regionIds = loser.regionIds.filter { it != targetId },
                    )
                    )
            }
            players[playerId]?.let { updated ->
                players = players + (
                    playerId to updated.copy(
                        income = Economy.calculateIncome(room.mapDefinition, claims, playerId),
                    )
                    )
            }
            if (previousOwnerId != null) {
                players[previousOwnerId]?.let { updated ->
                    players = players + (
                        previousOwnerId to updated.copy(
                            income = Economy.calculateIncome(room.mapDefinition, claims, previousOwnerId),
                        )
                        )
                }
            }
        }

        return RoomResult(
            room = room.copy(claims = claims, players = players),
            eligibility = base.eligibility.copy(previousOwnerId = previousOwnerId, combat = result),
        )
    }
}
