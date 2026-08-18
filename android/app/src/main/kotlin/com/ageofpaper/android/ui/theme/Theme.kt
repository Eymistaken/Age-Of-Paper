package com.ageofpaper.android.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * Commander's Desk tokens taken straight from the phone design.
 *
 * The design uses Libre Caslon Text for display, Source Serif 4 for overlines
 * and Work Sans for body copy. The bundled system families stand in for them:
 * serif carries the display and overline roles, sans-serif the body, keeping
 * the same weight ladder without shipping font binaries.
 */
object Ink {
    val Background = Color(0xFF141612)
    val Panel = Color(0xFF17160F)
    val Card = Color(0xFF222019)
    val CardMuted = Color(0xFF1B1A13)
    val Strip = Color(0xFF2D2A21)
    val StripWar = Color(0xFF35211D)

    val Line = Color(0xFF51462F)
    val LineStrong = Color(0xFF76592B)
    val LineGold = Color(0xFFA97924)

    val Gold = Color(0xFFE0AD45)
    val GoldLight = Color(0xFFEAD9A7)
    val Text = Color(0xFFECE2C8)
    val TextMuted = Color(0xFFB8AA83)

    val Approve = Color(0xFF55764A)
    val ApproveText = Color(0xFFB8CFAA)
    val Income = Color(0xFF8DA97F)
    val War = Color(0xFFA8453E)
    val WarSurface = Color(0xFF241713)
    val WarText = Color(0xFFD59A92)
    val Sea = Color(0xFF246B70)
    val SeaText = Color(0xFF9FC4C0)
    val SeaDeep = Color(0xFF245F63)
    val TargetGreen = Color(0xFF43B978)
    val TargetGreenText = Color(0xFF8FD8AB)

    val Paper = Color(0xFFD1BF8C)
    val PaperGrid = Color(0x12282316)
    val LandStroke = Color(0xFF282316)
    val NeutralLand = Color(0xFFB7A370)
    val NeutralLandSelected = Color(0xFFC6B07A)
    val OnGold = Color(0xFF2E2209)
}

/** Player palette, identical to `src/constants.js`. */
val PlayerColors = listOf(
    Color(0xFF2F6FA3),
    Color(0xFFA33A32),
    Color(0xFF4F7A45),
    Color(0xFFC89B3C),
    Color(0xFF6B4C9A),
    Color(0xFF2A7F78),
    Color(0xFFC56A2D),
    Color(0xFF9B4F7A),
    Color(0xFF5F6B73),
    Color(0xFF7A5132),
)

object Dimens {
    /** Every primary order button in the design is 58 px tall. */
    val PrimaryButtonHeight = 58.dp
    val SecondaryButtonHeight = 50.dp
    val ControlHeight = 46.dp
    val CardCorner = 8.dp
    val SheetCorner = 16.dp
    val ScreenPadding = 14.dp
}

object AopType {
    val Display = TextStyle(
        fontFamily = FontFamily.Serif,
        fontWeight = FontWeight.Bold,
        fontSize = 26.sp,
        lineHeight = 29.sp,
        color = Ink.Gold,
    )
    val DisplaySmall = TextStyle(
        fontFamily = FontFamily.Serif,
        fontWeight = FontWeight.Bold,
        fontSize = 21.sp,
        lineHeight = 24.sp,
        color = Ink.Gold,
    )
    val Overline = TextStyle(
        fontFamily = FontFamily.Serif,
        fontWeight = FontWeight.Bold,
        fontSize = 11.sp,
        letterSpacing = 1.1.sp,
        color = Ink.TextMuted,
    )
    val Body = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontSize = 14.sp,
        lineHeight = 20.sp,
        color = Ink.Text,
    )
    val BodySmall = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontSize = 12.sp,
        lineHeight = 17.sp,
        color = Ink.TextMuted,
    )
    val Label = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Bold,
        fontSize = 13.sp,
        color = Ink.Text,
    )
    val Numeric = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.ExtraBold,
        fontSize = 18.sp,
        color = Ink.GoldLight,
    )
    val ButtonPrimary = TextStyle(
        fontFamily = FontFamily.Serif,
        fontWeight = FontWeight.Bold,
        fontSize = 17.sp,
    )
}

private val AopColorScheme = darkColorScheme(
    primary = Ink.Gold,
    onPrimary = Ink.OnGold,
    secondary = Ink.LineStrong,
    onSecondary = Ink.GoldLight,
    background = Ink.Background,
    onBackground = Ink.Text,
    surface = Ink.Card,
    onSurface = Ink.Text,
    surfaceVariant = Ink.CardMuted,
    onSurfaceVariant = Ink.TextMuted,
    error = Ink.War,
    onError = Ink.GoldLight,
    outline = Ink.Line,
)

@Composable
fun AgeOfPaperTheme(
    @Suppress("UNUSED_PARAMETER") darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    // The Commander's Desk identity is a single dark theme by design.
    MaterialTheme(
        colorScheme = AopColorScheme,
        typography = Typography(
            bodyLarge = AopType.Body,
            bodyMedium = AopType.Body,
            bodySmall = AopType.BodySmall,
            labelLarge = AopType.Label,
            titleLarge = AopType.Display,
        ),
        content = content,
    )
}

/** Maps a stored player colour string onto the palette, with a safe fallback. */
fun playerColor(hex: String?): Color = runCatching {
    Color(android.graphics.Color.parseColor(hex))
}.getOrDefault(Ink.TextMuted)
