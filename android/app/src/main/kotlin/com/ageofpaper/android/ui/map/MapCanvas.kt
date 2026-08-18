package com.ageofpaper.android.ui.map

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.positionChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.TextMeasurer
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ageofpaper.android.ui.components.formatCompact
import com.ageofpaper.android.ui.theme.Ink
import com.ageofpaper.core.model.ViewBox
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

/** How a region should be outlined, mirroring the design stroke classes. */
enum class RegionAccent { NONE, LEGAL, SELECTED, SOURCE, TARGET, DIMMED }

data class RegionStyle(
    val fill: Color,
    val accent: RegionAccent = RegionAccent.NONE,
)

data class RegionBadge(
    val regionId: String,
    val soldiers: Int,
    val hasPort: Boolean = false,
    val ships: Int = 0,
)

/** Canonical camera state, independent of the command card height. */
data class MapCamera(
    val focusX: Double,
    val focusY: Double,
    val scale: Double,
) {
    companion object {
        fun fit(viewBox: ViewBox) = MapCamera(
            focusX = viewBox.x + viewBox.width / 2,
            focusY = viewBox.y + viewBox.height / 2,
            scale = 1.0,
        )
    }
}

private const val TAP_SLOP_DP = 12f
private const val MIN_SCALE = 0.6
private const val MAX_SCALE = 8.0

/**
 * Draws the map and owns the pointer state machine.
 *
 * The gesture flow follows `src/game/mapPointer.js`: a press is held as
 * `press-pending` until it crosses the movement threshold, only then does it
 * become a pan or a pinch. A press released below the threshold selects the
 * region recorded on press exactly once; a pan or pinch never selects.
 */
@Composable
fun MapCanvas(
    map: RenderableMap,
    styleFor: (String) -> RegionStyle,
    badges: List<RegionBadge>,
    routeLines: List<Pair<String, String>>,
    onRegionTap: (String) -> Unit,
    modifier: Modifier = Modifier,
    camera: MapCamera? = null,
    onCameraChange: (MapCamera) -> Unit = {},
) {
    val density = LocalDensity.current
    val textMeasurer = rememberTextMeasurer()
    var internalCamera by remember(map.viewBox) { mutableStateOf(MapCamera.fit(map.viewBox)) }
    val activeCamera = camera ?: internalCamera

    fun updateCamera(next: MapCamera) {
        internalCamera = next
        onCameraChange(next)
    }

    BoxWithConstraints(modifier = modifier.background(Ink.Paper)) {
        val widthPx = with(density) { maxWidth.toPx() }
        val heightPx = with(density) { maxHeight.toPx() }
        // Base fit keeps the whole viewBox visible; camera scale multiplies it.
        val baseScale = min(widthPx / map.viewBox.width.toFloat(), heightPx / map.viewBox.height.toFloat())
        val effectiveScale = baseScale * activeCamera.scale.toFloat()
        val slop = with(density) { TAP_SLOP_DP.dp.toPx() }

        fun toViewBox(offset: Offset): Pair<Double, Double> {
            val x = (offset.x - widthPx / 2f) / effectiveScale + activeCamera.focusX.toFloat()
            val y = (offset.y - heightPx / 2f) / effectiveScale + activeCamera.focusY.toFloat()
            return x.toDouble() to y.toDouble()
        }

        LaunchedEffect(map.viewBox) {
            if (camera == null) internalCamera = MapCamera.fit(map.viewBox)
        }

        Box(
            modifier = Modifier
                .fillMaxSize()
                .pointerInput(map, effectiveScale, activeCamera) {
                    awaitEachGesture {
                        val down = awaitFirstDown(requireUnconsumed = false)
                        val pressedRegion = toViewBox(down.position).let { (x, y) -> map.regionAt(x, y) }
                        var state = PointerState.PRESS_PENDING
                        var totalDrag = Offset.Zero
                        var camera = activeCamera

                        while (true) {
                            val event = awaitPointerEvent()
                            val changes = event.changes.filter { it.pressed }
                            if (changes.isEmpty()) break

                            if (changes.size >= 2) {
                                state = PointerState.PINCHING
                                val zoom = event.calculateZoomSafely()
                                if (zoom != 1f) {
                                    camera = camera.copy(
                                        scale = (camera.scale * zoom).coerceIn(MIN_SCALE, MAX_SCALE),
                                    )
                                    updateCamera(camera)
                                }
                                changes.forEach { it.consume() }
                                continue
                            }

                            val change = changes.first()
                            if (!change.positionChanged()) continue
                            val delta = change.position - change.previousPosition
                            totalDrag += delta
                            if (state == PointerState.PRESS_PENDING &&
                                abs(totalDrag.x) + abs(totalDrag.y) > slop
                            ) {
                                state = PointerState.PANNING
                            }
                            if (state == PointerState.PANNING) {
                                camera = camera.copy(
                                    focusX = camera.focusX - delta.x / effectiveScale,
                                    focusY = camera.focusY - delta.y / effectiveScale,
                                ).clampTo(map.viewBox)
                                updateCamera(camera)
                                change.consume()
                            }
                        }

                        // A press released below the threshold selects exactly once.
                        if (state == PointerState.PRESS_PENDING && pressedRegion != null) {
                            onRegionTap(pressedRegion)
                        }
                    }
                },
        ) {
            Canvas(modifier = Modifier.fillMaxSize()) {
                drawPaperGrid(effectiveScale)
                translate(
                    left = widthPx / 2f - activeCamera.focusX.toFloat() * effectiveScale,
                    top = heightPx / 2f - activeCamera.focusY.toFloat() * effectiveScale,
                ) {
                    scale(effectiveScale, pivot = Offset.Zero) {
                        drawRegions(map, styleFor, effectiveScale)
                        drawRoutes(map, routeLines, effectiveScale)
                    }
                    drawBadges(map, badges, effectiveScale, textMeasurer)
                }
            }
        }
    }
}

private enum class PointerState { PRESS_PENDING, PANNING, PINCHING }

private fun androidx.compose.ui.input.pointer.PointerEvent.calculateZoomSafely(): Float {
    val pressed = changes.filter { it.pressed }
    if (pressed.size < 2) return 1f
    val current = (pressed[0].position - pressed[1].position).getDistance()
    val previous = (pressed[0].previousPosition - pressed[1].previousPosition).getDistance()
    if (previous <= 0f || current <= 0f) return 1f
    return current / previous
}

private fun MapCamera.clampTo(viewBox: ViewBox): MapCamera = copy(
    focusX = focusX.coerceIn(viewBox.x, viewBox.x + viewBox.width),
    focusY = focusY.coerceIn(viewBox.y, viewBox.y + viewBox.height),
)

private fun DrawScope.drawPaperGrid(scale: Float) {
    val step = 96f * max(0.35f, min(scale, 2f))
    var x = 0f
    while (x < size.width) {
        drawLine(Ink.PaperGrid, Offset(x, 0f), Offset(x, size.height), strokeWidth = 1f)
        x += step
    }
    var y = 0f
    while (y < size.height) {
        drawLine(Ink.PaperGrid, Offset(0f, y), Offset(size.width, y), strokeWidth = 1f)
        y += step
    }
}

private fun DrawScope.drawRegions(
    map: RenderableMap,
    styleFor: (String) -> RegionStyle,
    scale: Float,
) {
    for (shape in map.shapes) {
        val style = styleFor(shape.regionId)
        val alpha = if (style.accent == RegionAccent.DIMMED) 0.4f else 1f
        drawPath(shape.path, color = style.fill, alpha = alpha)
        // Base land outline, then the accent stroke on top.
        drawPath(
            shape.path,
            color = Ink.LandStroke,
            alpha = 0.9f * alpha,
            style = Stroke(width = 1.2f / scale),
        )
        val accent = when (style.accent) {
            RegionAccent.LEGAL -> Ink.Gold to 3.5f
            RegionAccent.SELECTED -> Ink.GoldLight to 4.5f
            RegionAccent.SOURCE -> Ink.SeaDeep to 4.5f
            RegionAccent.TARGET -> Ink.TargetGreen to 4.5f
            else -> null
        }
        if (accent != null) {
            drawPath(
                shape.path,
                color = accent.first,
                style = Stroke(
                    width = accent.second / scale,
                    pathEffect = if (style.accent == RegionAccent.TARGET) {
                        PathEffect.dashPathEffect(floatArrayOf(6f / scale, 4f / scale))
                    } else {
                        null
                    },
                ),
            )
        }
    }
}

private fun DrawScope.drawRoutes(map: RenderableMap, routes: List<Pair<String, String>>, scale: Float) {
    for ((first, second) in routes) {
        val from = map.shapesById[first] ?: continue
        val to = map.shapesById[second] ?: continue
        drawLine(
            color = Ink.Sea,
            start = Offset(from.centerX.toFloat(), from.centerY.toFloat()),
            end = Offset(to.centerX.toFloat(), to.centerY.toFloat()),
            strokeWidth = 2.5f / scale,
            pathEffect = PathEffect.dashPathEffect(floatArrayOf(8f / scale, 6f / scale)),
        )
    }
}

private fun DrawScope.drawBadges(
    map: RenderableMap,
    badges: List<RegionBadge>,
    scale: Float,
    textMeasurer: TextMeasurer,
) {
    for (badge in badges) {
        val shape = map.shapesById[badge.regionId] ?: continue
        val centerX = shape.centerX.toFloat() * scale
        val centerY = shape.centerY.toFloat() * scale
        val label = formatCompact(badge.soldiers)
        val naval = if (badge.hasPort) "⚓${badge.ships}" else null

        val measured = textMeasurer.measure(
            label,
            TextStyle(color = Ink.GoldLight, fontSize = 12.sp, fontWeight = FontWeight.ExtraBold),
        )
        val navalMeasured = naval?.let {
            textMeasurer.measure(it, TextStyle(color = Ink.SeaText, fontSize = 9.sp, fontWeight = FontWeight.Bold))
        }
        val boxWidth = max(44f, measured.size.width + 16f)
        val boxHeight = if (navalMeasured == null) 24f else 32f

        drawRoundRect(
            color = Color(0xF017160F),
            topLeft = Offset(centerX - boxWidth / 2, centerY - boxHeight / 2),
            size = Size(boxWidth, boxHeight),
            cornerRadius = androidx.compose.ui.geometry.CornerRadius(4f, 4f),
        )
        drawRoundRect(
            color = Ink.LineStrong,
            topLeft = Offset(centerX - boxWidth / 2, centerY - boxHeight / 2),
            size = Size(boxWidth, boxHeight),
            cornerRadius = androidx.compose.ui.geometry.CornerRadius(4f, 4f),
            style = Stroke(width = 1.2f),
        )
        drawText(
            measured,
            topLeft = Offset(
                centerX - measured.size.width / 2f,
                centerY - (if (navalMeasured == null) measured.size.height / 2f else measured.size.height - 2f),
            ),
        )
        if (navalMeasured != null) {
            drawText(
                navalMeasured,
                topLeft = Offset(centerX - navalMeasured.size.width / 2f, centerY + 2f),
            )
        }
    }
}
