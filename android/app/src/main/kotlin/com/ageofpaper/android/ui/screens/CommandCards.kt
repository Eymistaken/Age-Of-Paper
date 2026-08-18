package com.ageofpaper.android.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ageofpaper.android.ui.WarOperation
import com.ageofpaper.android.ui.WarPlan
import com.ageofpaper.android.ui.WarStep
import com.ageofpaper.android.ui.components.Overline
import com.ageofpaper.android.ui.components.PrimaryOrderButton
import com.ageofpaper.android.ui.components.SecondaryOrderButton
import com.ageofpaper.android.ui.components.StatTile
import com.ageofpaper.android.ui.components.StatusPill
import com.ageofpaper.android.ui.components.formatMoney
import com.ageofpaper.android.ui.theme.AopType
import com.ageofpaper.android.ui.theme.Dimens
import com.ageofpaper.android.ui.theme.Ink
import com.ageofpaper.core.model.Claim
import com.ageofpaper.core.model.Eligibility
import com.ageofpaper.core.model.Region
import com.ageofpaper.core.model.Room
import com.ageofpaper.core.rules.WarCombat
import com.ageofpaper.core.rules.WarConstants

/**
 * The single order card that replaced the four tab bar.
 *
 * It is always the bottom third of the screen, its height follows its content,
 * and the primary order sits on the bottom edge within thumb reach.
 */
@Composable
fun CommandCard(
    modifier: Modifier = Modifier,
    accent: Color = Ink.LineStrong,
    content: @Composable ColumnScope.() -> Unit,
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(topStart = Dimens.SheetCorner, topEnd = Dimens.SheetCorner))
            .background(Ink.Card)
            .padding(top = 2.dp),
    ) {
        Box(Modifier.fillMaxWidth().height(2.dp).background(accent))
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .navigationBarsPadding()
                .padding(Dimens.ScreenPadding),
            verticalArrangement = Arrangement.spacedBy(12.dp),
            content = content,
        )
    }
}

/** Design screen 3: a selected region during the claiming phase. */
@Composable
fun ClaimCommandCard(
    region: Region?,
    ownerName: String?,
    eligibility: Eligibility?,
    income: Long,
    isMyTurn: Boolean,
    busy: Boolean,
    onBuy: () -> Unit,
    onSaveIncome: () -> Unit,
) {
    CommandCard {
        if (region == null) {
            Overline("Seçili bölge yok")
            Text(
                if (isMyTurn) {
                    "Haritadan bir bölge seç. Sınırına bitişik tarafsız topraklar altın çerçeveyle işaretli."
                } else {
                    "Sıradaki komutanın emrini bekliyorsun."
                },
                style = AopType.BodySmall,
            )
        } else {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Top,
            ) {
                Column(Modifier.weight(1f)) {
                    Overline("Seçili bölge")
                    Text(
                        region.name,
                        style = AopType.Display.copy(fontSize = 24.sp),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                val legal = eligibility?.legal == true
                StatusPill(
                    text = if (legal) "Alınabilir" else "Alınamaz",
                    color = if (legal) Ink.ApproveText else Ink.WarText,
                    borderColor = if (legal) Ink.Approve else Ink.War,
                )
            }

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                StatTile("Sahibi", ownerName ?: "Tarafsız", Modifier.weight(1f))
                StatTile("Fiyat", formatMoney(region.price), Modifier.weight(1f))
                StatTile("Getiri", "+${formatMoney(region.income)}", Modifier.weight(1f), Ink.Income)
            }

            if (eligibility != null && !eligibility.legal && eligibility.reason != null) {
                Text(eligibility.reason!!, style = AopType.BodySmall.copy(color = Ink.WarText))
            }

            PrimaryOrderButton(
                text = "Satın Al · ${formatMoney(region.price)}",
                onClick = onBuy,
                enabled = eligibility?.legal == true && !busy,
                container = Ink.Approve,
                contentColor = Ink.GoldLight,
                border = Color(0xFF354D2F),
            )
        }

        SecondaryOrderButton(
            text = "Almadan geç, +${formatMoney(income)} biriktir",
            onClick = onSaveIncome,
            enabled = isMyTurn && !busy,
        )
    }
}

/** Design screen 4: logistics during mobilisation. */
@Composable
fun LogisticsCommandCard(
    region: Region?,
    claim: Claim?,
    money: Long,
    canBuildPort: Boolean,
    isMyTurn: Boolean,
    busy: Boolean,
    onRecruit: () -> Unit,
    onBuildPort: () -> Unit,
    onBuyShip: () -> Unit,
    onReady: () -> Unit,
) {
    CommandCard {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.Top,
        ) {
            Column(Modifier.weight(1f)) {
                Overline(if (region == null) "Hazırlık" else "Hazırlık · kendi bölgen")
                Text(
                    region?.name ?: "Bölge seç",
                    style = AopType.Display.copy(fontSize = 24.sp),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            if (claim != null) {
                Column(horizontalAlignment = Alignment.End) {
                    Overline("Asker")
                    Text(formatMoney(claim.soldiers.toLong()), style = AopType.Numeric)
                }
            }
        }

        val owned = region != null && claim?.ownerId != null
        LogisticsRow(
            badge = "+1K",
            title = "Asker al",
            subtitle = "1.000 asker bu bölgeye eklenir",
            price = WarConstants.SOLDIER_COST,
            enabled = owned && isMyTurn && !busy && money >= WarConstants.SOLDIER_COST,
            onClick = onRecruit,
        )
        LogisticsRow(
            badge = "⚓",
            title = "Liman kur",
            subtitle = when {
                claim?.hasPort == true -> "Bu bölgede zaten liman var"
                canBuildPort -> "Kıyı bölgesi, henüz limanı yok"
                else -> "Liman yalnızca kıyı bölgesine kurulabilir"
            },
            price = WarConstants.PORT_COST,
            enabled = owned && isMyTurn && !busy && canBuildPort && money >= WarConstants.PORT_COST,
            onClick = onBuildPort,
            badgeColor = Ink.SeaText,
        )
        LogisticsRow(
            badge = "⛵",
            title = "Gemi al",
            subtitle = if (claim?.hasPort == true) {
                "Kapasite 1.000 asker"
            } else {
                "Önce liman gerekiyor"
            },
            price = WarConstants.SHIP_COST,
            enabled = owned && isMyTurn && !busy && claim?.hasPort == true && money >= WarConstants.SHIP_COST,
            onClick = onBuyShip,
            badgeColor = Ink.SeaText,
        )

        Text(
            "Lojistik turu bitirmez. Para yettiği sürece tekrarlayabilirsin.",
            style = AopType.BodySmall,
        )

        PrimaryOrderButton(
            text = "Hazırım, turu bitir",
            onClick = onReady,
            enabled = isMyTurn && !busy,
        )
    }
}

@Composable
private fun LogisticsRow(
    badge: String,
    title: String,
    subtitle: String,
    price: Long,
    enabled: Boolean,
    onClick: () -> Unit,
    badgeColor: Color = Ink.Gold,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 56.dp)
            .clip(RoundedCornerShape(Dimens.CardCorner))
            .background(if (enabled) Ink.CardMuted else Ink.Panel)
            .border(
                1.dp,
                if (enabled) Ink.LineStrong else Ink.Line,
                RoundedCornerShape(Dimens.CardCorner),
            )
            .clickable(enabled = enabled, onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(
            modifier = Modifier
                .size(34.dp)
                .clip(RoundedCornerShape(6.dp))
                .background(Ink.Panel)
                .border(1.dp, Ink.Line, RoundedCornerShape(6.dp)),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                badge,
                style = AopType.Label.copy(
                    color = if (enabled) badgeColor else Ink.TextMuted,
                    fontSize = 13.sp,
                ),
            )
        }
        Column(Modifier.weight(1f)) {
            Text(
                title,
                style = AopType.Body.copy(
                    fontWeight = FontWeight.Bold,
                    color = if (enabled) Ink.GoldLight else Ink.TextMuted,
                ),
            )
            Text(subtitle, style = AopType.BodySmall, maxLines = 2, overflow = TextOverflow.Ellipsis)
        }
        Text(
            formatMoney(price),
            style = AopType.Label.copy(color = if (enabled) Ink.Gold else Ink.TextMuted),
        )
    }
}

/** Design screens 5 and 6: the three step war order. */
@Composable
fun WarCommandCard(
    room: Room,
    plan: WarPlan,
    isMyTurn: Boolean,
    busy: Boolean,
    onPickOperation: (WarOperation) -> Unit,
    onAmountChange: (Int) -> Unit,
    onBack: () -> Unit,
    onSubmit: () -> Unit,
    onEndTurn: () -> Unit,
) {
    val accent = if (plan.operation?.attack == true) Ink.War else Ink.LineStrong
    CommandCard(accent = accent) {
        WarStepStrip(plan)

        when (plan.step) {
            WarStep.OPERATION -> {
                Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Overline("Bu tur bir harekât hakkın var")
                    Text("Ne yapacaksın?", style = AopType.Display.copy(fontSize = 22.sp))
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OperationTile(
                        WarOperation.LAND_TRANSFER,
                        "Dost yol üzerinden",
                        Ink.LineStrong,
                        Ink.TextMuted,
                        Modifier.weight(1f),
                    ) { onPickOperation(WarOperation.LAND_TRANSFER) }
                    OperationTile(
                        WarOperation.NAVAL_TRANSFER,
                        "Liman ve gemi gerekir",
                        Ink.Sea,
                        Ink.SeaText,
                        Modifier.weight(1f),
                    ) { onPickOperation(WarOperation.NAVAL_TRANSFER) }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OperationTile(
                        WarOperation.LAND_ATTACK,
                        "Komşu bölgeye",
                        Ink.War,
                        Ink.WarText,
                        Modifier.weight(1f),
                        background = Ink.WarSurface,
                    ) { onPickOperation(WarOperation.LAND_ATTACK) }
                    OperationTile(
                        WarOperation.NAVAL_ATTACK,
                        "Rota üzerinden",
                        Ink.War,
                        Ink.WarText,
                        Modifier.weight(1f),
                        background = Ink.WarSurface,
                    ) { onPickOperation(WarOperation.NAVAL_ATTACK) }
                }
                SecondaryOrderButton(
                    text = "Harekât yapmadan turu bitir",
                    onClick = onEndTurn,
                    enabled = isMyTurn && !busy,
                )
            }

            WarStep.TARGET -> {
                Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Overline(plan.operation?.label ?: "Harekât")
                    Text(
                        if (plan.sourceId == null) "Kaynak bölgeni işaretle" else "Hedefi işaretle",
                        style = AopType.Display.copy(fontSize = 20.sp),
                    )
                }
                Text(
                    if (plan.sourceId == null) {
                        "Haritada kendi bölgelerinden birine dokun."
                    } else {
                        "Kaynak seçildi: ${room.region(plan.sourceId)?.name.orEmpty()}. Şimdi hedefe dokun."
                    },
                    style = AopType.BodySmall,
                )
                SecondaryOrderButton("Harekâttan vazgeç", onBack, enabled = !busy)
            }

            WarStep.CONFIRM -> {
                val source = room.region(plan.sourceId)
                val target = room.region(plan.targetId)
                val sourceClaim = room.claims[plan.sourceId]
                val targetClaim = room.claims[plan.targetId]
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(Dimens.CardCorner))
                        .background(Ink.Panel)
                        .border(1.dp, Ink.Line, RoundedCornerShape(Dimens.CardCorner))
                        .padding(12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    Column(Modifier.weight(1f)) {
                        Overline("Kaynak", color = Ink.SeaText)
                        Text(
                            source?.name.orEmpty(),
                            style = AopType.Label.copy(color = Ink.GoldLight),
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        Text(
                            "${formatMoney((sourceClaim?.soldiers ?: 0).toLong())} asker",
                            style = AopType.BodySmall,
                        )
                    }
                    Text("→", style = AopType.Label.copy(color = accent, fontSize = 20.sp))
                    Column(Modifier.weight(1f), horizontalAlignment = Alignment.End) {
                        Overline("Hedef", color = Ink.TargetGreenText)
                        Text(
                            target?.name.orEmpty(),
                            style = AopType.Label.copy(color = Ink.GoldLight),
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        Text(
                            "${formatMoney((targetClaim?.soldiers ?: 0).toLong())} savunma",
                            style = AopType.BodySmall,
                        )
                    }
                }

                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Overline("Gönderilecek asker")
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        StepperButton("−", Modifier.width(60.dp)) { onAmountChange(-1) }
                        Column(
                            modifier = Modifier
                                .weight(1f)
                                .height(60.dp)
                                .clip(RoundedCornerShape(Dimens.CardCorner))
                                .background(Ink.Panel)
                                .border(1.dp, Ink.LineStrong, RoundedCornerShape(Dimens.CardCorner)),
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.Center,
                        ) {
                            Text(
                                formatMoney(plan.amount.toLong()),
                                style = AopType.Numeric.copy(fontSize = 22.sp),
                            )
                            Text(
                                "en fazla ${formatMoney((sourceClaim?.soldiers ?: 0).toLong())}",
                                style = AopType.BodySmall,
                            )
                        }
                        StepperButton("+", Modifier.width(60.dp)) { onAmountChange(1) }
                    }
                }

                if (plan.operation?.attack == true) {
                    val outcome = WarCombat.resolveDeterministicCombat(
                        plan.amount,
                        targetClaim?.soldiers ?: 0,
                    )
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(Dimens.CardCorner))
                            .background(Ink.WarSurface)
                            .border(1.dp, Ink.War, RoundedCornerShape(Dimens.CardCorner))
                            .padding(12.dp),
                        verticalArrangement = Arrangement.spacedBy(5.dp),
                    ) {
                        Text(
                            "Sonuç kesin, rastgelelik yok",
                            style = AopType.Label.copy(color = Ink.GoldLight),
                        )
                        Text(
                            when {
                                outcome == null -> "Asker sayısı 1.000 katı olmalı."
                                outcome.captured -> "${target?.name.orEmpty()} ele geçirilir, " +
                                    "${formatMoney(outcome.attackersRemaining.toLong())} askerin bölgede kalır."

                                else -> "Saldırı kırılır, savunmada " +
                                    "${formatMoney(outcome.defendersRemaining.toLong())} asker kalır."
                            },
                            style = AopType.BodySmall.copy(color = Ink.WarText),
                        )
                    }
                }

                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    SecondaryOrderButton("Geri", onBack, Modifier.width(96.dp), enabled = !busy)
                    PrimaryOrderButton(
                        text = if (plan.operation?.attack == true) "Saldır ve turu bitir" else "Naklet ve turu bitir",
                        onClick = onSubmit,
                        modifier = Modifier.weight(1f),
                        enabled = isMyTurn && !busy,
                        container = if (plan.operation?.attack == true) Ink.War else Ink.Gold,
                        contentColor = if (plan.operation?.attack == true) Ink.GoldLight else Ink.OnGold,
                        border = if (plan.operation?.attack == true) Color(0xFF7D302A) else Ink.LineGold,
                    )
                }
            }
        }
    }
}

@Composable
private fun WarStepStrip(plan: WarPlan) {
    val steps = listOf("Harekât" to WarStep.OPERATION, "Hedef" to WarStep.TARGET, "Onay" to WarStep.CONFIRM)
    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        steps.forEachIndexed { index, (label, step) ->
            val done = plan.step.ordinal > step.ordinal
            val active = plan.step == step
            Row(
                modifier = Modifier
                    .weight(1f)
                    .clip(RoundedCornerShape(6.dp))
                    .background(Ink.Panel)
                    .border(
                        1.dp,
                        if (active) Ink.LineGold else Ink.Line,
                        RoundedCornerShape(6.dp),
                    )
                    .padding(horizontal = 9.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(7.dp),
            ) {
                Box(
                    modifier = Modifier
                        .size(20.dp)
                        .clip(CircleShape)
                        .background(
                            when {
                                done -> Ink.Approve
                                active -> Ink.Gold
                                else -> Ink.Panel
                            },
                        )
                        .border(1.dp, if (active || done) Color.Transparent else Ink.Line, CircleShape),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        if (done) "✓" else "${index + 1}",
                        style = AopType.Label.copy(
                            fontSize = 11.sp,
                            color = if (active) Ink.OnGold else Ink.GoldLight,
                        ),
                    )
                }
                Text(
                    label,
                    style = AopType.BodySmall.copy(
                        color = if (active) Ink.GoldLight else Ink.TextMuted,
                        fontWeight = FontWeight.Bold,
                    ),
                    maxLines = 1,
                )
            }
        }
    }
}

@Composable
private fun OperationTile(
    operation: WarOperation,
    subtitle: String,
    borderColor: Color,
    subtitleColor: Color,
    modifier: Modifier = Modifier,
    background: Color = Ink.CardMuted,
    onClick: () -> Unit,
) {
    Column(
        modifier = modifier
            .heightIn(min = 72.dp)
            .clip(RoundedCornerShape(Dimens.CardCorner))
            .background(background)
            .border(1.dp, borderColor, RoundedCornerShape(Dimens.CardCorner))
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 10.dp),
        verticalArrangement = Arrangement.spacedBy(3.dp, Alignment.CenterVertically),
    ) {
        Text(
            operation.label,
            style = AopType.Body.copy(color = Ink.GoldLight, fontWeight = FontWeight.Bold),
        )
        Text(subtitle, style = AopType.BodySmall.copy(color = subtitleColor))
    }
}

@Composable
private fun StepperButton(label: String, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Box(
        modifier = modifier
            .height(60.dp)
            .clip(RoundedCornerShape(Dimens.CardCorner))
            .background(Ink.CardMuted)
            .border(1.dp, Ink.LineStrong, RoundedCornerShape(Dimens.CardCorner))
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Text(label, style = AopType.Display.copy(fontSize = 24.sp))
    }
}

/** Shown between claiming and mobilisation. */
@Composable
fun ClaimCompleteCard(isHost: Boolean, busy: Boolean, onStartMobilization: () -> Unit) {
    CommandCard {
        Overline("Toprak edinme tamamlandı")
        Text("Sefer hazırlığı", style = AopType.Display.copy(fontSize = 22.sp))
        Text(
            "Harita paylaşıldı. Kurucu seferberliği başlattığında her bölgeye 1.000 asker yerleşir.",
            style = AopType.BodySmall,
        )
        Spacer(Modifier.height(2.dp))
        PrimaryOrderButton(
            text = "Seferberliği Başlat",
            onClick = onStartMobilization,
            enabled = isHost && !busy,
        )
    }
}
