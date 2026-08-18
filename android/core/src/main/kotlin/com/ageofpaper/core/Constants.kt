package com.ageofpaper.core

/**
 * Port of `src/constants.js`. Values must stay identical to the web client so
 * both clients can share the same Firestore rooms.
 */
object Constants {
    val COLORS: List<String> = listOf(
        "#2F6FA3",
        "#A33A32",
        "#4F7A45",
        "#C89B3C",
        "#6B4C9A",
        "#2A7F78",
        "#C56A2D",
        "#9B4F7A",
        "#5F6B73",
        "#7A5132",
    )

    const val MAX_PLAYERS = 10
    const val MAX_JOIN_REQUESTS = 20
    const val JOIN_REQUEST_TTL = 10L * 60L * 1000L
    const val STARTING_MONEY = 0L
    const val BASE_INCOME = 5000L
    const val HEARTBEAT_INTERVAL = 20_000L
    const val PRESENCE_OFFLINE_TIMEOUT = 90_000L
    const val OFFLINE_SKIP_TIMEOUT = 120_000L
    const val CHAT_MESSAGE_LIMIT = 160
    const val CHAT_HISTORY_LIMIT = 80
    const val ROOM_CODE_LENGTH = 4
}
