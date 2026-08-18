package com.ageofpaper.core.rules

import com.ageofpaper.core.Constants
import com.ageofpaper.core.model.Claim
import com.ageofpaper.core.model.MapDefinition

/** Port of `src/game/economy.js`. */
object Economy {

    fun safeMoney(value: Long?): Long = if (value != null && value >= 0) value else 0L

    fun calculateIncome(
        mapDefinition: MapDefinition?,
        claims: Map<String, Claim>,
        playerId: String?,
    ): Long {
        val regionsById = mapDefinition?.regionsById.orEmpty()
        return claims.entries.fold(Constants.BASE_INCOME) { total, (regionId, claim) ->
            if (claim.ownerId != playerId) {
                total
            } else {
                val income = regionsById[regionId]?.income
                total + if (income != null && income >= 0) income else 0L
            }
        }
    }
}
