package com.ageofpaper.core.svg

import com.ageofpaper.core.model.Boundary
import com.ageofpaper.core.model.Bounds
import com.ageofpaper.core.model.MapIssue
import com.ageofpaper.core.model.TerrainTypes
import com.ageofpaper.core.model.ViewBox
import org.w3c.dom.Element
import java.text.Normalizer
import kotlin.math.hypot

/** Port of `src/game/surfaceCandidates.js`. */
object SurfaceCandidates {

    private val DECORATION_WORDS = Regex(
        """(^|[\s_-])(decor|decoration|background|frame|border|label|legend|centroid|anchor)([\s_-]|$)""",
        RegexOption.IGNORE_CASE,
    )
    private val MARKER_TAGS = setOf("circle", "ellipse", "rect")
    private val REGION_GEOMETRY_TAGS = setOf("path", "polygon")
    private const val MAX_MARKER_AREA_RATIO = 0.08
    private const val CENTROID_DISTANCE_RATIO = 0.2

    private val DIACRITICS = Regex("""[̀-ͯ]""")
    private val UNSAFE_ID_CHARS = Regex("""[^A-Za-z0-9_-]+""")
    private val REPEATED_UNDERSCORE = Regex("""_+""")
    private val EDGE_UNDERSCORE = Regex("""^_+|_+$""")
    private val CALIBRATION_CLASS = Regex("""^-?\d+(?:\.\d+)?\|-?\d+(?:\.\d+)?$""")

    fun normalizeRegionId(value: String?, fallback: String = "region"): String {
        var id = Normalizer.normalize(value?.ifBlank { fallback } ?: fallback, Normalizer.Form.NFKD)
            .replace(DIACRITICS, "")
            .replace(UNSAFE_ID_CHARS, "_")
            .replace(REPEATED_UNDERSCORE, "_")
            .replace(EDGE_UNDERSCORE, "")
        if (id.isEmpty()) id = fallback
        if (!Regex("""^[A-Za-z_]""").containsMatchIn(id)) id = "region_$id"
        return id.take(80)
    }

    /** Hidden, transparent or unfilled artwork never becomes a surface. */
    fun isRenderableSurfaceElement(element: Element): Boolean {
        if (element.hasAncestorTag(SvgSanitizer.EXCLUDED_ANCESTORS)) return false

        val parentGroup = element.closestTag(setOf("g"))
        val groupId = parentGroup?.attr("id")
        if (groupId == "points" || groupId == "calibration" || groupId == "reference") return false

        val className = element.attr("class")
        if (className != null && CALIBRATION_CLASS.matches(className.trim())) return false

        val style = element.attrOrEmpty("style").lowercase()
        val fill = element.attrOrEmpty("fill").trim().lowercase()
        val opacity = element.attr("opacity")?.toDoubleOrNull() ?: 1.0
        return element.attr("display") != "none" &&
            element.attr("visibility") != "hidden" &&
            opacity != 0.0 &&
            !Regex("""(?:^|;)\s*display\s*:\s*none""").containsMatchIn(style) &&
            !Regex("""(?:^|;)\s*visibility\s*:\s*hidden""").containsMatchIn(style) &&
            !Regex("""(?:^|;)\s*opacity\s*:\s*0(?:\.0+)?(?:;|$)""").containsMatchIn(style) &&
            fill != "none" &&
            !Regex("""(?:^|;)\s*fill\s*:\s*none(?:;|$)""").containsMatchIn(style)
    }

    private fun isExplicitSurface(element: Element): Boolean =
        element.attr("data-region") == "true" || TerrainTypes.SET.contains(element.attr("data-terrain"))

    private fun isSemanticDecoration(element: Element, explicit: Boolean): Boolean {
        if (explicit) return false
        if (element.attr("data-ignore") == "true") return true
        val semantic = listOfNotNull(
            element.attr("id"),
            element.attr("class"),
            element.attr("aria-label"),
            element.attr("data-name"),
        ).joinToString(" ")
        return DECORATION_WORDS.containsMatchIn(semantic)
    }

    class Candidate(
        val element: Element,
        val index: Int,
        val sourceId: String,
        val identity: String,
        val tagName: String,
        val explicit: Boolean,
        val semanticDecoration: Boolean,
        val bounds: Bounds?,
        val boundary: Boundary,
    ) {
        var id: String = ""
        var ownerId: String? = null
        var ownerIdentity: String? = null
        var semanticOnly: Boolean = false
    }

    data class Extraction(
        val records: List<Candidate>,
        val auxiliary: List<Candidate>,
        val importIssues: List<MapIssue>,
        val sourceToId: Map<String, String>,
        val boundsById: Map<String, Bounds>,
        val boundariesById: Map<String, Boundary>,
        val unmeasuredIds: List<String>,
        val unmeasuredBoundaryIds: List<String>,
    )

    private fun area(bounds: Bounds?): Double? =
        if (bounds != null && bounds.valid) bounds.width * bounds.height else null

    private fun containsBounds(outer: Bounds, inner: Bounds): Boolean {
        val tolerance = hypot(outer.width, outer.height) * 0.01
        return inner.x >= outer.x - tolerance &&
            inner.y >= outer.y - tolerance &&
            inner.x + inner.width <= outer.x + outer.width + tolerance &&
            inner.y + inner.height <= outer.y + outer.height + tolerance
    }

    private fun nearCentroid(owner: Bounds, marker: Bounds): Boolean {
        val ownerCenterX = owner.x + owner.width / 2
        val ownerCenterY = owner.y + owner.height / 2
        val markerCenterX = marker.x + marker.width / 2
        val markerCenterY = marker.y + marker.height / 2
        val distance = hypot(ownerCenterX - markerCenterX, ownerCenterY - markerCenterY)
        return distance <= hypot(owner.width, owner.height) * CENTROID_DISTANCE_RATIO
    }

    /**
     * A small unmarked circle or rectangle that sits inside its owner is a label
     * anchor, not a region. Size alone never demotes a shape.
     */
    private fun isCredibleMarker(candidate: Candidate, owner: Candidate): Boolean {
        if (candidate.explicit || !MARKER_TAGS.contains(candidate.tagName)) return false
        if (REGION_GEOMETRY_TAGS.contains(owner.tagName)) return true
        val candidateArea = area(candidate.bounds)
        val ownerArea = area(owner.bounds)
        if (candidateArea == null || ownerArea == null || candidateArea / ownerArea > MAX_MARKER_AREA_RATIO) {
            return false
        }
        return containsBounds(owner.bounds!!, candidate.bounds!!) || nearCentroid(owner.bounds, candidate.bounds)
    }

    private fun chooseOtherShapeOwner(group: List<Candidate>): Candidate = group.sortedWith { first, second ->
        val firstArea = area(first.bounds)
        val secondArea = area(second.bounds)
        when {
            firstArea != null && secondArea != null && firstArea != secondArea ->
                secondArea.compareTo(firstArea)

            firstArea != null && secondArea == null -> -1
            firstArea == null && secondArea != null -> 1
            else -> first.index - second.index
        }
    }.first()

    private fun allocateId(base: String, usedIds: MutableSet<String>): String {
        var id = normalizeRegionId(base)
        var suffix = 2
        while (usedIds.contains(id)) {
            id = normalizeRegionId(base).take(72) + "_" + suffix
            suffix++
        }
        usedIds.add(id)
        return id
    }

    private fun rewriteFragmentReferences(svg: Element, replacements: Map<String, String>) {
        if (replacements.isEmpty()) return
        svg.selfAndDescendants().toList().forEach { element ->
            val attributes = element.attributes
            val updates = mutableListOf<Pair<String, String>>()
            for (index in 0 until attributes.length) {
                val attribute = attributes.item(index)
                if (attribute.nodeName == "id") continue
                var next = attribute.nodeValue.orEmpty()
                for ((source, replacement) in replacements) {
                    next = next.replace("url(#$source)", "url(#$replacement)")
                    if (next == "#$source") next = "#$replacement"
                }
                if (next != attribute.nodeValue) updates.add(attribute.nodeName to next)
            }
            updates.forEach { (name, value) -> element.setAttribute(name, value) }
        }
    }

    private data class Ownership(
        val records: List<Candidate>,
        val auxiliary: List<Candidate>,
        val primary: Candidate,
    )

    private fun ownershipForGroup(group: List<Candidate>): Ownership {
        val explicit = group.filter { it.explicit }
        val geometry = group.filter { REGION_GEOMETRY_TAGS.contains(it.tagName) }
        val primary = explicit.firstOrNull() ?: geometry.firstOrNull() ?: chooseOtherShapeOwner(group)
        val records = mutableListOf<Candidate>()
        val auxiliary = mutableListOf<Candidate>()
        for (candidate in group) {
            val protectedOwner = candidate.explicit || REGION_GEOMETRY_TAGS.contains(candidate.tagName)
            if (candidate !== primary && !protectedOwner && isCredibleMarker(candidate, primary)) {
                auxiliary.add(candidate)
            } else {
                records.add(candidate)
            }
        }
        return Ownership(records, auxiliary, primary)
    }

    fun extract(svg: Element, viewBox: ViewBox): Extraction {
        val elements = svg.selfAndDescendants()
            .filter { SvgGeometry.SURFACE_SHAPE_TAGS.contains(it.tag()) }
            .filter { isRenderableSurfaceElement(it) }
            .toList()

        val measured = SvgGeometry.measureRegionGeometry(
            elements.mapIndexed { index, element -> "aop_candidate_${index + 1}" to element },
            viewBox,
        )

        val candidates = elements.mapIndexed { index, element ->
            val fallback = "surface_${index + 1}"
            val sourceId = element.attr("id") ?: element.attr("data-region-id") ?: fallback
            val explicit = isExplicitSurface(element)
            Candidate(
                element = element,
                index = index,
                sourceId = sourceId,
                identity = normalizeRegionId(sourceId, fallback),
                tagName = element.tag(),
                explicit = explicit,
                semanticDecoration = isSemanticDecoration(element, explicit),
                bounds = measured.boundsById["aop_candidate_${index + 1}"],
                boundary = measured.boundariesById["aop_candidate_${index + 1}"].orEmpty(),
            )
        }

        val groups = LinkedHashMap<String, MutableList<Candidate>>()
        candidates.filter { !it.semanticDecoration }.forEach { candidate ->
            groups.getOrPut(candidate.identity) { mutableListOf() }.add(candidate)
        }

        val importIssues = mutableListOf<MapIssue>()
        val records = mutableListOf<Candidate>()
        val auxiliary = mutableListOf<Candidate>()
        val ownerByIdentity = mutableMapOf<String, Candidate>()

        groups.forEach { (identity, group) ->
            val ownership = ownershipForGroup(group)
            records.addAll(ownership.records)
            ownership.auxiliary.forEach { candidate ->
                candidate.ownerIdentity = identity
                auxiliary.add(candidate)
            }
            ownerByIdentity[identity] = ownership.primary
            if (ownership.records.size > 1) {
                importIssues.add(
                    MapIssue(
                        severity = "error",
                        code = "DUPLICATE_ID",
                        message = "“${group.first().sourceId}” kimliğini paylaşan " +
                            "${ownership.records.size} anlamlı SVG yüzeyi bulundu.",
                    ),
                )
            }
        }

        candidates.filter { it.semanticDecoration }.forEach { candidate ->
            candidate.ownerIdentity = if (ownerByIdentity.containsKey(candidate.identity)) candidate.identity else null
            candidate.semanticOnly = true
            auxiliary.add(candidate)
        }

        records.sortBy { it.index }
        auxiliary.sortBy { it.index }

        val candidateElements = elements.toSet()
        val usedIds = svg.selfAndDescendants()
            .filter { it.attr("id") != null && !candidateElements.contains(it) }
            .mapNotNull { it.attr("id") }
            .toMutableSet()

        val sourceToId = LinkedHashMap<String, String>()
        val idByCandidate = mutableMapOf<Candidate, String>()
        val recordSet = records.toSet()
        val ownerIdByIdentity = mutableMapOf<String, String>()

        groups.forEach { (identity, group) ->
            val owner = ownerByIdentity[identity] ?: return@forEach
            val retained = group.filter { recordSet.contains(it) }
            val ordered = (listOf(owner) + retained.filter { it !== owner }).distinct()
            ordered.forEach { candidate ->
                val id = allocateId(identity, usedIds)
                candidate.id = id
                candidate.element.setAttribute("id", id)
                idByCandidate[candidate] = id
            }
            val ownerId = idByCandidate[owner] ?: return@forEach
            ownerIdByIdentity[identity] = ownerId
            sourceToId[identity] = ownerId
            sourceToId[owner.sourceId] = ownerId
            ordered.forEach { candidate ->
                if (!sourceToId.containsKey(candidate.sourceId)) sourceToId[candidate.sourceId] = candidate.id
            }
        }

        val auxiliaryCounts = mutableMapOf<String, Int>()
        auxiliary.forEach { candidate ->
            val ownerId = candidate.ownerIdentity?.let { ownerIdByIdentity[it] }
            if (ownerId != null) {
                val count = (auxiliaryCounts[ownerId] ?: 0) + 1
                auxiliaryCounts[ownerId] = count
                candidate.id = allocateId("aop_aux_${ownerId}_$count", usedIds)
                candidate.ownerId = ownerId
            } else if (candidate.element.attr("id") != null) {
                candidate.id = allocateId(candidate.identity, usedIds)
            } else {
                candidate.id = allocateId("aop_artwork_${candidate.index + 1}", usedIds)
            }
            candidate.element.setAttribute("id", candidate.id)
            candidate.element.removeAttribute("data-region-id")
            candidate.element.removeAttribute("data-surface-id")
        }

        val replacements = sourceToId.filter { (sourceId, id) -> sourceId != id }
        rewriteFragmentReferences(svg, replacements)

        val normalizedSources = mutableSetOf<String>()
        records.forEach { record ->
            if (record.sourceId != record.identity && normalizedSources.add(record.sourceId)) {
                importIssues.add(
                    MapIssue(
                        severity = "warning",
                        code = "NORMALIZED_ID",
                        message = "“${record.sourceId}” güvenli " +
                            "“${sourceToId[record.sourceId] ?: record.identity}” kimliğine dönüştürüldü.",
                    ),
                )
            }
        }

        val inferredAuxiliary = auxiliary.filter { !it.semanticOnly }
        if (inferredAuxiliary.isNotEmpty()) {
            val sample = inferredAuxiliary.take(5).joinToString(", ") { it.sourceId }
            importIssues.add(
                MapIssue(
                    severity = "warning",
                    code = "AUXILIARY_ARTWORK",
                    message = "${inferredAuxiliary.size} küçük etiket/merkez işareti yüzey modelinden " +
                        "çıkarıldı ve SVG çizimi olarak korundu" + if (sample.isNotEmpty()) " ($sample)." else ".",
                ),
            )
        }

        val boundsById = mutableMapOf<String, Bounds>()
        val boundariesById = mutableMapOf<String, Boundary>()
        val unmeasuredIds = mutableListOf<String>()
        val unmeasuredBoundaryIds = mutableListOf<String>()
        records.forEach { record ->
            val bounds = record.bounds
            if (bounds != null) boundsById[record.id] = bounds else unmeasuredIds.add(record.id)
            if (record.boundary.isNotEmpty()) boundariesById[record.id] = record.boundary
            else unmeasuredBoundaryIds.add(record.id)
        }

        return Extraction(
            records = records,
            auxiliary = auxiliary,
            importIssues = importIssues,
            sourceToId = sourceToId,
            boundsById = boundsById,
            boundariesById = boundariesById,
            unmeasuredIds = unmeasuredIds,
            unmeasuredBoundaryIds = unmeasuredBoundaryIds,
        )
    }
}
