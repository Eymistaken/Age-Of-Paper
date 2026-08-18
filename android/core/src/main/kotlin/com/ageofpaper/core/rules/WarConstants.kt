package com.ageofpaper.core.rules

/** Port of `src/game/warConstants.js`. */
object WarConstants {
    const val SOLDIER_BATCH = 1000
    const val SOLDIER_COST = 10_000L
    const val PORT_COST = 30_000L
    const val SHIP_COST = 20_000L
    const val SHIP_CAPACITY = 1000
    const val INITIAL_REGION_SOLDIERS = 1000
    const val WAR_SCHEMA_VERSION = 4

    fun isSoldierAmount(value: Int): Boolean = value > 0 && value % SOLDIER_BATCH == 0

    /** Returns `Int.MAX_VALUE` for illegal amounts, mirroring the JS `Infinity`. */
    fun requiredShips(amount: Int): Int =
        if (isSoldierAmount(amount)) (amount + SHIP_CAPACITY - 1) / SHIP_CAPACITY else Int.MAX_VALUE
}
