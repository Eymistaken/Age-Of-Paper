package com.ageofpaper.android.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ageofpaper.android.ui.components.Overline
import com.ageofpaper.android.ui.components.PrimaryOrderButton
import com.ageofpaper.android.ui.components.SecondaryOrderButton
import com.ageofpaper.android.ui.theme.AopType
import com.ageofpaper.android.ui.theme.Dimens
import com.ageofpaper.android.ui.theme.Ink
import com.ageofpaper.android.ui.theme.playerColor
import com.ageofpaper.core.model.Room

/** Design screen 8: the sealed table. */
@Composable
fun VictoryScreen(
    room: Room,
    onOpenChat: () -> Unit,
    onLeave: () -> Unit,
) {
    val winner = room.winnerId?.let { room.players[it] }
    val standings = room.players.values.sortedByDescending { player ->
        room.claims.count { it.value.ownerId == player.id }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Ink.Background)
            .statusBarsPadding(),
    ) {
        Column(
            modifier = Modifier
                .weight(1f)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 18.dp, vertical = 28.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Overline("Sefer Tamamlandı")
            Box(
                modifier = Modifier
                    .size(74.dp)
                    .clip(CircleShape)
                    .background(playerColor(winner?.color))
                    .border(2.dp, androidx.compose.ui.graphics.Color(0xA61F140C), CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    winner?.name?.take(1)?.uppercase() ?: "—",
                    style = AopType.Display.copy(color = Ink.GoldLight, fontSize = 30.sp),
                )
            }
            Text(
                winner?.let { "${it.name} zafer kazandı" } ?: "Sefer sona erdi",
                style = AopType.Display,
                textAlign = TextAlign.Center,
            )
            Text(
                "Son etkin bölge sahibi masayı mühürledi. Sonuçlar ve istihbarat hattı bütün " +
                    "seyircilere açık kalır.",
                style = AopType.BodySmall,
                textAlign = TextAlign.Center,
            )

            Spacer(Modifier.height(4.dp))
            standings.forEach { player ->
                val regions = room.claims.count { it.value.ownerId == player.id }
                val isWinner = player.id == room.winnerId
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(Dimens.CardCorner))
                        .background(if (isWinner) androidx.compose.ui.graphics.Color(0xFF26210F) else Ink.CardMuted)
                        .border(
                            1.dp,
                            if (isWinner) Ink.LineGold else Ink.Line,
                            RoundedCornerShape(Dimens.CardCorner),
                        )
                        .padding(12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Box(
                        modifier = Modifier
                            .size(38.dp)
                            .clip(CircleShape)
                            .background(playerColor(player.color)),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            player.name.take(1).uppercase(),
                            style = AopType.Label.copy(color = Ink.GoldLight),
                        )
                    }
                    Column(Modifier.weight(1f)) {
                        Text(
                            player.name,
                            style = AopType.Body.copy(color = Ink.Text),
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        Overline(
                            when {
                                isWinner -> "Galip"
                                player.eliminated -> "Elendi"
                                else -> "Seyirci"
                            },
                            color = if (isWinner) Ink.Gold else Ink.TextMuted,
                        )
                    }
                    Column(horizontalAlignment = Alignment.End) {
                        Text(regions.toString(), style = AopType.Label.copy(color = Ink.GoldLight))
                        Overline("bölge")
                    }
                }
            }
        }

        Column(
            modifier = Modifier
                .fillMaxWidth()
                .background(Ink.Panel)
                .navigationBarsPadding()
                .padding(horizontal = 18.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            SecondaryOrderButton("İstihbarat hattını aç", onOpenChat)
            PrimaryOrderButton(text = "Odadan Ayrıl", onClick = onLeave)
        }
    }
}
