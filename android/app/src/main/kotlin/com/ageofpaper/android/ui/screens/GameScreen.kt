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
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ageofpaper.android.ui.UiState
import com.ageofpaper.android.ui.WarStep
import com.ageofpaper.android.ui.components.Overline
import com.ageofpaper.android.ui.components.PlayerAvatar
import com.ageofpaper.android.ui.components.formatMoney
import com.ageofpaper.android.ui.map.MapCanvas
import com.ageofpaper.android.ui.map.RegionAccent
import com.ageofpaper.android.ui.map.RegionBadge
import com.ageofpaper.android.ui.map.RegionStyle
import com.ageofpaper.android.ui.theme.AopType
import com.ageofpaper.android.ui.theme.Dimens
import com.ageofpaper.android.ui.theme.Ink
import com.ageofpaper.android.ui.theme.playerColor
import com.ageofpaper.core.model.Room
import com.ageofpaper.core.rules.NavalPolicy
import com.ageofpaper.core.rules.Phases

/**
 * The playing surface: HUD, the always-on turn strip, the map, and the single
 * order card. The map takes whatever height the card leaves.
 */
@Composable
fun GameScreen(
    state: UiState,
    onRegionTap: (String) -> Unit,
    onOpenChat: () -> Unit,
    onOpenMenu: () -> Unit,
    commandCard: @Composable () -> Unit,
) {
    val room = state.room ?: return
    val clipboard = LocalClipboardManager.current

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Ink.Background)
            .statusBarsPadding(),
    ) {
        HudBar(
            money = state.me?.money ?: 0L,
            income = state.me?.income ?: 0L,
            roomCode = room.code,
            onCopyCode = { clipboard.setText(AnnotatedString(room.code)) },
            onOpenMenu = onOpenMenu,
        )
        TurnStrip(state)

        Box(modifier = Modifier.weight(1f).fillMaxWidth()) {
            val map = state.map
            if (map == null) {
                Box(
                    modifier = Modifier.fillMaxSize().background(Ink.Paper),
                    contentAlignment = Alignment.Center,
                ) {
                    Text("Harita yükleniyor…", style = AopType.BodySmall.copy(color = Ink.LandStroke))
                }
            } else {
                MapCanvas(
                    map = map,
                    styleFor = { regionId -> state.styleFor(regionId) },
                    badges = state.badges(),
                    routeLines = state.routeLines(),
                    onRegionTap = onRegionTap,
                    modifier = Modifier.fillMaxSize(),
                )
            }

            if (state.phase == Phases.CLAIMING && state.isMyTurn) {
                Box(
                    modifier = Modifier
                        .align(Alignment.TopStart)
                        .padding(12.dp)
                        .clip(RoundedCornerShape(6.dp))
                        .background(Color(0xEB17160F))
                        .border(1.dp, Ink.LineGold, RoundedCornerShape(6.dp))
                        .padding(horizontal = 11.dp, vertical = 7.dp),
                ) {
                    Overline("${state.legalClaims.size} bölge alınabilir", color = Ink.Gold)
                }
            }
            if (state.phase == Phases.WAR && state.warPlan.step == WarStep.CONFIRM) {
                Box(
                    modifier = Modifier
                        .align(Alignment.TopStart)
                        .padding(12.dp)
                        .clip(RoundedCornerShape(6.dp))
                        .background(Color(0xEB17160F))
                        .border(1.dp, Ink.TargetGreen, RoundedCornerShape(6.dp))
                        .padding(horizontal = 11.dp, vertical = 7.dp),
                ) {
                    Overline("Hedef seçildi", color = Ink.TargetGreenText)
                }
            }

            ChatFab(
                unread = state.unreadCount,
                onClick = onOpenChat,
                modifier = Modifier.align(Alignment.BottomStart).padding(12.dp),
            )
        }

        commandCard()
    }
}

@Composable
private fun HudBar(
    money: Long,
    income: Long,
    roomCode: String,
    onCopyCode: () -> Unit,
    onOpenMenu: () -> Unit,
) {
    Column {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(Ink.Panel)
                .padding(horizontal = 14.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(formatMoney(money), style = AopType.Numeric)
                Text(
                    "tur başı +${formatMoney(income)}",
                    style = AopType.BodySmall.copy(color = Ink.Income, fontWeight = FontWeight.Bold),
                )
            }
            Row(
                modifier = Modifier
                    .height(Dimens.ControlHeight)
                    .clip(RoundedCornerShape(Dimens.CardCorner))
                    .background(Ink.Card)
                    .border(1.dp, Ink.LineStrong, RoundedCornerShape(Dimens.CardCorner))
                    .clickable(onClick = onCopyCode)
                    .padding(horizontal = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(7.dp),
            ) {
                Text(
                    roomCode,
                    style = AopType.Label.copy(
                        color = Ink.GoldLight,
                        letterSpacing = 1.6.sp,
                        fontSize = 15.sp,
                    ),
                )
                Text("⧉", style = AopType.Label.copy(color = Ink.Gold))
            }
            Box(
                modifier = Modifier
                    .size(Dimens.ControlHeight)
                    .clip(RoundedCornerShape(Dimens.CardCorner))
                    .background(Ink.Card)
                    .border(1.dp, Ink.Line, RoundedCornerShape(Dimens.CardCorner))
                    .clickable(onClick = onOpenMenu),
                contentAlignment = Alignment.Center,
            ) {
                Text("☰", style = AopType.Label.copy(color = Ink.TextMuted, fontSize = 18.sp))
            }
        }
        Box(Modifier.fillMaxWidth().height(1.dp).background(Ink.Line))
    }
}

/** The permanent turn strip that replaced the order tab. */
@Composable
private fun TurnStrip(state: UiState) {
    val room = state.room ?: return
    val war = state.phase == Phases.WAR || state.phase == Phases.MOBILIZATION
    val accent = if (war && state.warPlan.operation?.attack == true) Ink.War else {
        playerColor(room.players[room.activePlayerId]?.color)
    }
    Column {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .height(42.dp)
                .background(if (state.warPlan.operation?.attack == true) Ink.StripWar else Ink.Strip)
                .padding(horizontal = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Box(Modifier.width(4.dp).height(42.dp).background(accent))
            Text(
                when {
                    state.warPlan.operation?.attack == true &&
                        state.warPlan.step != WarStep.OPERATION -> "Saldırı hazırlanıyor"

                    state.isMyTurn -> "Sıra sende"
                    else -> room.players[room.activePlayerId]?.name?.let { "$it oynuyor" } ?: "Sıra bekleniyor"
                },
                style = AopType.Label.copy(color = Ink.GoldLight, fontSize = 15.sp),
                maxLines = 1,
            )
            Text(
                phaseLabel(room),
                style = AopType.BodySmall,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            Row(horizontalArrangement = Arrangement.spacedBy((-6).dp)) {
                state.orderedPlayers.take(6).forEach { player ->
                    PlayerAvatar(
                        name = player.name,
                        color = playerColor(player.color),
                        size = 26.dp,
                        active = player.id == room.activePlayerId,
                        dimmed = player.eliminated,
                    )
                }
            }
        }
        Box(Modifier.fillMaxWidth().height(1.dp).background(Ink.Line))
    }
}

private fun phaseLabel(room: Room): String = when (room.phase) {
    Phases.CLAIMING -> "Round ${room.roundNumber} · Edinme"
    Phases.CLAIM_COMPLETE -> "Edinme tamamlandı"
    Phases.MOBILIZATION -> "Seferberlik turu"
    Phases.WAR -> "Round ${room.roundNumber} · Savaş"
    Phases.FINISHED -> "Sefer tamamlandı"
    else -> "Lobi"
}

@Composable
private fun ChatFab(unread: Int, onClick: () -> Unit, modifier: Modifier = Modifier) {
    Box(modifier = modifier) {
        Box(
            modifier = Modifier
                .size(52.dp)
                .clip(CircleShape)
                .background(Ink.Card)
                .border(1.dp, Ink.LineStrong, CircleShape)
                .clickable(onClick = onClick),
            contentAlignment = Alignment.Center,
        ) {
            Text("➤", style = AopType.Label.copy(color = Ink.Gold, fontSize = 18.sp))
        }
        if (unread > 0) {
            Box(
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .offset(x = 4.dp, y = (-4).dp)
                    .size(21.dp)
                    .clip(CircleShape)
                    .background(Ink.War)
                    .border(1.dp, Ink.GoldLight, CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    if (unread > 9) "9+" else unread.toString(),
                    style = AopType.Label.copy(color = Ink.GoldLight, fontSize = 10.sp),
                )
            }
        }
    }
}

// ------------------------------------------------------------ map styling

private fun UiState.styleFor(regionId: String): RegionStyle {
    val room = room ?: return RegionStyle(Ink.NeutralLand)
    val claim = room.claims[regionId]
    val owner = claim?.ownerId
    val fill = if (owner == null) {
        if (selectedRegionId == regionId) Ink.NeutralLandSelected else Ink.NeutralLand
    } else {
        playerColor(room.players[owner]?.color)
    }
    val plan = warPlan
    val accent = when {
        plan.sourceId == regionId -> RegionAccent.SOURCE
        plan.targetId == regionId -> RegionAccent.TARGET
        plan.step == WarStep.CONFIRM -> RegionAccent.DIMMED
        selectedRegionId == regionId -> RegionAccent.SELECTED
        phase == Phases.CLAIMING && isMyTurn && legalClaims.contains(regionId) -> RegionAccent.LEGAL
        else -> RegionAccent.NONE
    }
    return RegionStyle(fill, accent)
}

private fun UiState.badges(): List<RegionBadge> {
    val room = room ?: return emptyList()
    if (phase != Phases.MOBILIZATION && phase != Phases.WAR && phase != Phases.FINISHED) return emptyList()
    return room.claims.mapNotNull { (regionId, claim) ->
        if (claim.ownerId == null || claim.soldiers <= 0) return@mapNotNull null
        RegionBadge(
            regionId = regionId,
            soldiers = claim.soldiers,
            hasPort = claim.hasPort,
            ships = claim.ships,
        )
    }
}

private fun UiState.routeLines(): List<Pair<String, String>> {
    val definition = room?.mapDefinition ?: return emptyList()
    if (definition.navalPolicy != NavalPolicy.SELECTED_ROUTES) return emptyList()
    return definition.allowedRoutes.mapNotNull { key ->
        NavalPolicy.normalizeRoutePair(key)?.let { it.first to it.second }
    }
}
