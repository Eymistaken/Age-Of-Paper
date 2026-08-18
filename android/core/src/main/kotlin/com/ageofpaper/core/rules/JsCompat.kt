package com.ageofpaper.core.rules

import java.text.Collator
import java.util.Locale

/**
 * Small compatibility helpers for behaviour the JavaScript client relies on.
 *
 * The distinction matters for Firestore interoperability: `Array.prototype.sort()`
 * without a comparator orders by UTF-16 code unit, while
 * `Array.prototype.sort((a, b) => a.localeCompare(b))` uses collation order.
 * Route keys use the latter, plain id lists use the former.
 */
object JsCompat {

    private val collator: Collator = Collator.getInstance(Locale.ROOT).apply {
        strength = Collator.TERTIARY
    }

    /**
     * Approximates `String.prototype.localeCompare` for the safe region id
     * alphabet (`[A-Za-z0-9_-]`). Ties are broken by code unit order so the
     * result is always a total order.
     */
    fun localeCompare(first: String, second: String): Int {
        val collated = synchronized(collator) { collator.compare(first, second) }
        if (collated != 0) return collated
        return first.compareTo(second)
    }

    /** Distinct, non-blank values ordered by UTF-16 code unit, like `[...new Set(v)].sort()`. */
    fun uniqueSorted(values: Iterable<String?>?): List<String> =
        (values ?: emptyList()).filterNotNull().filter { it.isNotEmpty() }.distinct().sorted()
}
