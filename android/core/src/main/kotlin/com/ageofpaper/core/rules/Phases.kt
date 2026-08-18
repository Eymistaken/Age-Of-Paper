package com.ageofpaper.core.rules

/** Port of `src/game/phases.js`. */
object Phases {
    const val LOBBY = "lobby"
    const val CLAIMING = "claiming"
    const val CLAIM_COMPLETE = "claim_complete"
    const val MOBILIZATION = "mobilization"
    const val WAR = "war"
    const val FINISHED = "finished"

    val ALL = listOf(LOBBY, CLAIMING, CLAIM_COMPLETE, MOBILIZATION, WAR, FINISHED)

    private val TRANSITIONS: Map<String, List<String>> = mapOf(
        LOBBY to listOf(CLAIMING),
        CLAIMING to listOf(CLAIM_COMPLETE),
        CLAIM_COMPLETE to listOf(MOBILIZATION, FINISHED),
        MOBILIZATION to listOf(WAR, FINISHED),
        WAR to listOf(FINISHED),
        FINISHED to emptyList(),
    )

    fun canTransition(from: String?, to: String?): Boolean =
        TRANSITIONS[from]?.contains(to) ?: false

    /** Transitional rooms used a `status` field; combat data from those rooms is ignored. */
    fun resolve(phase: String?, status: String? = null): String {
        if (phase != null && ALL.contains(phase)) return phase
        if (status == "lobby") return LOBBY
        if (status == "playing") return CLAIMING
        return LOBBY
    }
}
