package com.ageofpaper.core.rules

import com.ageofpaper.core.model.Claim
import com.ageofpaper.core.model.Eligibility
import com.ageofpaper.core.model.MapDefinition
import com.ageofpaper.core.model.Region
import com.ageofpaper.core.model.Room

/** Port of `src/game/navalPolicy.js`. */
object NavalPolicy {

    const val ALL_COASTS = "all_coasts"
    const val SELECTED_ROUTES = "selected_routes"
    const val DISABLED = "disabled"

    val VALUES = listOf(ALL_COASTS, SELECTED_ROUTES, DISABLED)

    private val COAST_TYPES = setOf("ocean", "lake", "both")

    data class RoutePair(val first: String, val second: String) {
        val key: String get() = first + "::" + second
    }

    fun normalizeRoutePair(first: String?, second: String?): RoutePair? {
        val a = first?.trim().orEmpty()
        val b = second?.trim().orEmpty()
        if (a.isEmpty() || b.isEmpty() || a == b) return null
        return if (JsCompat.localeCompare(a, b) <= 0) RoutePair(a, b) else RoutePair(b, a)
    }

    fun normalizeRoutePair(value: String?): RoutePair? {
        if (value == null || !value.contains("::")) return null
        val parts = value.split("::")
        if (parts.size != 2) return null
        return normalizeRoutePair(parts[0], parts[1])
    }

    fun routeKey(first: String?, second: String?): String = normalizeRoutePair(first, second)?.key.orEmpty()

    fun routeKey(pair: RoutePair?): String = pair?.key.orEmpty()

    /**
     * A route endpoint must be a final coastal land surface. Legacy maps that
     * predate `coastType` are accepted through the `coastal` flag alone.
     */
    fun isFinalCoastalLand(region: Region?, allowLegacy: Boolean = true): Boolean {
        if (region == null) return false
        if (region.terrainType != null && region.terrainType != "land") return false
        if (region.coastType != null && COAST_TYPES.contains(region.coastType)) return region.coastal
        return allowLegacy && region.coastType == null && region.coastal
    }

    data class NormalizedRoutes(val routes: List<RoutePair>, val invalidRoutes: List<RoutePair>)

    fun normalizeRouteList(
        routes: List<String>?,
        known: Map<String, Region> = emptyMap(),
    ): NormalizedRoutes {
        val validateEndpoints = known.isNotEmpty()
        val normalized = mutableListOf<RoutePair>()
        val invalid = mutableListOf<RoutePair>()
        val seen = mutableSetOf<String>()
        for (candidate in routes.orEmpty()) {
            val pair = normalizeRoutePair(candidate)
            val key = routeKey(pair)
            val valid = pair != null && (
                !validateEndpoints || (
                    isFinalCoastalLand(known[pair.first]) && isFinalCoastalLand(known[pair.second])
                    )
                )
            if (!valid || seen.contains(key)) {
                if (pair != null && !seen.contains(key)) invalid.add(pair)
                continue
            }
            seen.add(key)
            normalized.add(pair)
        }
        normalized.sortWith { a, b -> JsCompat.localeCompare(a.key, b.key) }
        invalid.sortWith { a, b -> JsCompat.localeCompare(a.key, b.key) }
        return NormalizedRoutes(normalized, invalid)
    }

    fun listLegacySeaRoutes(mapDefinition: MapDefinition?): List<RoutePair> {
        val regions = mapDefinition?.regionsById.orEmpty()
        val routes = mutableListOf<String>()
        for (id in mapDefinition?.regionIds ?: regions.keys.toList()) {
            for (neighborId in regions[id]?.seaNeighbors.orEmpty()) {
                if (regions[neighborId]?.seaNeighbors?.contains(id) == true) {
                    routes.add(routeKey(id, neighborId))
                }
            }
        }
        return normalizeRouteList(routes, regions).routes
    }

    data class NavalConfig(
        val navalPolicy: String,
        val allowedRoutes: List<RoutePair>,
        val blockedRoutes: List<RoutePair>,
        val migratedLegacyRoutes: Boolean = false,
    )

    fun migrateLegacy(
        navalPolicy: String?,
        allowedRoutes: List<String>?,
        blockedRoutes: List<String>?,
        compatibilityRoutes: List<String>?,
        mapDefinition: MapDefinition?,
        defaultPolicy: String = ALL_COASTS,
    ): NavalConfig {
        val explicitPolicy = if (navalPolicy != null && VALUES.contains(navalPolicy)) navalPolicy else null
        val legacyRoutes = compatibilityRoutes.orEmpty() + listLegacySeaRoutes(mapDefinition).map { it.key }
        val allowedSource = allowedRoutes ?: legacyRoutes
        val regions = mapDefinition?.regionsById.orEmpty()
        return NavalConfig(
            navalPolicy = explicitPolicy
                ?: if (legacyRoutes.isNotEmpty()) SELECTED_ROUTES else defaultPolicy,
            allowedRoutes = normalizeRouteList(allowedSource, regions).routes,
            blockedRoutes = normalizeRouteList(blockedRoutes, regions).routes,
            migratedLegacyRoutes = explicitPolicy == null && legacyRoutes.isNotEmpty(),
        )
    }

    fun normalizeConfig(
        mapDefinition: MapDefinition?,
        defaultPolicy: String = SELECTED_ROUTES,
    ): NavalConfig = migrateLegacy(
        navalPolicy = mapDefinition?.navalPolicy,
        allowedRoutes = mapDefinition?.allowedRoutes,
        blockedRoutes = mapDefinition?.blockedRoutes,
        compatibilityRoutes = null,
        mapDefinition = mapDefinition,
        defaultPolicy = defaultPolicy,
    )

    sealed interface NavalEdit {
        data class Policy(val navalPolicy: String) : NavalEdit
        data object ResetRoutes : NavalEdit
        data class Route(val firstId: String, val secondId: String, val allowed: Boolean) : NavalEdit
    }

    data class EditResult(
        val ok: Boolean,
        val mapDefinition: MapDefinition? = null,
        val code: String? = null,
        val reason: String? = null,
    )

    fun applyEdit(mapDefinition: MapDefinition, edit: NavalEdit): EditResult {
        val config = normalizeConfig(mapDefinition, SELECTED_ROUTES)
        when (edit) {
            is NavalEdit.Policy -> {
                if (!VALUES.contains(edit.navalPolicy)) {
                    return EditResult(false, code = "INVALID_NAVAL_EDIT", reason = Messages.INVALID_NAVAL_EDIT)
                }
                return EditResult(
                    true,
                    mapDefinition.copy(
                        navalPolicy = edit.navalPolicy,
                        allowedRoutes = config.allowedRoutes.map { it.key },
                        blockedRoutes = config.blockedRoutes.map { it.key },
                    ),
                )
            }

            NavalEdit.ResetRoutes -> return EditResult(
                true,
                mapDefinition.copy(
                    navalPolicy = config.navalPolicy,
                    allowedRoutes = emptyList(),
                    blockedRoutes = emptyList(),
                ),
            )

            is NavalEdit.Route -> {
                val pair = normalizeRoutePair(edit.firstId, edit.secondId)
                val regions = mapDefinition.regionsById
                if (pair == null ||
                    !isFinalCoastalLand(regions[pair.first]) ||
                    !isFinalCoastalLand(regions[pair.second])
                ) {
                    return EditResult(
                        false,
                        code = "INVALID_ROUTE_ENDPOINT",
                        reason = Messages.INVALID_ROUTE_ENDPOINT,
                    )
                }
                val blockedField = config.navalPolicy == ALL_COASTS
                val shouldContain = if (blockedField) !edit.allowed else edit.allowed
                val current = if (blockedField) config.blockedRoutes else config.allowedRoutes
                val next = if (shouldContain) {
                    normalizeRouteList((current + pair).map { it.key }, regions).routes
                } else {
                    current.filter { it.key != pair.key }
                }
                return EditResult(
                    true,
                    mapDefinition.copy(
                        navalPolicy = config.navalPolicy,
                        allowedRoutes = (if (blockedField) config.allowedRoutes else next).map { it.key },
                        blockedRoutes = (if (blockedField) next else config.blockedRoutes).map { it.key },
                    ),
                )
            }
        }
    }

    object Messages {
        const val NAVAL_DISABLED = "Deniz politikası kapalı."
        const val STALE_COAST = "Kaynak veya hedef artık geçerli bir kıyı değil."
        const val ROUTE_BLOCKED = "Rota engelli."
        const val NO_SELECTED_ROUTE = "Özel rota bulunmuyor."
        const val INVALID_ROUTE_ENDPOINT = "Rota uçları nihai kıyı kara bölgeleri olmalı."
        const val INVALID_NAVAL_EDIT = "Deniz politikası işlemi tanınmıyor."
    }

    data class RouteCheck(val allowed: Boolean, val code: String, val reason: String? = null)

    fun isRouteAllowed(mapDefinition: MapDefinition?, firstId: String?, secondId: String?): RouteCheck {
        val pair = normalizeRoutePair(firstId, secondId)
        val regions = mapDefinition?.regionsById.orEmpty()
        val config = normalizeConfig(mapDefinition, SELECTED_ROUTES)
        if (config.navalPolicy == DISABLED) {
            return RouteCheck(false, "NAVAL_DISABLED", Messages.NAVAL_DISABLED)
        }
        if (pair == null ||
            !isFinalCoastalLand(regions[pair.first]) ||
            !isFinalCoastalLand(regions[pair.second])
        ) {
            return RouteCheck(false, "STALE_COAST", Messages.STALE_COAST)
        }
        if (config.navalPolicy == ALL_COASTS) {
            val blocked = config.blockedRoutes.any { it.key == pair.key }
            return if (blocked) {
                RouteCheck(false, "ROUTE_BLOCKED", Messages.ROUTE_BLOCKED)
            } else {
                RouteCheck(true, "AVAILABLE")
            }
        }
        val allowed = config.allowedRoutes.any { it.key == pair.key }
        return if (allowed) {
            RouteCheck(true, "AVAILABLE")
        } else {
            RouteCheck(false, "NO_SELECTED_ROUTE", Messages.NO_SELECTED_ROUTE)
        }
    }

    data class OperationBase(
        val eligibility: Eligibility,
        val sourceClaim: Claim? = null,
        val targetClaim: Claim? = null,
        val sourceRegion: Region? = null,
        val targetRegion: Region? = null,
        val shipsNeeded: Int = 0,
    )

    private fun operationBase(
        room: Room,
        playerId: String,
        sourceId: String?,
        targetId: String?,
        amount: Int,
    ): OperationBase {
        if (room.phase != Phases.WAR) {
            return OperationBase(Eligibility.illegal("WRONG_PHASE", WarMessages.OPERATION_WRONG_PHASE))
        }
        if (room.activePlayerId != playerId) {
            return OperationBase(Eligibility.illegal("NOT_ACTIVE", WarMessages.NOT_ACTIVE))
        }
        if (room.players[playerId]?.eliminated == true) {
            return OperationBase(Eligibility.illegal("ELIMINATED", WarMessages.ELIMINATED_ORDER))
        }
        if (sourceId.isNullOrEmpty() || targetId.isNullOrEmpty() || sourceId == targetId) {
            return OperationBase(Eligibility.illegal("SAME_REGION", WarMessages.SAME_REGION))
        }
        val sourceClaim = room.claims[sourceId]
        val targetClaim = room.claims[targetId]
        if (sourceClaim?.ownerId != playerId) {
            return OperationBase(Eligibility.illegal("INVALID_SOURCE", WarMessages.INVALID_SOURCE))
        }
        val route = isRouteAllowed(room.mapDefinition, sourceId, targetId)
        if (!route.allowed) {
            return OperationBase(Eligibility.illegal(route.code, route.reason.orEmpty()))
        }
        if (!WarConstants.isSoldierAmount(amount) || sourceClaim.soldiers < amount) {
            return OperationBase(Eligibility.illegal("INSUFFICIENT_SOLDIERS", WarMessages.INSUFFICIENT_SOLDIERS_SHORT))
        }
        if (!sourceClaim.hasPort) {
            return OperationBase(Eligibility.illegal("PORT_REQUIRED", WarMessages.PORT_REQUIRED_SHORT))
        }
        val shipsNeeded = WarConstants.requiredShips(amount)
        if (sourceClaim.ships < shipsNeeded) {
            return OperationBase(
                Eligibility(
                    false,
                    "INSUFFICIENT_SHIPS",
                    WarMessages.INSUFFICIENT_SHIPS,
                    shipsNeeded = shipsNeeded,
                ),
            )
        }
        return OperationBase(
            eligibility = Eligibility(true, "AVAILABLE", shipsNeeded = shipsNeeded),
            sourceClaim = sourceClaim,
            targetClaim = targetClaim ?: Claim(),
            sourceRegion = room.region(sourceId),
            targetRegion = room.region(targetId),
            shipsNeeded = shipsNeeded,
        )
    }

    fun navalTargetEligibility(
        room: Room,
        playerId: String,
        operation: String,
        sourceId: String?,
        targetId: String?,
        amount: Int,
    ): OperationBase {
        val base = operationBase(room, playerId, sourceId, targetId, amount)
        if (!base.eligibility.legal) return base
        if (operation == "move" && base.targetClaim?.ownerId != playerId) {
            return OperationBase(
                Eligibility.illegal("ENEMY_TRANSFER_TARGET", WarMessages.ENEMY_TRANSFER_TARGET),
            )
        }
        if (operation == "attack" && base.targetClaim?.ownerId == playerId) {
            return OperationBase(
                Eligibility.illegal("FRIENDLY_ATTACK_TARGET", WarMessages.FRIENDLY_ATTACK_TARGET),
            )
        }
        return base
    }

    data class NavalCapability(
        val policy: String,
        val available: Boolean,
        val ownedCoasts: List<String>,
        val eligibleCoasts: List<String>,
        val reachableBySource: Map<String, List<String>>,
        val accessibleTargets: List<String>,
        val ports: List<String>,
        val ships: Int,
    ) {
        val hasPort: Boolean get() = ports.isNotEmpty()
        val showNavalSection: Boolean get() = available
    }

    fun playerCapability(room: Room, playerId: String?): NavalCapability {
        val regions = room.mapDefinition?.regionsById.orEmpty()
        val policy = normalizeConfig(room.mapDefinition, SELECTED_ROUTES).navalPolicy
        val ownedCoasts = regions.keys.filter { id ->
            room.claims[id]?.ownerId == playerId && isFinalCoastalLand(regions[id])
        }
        val eligibleCoasts = ownedCoasts.filter { regions[it]?.portAllowed != false }
        val reachableBySource = eligibleCoasts.associateWith { sourceId ->
            regions.keys.filter { targetId ->
                targetId != sourceId && isRouteAllowed(room.mapDefinition, sourceId, targetId).allowed
            }
        }
        val accessibleTargets = reachableBySource.values.flatten().distinct()
        val ports = eligibleCoasts.filter { room.claims[it]?.hasPort == true }
        val ships = ports.sumOf { maxOf(0, room.claims[it]?.ships ?: 0) }
        return NavalCapability(
            policy = policy,
            available = policy != DISABLED && eligibleCoasts.isNotEmpty() && accessibleTargets.isNotEmpty(),
            ownedCoasts = ownedCoasts,
            eligibleCoasts = eligibleCoasts,
            reachableBySource = reachableBySource,
            accessibleTargets = accessibleTargets,
            ports = ports,
            ships = ships,
        )
    }
}
