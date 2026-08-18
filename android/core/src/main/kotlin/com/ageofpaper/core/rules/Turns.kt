package com.ageofpaper.core.rules

import com.ageofpaper.core.model.Room

/** Port of `src/game/turns.js`. */
object Turns {

    fun activePlayerId(room: Room): String? = room.turnOrder.getOrNull(room.turnIndex)

    fun advanceTurn(room: Room): Room {
        val order = room.turnOrder
        if (order.isEmpty()) return room.copy(turnIndex = 0)
        val currentIndex = room.turnIndex.coerceIn(0, order.size - 1)
        val nextIndex = (currentIndex + 1) % order.size
        return room.copy(
            turnIndex = nextIndex,
            turnNumber = maxOf(1, room.turnNumber) + 1,
            roundNumber = maxOf(1, room.roundNumber) + if (nextIndex == 0) 1 else 0,
        )
    }

    data class Removal(val room: Room, val activePlayerChanged: Boolean)

    fun removePlayerFromTurnState(room: Room, playerId: String): Removal {
        val oldOrder = room.turnOrder
        val removedIndex = oldOrder.indexOf(playerId)
        if (removedIndex < 0) return Removal(room, false)

        val oldIndex = room.turnIndex.coerceIn(0, maxOf(0, oldOrder.size - 1))
        val wasActive = removedIndex == oldIndex
        val newOrder = oldOrder.filter { it != playerId }
        if (newOrder.isEmpty()) {
            return Removal(room.copy(turnOrder = emptyList(), turnIndex = 0), wasActive)
        }

        var turnIndex = oldIndex
        if (removedIndex < oldIndex) turnIndex -= 1
        if (turnIndex >= newOrder.size) turnIndex = 0
        val wrapped = wasActive && removedIndex == oldOrder.size - 1

        return Removal(
            room.copy(
                turnOrder = newOrder,
                turnIndex = turnIndex,
                turnNumber = if (wasActive) maxOf(1, room.turnNumber) + 1 else room.turnNumber,
                roundNumber = if (wrapped) maxOf(1, room.roundNumber) + 1 else room.roundNumber,
            ),
            wasActive,
        )
    }
}
