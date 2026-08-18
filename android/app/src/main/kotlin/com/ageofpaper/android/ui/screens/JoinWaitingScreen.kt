package com.ageofpaper.android.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ageofpaper.android.ui.components.Overline
import com.ageofpaper.android.ui.components.SecondaryOrderButton
import com.ageofpaper.android.ui.components.StatTile
import com.ageofpaper.android.ui.theme.AopType
import com.ageofpaper.android.ui.theme.Dimens
import com.ageofpaper.android.ui.theme.Ink

/** Design screen 2: waiting for the table to approve a join request. */
@Composable
fun JoinWaitingScreen(
    commanderName: String,
    roomCode: String,
    remaining: String,
    onCancel: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Ink.Background)
            .statusBarsPadding()
            .navigationBarsPadding()
            .padding(28.dp),
        verticalArrangement = Arrangement.spacedBy(18.dp, Alignment.CenterVertically),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(10.dp))
                .background(Ink.Card)
                .border(1.dp, Ink.LineStrong, RoundedCornerShape(10.dp))
                .padding(horizontal = 24.dp, vertical = 32.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Box(
                modifier = Modifier
                    .size(66.dp)
                    .clip(CircleShape)
                    .background(Ink.LineStrong)
                    .border(2.dp, androidx.compose.ui.graphics.Color(0xA61F140C), CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                Text("☖", style = AopType.Label.copy(color = Ink.GoldLight, fontSize = 26.sp))
            }
            Overline("Katılma İsteği Gönderildi")
            Text("Onay bekleniyor", style = AopType.Display)
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(7.dp),
            ) {
                StatTile("Komutan", commanderName, Modifier.weight(1f))
                StatTile("Oda", roomCode, Modifier.weight(1f))
                StatTile("Kalan", remaining, Modifier.weight(1f))
            }
            Text(
                "Kurucu tek başına kabul edebilir. Cevap gelmezse odadaki diğer komutanların " +
                    "oybirliği yeterli.",
                style = AopType.BodySmall,
                textAlign = TextAlign.Center,
            )
        }

        SecondaryOrderButton(
            text = "Vazgeç",
            onClick = onCancel,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

/** Host-side approval cards; the design only shows the requesting commander. */
@Composable
fun JoinRequestCards(
    requests: List<JoinRequestRow>,
    onAccept: (String) -> Unit,
    onReject: (String) -> Unit,
    onVote: (String, Boolean) -> Unit,
    isHost: Boolean,
    modifier: Modifier = Modifier,
) {
    if (requests.isEmpty()) return
    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        requests.forEach { request ->
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(Dimens.CardCorner))
                    .background(Ink.Card)
                    .border(1.dp, Ink.LineStrong, RoundedCornerShape(Dimens.CardCorner))
                    .padding(12.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Overline("Katılma isteği")
                Text(request.name, style = AopType.DisplaySmall)
                Text(
                    "${request.approvedCount}/${request.requiredCount} onay",
                    style = AopType.BodySmall,
                )
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (isHost) {
                        SecondaryOrderButton("Kabul et", { onAccept(request.uid) }, Modifier.weight(1f))
                        SecondaryOrderButton(
                            "Reddet",
                            { onReject(request.uid) },
                            Modifier.weight(1f),
                            contentColor = Ink.WarText,
                        )
                    } else {
                        SecondaryOrderButton("Onayla", { onVote(request.uid, true) }, Modifier.weight(1f))
                        SecondaryOrderButton(
                            "Karşıyım",
                            { onVote(request.uid, false) },
                            Modifier.weight(1f),
                            contentColor = Ink.WarText,
                        )
                    }
                }
            }
        }
    }
}

data class JoinRequestRow(
    val uid: String,
    val name: String,
    val approvedCount: Int,
    val requiredCount: Int,
)
