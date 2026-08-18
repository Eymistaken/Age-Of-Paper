package com.ageofpaper.core.svg

import com.ageofpaper.core.json.Json
import com.ageofpaper.core.json.JsonValue
import com.ageofpaper.core.json.asArray
import com.ageofpaper.core.json.asBoolean
import com.ageofpaper.core.json.asDouble
import com.ageofpaper.core.json.asInt
import com.ageofpaper.core.json.asObject
import com.ageofpaper.core.json.asString
import com.ageofpaper.core.json.jsonOf
import com.ageofpaper.core.model.AutomaticClassification
import com.ageofpaper.core.model.Bounds
import com.ageofpaper.core.model.GridRuns
import com.ageofpaper.core.model.MapIssue
import com.ageofpaper.core.model.NavigationCoast
import com.ageofpaper.core.model.NavigationComponent
import com.ageofpaper.core.model.NavigationMask
import com.ageofpaper.core.model.Point
import com.ageofpaper.core.model.Surface
import com.ageofpaper.core.model.TerrainDocument
import com.ageofpaper.core.model.ViewBox
import org.w3c.dom.Element
import java.security.MessageDigest

/** Port of `src/game/mapMetadata.js`. */
object MapMetadata {

    const val METADATA_ID = "age-of-paper-map"
    const val MAX_METADATA_CHARACTERS = 450_000

    private val EDITOR_ATTRIBUTES = listOf(
        "data-terrain",
        "data-port-allowed",
        "data-coast-type",
        "data-region",
        "data-region-id",
        "data-surface-id",
        "data-name",
        "data-price",
        "data-income",
        "data-neighbors",
        "data-claim-neighbors",
        "data-land-neighbors",
        "data-sea-neighbors",
        "data-coastal",
    )

    private val TOP_LEVEL_FIELDS = setOf(
        "schemaVersion", "editorVersion", "analysisAlgorithmVersion", "mapId", "revision", "displayName",
        "sourceGeometryHash", "baseSvgHash", "compact", "viewBox", "compatibilityRoutes", "surfaces",
        "importIssues", "navalPolicy", "allowedRoutes", "blockedRoutes", "navigationMask",
    )

    /** SHA-256 hex, matching `crypto.subtle.digest('SHA-256', ...)` on the web. */
    fun hashText(value: String?): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(value.orEmpty().toByteArray(Charsets.UTF_8))
        return digest.joinToString("") { "%02x".format(it) }
    }

    fun canonicalJson(value: JsonValue): String = Json.canonical(value)

    private fun boundsJson(bounds: Bounds?): Any? = bounds?.let {
        mapOf("x" to it.x, "y" to it.y, "width" to it.width, "height" to it.height)
    }

    private fun boundaryJson(boundary: List<List<Point>>): Any =
        boundary.map { line -> line.map { mapOf("x" to it.x, "y" to it.y) } }

    private fun geometryJson(geometry: GridRuns?): Any? = geometry?.let {
        mapOf(
            "type" to "grid_runs",
            "columns" to it.columns,
            "rows" to it.rows,
            "runs" to it.runs.map { run -> listOf(run.first, run.last) },
        )
    }

    private fun navigationMaskJson(mask: NavigationMask?): Any? = mask?.let {
        mapOf(
            "version" to it.version,
            "viewBox" to mapOf(
                "x" to it.viewBox.x,
                "y" to it.viewBox.y,
                "width" to it.viewBox.width,
                "height" to it.viewBox.height,
            ),
            "columns" to it.columns,
            "rows" to it.rows,
            "components" to it.components.map { component ->
                mapOf(
                    "id" to component.id,
                    "runs" to component.runs.map { run -> listOf(run.first, run.last) },
                    "portalCell" to component.portalCell,
                )
            },
            "coasts" to it.coasts.mapValues { (_, coasts) ->
                coasts.map { coast -> mapOf("componentId" to coast.componentId, "cell" to coast.cell) }
            },
        )
    }

    private fun surfaceJson(surface: Surface, compact: Boolean): Map<String, Any?> {
        val common = mutableMapOf<String, Any?>(
            "id" to surface.id,
            "elementId" to surface.elementId,
            "name" to surface.name,
            "terrainType" to surface.terrainType,
            "classificationSource" to surface.classificationSource,
            "confidence" to surface.confidence,
            "metadataTerrainType" to surface.metadataTerrainType,
            "hostOverride" to surface.hostOverride,
            "coastType" to surface.coastType,
            "portAllowed" to surface.portAllowed,
            "portPreference" to surface.portPreference,
            "adjacentSurfaceIds" to surface.adjacentSurfaceIds.sorted(),
            "claimNeighborIds" to surface.claimNeighborIds?.sorted(),
            "landNeighborIds" to surface.landNeighborIds?.sorted(),
            "touchesRootBoundary" to surface.touchesRootBoundary,
            "synthetic" to surface.synthetic,
            "price" to surface.price,
            "income" to surface.income,
        )
        if (compact) return common
        common["automatic"] = mapOf(
            "terrainType" to surface.automatic.terrainType,
            "confidence" to surface.automatic.confidence,
            "evidence" to surface.automatic.evidence,
        )
        common["bounds"] = boundsJson(surface.bounds)
        common["boundary"] = if (surface.boundary.isEmpty()) null else boundaryJson(surface.boundary)
        common["geometry"] = geometryJson(surface.geometry)
        return common
    }

    fun createPackage(document: TerrainDocument, compact: Boolean = false): JsonValue = jsonOf(
        mapOf(
            "schemaVersion" to TerrainModel.METADATA_SCHEMA_VERSION,
            "editorVersion" to TerrainModel.EDITOR_SCHEMA_VERSION,
            "analysisAlgorithmVersion" to document.analysisAlgorithmVersion,
            "mapId" to document.mapId,
            "revision" to if (document.revision > 0) document.revision else 1,
            "displayName" to document.displayName.take(120),
            "sourceGeometryHash" to document.sourceGeometryHash,
            "baseSvgHash" to document.baseSvgHash,
            "compact" to compact,
            "viewBox" to document.viewBox?.let {
                mapOf("x" to it.x, "y" to it.y, "width" to it.width, "height" to it.height)
            },
            "compatibilityRoutes" to document.compatibilityRoutes,
            "navalPolicy" to document.navalPolicy,
            "allowedRoutes" to document.allowedRoutes,
            "blockedRoutes" to document.blockedRoutes,
            "navigationMask" to navigationMaskJson(document.navigationMask),
            "importIssues" to document.importIssues.take(1000).map { issue ->
                buildMap {
                    put("severity", issue.severity)
                    put("code", issue.code)
                    put("message", issue.message)
                    if (issue.regionId != null) put("regionId", issue.regionId)
                }
            },
            "surfaces" to document.surfaces.map { surfaceJson(it, compact) },
        ),
    )

    data class MetadataValidation(val valid: Boolean, val errors: List<MapIssue>)

    fun validatePackage(metadata: JsonValue?): MetadataValidation {
        val root = metadata?.asObject
            ?: return MetadataValidation(
                false,
                listOf(MapIssue("INVALID_METADATA", "Age of Paper metadata kaydı bir nesne olmalı.")),
            )
        val errors = mutableListOf<MapIssue>()
        if (root["schemaVersion"]?.asInt != TerrainModel.METADATA_SCHEMA_VERSION) {
            errors.add(MapIssue("UNSUPPORTED_METADATA_VERSION", "Metadata şema sürümü desteklenmiyor."))
        }
        if (root["editorVersion"]?.asInt != TerrainModel.EDITOR_SCHEMA_VERSION) {
            errors.add(MapIssue("UNSUPPORTED_EDITOR_VERSION", "Editör sürümü desteklenmiyor."))
        }
        if (root["analysisAlgorithmVersion"]?.asString != TerrainModel.ANALYSIS_ALGORITHM_VERSION) {
            errors.add(MapIssue("UNSUPPORTED_ANALYSIS_VERSION", "Analiz algoritması sürümü desteklenmiyor."))
        }
        val mapId = root["mapId"]?.asString
        if (mapId.isNullOrEmpty() || mapId.length > 120) {
            errors.add(MapIssue("INVALID_MAP_ID", "Geçerli bir mapId gerekli."))
        }
        val revision = root["revision"]?.asInt
        if (revision == null || revision < 1) {
            errors.add(MapIssue("INVALID_REVISION", "Harita revision değeri pozitif tam sayı olmalı."))
        }
        val sourceHash = root["sourceGeometryHash"]?.asString
        if (sourceHash == null || sourceHash.length > 128) {
            errors.add(MapIssue("INVALID_SOURCE_HASH", "Kaynak geometri hash alanı geçersiz."))
        }
        val surfaces = root["surfaces"]?.asArray
        if (surfaces == null || surfaces.size > 10_000) {
            errors.add(MapIssue("INVALID_SURFACES", "Metadata yüzey listesi geçersiz."))
        }
        val importIssues = root["importIssues"]?.asArray
        if (importIssues == null || importIssues.size > 1000) {
            errors.add(MapIssue("INVALID_IMPORT_ISSUES", "Metadata importIssues listesi geçersiz."))
        }
        if (root.keys.any { !TOP_LEVEL_FIELDS.contains(it) }) {
            errors.add(MapIssue("UNKNOWN_METADATA_FIELD", "Metadata bilinmeyen bir üst düzey alan içeriyor."))
        }
        if (root["compact"]?.asBoolean == null) {
            errors.add(MapIssue("INVALID_COMPACT_FLAG", "Metadata compact alanı true veya false olmalı."))
        }
        if (!listOf("all_coasts", "selected_routes", "disabled").contains(root["navalPolicy"]?.asString)) {
            errors.add(MapIssue("INVALID_NAVAL_POLICY", "Deniz politikası desteklenmiyor."))
        }
        return MetadataValidation(errors.isEmpty(), errors)
    }

    data class Extracted(
        val found: Boolean,
        val valid: Boolean,
        val metadata: JsonValue?,
        val errors: List<MapIssue> = emptyList(),
    )

    fun extract(svgText: String?): Extracted {
        return try {
            val document = SvgSanitizer.parseSanitized(svgText)
            val node = document.elementById(METADATA_ID)
                ?: return Extracted(found = false, valid = false, metadata = null)
            val text = node.textContentOrEmpty()
            if (text.isEmpty() || text.length > MAX_METADATA_CHARACTERS) {
                return Extracted(
                    found = true,
                    valid = false,
                    metadata = null,
                    errors = listOf(MapIssue("METADATA_SIZE", "Metadata boş veya izin verilen boyutu aşıyor.")),
                )
            }
            val metadata = Json.parse(text)
            val validation = validatePackage(metadata)
            Extracted(true, validation.valid, metadata, validation.errors)
        } catch (error: Exception) {
            Extracted(
                found = true,
                valid = false,
                metadata = null,
                errors = listOf(MapIssue("METADATA_PARSE", "Age of Paper metadata kaydı okunamadı.")),
            )
        }
    }

    /** Removes the metadata node and every editor-owned attribute. */
    fun stripEditorMetadata(svgText: String?): String {
        val document = SvgSanitizer.parseSanitized(svgText)
        document.documentElement.selfAndDescendants()
            .filter { it.attr("id") == METADATA_ID || it.attr("data-aop-editor-overlay") == "true" }
            .toList()
            .forEach { it.remove() }

        document.documentElement.selfAndDescendants().toList().forEach { element ->
            val attributes = element.attributes
            val doomed = mutableListOf<String>()
            for (index in 0 until attributes.length) {
                val name = attributes.item(index).nodeName
                if (name.startsWith("data-aop-") || EDITOR_ATTRIBUTES.contains(name)) doomed.add(name)
            }
            doomed.forEach { element.removeAttribute(it) }
            val classes = element.attrOrEmpty("class").split(" ").filter { it.isNotBlank() && it != "default-land" }
            if (classes.isEmpty()) element.removeAttribute("class") else element.setAttribute("class", classes.joinToString(" "))
        }
        return SvgDom.serialize(document.documentElement)
    }

    /** Writes compact metadata back onto the base artwork as inert attributes. */
    fun applyCompactMetadataToSvg(baseSvg: String, metadata: JsonValue): String {
        val validation = validatePackage(metadata)
        if (!validation.valid) throw IllegalArgumentException(validation.errors.first().message)
        val document = SvgSanitizer.parseSanitized(baseSvg)
        document.documentElement.selfAndDescendants().toList().forEach { element ->
            listOf("data-region", "data-region-id", "data-terrain", "data-port-allowed", "data-coast-type")
                .forEach { element.removeAttribute(it) }
            val classes = element.attrOrEmpty("class").split(" ").filter { it.isNotBlank() && it != "default-land" }
            if (classes.isEmpty()) element.removeAttribute("class") else element.setAttribute("class", classes.joinToString(" "))
        }
        for (surfaceValue in metadata.asObject?.get("surfaces")?.asArray.orEmpty()) {
            val surface = surfaceValue.asObject ?: continue
            val elementId = surface["elementId"]?.asString ?: continue
            val element: Element = document.elementById(elementId)
                ?: throw IllegalArgumentException("SVG öğesi bulunamadı: $elementId")
            val terrainType = surface["terrainType"]?.asString.orEmpty()
            element.setAttribute("data-terrain", terrainType)
            element.setAttribute("data-coast-type", surface["coastType"]?.asString.orEmpty())
            element.setAttribute("data-port-allowed", (surface["portAllowed"]?.asBoolean == true).toString())
            if (terrainType == "land") {
                val id = surface["id"]?.asString.orEmpty()
                element.setAttribute("data-region", "true")
                element.setAttribute("data-region-id", id)
                element.setAttribute("data-name", surface["name"]?.asString ?: id)
                surface["price"]?.asDouble?.let { element.setAttribute("data-price", it.toLong().toString()) }
                surface["income"]?.asDouble?.let { element.setAttribute("data-income", it.toLong().toString()) }
                val classes = element.attrOrEmpty("class").split(" ").filter { it.isNotBlank() } + "default-land"
                element.setAttribute("class", classes.distinct().joinToString(" "))
            }
        }
        return SvgDom.serialize(document.documentElement)
    }

    fun embedMetadata(svgText: String, metadata: JsonValue): String {
        val serialized = canonicalJson(metadata)
        if (serialized.length > MAX_METADATA_CHARACTERS) {
            throw IllegalArgumentException("Metadata izin verilen boyutu aşıyor.")
        }
        val document = SvgSanitizer.parseSanitized(svgText)
        document.elementById(METADATA_ID)?.remove()
        val node = document.createElement("metadata")
        node.setAttribute("id", METADATA_ID)
        node.setAttribute("data-aop-schema-version", TerrainModel.METADATA_SCHEMA_VERSION.toString())
        node.textContent = serialized
        val root = document.documentElement
        root.insertBefore(node, root.firstChild)
        return SvgDom.serialize(root)
    }

    /** Rebuilds a terrain document from a metadata package. */
    fun toTerrainDocument(metadata: JsonValue): TerrainDocument {
        val root = metadata.asObject.orEmpty()
        val viewBox = root["viewBox"]?.asObject?.let {
            ViewBox(
                it["x"]?.asDouble ?: 0.0,
                it["y"]?.asDouble ?: 0.0,
                it["width"]?.asDouble ?: 1000.0,
                it["height"]?.asDouble ?: 1000.0,
            )
        }
        val surfaces = root["surfaces"]?.asArray.orEmpty().mapNotNull { value ->
            val entry = value.asObject ?: return@mapNotNull null
            val id = entry["id"]?.asString ?: return@mapNotNull null
            Surface(
                id = id,
                elementId = entry["elementId"]?.asString,
                name = entry["name"]?.asString ?: id,
                automatic = entry["automatic"]?.asObject?.let {
                    AutomaticClassification(
                        terrainType = it["terrainType"]?.asString ?: entry["terrainType"]?.asString.orEmpty(),
                        confidence = it["confidence"]?.asDouble ?: 0.0,
                        evidence = it["evidence"]?.asArray?.mapNotNull { item -> item.asString }.orEmpty(),
                    )
                } ?: AutomaticClassification(
                    terrainType = entry["terrainType"]?.asString.orEmpty(),
                    confidence = entry["confidence"]?.asDouble ?: 0.0,
                    evidence = listOf("compact_metadata"),
                ),
                metadataTerrainType = entry["metadataTerrainType"]?.asString,
                hostOverride = entry["hostOverride"]?.asString,
                portPreference = entry["portPreference"]?.asBoolean,
                bounds = entry["bounds"]?.asObject?.let {
                    Bounds(
                        it["x"]?.asDouble ?: 0.0,
                        it["y"]?.asDouble ?: 0.0,
                        it["width"]?.asDouble ?: 0.0,
                        it["height"]?.asDouble ?: 0.0,
                    )
                },
                boundary = entry["boundary"]?.asArray.orEmpty().map { line ->
                    line.asArray.orEmpty().mapNotNull { point ->
                        val record = point.asObject ?: return@mapNotNull null
                        Point(record["x"]?.asDouble ?: 0.0, record["y"]?.asDouble ?: 0.0)
                    }
                },
                touchesRootBoundary = entry["touchesRootBoundary"]?.asBoolean == true,
                adjacentSurfaceIds = entry["adjacentSurfaceIds"]?.asArray?.mapNotNull { it.asString }.orEmpty(),
                claimNeighborIds = entry["claimNeighborIds"]?.asArray?.mapNotNull { it.asString },
                landNeighborIds = entry["landNeighborIds"]?.asArray?.mapNotNull { it.asString },
                price = entry["price"]?.asDouble?.toLong(),
                income = entry["income"]?.asDouble?.toLong(),
                synthetic = entry["synthetic"]?.asBoolean == true,
                geometry = entry["geometry"]?.asObject?.let { geometry ->
                    GridRuns(
                        columns = geometry["columns"]?.asInt ?: 0,
                        rows = geometry["rows"]?.asInt ?: 0,
                        runs = geometry["runs"]?.asArray.orEmpty().mapNotNull { run ->
                            val pair = run.asArray ?: return@mapNotNull null
                            val start = pair.getOrNull(0)?.asInt ?: return@mapNotNull null
                            val end = pair.getOrNull(1)?.asInt ?: return@mapNotNull null
                            start..end
                        },
                    )
                },
            )
        }
        return TerrainDocument(
            mapId = root["mapId"]?.asString.orEmpty(),
            displayName = root["displayName"]?.asString ?: "İsimsiz Harita",
            revision = root["revision"]?.asInt ?: 1,
            sourceGeometryHash = root["sourceGeometryHash"]?.asString.orEmpty(),
            baseSvgHash = root["baseSvgHash"]?.asString.orEmpty(),
            viewBox = viewBox,
            analysisAlgorithmVersion = root["analysisAlgorithmVersion"]?.asString
                ?: TerrainModel.ANALYSIS_ALGORITHM_VERSION,
            surfaces = surfaces,
            navalPolicy = root["navalPolicy"]?.asString ?: "all_coasts",
            allowedRoutes = root["allowedRoutes"]?.asArray?.mapNotNull { it.asString }.orEmpty(),
            blockedRoutes = root["blockedRoutes"]?.asArray?.mapNotNull { it.asString }.orEmpty(),
            compatibilityRoutes = root["compatibilityRoutes"]?.asArray?.mapNotNull { it.asString }.orEmpty(),
            navigationMask = root["navigationMask"]?.asObject?.let { mask -> parseNavigationMask(mask) },
            importIssues = root["importIssues"]?.asArray.orEmpty().mapNotNull { value ->
                val entry = value.asObject ?: return@mapNotNull null
                MapIssue(
                    code = entry["code"]?.asString.orEmpty(),
                    message = entry["message"]?.asString.orEmpty(),
                    regionId = entry["regionId"]?.asString,
                    severity = entry["severity"]?.asString ?: "error",
                )
            },
        )
    }

    private fun parseNavigationMask(mask: Map<String, JsonValue>): NavigationMask? {
        val viewBox = mask["viewBox"]?.asObject ?: return null
        return NavigationMask(
            version = mask["version"]?.asInt ?: 1,
            viewBox = ViewBox(
                viewBox["x"]?.asDouble ?: 0.0,
                viewBox["y"]?.asDouble ?: 0.0,
                viewBox["width"]?.asDouble ?: 0.0,
                viewBox["height"]?.asDouble ?: 0.0,
            ),
            columns = mask["columns"]?.asInt ?: 0,
            rows = mask["rows"]?.asInt ?: 0,
            components = mask["components"]?.asArray.orEmpty().mapNotNull { value ->
                val entry = value.asObject ?: return@mapNotNull null
                NavigationComponent(
                    id = entry["id"]?.asString ?: return@mapNotNull null,
                    runs = entry["runs"]?.asArray.orEmpty().mapNotNull { run ->
                        val pair = run.asArray ?: return@mapNotNull null
                        val start = pair.getOrNull(0)?.asInt ?: return@mapNotNull null
                        val end = pair.getOrNull(1)?.asInt ?: return@mapNotNull null
                        start..end
                    },
                    portalCell = entry["portalCell"]?.asInt ?: 0,
                )
            },
            coasts = mask["coasts"]?.asObject.orEmpty().mapValues { (_, value) ->
                value.asArray.orEmpty().mapNotNull { item ->
                    val entry = item.asObject ?: return@mapNotNull null
                    NavigationCoast(
                        componentId = entry["componentId"]?.asString ?: return@mapNotNull null,
                        cell = entry["cell"]?.asInt ?: 0,
                    )
                }
            },
        )
    }
}
