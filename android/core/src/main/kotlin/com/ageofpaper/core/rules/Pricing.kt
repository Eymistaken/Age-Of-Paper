package com.ageofpaper.core.rules

import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToLong
import kotlin.math.sqrt

/** Port of `src/game/pricing.js` (pricing v2). */
object Pricing {
    const val PRICING_VERSION = 2
    const val MIN_AUTOMATIC_PRICE = 5_000L
    const val MAX_AUTOMATIC_PRICE = 40_000L
    const val MIN_AUTOMATIC_INCOME = 500L
    const val MAX_AUTOMATIC_INCOME = 4_000L

    fun clamp(value: Double, minimum: Double, maximum: Double): Double =
        min(maximum, max(minimum, value))

    fun median(values: List<Double>): Double? {
        val sorted = values.filter { it.isFinite() }.sorted()
        if (sorted.isEmpty()) return null
        val middle = sorted.size / 2
        return if (sorted.size % 2 == 0) (sorted[middle - 1] + sorted[middle]) / 2 else sorted[middle]
    }

    fun roundToNearest(value: Double, step: Double): Double = jsRound(value / step) * step

    /** JavaScript `Math.round` rounds halves towards positive infinity. */
    private fun jsRound(value: Double): Double = kotlin.math.floor(value + 0.5)

    fun priceFromArea(regionArea: Double?, medianRegionArea: Double?): Long {
        val safeMedian = if (medianRegionArea != null && medianRegionArea.isFinite() && medianRegionArea > 0) medianRegionArea else 1.0
        val safeArea = if (regionArea != null && regionArea.isFinite() && regionArea > 0) regionArea else safeMedian
        val sizeFactor = clamp(sqrt(safeArea / safeMedian), 0.5, 3.0)
        val price = clamp(10_000.0 * sizeFactor, MIN_AUTOMATIC_PRICE.toDouble(), MAX_AUTOMATIC_PRICE.toDouble())
        return roundToNearest(price, 500.0).roundToLong()
    }

    fun incomeFromPrice(price: Long): Long {
        val income = clamp(price * 0.1, MIN_AUTOMATIC_INCOME.toDouble(), MAX_AUTOMATIC_INCOME.toDouble())
        return roundToNearest(income, 100.0).roundToLong()
    }

    data class PricedRecord(
        val id: String,
        val price: Long,
        val income: Long,
        val usedAreaFallback: Boolean,
        val automaticPrice: Boolean,
        val automaticIncome: Boolean,
    )

    data class PricingInput(
        val id: String,
        val area: Double?,
        val explicitPrice: Long?,
        val explicitIncome: Long?,
    )

    data class PricingOutput(val medianArea: Double, val records: List<PricedRecord>)

    fun applyAutomaticPricing(records: List<PricingInput>): PricingOutput {
        val measured = records.mapNotNull { it.area }.filter { it.isFinite() && it > 0 }
        val medianArea = median(measured) ?: 1.0
        val safeMedian = if (medianArea > 0) medianArea else 1.0
        return PricingOutput(
            medianArea = safeMedian,
            records = records.map { record ->
                val hasArea = record.area != null && record.area.isFinite() && record.area > 0
                val automatic = priceFromArea(if (hasArea) record.area else safeMedian, safeMedian)
                val price = record.explicitPrice ?: automatic
                val income = record.explicitIncome ?: incomeFromPrice(price)
                PricedRecord(
                    id = record.id,
                    price = price,
                    income = income,
                    usedAreaFallback = !hasArea,
                    automaticPrice = record.explicitPrice == null,
                    automaticIncome = record.explicitIncome == null,
                )
            },
        )
    }

    data class EconomySummary(
        val minPrice: Long,
        val medianPrice: Double,
        val maxPrice: Long,
        val minIncome: Long,
        val maxIncome: Long,
    )

    fun summarize(prices: List<Long>, incomes: List<Long>): EconomySummary? {
        if (prices.isEmpty() || incomes.isEmpty()) return null
        return EconomySummary(
            minPrice = prices.min(),
            medianPrice = median(prices.map { it.toDouble() }) ?: 0.0,
            maxPrice = prices.max(),
            minIncome = incomes.min(),
            maxIncome = incomes.max(),
        )
    }
}
