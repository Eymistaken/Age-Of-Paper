package com.ageofpaper.core.rules

import com.ageofpaper.core.model.Claim
import com.ageofpaper.core.model.Eligibility
import com.ageofpaper.core.model.MapDefinition
import com.ageofpaper.core.model.Room
import com.ageofpaper.core.model.RoomResult

/** Port of `src/game/rules.js`. */
object ClaimRules {

    object Reasons {
        const val AVAILABLE = "Bu tarafsız bölge satın alınabilir."
        const val COMPLETE = "Toprak edinme evresi tamamlandı."
        const val NOT_CLAIMING = "Toprak yalnızca edinme evresinde satın alınabilir."
        const val NOT_ACTIVE = "Satın almak için kendi sıranı beklemelisin."
        const val UNKNOWN_REGION = "Bu bölge harita tanımında bulunmuyor."
        const val OCCUPIED = "Bu bölge başka bir komutanın yönetiminde."
        const val NOT_CONNECTED = "Yeni bölge mevcut ülkenin claim sınırına bağlı olmalı."
        const val INSUFFICIENT_FUNDS = "Bu bölge için hazinende yeterli altın yok."
    }

    fun ownedRegionIds(claims: Map<String, Claim>, playerId: String?): List<String> =
        claims.entries.filter { it.value.ownerId == playerId }.map { it.key }

    fun legalClaims(
        mapDefinition: MapDefinition?,
        claims: Map<String, Claim>,
        playerId: String?,
    ): List<String> {
        val byId = mapDefinition?.regionsById.orEmpty()
        val owned = ownedRegionIds(claims, playerId).toSet()
        val neutralIds = (mapDefinition?.regionIds ?: byId.keys.toList())
            .filter { claims[it]?.ownerId == null }
        if (owned.isEmpty()) return neutralIds
        return neutralIds.filter { id ->
            byId[id]?.claimNeighbors?.any { owned.contains(it) } == true
        }
    }

    fun claimEligibility(
        phase: String,
        mapDefinition: MapDefinition?,
        claims: Map<String, Claim>,
        playerId: String?,
        regionId: String?,
        money: Long?,
        isActive: Boolean,
    ): Eligibility {
        if (phase == Phases.CLAIM_COMPLETE) return Eligibility.illegal("COMPLETE", Reasons.COMPLETE)
        if (phase != Phases.CLAIMING) return Eligibility.illegal("NOT_CLAIMING", Reasons.NOT_CLAIMING)
        if (!isActive) return Eligibility.illegal("NOT_ACTIVE", Reasons.NOT_ACTIVE)
        val region = mapDefinition?.regionsById?.get(regionId)
            ?: return Eligibility.illegal("UNKNOWN_REGION", Reasons.UNKNOWN_REGION)
        if (claims[regionId]?.ownerId != null) return Eligibility.illegal("OCCUPIED", Reasons.OCCUPIED)
        if (!legalClaims(mapDefinition, claims, playerId).contains(regionId)) {
            return Eligibility.illegal("NOT_CONNECTED", Reasons.NOT_CONNECTED)
        }
        if (money == null || money < region.price) {
            return Eligibility.illegal("INSUFFICIENT_FUNDS", Reasons.INSUFFICIENT_FUNDS)
        }
        return Eligibility(true, "AVAILABLE", Reasons.AVAILABLE, region = region)
    }

    fun isMapFullyClaimed(mapDefinition: MapDefinition?, claims: Map<String, Claim>): Boolean {
        val regionIds = mapDefinition?.regionIds ?: emptyList()
        return regionIds.isNotEmpty() && regionIds.all { claims[it]?.ownerId != null }
    }

    fun releasePlayerClaims(claims: Map<String, Claim>, playerId: String): Map<String, Claim> =
        claims.filterValues { it.ownerId != playerId }

    fun applyClaim(room: Room, playerId: String, regionId: String): RoomResult {
        val player = room.players[playerId]
        val eligibility = claimEligibility(
            phase = room.phase,
            mapDefinition = room.mapDefinition,
            claims = room.claims,
            playerId = playerId,
            regionId = regionId,
            money = player?.money,
            isActive = room.activePlayerId == playerId,
        )
        if (!eligibility.legal || player == null) return RoomResult(room, eligibility)

        val region = eligibility.region!!
        val claims = room.claims + (regionId to Claim(ownerId = playerId, claimedAtTurn = room.turnNumber))
        val players = room.players + (
            playerId to player.copy(
                money = Economy.safeMoney(player.money) - region.price,
                income = Economy.calculateIncome(room.mapDefinition, claims, playerId),
                regionIds = player.regionIds + regionId,
            )
            )
        val complete = isMapFullyClaimed(room.mapDefinition, claims)
        val base = room.copy(claims = claims, players = players)
        val next = if (complete) {
            base.copy(phase = Phases.CLAIM_COMPLETE)
        } else {
            Turns.advanceTurn(base).copy(phase = Phases.CLAIMING)
        }
        return RoomResult(next, eligibility)
    }

    fun applySaveIncome(room: Room, playerId: String): RoomResult {
        if (room.phase != Phases.CLAIMING) {
            return RoomResult(room, Eligibility.illegal("PHASE_FROZEN", "Bu evrede para biriktirilemez."))
        }
        if (room.activePlayerId != playerId) {
            return RoomResult(room, Eligibility.illegal("NOT_ACTIVE", "Sıra sende değil."))
        }
        val player = room.players[playerId]
            ?: return RoomResult(room, Eligibility.illegal("NOT_PLAYER", "Odanın oyuncusu değilsin."))

        val income = Economy.calculateIncome(room.mapDefinition, room.claims, playerId)
        val advanced = Turns.advanceTurn(room)
        val next = advanced.copy(
            players = room.players + (
                playerId to player.copy(
                    money = Economy.safeMoney(player.money) + income,
                    income = income,
                    // Legacy compatibility only. Atomic turn advancement is the action lock.
                    lastIncomeTurn = room.turnNumber,
                )
                ),
        )
        return RoomResult(next, Eligibility(true, "AVAILABLE", income = income))
    }
}
