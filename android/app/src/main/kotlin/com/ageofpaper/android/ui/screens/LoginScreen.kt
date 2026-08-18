package com.ageofpaper.android.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.ageofpaper.android.data.BackendMode
import com.ageofpaper.android.ui.components.Overline
import com.ageofpaper.android.ui.components.PrimaryOrderButton
import com.ageofpaper.android.ui.components.SecondaryOrderButton
import com.ageofpaper.android.ui.theme.AopType
import com.ageofpaper.android.ui.theme.Dimens
import com.ageofpaper.android.ui.theme.Ink

/** Entry screen: pick a commander name, then open or join a table. */
@Composable
fun LoginScreen(
    nickname: String,
    backendMode: BackendMode,
    busy: Boolean,
    onNicknameChange: (String) -> Unit,
    onCreateRoom: () -> Unit,
    onJoinRoom: (String) -> Unit,
) {
    var roomCode by remember { mutableStateOf("") }
    val canSubmit = nickname.trim().isNotEmpty() && !busy

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Ink.Background)
            .statusBarsPadding()
            .navigationBarsPadding()
            .imePadding()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 20.dp, vertical = 28.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Spacer(Modifier.height(24.dp))
        Overline("Harita Meclisi")
        Text("Age of Paper", style = AopType.Display)
        Text(
            "Kâğıt üstünde bir sefer. Komutan adını yaz, masayı kur ya da bir oda koduyla katıl.",
            style = AopType.BodySmall,
        )

        Spacer(Modifier.height(8.dp))
        DeskField(
            value = nickname,
            onValueChange = onNicknameChange,
            label = "Komutan adı",
        )

        PrimaryOrderButton(
            text = "Yeni masa kur",
            onClick = onCreateRoom,
            enabled = canSubmit,
        )

        Spacer(Modifier.height(8.dp))
        Overline("Var olan masaya katıl")
        DeskField(
            value = roomCode,
            onValueChange = { roomCode = it.uppercase().take(4) },
            label = "Oda kodu",
            capitalize = true,
        )
        SecondaryOrderButton(
            text = "Katıl",
            onClick = { onJoinRoom(roomCode) },
            enabled = canSubmit && roomCode.length == 4,
        )

        if (backendMode == BackendMode.DEMO) {
            Spacer(Modifier.height(12.dp))
            Text(
                "Çevrimdışı tanıtım modu: oda yerel olarak kurulur, üç bot komutan sırasını " +
                    "kendisi oynar. Gerçek çok oyunculu mod için Firebase Android uygulama " +
                    "kimliğini ekle.",
                style = AopType.BodySmall,
                textAlign = TextAlign.Start,
            )
        }
    }
}

@Composable
private fun DeskField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    capitalize: Boolean = false,
) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        label = { Text(label, style = AopType.BodySmall) },
        singleLine = true,
        shape = RoundedCornerShape(Dimens.CardCorner),
        keyboardOptions = KeyboardOptions(
            capitalization = if (capitalize) KeyboardCapitalization.Characters else KeyboardCapitalization.Words,
        ),
        colors = OutlinedTextFieldDefaults.colors(
            focusedContainerColor = Ink.Panel,
            unfocusedContainerColor = Ink.Panel,
            focusedBorderColor = Ink.LineStrong,
            unfocusedBorderColor = Ink.Line,
            focusedTextColor = Ink.Text,
            unfocusedTextColor = Ink.Text,
            cursorColor = Ink.Gold,
        ),
        modifier = Modifier.fillMaxWidth(),
    )
}

/** Shared alignment helper so screens can centre a single column of content. */
val CenterColumn = Alignment.CenterHorizontally
