package com.ageofpaper.core.json

import java.math.BigDecimal
import java.math.MathContext
import java.math.RoundingMode

/**
 * Formats a double exactly the way ECMAScript `Number::toString` does.
 *
 * Metadata hashes are computed over `JSON.stringify` output on the web client,
 * so any difference in number rendering would produce a different
 * `metadataHash` and make a prepared map look corrupted to the other client.
 * `Double.toString` on the JVM is not the same algorithm, so the shortest
 * round-tripping digit string is derived explicitly here.
 */
object JsNumber {

    fun format(value: Double): String {
        if (value.isNaN() || value.isInfinite()) return "null"
        if (value == 0.0) return "0"
        val negative = value < 0
        val magnitude = if (negative) -value else value
        val body = formatPositive(magnitude)
        return if (negative) "-$body" else body
    }

    fun format(value: Long): String = value.toString()

    private fun formatPositive(value: Double): String {
        val (digits, exponent) = shortestDigits(value)
        val k = digits.length
        val n = exponent

        return when {
            k <= n && n <= 21 -> digits + "0".repeat(n - k)
            n in 1..21 -> digits.substring(0, n) + "." + digits.substring(n)
            n in -5..0 -> "0." + "0".repeat(-n) + digits
            k == 1 -> digits + "e" + exponentSuffix(n - 1)
            else -> digits.substring(0, 1) + "." + digits.substring(1) + "e" + exponentSuffix(n - 1)
        }
    }

    private fun exponentSuffix(exponent: Int): String =
        if (exponent >= 0) "+$exponent" else "-${-exponent}"

    /**
     * Returns the minimal digit string `s` and decimal exponent `n` such that
     * `0.s * 10^n` round-trips back to [value].
     */
    private fun shortestDigits(value: Double): Pair<String, Int> {
        for (precision in 1..17) {
            val candidate = BigDecimal(value).round(MathContext(precision, RoundingMode.HALF_EVEN))
            if (candidate.toDouble() == value) return normalize(candidate)
        }
        return normalize(BigDecimal(value))
    }

    private fun normalize(decimal: BigDecimal): Pair<String, Int> {
        val stripped = decimal.stripTrailingZeros()
        val unscaled = stripped.unscaledValue().abs().toString()
        // precision() - scale() is the position of the decimal point.
        val exponent = stripped.precision() - stripped.scale()
        return unscaled to exponent
    }
}
