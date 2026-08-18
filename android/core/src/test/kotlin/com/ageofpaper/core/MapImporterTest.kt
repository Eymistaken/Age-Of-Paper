package com.ageofpaper.core

import com.ageofpaper.core.model.TerrainTypes
import com.ageofpaper.core.svg.MapImporter
import com.ageofpaper.core.svg.MapMetadata
import com.ageofpaper.core.svg.SvgGeometry
import com.ageofpaper.core.svg.SvgPath
import com.ageofpaper.core.svg.SvgSanitizer
import com.ageofpaper.core.svg.SvgTransform
import com.ageofpaper.core.model.Point
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.abs
import kotlin.random.Random

/** End to end checks for the Kotlin port of the SVG import chain. */
class MapImporterTest {

    /** Eight touching regions, laid out like the map in the phone design. */
    private val sampleMap = """
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 600">
          <polygon id="kuzey_kiyisi" points="40,60 150,40 190,130 120,170 45,150" fill="#b7a370"/>
          <polygon id="demir_gecit" points="190,130 300,70 360,140 300,210 200,205" fill="#b7a370"/>
          <polygon id="kuzey_vadisi" points="120,170 200,205 205,300 110,320 55,250" fill="#c6b07a"/>
          <polygon id="tas_ovasi" points="205,300 300,210 365,260 350,360 240,375" fill="#b7a370"/>
          <polygon id="bati_sancagi" points="110,320 205,300 240,375 180,440 90,410" fill="#b7a370"/>
          <polygon id="gunes_kapisi" points="240,375 350,360 370,450 300,500 235,455" fill="#b7a370"/>
          <polygon id="guney_burnu" points="90,410 180,440 235,455 210,540 100,530" fill="#b7a370"/>
          <polygon id="son_liman" points="300,500 370,450 380,545 300,570" fill="#b7a370"/>
        </svg>
    """.trimIndent()

    private fun prepare(svg: String = sampleMap) =
        MapImporter.prepare(svg, displayName = "Test Haritası", random = Random(1), now = 1_700_000_000_000L)

    @Test
    fun `imports every drawn polygon as a playable land region`() {
        val prepared = prepare()
        val ids = prepared.mapDefinition.regionIds
        assertEquals(8, ids.size)
        assertTrue(ids.contains("kuzey_vadisi"))
        assertTrue(ids.contains("bati_sancagi"))
        assertTrue(prepared.mapDefinition.regions.all { it.price > 0 && it.income > 0 })
    }

    @Test
    fun `derives adjacency from shared boundaries`() {
        val prepared = prepare()
        val byId = prepared.mapDefinition.regionsById
        val valley = byId.getValue("kuzey_vadisi")
        assertTrue(valley.claimNeighbors.contains("bati_sancagi"))
        assertFalse(valley.claimNeighbors.contains("son_liman"))
        // Adjacency is symmetric.
        assertTrue(byId.getValue("bati_sancagi").claimNeighbors.contains("kuzey_vadisi"))
        assertTrue(byId.getValue("bati_sancagi").claimNeighbors.contains("tas_ovasi"))
        assertTrue(byId.getValue("guney_burnu").claimNeighbors.contains("bati_sancagi"))
        // A single shared corner is not a border: the valley only touches the
        // plain at one point, so they never become claim neighbours.
        assertFalse(valley.claimNeighbors.contains("tas_ovasi"))
    }

    @Test
    fun `negative space becomes water and coastal land gets a coast type`() {
        val prepared = prepare()
        val water = prepared.terrainDocument.surfaces.filter { it.synthetic }
        assertTrue(water.isNotEmpty())
        assertTrue(water.any { it.terrainType == TerrainTypes.OCEAN })
        assertTrue(prepared.mapDefinition.regions.any { it.coastal })
    }

    @Test
    fun `prices stay inside the automatic pricing band`() {
        val prepared = prepare()
        assertTrue(prepared.mapDefinition.regions.all { it.price in 5_000..40_000 })
        assertTrue(prepared.mapDefinition.regions.all { it.income in 500..4_000 })
        assertTrue(prepared.mapDefinition.regions.all { it.price % 500 == 0L })
        assertTrue(prepared.mapDefinition.regions.all { it.income % 100 == 0L })
    }

    @Test
    fun `prepared svg carries metadata that reimports without reanalysis`() {
        val prepared = prepare()
        val reimported = MapImporter.prepare(prepared.preparedSvg, random = Random(1))
        assertEquals("validated", reimported.metadataStatus)
        assertEquals(prepared.mapId, reimported.mapId)
        assertEquals(prepared.mapDefinition.regionIds.sorted(), reimported.mapDefinition.regionIds.sorted())
        assertEquals(prepared.metadataHash, reimported.metadataHash)
    }

    @Test
    fun `metadata that does not match the artwork is rejected`() {
        val prepared = prepare()
        val tampered = prepared.preparedSvg.replace("""points="40,60""", """points="41,60""")
        val failure = runCatching { MapImporter.prepare(tampered) }.exceptionOrNull()
        assertTrue(failure is MapImporter.MapMetadataConflictException)
        assertEquals("SOURCE_GEOMETRY_MISMATCH", (failure as MapImporter.MapMetadataConflictException).code)

        val recovered = MapImporter.prepare(tampered, metadataMismatch = MapImporter.MetadataMismatch.REANALYZE)
        assertEquals("geometry_mismatch_reanalyzed", recovered.metadataStatus)
    }

    @Test
    fun `import is deterministic for the same input`() {
        val first = prepare()
        val second = prepare()
        assertEquals(first.baseSvgHash, second.baseSvgHash)
        assertEquals(first.metadataHash, second.metadataHash)
        assertEquals(
            MapMetadata.canonicalJson(first.compactMetadata),
            MapMetadata.canonicalJson(second.compactMetadata),
        )
    }

    @Test
    fun `explicit data attributes override the automatic result`() {
        val svg = """
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
              <polygon id="alpha" data-region="true" data-name="Alfa" data-price="12345" data-income="777"
                       points="10,10 90,10 90,90 10,90" fill="#b7a370"/>
              <polygon id="beta" data-region="true" points="90,10 190,10 190,90 90,90" fill="#b7a370"/>
              <polygon id="deniz" data-terrain="ocean" points="10,120 190,120 190,190 10,190" fill="#2F6FA3"/>
            </svg>
        """.trimIndent()
        val prepared = MapImporter.prepare(svg, random = Random(2))
        val alpha = prepared.mapDefinition.regionsById.getValue("alpha")
        assertEquals("Alfa", alpha.name)
        assertEquals(12_345L, alpha.price)
        assertEquals(777L, alpha.income)
        assertFalse(prepared.mapDefinition.regionIds.contains("deniz"))
    }

    @Test
    fun `sanitiser strips scripts and remote references`() {
        val svg = """
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
              <script>alert(1)</script>
              <polygon id="alpha" onclick="steal()" points="10,10 90,10 90,90" fill="#b7a370"
                       style="fill:url(https://evil.example/x)"/>
            </svg>
        """.trimIndent()
        val sanitized = SvgSanitizer.sanitizeMarkup(svg)
        assertFalse(sanitized.contains("script"))
        assertFalse(sanitized.contains("onclick"))
        assertFalse(sanitized.contains("evil.example"))
    }

    @Test
    fun `nested transforms are composed into root viewBox coordinates`() {
        val svg = """
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
              <g transform="translate(50 20)">
                <g transform="scale(2)">
                  <rect id="boxed" x="5" y="5" width="10" height="10" fill="#b7a370"/>
                </g>
              </g>
            </svg>
        """.trimIndent()
        val document = SvgSanitizer.parseSanitized(svg)
        val element = document.documentElement.selfAndDescendantsForTest().first { it.getAttribute("id") == "boxed" }
        val matrix = SvgTransform.toRootMatrix(element)
        val mapped = matrix.apply(Point(5.0, 5.0))
        assertEquals(60.0, mapped.x, 1e-9)
        assertEquals(30.0, mapped.y, 1e-9)

        val measured = SvgGeometry.measureRegionGeometry(listOf("boxed" to element), com.ageofpaper.core.model.ViewBox(0.0, 0.0, 200.0, 200.0))
        val bounds = measured.boundsById.getValue("boxed")
        assertEquals(60.0, bounds.x, 1e-6)
        assertEquals(30.0, bounds.y, 1e-6)
        assertEquals(20.0, bounds.width, 1e-6)
        assertEquals(20.0, bounds.height, 1e-6)
    }

    @Test
    fun `path data flattens into closed polylines`() {
        val subPaths = SvgPath.parse("M 10 10 L 90 10 L 90 90 Z")
        assertEquals(1, subPaths.size)
        assertTrue(subPaths.first().closed)
        val points = subPaths.first().points
        assertEquals(Point(10.0, 10.0), points.first())
        assertEquals(Point(10.0, 10.0), points.last())
    }

    @Test
    fun `curved path stays inside its control hull`() {
        val subPaths = SvgPath.parse("M 0 0 C 0 100 100 100 100 0")
        val points = subPaths.first().points
        assertTrue(points.size > 4)
        assertTrue(points.all { it.y >= -1e-9 && it.y <= 75.1 })
        assertTrue(abs(points.last().x - 100.0) < 1e-6)
    }

    @Test
    fun `arc commands produce a curve between the endpoints`() {
        val points = SvgPath.parse("M 0 0 A 50 50 0 0 1 100 0").first().points
        assertEquals(0.0, points.first().x, 1e-9)
        assertEquals(100.0, points.last().x, 1e-6)
        assertTrue(points.any { abs(it.y) > 10 })
    }

    @Test
    fun `point in boundary uses ray casting`() {
        val square = listOf(
            listOf(
                Point(0.0, 0.0),
                Point(10.0, 0.0),
                Point(10.0, 10.0),
                Point(0.0, 10.0),
                Point(0.0, 0.0),
            ),
        )
        assertTrue(SvgGeometry.pointInBoundary(Point(5.0, 5.0), square))
        assertFalse(SvgGeometry.pointInBoundary(Point(15.0, 5.0), square))
    }

    @Test
    fun `label markers are demoted to auxiliary artwork`() {
        val svg = """
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
              <polygon id="alpha" points="10,10 190,10 190,190 10,190" fill="#b7a370"/>
              <circle id="alpha" cx="100" cy="100" r="4" fill="#282316"/>
            </svg>
        """.trimIndent()
        val prepared = MapImporter.prepare(svg, random = Random(3))
        assertEquals(listOf("alpha"), prepared.mapDefinition.regionIds)
        assertTrue(prepared.mapDefinition.importIssues.any { it.code == "AUXILIARY_ARTWORK" })
        assertNotNull(prepared.preparedSvg)
    }
}

/** Test-only bridge to the internal DOM walker. */
private fun org.w3c.dom.Element.selfAndDescendantsForTest(): List<org.w3c.dom.Element> {
    val result = mutableListOf(this)
    val children = childNodes
    for (index in 0 until children.length) {
        val node = children.item(index)
        if (node is org.w3c.dom.Element) result.addAll(node.selfAndDescendantsForTest())
    }
    return result
}
