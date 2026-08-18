package com.ageofpaper.android.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ageofpaper.android.ui.theme.AopType
import com.ageofpaper.android.ui.theme.Dimens
import com.ageofpaper.android.ui.theme.Ink
import java.text.DecimalFormat
import java.text.DecimalFormatSymbols
import java.util.Locale

private val turkishGrouping = DecimalFormat(
    "#,###",
    DecimalFormatSymbols(Locale("tr", "TR")).apply { groupingSeparator = '.' },
)

/** 18.500 style grouping, matching the design and the Turkish web UI. */
fun formatMoney(value: Long): String = turkishGrouping.format(value)

/** Compact thousands used on map badges: 6.000 soldiers reads as `6K`. */
fun formatCompact(value: Int): String =
    if (value >= 1000 && value % 1000 == 0) "${value / 1000}K" else formatMoney(value.toLong())

@Composable
fun Overline(text: String, modifier: Modifier = Modifier, color: Color = Ink.TextMuted) {
    Text(
        text = text.uppercase(Locale("tr", "TR")),
        style = AopType.Overline.copy(color = color),
        modifier = modifier,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
    )
}

/** The gold order button pinned to the bottom edge of every screen. */
@Composable
fun PrimaryOrderButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    container: Color = Ink.Gold,
    contentColor: Color = Ink.OnGold,
    border: Color = Ink.LineGold,
    leading: @Composable (() -> Unit)? = null,
) {
    Button(
        onClick = onClick,
        enabled = enabled,
        modifier = modifier.fillMaxWidth().heightIn(min = Dimens.PrimaryButtonHeight),
        shape = RoundedCornerShape(Dimens.CardCorner),
        border = BorderStroke(2.dp, if (enabled) border else Ink.Line),
        colors = ButtonDefaults.buttonColors(
            containerColor = container,
            contentColor = contentColor,
            disabledContainerColor = Ink.Panel,
            disabledContentColor = Ink.TextMuted,
        ),
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            leading?.invoke()
            Text(text = text, style = AopType.ButtonPrimary, textAlign = TextAlign.Center)
        }
    }
}

/** Outlined counterpart used for the softer choice under the main order. */
@Composable
fun SecondaryOrderButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    contentColor: Color = Ink.Gold,
) {
    Button(
        onClick = onClick,
        enabled = enabled,
        modifier = modifier.fillMaxWidth().heightIn(min = Dimens.SecondaryButtonHeight),
        shape = RoundedCornerShape(Dimens.CardCorner),
        border = BorderStroke(1.dp, if (enabled) Ink.LineStrong else Ink.Line),
        colors = ButtonDefaults.buttonColors(
            containerColor = Ink.Panel,
            contentColor = contentColor,
            disabledContainerColor = Ink.Panel,
            disabledContentColor = Ink.TextMuted,
        ),
    ) {
        Text(text = text, style = AopType.Label.copy(color = if (enabled) contentColor else Ink.TextMuted))
    }
}

/** Round commander badge with the initial, used in lists and the turn strip. */
@Composable
fun PlayerAvatar(
    name: String,
    color: Color,
    size: androidx.compose.ui.unit.Dp = 40.dp,
    active: Boolean = false,
    dimmed: Boolean = false,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier
            .size(size)
            .clip(CircleShape)
            .background(if (dimmed) color.copy(alpha = 0.45f) else color)
            .border(2.dp, if (active) Ink.Gold else Color(0xA61F140C), CircleShape),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = name.take(1).uppercase(Locale("tr", "TR")),
            style = AopType.Label.copy(
                color = Ink.GoldLight,
                fontSize = (size.value * 0.4f).sp,
            ),
        )
    }
}

/** Small bordered fact box; the design uses rows of three. */
@Composable
fun StatTile(
    label: String,
    value: String,
    modifier: Modifier = Modifier,
    valueColor: Color = Ink.GoldLight,
) {
    Column(
        modifier = modifier
            .clip(RoundedCornerShape(6.dp))
            .background(Ink.Panel)
            .border(1.dp, Ink.Line, RoundedCornerShape(6.dp))
            .padding(horizontal = 10.dp, vertical = 9.dp),
        verticalArrangement = Arrangement.spacedBy(3.dp),
    ) {
        Overline(label)
        Text(
            text = value,
            style = AopType.Label.copy(color = valueColor),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

/** Bordered surface used for every panel in the design. */
@Composable
fun DeskCard(
    modifier: Modifier = Modifier,
    background: Color = Ink.CardMuted,
    border: Color = Ink.Line,
    content: @Composable androidx.compose.foundation.layout.ColumnScope.() -> Unit,
) {
    Column(
        modifier = modifier
            .clip(RoundedCornerShape(Dimens.CardCorner))
            .background(background)
            .border(1.dp, border, RoundedCornerShape(Dimens.CardCorner))
            .padding(14.dp),
        content = content,
    )
}

/** Pill used for state words such as `Alınabilir`. */
@Composable
fun StatusPill(text: String, color: Color, borderColor: Color, modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(6.dp))
            .background(Ink.Panel)
            .border(1.dp, borderColor, RoundedCornerShape(6.dp))
            .padding(horizontal = 10.dp, vertical = 7.dp),
    ) {
        Overline(text, color = color)
    }
}
