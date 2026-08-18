package com.ageofpaper.android.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.ageofpaper.android.ui.components.Overline
import com.ageofpaper.android.ui.components.PrimaryOrderButton
import com.ageofpaper.android.ui.components.SecondaryOrderButton
import com.ageofpaper.android.ui.components.StatTile
import com.ageofpaper.android.ui.components.formatMoney
import com.ageofpaper.android.ui.theme.AopType
import com.ageofpaper.android.ui.theme.Dimens
import com.ageofpaper.android.ui.theme.Ink
import com.ageofpaper.core.model.CoastTypes
import com.ageofpaper.core.model.TerrainTypes
import com.ageofpaper.core.rules.NavalPolicy
import com.ageofpaper.core.svg.MapImporter

/**
 * Mobile preparation desk: the simplified counterpart of the web terrain
 * editor. It changes host decisions only; the artwork is never rewritten by
 * hand, every edit goes back through the importer.
 */
@Composable
fun MapPrepareScreen(
    prepared: MapImporter.PreparedMap,
    busy: Boolean,
    onTerrainChange: (String, String) -> Unit,
    onPortChange: (String, Boolean) -> Unit,
    onNavalPolicy: (String) -> Unit,
    onToggleRoute: (String, String) -> Unit,
    onApply: () -> Unit,
    onClose: () -> Unit,
) {
    val document = prepared.terrainDocument
    val coastalIds = document.surfaces
        .filter { it.terrainType == TerrainTypes.LAND && it.coastType != CoastTypes.NONE }
        .map { it.id }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Ink.Background)
            .statusBarsPadding(),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(Ink.Panel)
                .padding(horizontal = 16.dp, vertical = 14.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column {
                Overline("Hazırlık masası")
                Text(prepared.displayName, style = AopType.DisplaySmall, maxLines = 1)
            }
            Text(
                "×",
                style = AopType.Display,
                modifier = Modifier.clickable(onClick = onClose).padding(8.dp),
            )
        }
        Box(Modifier.fillMaxWidth().height(1.dp).background(Ink.Line))

        LazyColumn(
            modifier = Modifier.weight(1f).fillMaxWidth().padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    StatTile("Bölge", document.summary.playableLandCount.toString(), Modifier.weight(1f))
                    StatTile("Kıyı", document.summary.coastalLandCount.toString(), Modifier.weight(1f))
                    StatTile("Rota", document.allowedRoutes.size.toString(), Modifier.weight(1f))
                }
            }

            item {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Overline("Deniz politikası")
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        listOf(
                            "Tüm kıyılar" to NavalPolicy.ALL_COASTS,
                            "Seçili rotalar" to NavalPolicy.SELECTED_ROUTES,
                            "Kapalı" to NavalPolicy.DISABLED,
                        ).forEach { (label, value) ->
                            val selected = document.navalPolicy == value
                            Box(
                                modifier = Modifier
                                    .weight(1f)
                                    .clip(RoundedCornerShape(6.dp))
                                    .background(if (selected) Ink.Panel else Ink.CardMuted)
                                    .border(
                                        1.dp,
                                        if (selected) Ink.LineGold else Ink.Line,
                                        RoundedCornerShape(6.dp),
                                    )
                                    .clickable(enabled = !busy) { onNavalPolicy(value) }
                                    .padding(vertical = 10.dp),
                                contentAlignment = Alignment.Center,
                            ) {
                                Text(
                                    label,
                                    style = AopType.BodySmall.copy(
                                        color = if (selected) Ink.Gold else Ink.TextMuted,
                                    ),
                                )
                            }
                        }
                    }
                }
            }

            if (document.navalPolicy == NavalPolicy.SELECTED_ROUTES && coastalIds.size >= 2) {
                item { Overline("Deniz rotaları") }
                items(coastalPairs(coastalIds)) { (first, second) ->
                    val key = NavalPolicy.routeKey(first, second)
                    val enabled = document.allowedRoutes.contains(key)
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(Dimens.CardCorner))
                            .background(Ink.CardMuted)
                            .border(
                                1.dp,
                                if (enabled) Ink.Sea else Ink.Line,
                                RoundedCornerShape(Dimens.CardCorner),
                            )
                            .clickable(enabled = !busy) { onToggleRoute(first, second) }
                            .padding(12.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            "${document.surfacesById[first]?.name} ↔ ${document.surfacesById[second]?.name}",
                            style = AopType.BodySmall.copy(color = Ink.Text),
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.weight(1f),
                        )
                        Overline(
                            if (enabled) "Açık" else "Kapalı",
                            color = if (enabled) Ink.SeaText else Ink.TextMuted,
                        )
                    }
                }
            }

            item { Overline("Yüzeyler") }
            items(document.surfaces.filter { !it.synthetic }, key = { it.id }) { surface ->
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(Dimens.CardCorner))
                        .background(Ink.CardMuted)
                        .border(1.dp, Ink.Line, RoundedCornerShape(Dimens.CardCorner))
                        .padding(12.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            surface.name,
                            style = AopType.Label.copy(color = Ink.GoldLight),
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.weight(1f),
                        )
                        if (surface.terrainType == TerrainTypes.LAND) {
                            Text(
                                "${formatMoney(surface.price ?: 0)} · +${formatMoney(surface.income ?: 0)}",
                                style = AopType.BodySmall,
                            )
                        }
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        TerrainTypes.ALL.forEach { type ->
                            val selected = surface.terrainType == type
                            Box(
                                modifier = Modifier
                                    .weight(1f)
                                    .clip(RoundedCornerShape(5.dp))
                                    .background(if (selected) Ink.Panel else Ink.Card)
                                    .border(
                                        1.dp,
                                        if (selected) Ink.LineGold else Ink.Line,
                                        RoundedCornerShape(5.dp),
                                    )
                                    .clickable(enabled = !busy) { onTerrainChange(surface.id, type) }
                                    .padding(vertical = 8.dp),
                                contentAlignment = Alignment.Center,
                            ) {
                                Text(
                                    terrainLabel(type),
                                    style = AopType.BodySmall.copy(
                                        color = if (selected) Ink.Gold else Ink.TextMuted,
                                    ),
                                )
                            }
                        }
                    }
                    if (surface.terrainType == TerrainTypes.LAND && surface.coastType != CoastTypes.NONE) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable(enabled = !busy) {
                                    onPortChange(surface.id, !surface.portAllowed)
                                },
                            horizontalArrangement = Arrangement.SpaceBetween,
                        ) {
                            Text("Liman kurulabilir", style = AopType.BodySmall.copy(color = Ink.Text))
                            Overline(
                                if (surface.portAllowed) "İzinli" else "Kapalı",
                                color = if (surface.portAllowed) Ink.SeaText else Ink.TextMuted,
                            )
                        }
                    }
                }
            }

            if (prepared.validation.errors.isNotEmpty()) {
                item { Overline("Doğrulama hataları", color = Ink.WarText) }
                items(prepared.validation.errors) { issue ->
                    Text(issue.message, style = AopType.BodySmall.copy(color = Ink.WarText))
                }
            }
        }

        Column(
            modifier = Modifier
                .fillMaxWidth()
                .background(Ink.Panel)
                .navigationBarsPadding()
                .padding(horizontal = 16.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            SecondaryOrderButton("Kapat", onClose)
            PrimaryOrderButton(
                text = "Odaya Uygula",
                onClick = onApply,
                enabled = prepared.validation.valid && !busy,
            )
        }
    }
}

private fun terrainLabel(type: String): String = when (type) {
    TerrainTypes.LAND -> "Kara"
    TerrainTypes.OCEAN -> "Deniz"
    TerrainTypes.LAKE -> "Göl"
    else -> "Yok say"
}

/** All unordered coastal pairs, capped so the list stays usable on a phone. */
private fun coastalPairs(ids: List<String>): List<Pair<String, String>> {
    val pairs = mutableListOf<Pair<String, String>>()
    for (first in ids.indices) {
        for (second in first + 1 until ids.size) {
            pairs.add(ids[first] to ids[second])
            if (pairs.size >= 60) return pairs
        }
    }
    return pairs
}
