package com.ageofpaper.core.rules

import com.ageofpaper.core.model.Eligibility
import com.ageofpaper.core.model.MapDefinition
import com.ageofpaper.core.model.Region
import com.ageofpaper.core.model.Room
import com.ageofpaper.core.model.RoomResult

/** Port of `src/game/warEconomy.js`. */
object WarEconomy {

    enum class Purchase { SOLDIERS, PORT, SHIPS }

    fun isWarTurnPhase(phase: String?): Boolean =
        phase == Phases.MOBILIZATION || phase == Phases.WAR

    fun canBuildPort(region: Region?, mapDefinition: MapDefinition?): Boolean {
        val policy = NavalPolicy.normalizeConfig(mapDefinition, NavalPolicy.SELECTED_ROUTES).navalPolicy
        return policy != NavalPolicy.DISABLED &&
            NavalPolicy.isFinalCoastalLand(region) &&
            (region?.portAllowed == null || region.portAllowed == true)
    }

    data class IncomeGrant(val room: Room, val granted: Long, val due: Boolean)

    /**
     * Income is granted at most once per `turnNumber`, tracked with
     * `lastIncomeTurn`. Every logistics or operation transaction must call this.
     */
    fun grantTurnIncome(room: Room, playerId: String? = room.activePlayerId): IncomeGrant {
        val player = playerId?.let { room.players[it] }
        if (!isWarTurnPhase(room.phase) || player == null || player.eliminated || playerId != room.activePlayerId) {
            return IncomeGrant(room, 0L, false)
        }
        if (player.lastIncomeTurn >= room.turnNumber) return IncomeGrant(room, 0L, false)
        val income = Economy.calculateIncome(room.mapDefinition, room.claims, playerId)
        return IncomeGrant(
            room = room.copy(
                players = room.players + (
                    playerId to player.copy(
                        money = Economy.safeMoney(player.money) + income,
                        income = income,
                        lastIncomeTurn = room.turnNumber,
                    )
                    ),
            ),
            granted = income,
            due = true,
        )
    }

    private data class LogisticsBase(
        val eligibility: Eligibility,
        val room: Room,
        val region: Region? = null,
    )

    private fun logisticsBase(room: Room, playerId: String, regionId: String): LogisticsBase {
        if (!isWarTurnPhase(room.phase)) {
            return LogisticsBase(Eligibility.illegal("WRONG_PHASE", WarMessages.LOGISTICS_WRONG_PHASE), room)
        }
        if (room.activePlayerId != playerId) {
            return LogisticsBase(Eligibility.illegal("NOT_ACTIVE", WarMessages.NOT_ACTIVE), room)
        }
        val player = room.players[playerId]
        if (player == null || player.eliminated) {
            return LogisticsBase(Eligibility.illegal("ELIMINATED", WarMessages.ELIMINATED_ORDER), room)
        }
        val claim = room.claims[regionId]
        if (claim == null || claim.ownerId != playerId) {
            return LogisticsBase(Eligibility.illegal("NOT_OWNED", WarMessages.NOT_OWNED), room)
        }
        val region = room.region(regionId)
            ?: return LogisticsBase(Eligibility.illegal("UNKNOWN_REGION", WarMessages.UNKNOWN_REGION), room)
        return LogisticsBase(Eligibility(true, "AVAILABLE"), room, region)
    }

    private fun purchase(
        room: Room,
        playerId: String,
        regionId: String,
        kind: Purchase,
        count: Int,
    ): RoomResult {
        val paid = grantTurnIncome(room, playerId).room
        val base = logisticsBase(paid, playerId, regionId)
        if (!base.eligibility.legal) return RoomResult(room, base.eligibility)
        if (count <= 0) {
            return RoomResult(room, Eligibility.illegal("INVALID_COUNT", WarMessages.INVALID_COUNT))
        }
        val unitCost = when (kind) {
            Purchase.SOLDIERS -> WarConstants.SOLDIER_COST
            Purchase.PORT -> WarConstants.PORT_COST
            Purchase.SHIPS -> WarConstants.SHIP_COST
        }
        val cost = unitCost * count
        val player = paid.players.getValue(playerId)
        val claim = paid.claims.getValue(regionId)
        val region = base.region!!
        if (Economy.safeMoney(player.money) < cost) {
            return RoomResult(room, Eligibility.illegal("INSUFFICIENT_FUNDS", WarMessages.INSUFFICIENT_FUNDS))
        }
        val policy = NavalPolicy.normalizeConfig(paid.mapDefinition, NavalPolicy.SELECTED_ROUTES).navalPolicy
        if ((kind == Purchase.PORT || kind == Purchase.SHIPS) && policy == NavalPolicy.DISABLED) {
            return RoomResult(room, Eligibility.illegal("NAVAL_DISABLED", NavalPolicy.Messages.NAVAL_DISABLED))
        }
        if (kind == Purchase.PORT && (!canBuildPort(region, paid.mapDefinition) || claim.hasPort)) {
            val code = when {
                claim.hasPort -> "HAS_PORT"
                NavalPolicy.isFinalCoastalLand(region) -> "PORT_NOT_ALLOWED"
                else -> "NOT_COASTAL"
            }
            val reason = when {
                claim.hasPort -> WarMessages.HAS_PORT
                NavalPolicy.isFinalCoastalLand(region) -> WarMessages.PORT_NOT_ALLOWED
                else -> WarMessages.NOT_COASTAL
            }
            return RoomResult(room, Eligibility.illegal(code, reason))
        }
        if (kind == Purchase.SHIPS &&
            (!NavalPolicy.isFinalCoastalLand(region) || region.portAllowed == false || !claim.hasPort)
        ) {
            return RoomResult(room, Eligibility.illegal("PORT_REQUIRED", WarMessages.SHIP_PORT_REQUIRED))
        }

        val nextClaim = when (kind) {
            Purchase.SOLDIERS -> claim.copy(soldiers = claim.soldiers + WarConstants.SOLDIER_BATCH * count)
            Purchase.PORT -> claim.copy(hasPort = true)
            Purchase.SHIPS -> claim.copy(ships = claim.ships + count)
        }
        val incomeGranted = player.money - Economy.safeMoney(room.players[playerId]?.money)
        return RoomResult(
            room = paid.copy(
                players = paid.players + (playerId to player.copy(money = player.money - cost)),
                claims = paid.claims + (regionId to nextClaim),
            ),
            eligibility = Eligibility(true, "AVAILABLE", cost = cost, incomeGranted = incomeGranted),
        )
    }

    fun applyRecruitSoldiers(room: Room, playerId: String, regionId: String, batches: Int): RoomResult =
        purchase(room, playerId, regionId, Purchase.SOLDIERS, batches)

    fun applyBuildPort(room: Room, playerId: String, regionId: String): RoomResult =
        purchase(room, playerId, regionId, Purchase.PORT, 1)

    fun applyBuyShips(room: Room, playerId: String, regionId: String, count: Int): RoomResult =
        purchase(room, playerId, regionId, Purchase.SHIPS, count)
}
