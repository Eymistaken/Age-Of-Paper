package com.ageofpaper.core.model

import com.ageofpaper.core.Constants
import com.ageofpaper.core.rules.Phases
import com.ageofpaper.core.rules.Pricing
import com.ageofpaper.core.rules.WarConstants

data class MapIssue(
    val code: String,
    val message: String,
    val regionId: String? = null,
    val severity: String = "error",
)

data class Region(
    val id: String,
    val name: String,
    val price: Long,
    val income: Long,
    val bounds: Bounds? = null,
    val landNeighbors: List<String> = emptyList(),
    val claimNeighbors: List<String> = emptyList(),
    val seaNeighbors: List<String> = emptyList(),
    val coastal: Boolean = false,
    val coastType: String? = null,
    val portAllowed: Boolean? = null,
    val terrainType: String? = null,
)

data class MapDefinition(
    val version: Int = 1,
    val pricingVersion: Int = Pricing.PRICING_VERSION,
    val geometryVersion: Int = 2,
    val boundsSpace: String = "viewBox",
    val terrainSchemaVersion: Int? = null,
    val analysisAlgorithmVersion: String? = null,
    val navalPolicy: String? = null,
    val allowedRoutes: List<String> = emptyList(),
    val blockedRoutes: List<String> = emptyList(),
    val viewBox: ViewBox? = null,
    val regions: List<Region> = emptyList(),
    val pricingSummary: Pricing.EconomySummary? = null,
    val importIssues: List<MapIssue> = emptyList(),
) {
    val regionIds: List<String> get() = regions.map { it.id }
    val regionsById: Map<String, Region> by lazy(LazyThreadSafetyMode.NONE) { regions.associateBy { it.id } }
}

data class ValidationResult(
    val valid: Boolean,
    val errors: List<MapIssue> = emptyList(),
    val warnings: List<MapIssue> = emptyList(),
    val regionCount: Int = 0,
    val pricingSummary: Pricing.EconomySummary? = null,
)

/** Content addressed pointer to the map assets stored beside the room. */
data class MapManifest(
    val version: Int = 1,
    val mapId: String = "",
    val displayName: String = "",
    val revision: Int = 1,
    val baseSvgHash: String = "",
    val metadataHash: String = "",
    val metadataSchemaVersion: Int = 2,
    val analysisAlgorithmVersion: String = "",
    val mapDefinitionVersion: Int = 1,
) {
    val valid: Boolean
        get() = mapId.isNotEmpty() && baseSvgHash.isNotEmpty() && metadataHash.isNotEmpty()
}

data class Claim(
    val ownerId: String? = null,
    val claimedAtTurn: Int = 0,
    val soldiers: Int = 0,
    val hasPort: Boolean = false,
    val ships: Int = 0,
)

data class Player(
    val id: String,
    val name: String,
    val color: String,
    val money: Long = Constants.STARTING_MONEY,
    val income: Long = Constants.BASE_INCOME,
    val regionIds: List<String> = emptyList(),
    val joinedAt: Long = 0L,
    val lastActive: Long = 0L,
    val lastIncomeTurn: Int = 0,
    val eliminated: Boolean = false,
)

data class ChatMessage(
    val id: String,
    val senderId: String,
    val name: String,
    val color: String,
    val text: String,
    val createdAt: Long,
)

object JoinRequestStatus {
    const val PENDING = "pending"
    const val ACCEPTED = "accepted"
    const val REJECTED = "rejected"
    const val CANCELLED = "cancelled"
    const val EXPIRED = "expired"
}

data class JoinRequest(
    val uid: String,
    val name: String,
    val createdAt: Long,
    val expiresAt: Long,
    val updatedAt: Long,
    val status: String = JoinRequestStatus.PENDING,
    val requiredVoterIds: List<String> = emptyList(),
    val approvals: Map<String, Boolean> = emptyMap(),
    val rejections: Map<String, Boolean> = emptyMap(),
    val decisionAt: Long? = null,
    val decidedBy: String? = null,
)

data class JoinRequestAction(
    val type: String,
    val actorId: String,
    val requesterId: String,
    val at: Long,
)

data class LastAction(
    val id: String,
    val type: String,
    val actorId: String,
    val regionId: String? = null,
    val targetId: String? = null,
    val amount: Int = 0,
    val turnNumber: Int = 0,
    val at: Long = 0L,
)

data class Room(
    val code: String = "",
    val schemaVersion: Int = WarConstants.WAR_SCHEMA_VERSION,
    val phase: String = Phases.LOBBY,
    val hostId: String = "",
    val createdAt: Long = 0L,
    val mapSvg: String = "",
    val mapManifest: MapManifest? = null,
    val mapDefinition: MapDefinition? = null,
    val mapValidation: ValidationResult? = null,
    val players: Map<String, Player> = emptyMap(),
    val turnOrder: List<String> = emptyList(),
    val turnIndex: Int = 0,
    val turnNumber: Int = 0,
    val roundNumber: Int = 0,
    val claims: Map<String, Claim> = emptyMap(),
    val chat: List<ChatMessage> = emptyList(),
    val lastAction: LastAction? = null,
    val joinRequests: Map<String, JoinRequest> = emptyMap(),
    val joinRequestAction: JoinRequestAction? = null,
    val mobilizationTurnsRemaining: Int = 0,
    val mobilizationPending: List<String> = emptyList(),
    val winnerId: String? = null,
    val completedAt: Long? = null,
) {
    val activePlayerId: String? get() = turnOrder.getOrNull(turnIndex)

    fun region(regionId: String?): Region? =
        if (regionId == null) null else mapDefinition?.regionsById?.get(regionId)

    fun claim(regionId: String?): Claim? = if (regionId == null) null else claims[regionId]

    fun isActive(playerId: String?): Boolean = playerId != null && activePlayerId == playerId
}

data class Eligibility(
    val legal: Boolean,
    val code: String,
    val reason: String? = null,
    val region: Region? = null,
    val income: Long = 0L,
    val cost: Long = 0L,
    val incomeGranted: Long = 0L,
    val shipsNeeded: Int = 0,
    val path: List<String>? = null,
    val previousOwnerId: String? = null,
    val combat: CombatResult? = null,
) {
    companion object {
        fun illegal(code: String, reason: String) = Eligibility(false, code, reason)
        fun legal(code: String = "AVAILABLE", reason: String? = null) = Eligibility(true, code, reason)
    }
}

data class CombatResult(
    val captured: Boolean,
    val attackersRemaining: Int,
    val defendersRemaining: Int,
)

data class RoomResult(val room: Room, val eligibility: Eligibility)
