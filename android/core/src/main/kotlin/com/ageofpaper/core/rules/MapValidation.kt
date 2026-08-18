package com.ageofpaper.core.rules

import com.ageofpaper.core.model.MapDefinition
import com.ageofpaper.core.model.MapIssue
import com.ageofpaper.core.model.Region
import com.ageofpaper.core.model.ValidationResult

/** Port of `src/game/mapValidation.js`. */
object MapValidation {

    val SAFE_REGION_ID = Regex("^[A-Za-z_][A-Za-z0-9_-]{0,79}$")

    private fun issue(code: String, message: String, regionId: String? = null) =
        MapIssue(code = code, message = message, regionId = regionId)

    private fun visit(start: String, adjacency: Map<String, List<String>>): Set<String> {
        val seen = mutableSetOf(start)
        val queue = ArrayDeque(listOf(start))
        while (queue.isNotEmpty()) {
            val current = queue.removeFirst()
            for (neighbor in adjacency[current].orEmpty()) {
                if (seen.add(neighbor)) queue.add(neighbor)
            }
        }
        return seen
    }

    fun validate(candidate: MapDefinition?): ValidationResult {
        val errors = mutableListOf<MapIssue>()
        val warnings = mutableListOf<MapIssue>()
        val regions = candidate?.regions.orEmpty()

        for (imported in candidate?.importIssues.orEmpty()) {
            if (imported.severity == "error") errors.add(imported) else warnings.add(imported)
        }

        if (candidate?.version != 1) {
            errors.add(issue("UNSUPPORTED_VERSION", "Harita tanımı sürümü desteklenmiyor."))
        }

        if (regions.isEmpty() || candidate == null) {
            errors.add(issue("NO_REGIONS", "Haritada oynanabilir bölge bulunamadı."))
            return ValidationResult(false, errors, warnings, 0, null)
        }
        val mapDefinition: MapDefinition = candidate

        val ids = mutableSetOf<String>()
        for (region in regions) {
            if (!SAFE_REGION_ID.matches(region.id)) {
                errors.add(issue("UNSAFE_ID", "“${region.id}” güvenli bir bölge kimliği değil.", region.id))
            } else if (ids.contains(region.id)) {
                errors.add(issue("DUPLICATE_ID", "“${region.id}” bölge kimliği birden fazla kullanılmış.", region.id))
            }
            ids.add(region.id)

            if (region.name.isBlank()) {
                errors.add(issue("INVALID_NAME", "“${region.id}” için bölge adı gerekli.", region.id))
            }
            if (region.portAllowed == true && !region.coastal) {
                errors.add(
                    issue("INLAND_PORT_ALLOWED", "“${region.id}” kıyı değilken limana izin veremez.", region.id),
                )
            }
            if (region.terrainType != null && region.terrainType != "land") {
                errors.add(
                    issue("NON_LAND_PLAYABLE", "“${region.id}” oynanabilir tanımda yalnızca kara olabilir.", region.id),
                )
            }
            if (region.price < 0) {
                errors.add(issue("INVALID_NUMBER", "“${region.name}” için price geçersiz veya negatif.", region.id))
            }
            if (region.income < 0) {
                errors.add(issue("INVALID_NUMBER", "“${region.name}” için income geçersiz veya negatif.", region.id))
            }
        }

        val indexedIds = mapDefinition.regionIds.toSet()
        if (indexedIds.size != mapDefinition.regionIds.size ||
            indexedIds.size != ids.size ||
            ids.any { !indexedIds.contains(it) }
        ) {
            errors.add(
                issue("INVALID_REGION_INDEX", "regionIds listesi oynanabilir bölge kayıtlarıyla birebir eşleşmiyor."),
            )
        }

        val byId: Map<String, Region> = regions.associateBy { it.id }
        val adjacency = mutableMapOf<String, MutableList<String>>()
        val reverse = mutableMapOf<String, MutableList<String>>()
        regions.forEach {
            adjacency[it.id] = mutableListOf()
            reverse[it.id] = mutableListOf()
        }

        if (mapDefinition.navalPolicy != null && !NavalPolicy.VALUES.contains(mapDefinition.navalPolicy)) {
            errors.add(issue("INVALID_NAVAL_POLICY", "Harita geçerli bir deniz politikası taşımalı."))
        }
        for ((field, list) in listOf(
            "allowedRoutes" to mapDefinition.allowedRoutes,
            "blockedRoutes" to mapDefinition.blockedRoutes,
        )) {
            val seenRoutes = mutableSetOf<String>()
            for (route in list) {
                val pair = NavalPolicy.normalizeRoutePair(route)
                val key = NavalPolicy.routeKey(pair)
                if (pair == null || route != key || seenRoutes.contains(key)) {
                    errors.add(
                        issue("INVALID_NAVAL_ROUTE", "$field normalize edilmiş ve benzersiz çiftler içermeli."),
                    )
                } else if (!NavalPolicy.isFinalCoastalLand(byId[pair.first]) ||
                    !NavalPolicy.isFinalCoastalLand(byId[pair.second])
                ) {
                    errors.add(
                        issue("NON_COASTAL_ROUTE", "$field yalnızca nihai kıyı kara bölgelerini bağlayabilir."),
                    )
                }
                seenRoutes.add(key)
            }
        }

        for (region in regions) {
            for ((field, neighbors) in listOf(
                "landNeighbors" to region.landNeighbors,
                "claimNeighbors" to region.claimNeighbors,
                "seaNeighbors" to region.seaNeighbors,
            )) {
                val seenNeighbors = mutableSetOf<String>()
                for (neighborId in neighbors) {
                    if (seenNeighbors.contains(neighborId)) {
                        errors.add(
                            issue(
                                "DUPLICATE_ROUTE",
                                "“${region.id}” için “$neighborId” bağlantısı yineleniyor ($field).",
                                region.id,
                            ),
                        )
                    } else if (neighborId == region.id) {
                        errors.add(issue("SELF_NEIGHBOR", "“${region.id}” kendisine komşu olamaz.", region.id))
                    } else if (!byId.containsKey(neighborId)) {
                        errors.add(
                            issue(
                                "UNKNOWN_NEIGHBOR",
                                "“${region.id}”, bilinmeyen “$neighborId” bölgesine bağlanıyor.",
                                region.id,
                            ),
                        )
                    }
                    seenNeighbors.add(neighborId)
                }
            }

            for (neighborId in region.seaNeighbors) {
                val neighbor = byId[neighborId]
                if (!region.coastal || (neighbor != null && !neighbor.coastal)) {
                    errors.add(
                        issue(
                            "NON_COASTAL_ROUTE",
                            "“${region.id}” deniz rotası yalnızca kıyı bölgelerini bağlayabilir.",
                            region.id,
                        ),
                    )
                }
                if (neighbor != null && !neighbor.seaNeighbors.contains(region.id)) {
                    errors.add(
                        issue(
                            "ASYMMETRIC_SEA_ROUTE",
                            "“${region.id}” ile “$neighborId” arasındaki deniz rotası çift yönlü olmalı.",
                            region.id,
                        ),
                    )
                }
            }

            for (neighborId in region.claimNeighbors) {
                if (byId.containsKey(neighborId) && neighborId != region.id) {
                    adjacency.getValue(region.id).add(neighborId)
                    reverse.getValue(neighborId).add(region.id)
                    if (byId[neighborId]?.claimNeighbors?.contains(region.id) != true) {
                        warnings.add(
                            issue(
                                "ASYMMETRIC_CLAIM",
                                "“${region.id}” → “$neighborId” claim bağlantısı tek yönlü.",
                                region.id,
                            ),
                        )
                    }
                }
            }
        }

        if (regions.size > 1) {
            val start = regions.first().id
            val forward = visit(start, adjacency)
            val backward = visit(start, reverse)
            if (forward.size != regions.size || backward.size != regions.size) {
                val unreachable = regions
                    .filter { !forward.contains(it.id) || !backward.contains(it.id) }
                    .map { it.name.ifBlank { it.id } }
                    .take(6)
                    .joinToString(", ")
                errors.add(
                    issue(
                        "UNREACHABLE_REGION",
                        "Claim grafiği her başlangıçtan tamamlanamıyor. Ulaşılamayan bölgeler: $unreachable.",
                    ),
                )
            }
        }

        val hasCoastal = regions.any { it.coastal }
        if ((
                mapDefinition.navalPolicy == NavalPolicy.SELECTED_ROUTES &&
                    hasCoastal &&
                    mapDefinition.allowedRoutes.isEmpty()
                ) ||
            (
                mapDefinition.navalPolicy == null &&
                    hasCoastal &&
                    regions.none { it.seaNeighbors.isNotEmpty() }
                )
        ) {
            warnings.add(
                issue(
                    "COASTAL_WITHOUT_ROUTES",
                    "Kıyı bölgeleri var, ancak deniz rotası yapılandırılmamış. " +
                        "Harita kara oyunu için yine kullanılabilir.",
                ),
            )
        }

        return ValidationResult(
            valid = errors.isEmpty(),
            errors = errors,
            warnings = warnings,
            regionCount = regions.size,
            pricingSummary = Pricing.summarize(regions.map { it.price }, regions.map { it.income }),
        )
    }
}
