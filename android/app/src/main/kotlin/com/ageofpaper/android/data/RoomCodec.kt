package com.ageofpaper.android.data

import com.ageofpaper.core.model.Bounds
import com.ageofpaper.core.model.ChatMessage
import com.ageofpaper.core.model.Claim
import com.ageofpaper.core.model.JoinRequest
import com.ageofpaper.core.model.JoinRequestAction
import com.ageofpaper.core.model.LastAction
import com.ageofpaper.core.model.MapDefinition
import com.ageofpaper.core.model.MapIssue
import com.ageofpaper.core.model.MapManifest
import com.ageofpaper.core.model.Player
import com.ageofpaper.core.model.Region
import com.ageofpaper.core.model.Room
import com.ageofpaper.core.model.ValidationResult
import com.ageofpaper.core.model.ViewBox
import com.ageofpaper.core.rules.Phases
import com.ageofpaper.core.rules.Pricing
import com.ageofpaper.core.rules.WarConstants
import com.google.firebase.Timestamp

/**
 * Translates between the Firestore document shape written by the web client and
 * the `core` model.
 *
 * Two Firestore constraints shape this file: nested arrays are not allowed (so
 * naval routes travel as `first::second` strings), and timestamps arrive either
 * as [Timestamp] or as a plain number depending on which client wrote them.
 */
object RoomCodec {

    fun millis(value: Any?): Long = when (value) {
        is Timestamp -> value.toDate().time
        is Number -> value.toLong()
        is java.util.Date -> value.time
        else -> 0L
    }

    private fun long(value: Any?, fallback: Long = 0L): Long =
        (value as? Number)?.toLong() ?: fallback

    private fun int(value: Any?, fallback: Int = 0): Int =
        (value as? Number)?.toInt() ?: fallback

    private fun double(value: Any?): Double? = (value as? Number)?.toDouble()

    private fun bool(value: Any?, fallback: Boolean = false): Boolean = value as? Boolean ?: fallback

    private fun string(value: Any?): String? = value as? String

    @Suppress("UNCHECKED_CAST")
    private fun map(value: Any?): Map<String, Any?> = (value as? Map<String, Any?>) ?: emptyMap()

    @Suppress("UNCHECKED_CAST")
    private fun list(value: Any?): List<Any?> = (value as? List<Any?>) ?: emptyList()

    private fun stringList(value: Any?): List<String> = list(value).mapNotNull { it as? String }

    fun decodeRoom(code: String, data: Map<String, Any?>?): Room? {
        if (data == null) return null
        return Room(
            code = code,
            schemaVersion = int(data["schemaVersion"], WarConstants.WAR_SCHEMA_VERSION),
            phase = Phases.resolve(string(data["phase"]), string(data["status"])),
            hostId = string(data["hostId"]).orEmpty(),
            createdAt = millis(data["createdAt"]),
            mapSvg = string(data["mapSvg"]).orEmpty(),
            mapManifest = decodeManifest(data["mapManifest"]),
            mapDefinition = decodeMapDefinition(data["mapDefinition"]),
            mapValidation = decodeValidation(data["mapValidation"]),
            players = map(data["players"]).mapNotNull { (id, value) ->
                decodePlayer(id, map(value))?.let { id to it }
            }.toMap(),
            turnOrder = stringList(data["turnOrder"]),
            turnIndex = int(data["turnIndex"]),
            turnNumber = int(data["turnNumber"]),
            roundNumber = int(data["roundNumber"]),
            claims = map(data["claims"]).mapValues { (_, value) -> decodeClaim(map(value)) },
            chat = list(data["chat"]).map { decodeChat(map(it)) },
            lastAction = decodeLastAction(data["lastAction"]),
            joinRequests = map(data["joinRequests"]).mapNotNull { (id, value) ->
                decodeJoinRequest(id, map(value))?.let { id to it }
            }.toMap(),
            joinRequestAction = map(data["joinRequestAction"]).takeIf { it.isNotEmpty() }?.let {
                JoinRequestAction(
                    type = string(it["type"]).orEmpty(),
                    actorId = string(it["actorId"]).orEmpty(),
                    requesterId = string(it["requesterId"]).orEmpty(),
                    at = millis(it["at"]),
                )
            },
            mobilizationTurnsRemaining = int(data["mobilizationTurnsRemaining"]),
            mobilizationPending = stringList(data["mobilizationPending"]),
            winnerId = string(data["winnerId"]),
            completedAt = data["completedAt"]?.let { millis(it) },
        )
    }

    private fun decodePlayer(id: String, data: Map<String, Any?>): Player? {
        if (data.isEmpty()) return null
        return Player(
            id = string(data["id"]) ?: id,
            name = string(data["name"]).orEmpty(),
            color = string(data["color"]).orEmpty(),
            money = long(data["money"]),
            income = long(data["income"]),
            regionIds = stringList(data["regionIds"]),
            joinedAt = millis(data["joinedAt"]),
            lastActive = millis(data["lastActive"]),
            lastIncomeTurn = int(data["lastIncomeTurn"]),
            eliminated = bool(data["eliminated"]),
        )
    }

    private fun decodeClaim(data: Map<String, Any?>): Claim = Claim(
        ownerId = string(data["ownerId"]),
        claimedAtTurn = int(data["claimedAtTurn"]),
        soldiers = int(data["soldiers"]),
        hasPort = bool(data["hasPort"]),
        ships = int(data["ships"]),
    )

    private fun decodeChat(data: Map<String, Any?>): ChatMessage = ChatMessage(
        id = string(data["id"]).orEmpty(),
        senderId = string(data["senderId"]).orEmpty(),
        name = string(data["senderName"]).orEmpty(),
        color = string(data["senderColor"]).orEmpty(),
        text = string(data["text"]).orEmpty(),
        createdAt = millis(data["createdAt"]),
    )

    private fun decodeLastAction(value: Any?): LastAction? {
        val data = map(value).takeIf { it.isNotEmpty() } ?: return null
        return LastAction(
            id = string(data["actionId"]).orEmpty(),
            type = string(data["type"]).orEmpty(),
            actorId = string(data["actorId"]).orEmpty(),
            regionId = string(data["regionId"]),
            targetId = string(data["targetId"]),
            amount = int(data["amount"]),
            turnNumber = int(data["turnNumber"]),
            at = millis(data["at"]),
        )
    }

    private fun decodeJoinRequest(id: String, data: Map<String, Any?>): JoinRequest? {
        if (data.isEmpty()) return null
        return JoinRequest(
            uid = string(data["uid"]) ?: id,
            name = string(data["name"]).orEmpty(),
            createdAt = millis(data["createdAt"]),
            expiresAt = millis(data["expiresAt"]),
            updatedAt = millis(data["updatedAt"]),
            status = string(data["status"]).orEmpty(),
            requiredVoterIds = stringList(data["requiredVoterIds"]),
            approvals = map(data["approvals"]).mapValues { bool(it.value) },
            rejections = map(data["rejections"]).mapValues { bool(it.value) },
            decisionAt = data["decisionAt"]?.let { millis(it) },
            decidedBy = string(data["decidedBy"]),
        )
    }

    private fun decodeManifest(value: Any?): MapManifest? {
        val data = map(value).takeIf { it.isNotEmpty() } ?: return null
        return MapManifest(
            version = int(data["version"], 1),
            mapId = string(data["mapId"]).orEmpty(),
            displayName = string(data["displayName"]).orEmpty(),
            revision = int(data["revision"], 1),
            baseSvgHash = string(data["baseSvgHash"]).orEmpty(),
            metadataHash = string(data["metadataHash"]).orEmpty(),
            metadataSchemaVersion = int(data["metadataSchemaVersion"], 2),
            analysisAlgorithmVersion = string(data["analysisAlgorithmVersion"]).orEmpty(),
            mapDefinitionVersion = int(data["mapDefinitionVersion"], 1),
        )
    }

    private fun decodeBounds(value: Any?): Bounds? {
        val data = map(value).takeIf { it.isNotEmpty() } ?: return null
        return Bounds(
            double(data["x"]) ?: return null,
            double(data["y"]) ?: return null,
            double(data["width"]) ?: return null,
            double(data["height"]) ?: return null,
        )
    }

    fun decodeMapDefinition(value: Any?): MapDefinition? {
        val data = map(value).takeIf { it.isNotEmpty() } ?: return null
        val regions = list(data["regions"]).map { decodeRegion(map(it)) }
        return MapDefinition(
            version = int(data["version"], 1),
            pricingVersion = int(data["pricingVersion"], Pricing.PRICING_VERSION),
            geometryVersion = int(data["geometryVersion"], 2),
            boundsSpace = string(data["boundsSpace"]) ?: "viewBox",
            terrainSchemaVersion = (data["terrainSchemaVersion"] as? Number)?.toInt(),
            analysisAlgorithmVersion = string(data["analysisAlgorithmVersion"]),
            navalPolicy = string(data["navalPolicy"]),
            allowedRoutes = stringList(data["allowedRoutes"]),
            blockedRoutes = stringList(data["blockedRoutes"]),
            viewBox = map(data["viewBox"]).takeIf { it.isNotEmpty() }?.let {
                ViewBox(
                    double(it["x"]) ?: 0.0,
                    double(it["y"]) ?: 0.0,
                    double(it["width"]) ?: 1000.0,
                    double(it["height"]) ?: 1000.0,
                )
            },
            regions = regions,
            pricingSummary = map(data["pricingSummary"]).takeIf { it.isNotEmpty() }?.let {
                Pricing.EconomySummary(
                    minPrice = long(it["minPrice"]),
                    medianPrice = double(it["medianPrice"]) ?: 0.0,
                    maxPrice = long(it["maxPrice"]),
                    minIncome = long(it["minIncome"]),
                    maxIncome = long(it["maxIncome"]),
                )
            },
            importIssues = list(data["importIssues"]).map { decodeIssue(map(it)) },
        )
    }

    private fun decodeRegion(data: Map<String, Any?>): Region = Region(
        id = string(data["id"]).orEmpty(),
        name = string(data["name"]).orEmpty(),
        price = long(data["price"]),
        income = long(data["income"]),
        bounds = decodeBounds(data["bounds"]),
        landNeighbors = stringList(data["landNeighbors"]),
        claimNeighbors = stringList(data["claimNeighbors"]),
        seaNeighbors = stringList(data["seaNeighbors"]),
        coastal = bool(data["coastal"]),
        coastType = string(data["coastType"]),
        portAllowed = data["portAllowed"] as? Boolean,
        terrainType = string(data["terrainType"]),
    )

    private fun decodeIssue(data: Map<String, Any?>): MapIssue = MapIssue(
        code = string(data["code"]).orEmpty(),
        message = string(data["message"]).orEmpty(),
        regionId = string(data["regionId"]),
        severity = string(data["severity"]) ?: "error",
    )

    private fun decodeValidation(value: Any?): ValidationResult? {
        val data = map(value).takeIf { it.isNotEmpty() } ?: return null
        return ValidationResult(
            valid = bool(data["valid"]),
            errors = list(data["errors"]).map { decodeIssue(map(it)) },
            warnings = list(data["warnings"]).map { decodeIssue(map(it)) },
            regionCount = int(data["regionCount"]),
        )
    }

    // ---------------------------------------------------------------- encode

    fun encodePlayer(player: Player, joinedAt: Any? = null, lastActive: Any? = null): Map<String, Any?> = mapOf(
        "id" to player.id,
        "name" to player.name,
        "color" to player.color,
        "money" to player.money,
        "income" to player.income,
        "regionIds" to player.regionIds,
        "joinedAt" to (joinedAt ?: Timestamp(java.util.Date(player.joinedAt))),
        "lastActive" to (lastActive ?: Timestamp(java.util.Date(player.lastActive))),
        "lastIncomeTurn" to player.lastIncomeTurn,
        "eliminated" to player.eliminated,
    )

    fun encodeClaim(claim: Claim): Map<String, Any?> = mapOf(
        "ownerId" to claim.ownerId,
        "claimedAtTurn" to claim.claimedAtTurn,
        "soldiers" to claim.soldiers,
        "hasPort" to claim.hasPort,
        "ships" to claim.ships,
    )

    fun encodeChat(message: ChatMessage): Map<String, Any?> = mapOf(
        "id" to message.id,
        "senderId" to message.senderId,
        "senderName" to message.name,
        "senderColor" to message.color,
        "text" to message.text,
        "createdAt" to message.createdAt,
    )

    fun encodeJoinRequest(request: JoinRequest): Map<String, Any?> = mapOf(
        "uid" to request.uid,
        "name" to request.name,
        "createdAt" to Timestamp(java.util.Date(request.createdAt)),
        "expiresAt" to Timestamp(java.util.Date(request.expiresAt)),
        "updatedAt" to Timestamp(java.util.Date(request.updatedAt)),
        "status" to request.status,
        "requiredVoterIds" to request.requiredVoterIds,
        "approvals" to request.approvals,
        "rejections" to request.rejections,
        "decisionAt" to request.decisionAt?.let { Timestamp(java.util.Date(it)) },
        "decidedBy" to request.decidedBy,
    )

    fun encodeManifest(manifest: com.ageofpaper.core.svg.MapAssets.Manifest): Map<String, Any?> = mapOf(
        "version" to manifest.version,
        "mapId" to manifest.mapId,
        "displayName" to manifest.displayName,
        "revision" to manifest.revision,
        "baseSvgHash" to manifest.baseSvgHash,
        "metadataHash" to manifest.metadataHash,
        "metadataSchemaVersion" to manifest.metadataSchemaVersion,
        "analysisAlgorithmVersion" to manifest.analysisAlgorithmVersion,
        "mapDefinitionVersion" to manifest.mapDefinitionVersion,
    )

    fun encodeMapDefinition(definition: MapDefinition): Map<String, Any?> = mapOf(
        "version" to definition.version,
        "pricingVersion" to definition.pricingVersion,
        "geometryVersion" to definition.geometryVersion,
        "boundsSpace" to definition.boundsSpace,
        "terrainSchemaVersion" to definition.terrainSchemaVersion,
        "analysisAlgorithmVersion" to definition.analysisAlgorithmVersion,
        "navalPolicy" to definition.navalPolicy,
        // Firestore rejects nested arrays, so pairs travel as `first::second`.
        "allowedRoutes" to definition.allowedRoutes,
        "blockedRoutes" to definition.blockedRoutes,
        "viewBox" to definition.viewBox?.let {
            mapOf("x" to it.x, "y" to it.y, "width" to it.width, "height" to it.height)
        },
        "regionIds" to definition.regionIds,
        "regions" to definition.regions.map { encodeRegion(it) },
        "regionsById" to definition.regions.associate { it.id to encodeRegion(it) },
        "pricingSummary" to definition.pricingSummary?.let {
            mapOf(
                "minPrice" to it.minPrice,
                "medianPrice" to it.medianPrice,
                "maxPrice" to it.maxPrice,
                "minIncome" to it.minIncome,
                "maxIncome" to it.maxIncome,
            )
        },
        "importIssues" to definition.importIssues.map { encodeIssue(it) },
    )

    private fun encodeRegion(region: Region): Map<String, Any?> = mapOf(
        "id" to region.id,
        "name" to region.name,
        "price" to region.price,
        "income" to region.income,
        "bounds" to region.bounds?.let {
            mapOf("x" to it.x, "y" to it.y, "width" to it.width, "height" to it.height)
        },
        "landNeighbors" to region.landNeighbors,
        "claimNeighbors" to region.claimNeighbors,
        "seaNeighbors" to region.seaNeighbors,
        "coastal" to region.coastal,
        "coastType" to region.coastType,
        "portAllowed" to region.portAllowed,
    )

    private fun encodeIssue(issue: MapIssue): Map<String, Any?> = buildMap {
        put("code", issue.code)
        put("message", issue.message)
        put("severity", issue.severity)
        if (issue.regionId != null) put("regionId", issue.regionId)
    }

    fun encodeValidation(validation: ValidationResult): Map<String, Any?> = mapOf(
        "valid" to validation.valid,
        "errors" to validation.errors.map { encodeIssue(it) },
        "warnings" to validation.warnings.map { encodeIssue(it) },
        "regionCount" to validation.regionCount,
    )
}
