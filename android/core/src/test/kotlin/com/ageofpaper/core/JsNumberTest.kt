package com.ageofpaper.core

import com.ageofpaper.core.json.JsNumber
import com.ageofpaper.core.json.Json
import com.ageofpaper.core.json.jsonOf
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Metadata hashes are computed over `JSON.stringify` output, so number
 * rendering has to match V8 exactly.
 */
class JsNumberTest {

    @Test
    fun `renders integers without a decimal point`() {
        assertEquals("0", JsNumber.format(0.0))
        assertEquals("1", JsNumber.format(1.0))
        assertEquals("-42", JsNumber.format(-42.0))
        assertEquals("18500", JsNumber.format(18500.0))
        assertEquals("1000000", JsNumber.format(1e6))
    }

    @Test
    fun `renders fractions with the shortest round trip digits`() {
        assertEquals("0.1", JsNumber.format(0.1))
        assertEquals("1.5", JsNumber.format(1.5))
        assertEquals("0.56", JsNumber.format(0.56))
        assertEquals("0.78", JsNumber.format(0.78))
        assertEquals("-0.125", JsNumber.format(-0.125))
        assertEquals("3.3333333333333335", JsNumber.format(10.0 / 3.0))
    }

    @Test
    fun `switches to exponent notation on the same boundaries as JavaScript`() {
        assertEquals("1e+21", JsNumber.format(1e21))
        assertEquals("1e+22", JsNumber.format(1e22))
        assertEquals("100000000000000000000", JsNumber.format(1e20))
        assertEquals("0.000001", JsNumber.format(1e-6))
        assertEquals("1e-7", JsNumber.format(1e-7))
        assertEquals("1.5e-7", JsNumber.format(1.5e-7))
    }

    @Test
    fun `canonical json sorts keys recursively`() {
        val value = jsonOf(
            mapOf(
                "b" to 2,
                "a" to mapOf("z" to true, "y" to listOf(1, 2)),
            ),
        )
        assertEquals("""{"a":{"y":[1,2],"z":true},"b":2}""", Json.canonical(value))
    }

    @Test
    fun `canonical json escapes control characters`() {
        assertEquals("""{"a":"line\nbreak"}""", Json.canonicalOf(mapOf("a" to "line\nbreak")))
    }

    @Test
    fun `parses back what it writes`() {
        val text = """{"a":[1,2.5,null,true],"b":"x"}"""
        assertEquals(text, Json.canonical(Json.parse(text)))
    }
}
