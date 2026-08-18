package com.ageofpaper.android.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ageofpaper.android.ui.components.Overline
import com.ageofpaper.android.ui.theme.AopType
import com.ageofpaper.android.ui.theme.Dimens
import com.ageofpaper.android.ui.theme.Ink
import com.ageofpaper.android.ui.theme.playerColor
import com.ageofpaper.core.Constants
import com.ageofpaper.core.model.ChatMessage

/**
 * Design screen 7: the intelligence line.
 *
 * The chat is a layer over the darkened map rather than a tab, so the map never
 * loses its place while a message is written.
 */
@Composable
fun ChatOverlay(
    messages: List<ChatMessage>,
    commanderCount: Int,
    busy: Boolean,
    onSend: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    var draft by remember { mutableStateOf("") }
    val listState = rememberLazyListState()

    LaunchedEffect(messages.size) {
        if (messages.isNotEmpty()) listState.animateScrollToItem(messages.lastIndex)
    }

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
                .fillMaxHeight(0.74f)
                .clip(RoundedCornerShape(topStart = Dimens.SheetCorner, topEnd = Dimens.SheetCorner))
                .background(Ink.Card),
        ) {
            Box(Modifier.fillMaxWidth().height(2.dp).background(Ink.LineStrong))
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(start = 14.dp, end = 14.dp, top = 14.dp, bottom = 12.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column {
                    Overline("Masadaki $commanderCount komutan")
                    Text("İstihbarat Hattı", style = AopType.DisplaySmall)
                }
                Box(
                    modifier = Modifier
                        .size(Dimens.ControlHeight)
                        .clip(RoundedCornerShape(Dimens.CardCorner))
                        .background(Ink.Panel)
                        .border(1.dp, Ink.Line, RoundedCornerShape(Dimens.CardCorner))
                        .clickable(onClick = onDismiss),
                    contentAlignment = Alignment.Center,
                ) {
                    Text("×", style = AopType.Label.copy(color = Ink.TextMuted, fontSize = 22.sp))
                }
            }
            Box(Modifier.fillMaxWidth().height(1.dp).background(Ink.Line))

            LazyColumn(
                state = listState,
                modifier = Modifier.weight(1f).fillMaxWidth().padding(14.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                items(messages, key = { it.id }) { message ->
                    Column {
                        Text(
                            message.name,
                            style = AopType.BodySmall.copy(
                                color = playerColor(message.color),
                                fontWeight = FontWeight.Bold,
                            ),
                        )
                        Box(
                            modifier = Modifier
                                .padding(top = 4.dp)
                                .clip(RoundedCornerShape(6.dp))
                                .background(Ink.Panel)
                                .border(1.dp, Ink.Line, RoundedCornerShape(6.dp))
                                .padding(horizontal = 11.dp, vertical = 9.dp),
                        ) {
                            Text(message.text, style = AopType.Body)
                        }
                    }
                }
            }

            Box(Modifier.fillMaxWidth().height(1.dp).background(Ink.Line))
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Ink.CardMuted)
                    .navigationBarsPadding()
                    .imePadding()
                    .padding(horizontal = 14.dp, vertical = 12.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                OutlinedTextField(
                    value = draft,
                    onValueChange = { draft = it.take(Constants.CHAT_MESSAGE_LIMIT) },
                    placeholder = { Text("Mesaj…", style = AopType.BodySmall) },
                    singleLine = true,
                    shape = RoundedCornerShape(Dimens.CardCorner),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedContainerColor = Ink.Panel,
                        unfocusedContainerColor = Ink.Panel,
                        focusedBorderColor = Ink.LineStrong,
                        unfocusedBorderColor = Ink.Line,
                        focusedTextColor = Ink.Text,
                        unfocusedTextColor = Ink.Text,
                        cursorColor = Ink.Gold,
                    ),
                    modifier = Modifier.weight(1f).heightIn(min = 52.dp),
                )
                Box(
                    modifier = Modifier
                        .size(56.dp)
                        .clip(RoundedCornerShape(Dimens.CardCorner))
                        .background(Ink.Card)
                        .border(1.dp, Ink.LineStrong, RoundedCornerShape(Dimens.CardCorner))
                        .clickable(enabled = draft.isNotBlank() && !busy) {
                            onSend(draft)
                            draft = ""
                        },
                    contentAlignment = Alignment.Center,
                ) {
                    Text("➤", style = AopType.Label.copy(color = Ink.Gold, fontSize = 18.sp))
                }
            }
        }
    }
}
