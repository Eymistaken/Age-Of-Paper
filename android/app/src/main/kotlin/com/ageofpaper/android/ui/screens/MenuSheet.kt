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
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.ageofpaper.android.ui.components.Overline
import com.ageofpaper.android.ui.components.SecondaryOrderButton
import com.ageofpaper.android.ui.theme.AopType
import com.ageofpaper.android.ui.theme.Dimens
import com.ageofpaper.android.ui.theme.Ink
import com.ageofpaper.core.rules.NavalPolicy
import com.ageofpaper.core.rules.Phases

/**
 * Everything the web client keeps in side panels: leaving, surrendering,
 * skipping an offline commander, and the naval route configuration.
 */
@Composable
fun MenuSheet(
    phase: String,
    isHost: Boolean,
    navalPolicy: String?,
    pendingRequests: List<JoinRequestRow>,
    busy: Boolean,
    onDismiss: () -> Unit,
    onLeave: () -> Unit,
    onSkipOffline: () -> Unit,
    onOpenPrepare: () -> Unit,
    onNavalPolicy: (String) -> Unit,
    onAcceptRequest: (String) -> Unit,
    onRejectRequest: (String) -> Unit,
    onVoteRequest: (String, Boolean) -> Unit,
) {
    Box(modifier = Modifier.fillMaxSize()) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Color(0xB80A0B07))
                .clickable(onClick = onDismiss),
        )
        Column(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .clip(RoundedCornerShape(topStart = Dimens.SheetCorner, topEnd = Dimens.SheetCorner))
                .background(Ink.Card),
        ) {
            Box(Modifier.fillMaxWidth().height(2.dp).background(Ink.LineStrong))
            Column(
                modifier = Modifier
                    .verticalScroll(rememberScrollState())
                    .navigationBarsPadding()
                    .padding(Dimens.ScreenPadding),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column {
                        Overline("Komuta menüsü")
                        Text("Masadaki emirler", style = AopType.DisplaySmall)
                    }
                    Text(
                        "×",
                        style = AopType.Display,
                        modifier = Modifier.clickable(onClick = onDismiss).padding(8.dp),
                    )
                }

                JoinRequestCards(
                    requests = pendingRequests,
                    onAccept = onAcceptRequest,
                    onReject = onRejectRequest,
                    onVote = onVoteRequest,
                    isHost = isHost,
                )

                if (isHost && phase == Phases.LOBBY) {
                    Overline("Deniz politikası")
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        NavalPolicyChip("Tüm kıyılar", NavalPolicy.ALL_COASTS, navalPolicy, Modifier.weight(1f)) {
                            onNavalPolicy(NavalPolicy.ALL_COASTS)
                        }
                        NavalPolicyChip("Seçili rotalar", NavalPolicy.SELECTED_ROUTES, navalPolicy, Modifier.weight(1f)) {
                            onNavalPolicy(NavalPolicy.SELECTED_ROUTES)
                        }
                        NavalPolicyChip("Kapalı", NavalPolicy.DISABLED, navalPolicy, Modifier.weight(1f)) {
                            onNavalPolicy(NavalPolicy.DISABLED)
                        }
                    }
                    SecondaryOrderButton("Hazırlık masasını aç", onOpenPrepare, enabled = !busy)
                }

                if (isHost && phase in setOf(Phases.CLAIMING, Phases.MOBILIZATION, Phases.WAR)) {
                    SecondaryOrderButton(
                        text = "Çevrimdışı oyuncunun sırasını atla",
                        onClick = onSkipOffline,
                        enabled = !busy,
                    )
                }

                Spacer(Modifier.height(4.dp))
                SecondaryOrderButton(
                    text = if (phase in setOf(Phases.CLAIM_COMPLETE, Phases.MOBILIZATION, Phases.WAR)) {
                        "Teslim ol ve odadan ayrıl"
                    } else {
                        "Odadan ayrıl"
                    },
                    onClick = onLeave,
                    enabled = !busy,
                    contentColor = Ink.WarText,
                )
                Text(
                    "Teslim olduğunda askerlerin ve gemilerin dağılır, limanlar bölgede kalır.",
                    style = AopType.BodySmall,
                )
            }
        }
    }
}

@Composable
private fun NavalPolicyChip(
    label: String,
    value: String,
    current: String?,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    val selected = current == value
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(6.dp))
            .background(if (selected) Ink.Panel else Ink.CardMuted)
            .border(1.dp, if (selected) Ink.LineGold else Ink.Line, RoundedCornerShape(6.dp))
            .clickable(onClick = onClick)
            .padding(horizontal = 8.dp, vertical = 10.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            label,
            style = AopType.BodySmall.copy(color = if (selected) Ink.Gold else Ink.TextMuted),
        )
    }
}
