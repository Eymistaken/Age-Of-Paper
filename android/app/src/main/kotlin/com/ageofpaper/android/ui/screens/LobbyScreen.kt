package com.ageofpaper.android.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ageofpaper.android.ui.components.DeskCard
import com.ageofpaper.android.ui.components.Overline
import com.ageofpaper.android.ui.components.PlayerAvatar
import com.ageofpaper.android.ui.components.PrimaryOrderButton
import com.ageofpaper.android.ui.components.SecondaryOrderButton
import com.ageofpaper.android.ui.components.StatTile
import com.ageofpaper.android.ui.components.formatMoney
import com.ageofpaper.android.ui.theme.AopType
import com.ageofpaper.android.ui.theme.Dimens
import com.ageofpaper.android.ui.theme.Ink
import com.ageofpaper.android.ui.theme.playerColor
import com.ageofpaper.core.Constants
import com.ageofpaper.core.model.Room
import com.ageofpaper.core.svg.MapImporter

/**
 * Design screen 1: the map assembly.
 *
 * Room code, commander roster, the SVG drop target and the validation summary
 * scroll; the gold start order stays pinned to the bottom edge.
 */
@Composable
fun LobbyScreen(
    room: Room,
    isHost: Boolean,
    busy: Boolean,
    pendingImport: MapImporter.PreparedMap?,
    onPickMap: () -> Unit,
    onApplyMap: () -> Unit,
    onDiscardMap: () -> Unit,
    onOpenPrepare: () -> Unit,
    onStart: () -> Unit,
    onLeave: () -> Unit,
) {
    val clipboard = LocalClipboardManager.current
    val definition = pendingImport?.mapDefinition ?: room.mapDefinition
    val validation = pendingImport?.validation ?: room.mapValidation

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
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Column {
                Overline("Harita Meclisi")
                Text("Age of Paper", style = AopType.DisplaySmall)
            }
            Box(
                modifier = Modifier
                    .size(46.dp)
                    .clip(RoundedCornerShape(Dimens.CardCorner))
                    .background(Ink.Card)
                    .border(1.dp, Ink.Line, RoundedCornerShape(Dimens.CardCorner))
                    .clickable(onClick = onLeave),
                contentAlignment = Alignment.Center,
            ) {
                Text("⎋", style = AopType.Label.copy(color = Ink.War, fontSize = 20.sp))
            }
        }
        Box(Modifier.fillMaxWidth().height(1.dp).background(Ink.Line))

        Column(
            modifier = Modifier
                .weight(1f)
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(Dimens.CardCorner))
                    .background(Ink.Card)
                    .border(2.dp, Ink.LineStrong, RoundedCornerShape(Dimens.CardCorner))
                    .padding(horizontal = 14.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Column {
                    Overline("Oda Kodu")
                    Text(
                        room.code,
                        style = AopType.DisplaySmall.copy(color = Ink.GoldLight, letterSpacing = 4.sp),
                    )
                }
                SecondaryOrderButton(
                    text = "Kopyala",
                    onClick = { clipboard.setText(AnnotatedString(room.code)) },
                    modifier = Modifier.width(130.dp),
                )
            }

            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.Bottom,
                ) {
                    Overline("Komutanlar")
                    Text(
                        "${room.players.size} / ${Constants.MAX_PLAYERS}",
                        style = AopType.Label.copy(color = Ink.GoldLight),
                    )
                }
                room.players.values.sortedBy { it.joinedAt }.forEach { player ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(Dimens.CardCorner))
                            .background(Ink.CardMuted)
                            .border(1.dp, Ink.Line, RoundedCornerShape(Dimens.CardCorner))
                            .padding(horizontal = 12.dp, vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        PlayerAvatar(player.name, playerColor(player.color))
                        Text(
                            player.name,
                            style = AopType.Body.copy(fontWeight = FontWeight.Bold),
                            modifier = Modifier.weight(1f),
                        )
                        if (player.id == room.hostId) {
                            Box(
                                modifier = Modifier
                                    .clip(RoundedCornerShape(3.dp))
                                    .background(Ink.Panel)
                                    .border(1.dp, Ink.LineStrong, RoundedCornerShape(3.dp))
                                    .padding(horizontal = 9.dp, vertical = 5.dp),
                            ) {
                                Overline("Kurucu", color = Ink.Gold)
                            }
                        }
                    }
                }
                val free = Constants.MAX_PLAYERS - room.players.size
                if (free > 0) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .heightIn(min = 56.dp)
                            .clip(RoundedCornerShape(Dimens.CardCorner))
                            .background(Ink.Panel)
                            .border(2.dp, Ink.Line, RoundedCornerShape(Dimens.CardCorner)),
                        contentAlignment = Alignment.Center,
                    ) {
                        Overline("$free boş kontenjan")
                    }
                }
            }

            if (isHost) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(min = 132.dp)
                        .clip(RoundedCornerShape(Dimens.CardCorner))
                        .background(Color_1F1D15)
                        .border(1.dp, Ink.LineGold, RoundedCornerShape(Dimens.CardCorner))
                        .clickable(onClick = onPickMap)
                        .padding(20.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterVertically),
                ) {
                    Text("◆", style = AopType.Display.copy(fontSize = 26.sp))
                    Text(
                        "SVG haritayı seç",
                        style = AopType.Body.copy(color = Ink.GoldLight, fontWeight = FontWeight.SemiBold),
                    )
                    Text(
                        "Odaya ancak “Odaya Uygula” emriyle yazılır",
                        style = AopType.BodySmall,
                    )
                }
            }

            if (definition != null) {
                DeskCard(modifier = Modifier.fillMaxWidth()) {
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(bottom = 10.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text("${definition.regions.size} oynanabilir bölge", style = AopType.Body)
                        Text(
                            if (validation?.valid == true) "Doğrulandı" else "Hatalı",
                            style = AopType.Label.copy(
                                color = if (validation?.valid == true) Ink.Income else Ink.War,
                            ),
                        )
                    }
                    Box(Modifier.fillMaxWidth().height(1.dp).background(Ink.Line))
                    Spacer(Modifier.height(10.dp))
                    val summary = definition.pricingSummary
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        StatTile(
                            "Fiyat",
                            summary?.let { "${formatMoney(it.minPrice)}–${formatMoney(it.maxPrice)}" } ?: "—",
                            Modifier.weight(1f),
                        )
                        StatTile(
                            "Medyan",
                            summary?.let { formatMoney(it.medianPrice.toLong()) } ?: "—",
                            Modifier.weight(1f),
                        )
                        StatTile(
                            "Gelir",
                            summary?.let { "${formatMoney(it.minIncome)}–${formatMoney(it.maxIncome)}" } ?: "—",
                            Modifier.weight(1f),
                        )
                    }
                    Spacer(Modifier.height(10.dp))
                    val coastal = definition.regions.count { it.coastal }
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(Ink.Panel)
                            .border(1.dp, Ink.Sea, RoundedCornerShape(4.dp))
                            .padding(12.dp),
                        verticalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        Text(
                            "$coastal kıyı bölgesi · ${definition.allowedRoutes.size} özel rota",
                            style = AopType.Label.copy(color = Ink.GoldLight),
                        )
                        Text(
                            "Deniz nakli ve saldırısı bu rotalarla sınırlı.",
                            style = AopType.BodySmall.copy(color = Ink.SeaText),
                        )
                    }
                    validation?.errors?.take(3)?.forEach { issue ->
                        Spacer(Modifier.height(8.dp))
                        Text(issue.message, style = AopType.BodySmall.copy(color = Ink.WarText))
                    }
                    if (isHost) {
                        Spacer(Modifier.height(10.dp))
                        SecondaryOrderButton("Hazırlık Masasında Aç", onOpenPrepare)
                    }
                }
            }

            if (pendingImport != null && isHost) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    SecondaryOrderButton("Vazgeç", onDiscardMap, Modifier.weight(1f))
                    SecondaryOrderButton(
                        "Odaya Uygula",
                        onApplyMap,
                        Modifier.weight(1f),
                        enabled = pendingImport.validation.valid && !busy,
                    )
                }
            }
        }

        Column(
            modifier = Modifier
                .fillMaxWidth()
                .background(Ink.Panel)
                .navigationBarsPadding()
                .padding(horizontal = 16.dp, vertical = 12.dp),
        ) {
            PrimaryOrderButton(
                text = "Toprak Edinmeyi Başlat",
                onClick = onStart,
                enabled = isHost && !busy && room.mapValidation?.valid == true,
            )
        }
    }
}

private val Color_1F1D15 = androidx.compose.ui.graphics.Color(0xFF1F1D15)
