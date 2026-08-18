package com.ageofpaper.core.json

/**
 * Minimal JSON tree plus a canonical writer.
 *
 * `src/game/mapMetadata.js` serialises metadata with recursively sorted object
 * keys and hashes the result, so the writer here sorts keys the same way and
 * renders numbers through [JsNumber].
 */
sealed interface JsonValue {
    data object Null : JsonValue
    data class Bool(val value: Boolean) : JsonValue
    data class Num(val value: Double) : JsonValue
    data class Str(val value: String) : JsonValue
    data class Arr(val items: List<JsonValue>) : JsonValue
    data class Obj(val entries: Map<String, JsonValue>) : JsonValue
}

fun jsonOf(value: Any?): JsonValue = when (value) {
    null -> JsonValue.Null
    is JsonValue -> value
    is Boolean -> JsonValue.Bool(value)
    is Int -> JsonValue.Num(value.toDouble())
    is Long -> JsonValue.Num(value.toDouble())
    is Float -> JsonValue.Num(value.toDouble())
    is Double -> JsonValue.Num(value)
    is String -> JsonValue.Str(value)
    is List<*> -> JsonValue.Arr(value.map { jsonOf(it) })
    is Array<*> -> JsonValue.Arr(value.map { jsonOf(it) })
    is Map<*, *> -> JsonValue.Obj(
        value.entries
            .filter { it.key is String }
            .associate { (it.key as String) to jsonOf(it.value) },
    )

    else -> throw IllegalArgumentException("Unsupported JSON value: ${value::class}")
}

val JsonValue.asObject: Map<String, JsonValue>? get() = (this as? JsonValue.Obj)?.entries
val JsonValue.asArray: List<JsonValue>? get() = (this as? JsonValue.Arr)?.items
val JsonValue.asString: String? get() = (this as? JsonValue.Str)?.value
val JsonValue.asDouble: Double? get() = (this as? JsonValue.Num)?.value
val JsonValue.asInt: Int? get() = (this as? JsonValue.Num)?.value?.toInt()
val JsonValue.asLong: Long? get() = (this as? JsonValue.Num)?.value?.toLong()
val JsonValue.asBoolean: Boolean? get() = (this as? JsonValue.Bool)?.value

object Json {

    /** `JSON.stringify` with recursively sorted object keys. */
    fun canonical(value: JsonValue): String = buildString { writeCanonical(value, this) }

    fun canonicalOf(value: Any?): String = canonical(jsonOf(value))

    private fun writeCanonical(value: JsonValue, out: StringBuilder) {
        when (value) {
            JsonValue.Null -> out.append("null")
            is JsonValue.Bool -> out.append(if (value.value) "true" else "false")
            is JsonValue.Num -> out.append(JsNumber.format(value.value))
            is JsonValue.Str -> writeString(value.value, out)
            is JsonValue.Arr -> {
                out.append('[')
                value.items.forEachIndexed { index, item ->
                    if (index > 0) out.append(',')
                    writeCanonical(item, out)
                }
                out.append(']')
            }

            is JsonValue.Obj -> {
                out.append('{')
                // Object.keys(...).sort() orders by UTF-16 code unit.
                val keys = value.entries.keys.sorted()
                var first = true
                for (key in keys) {
                    val entry = value.entries.getValue(key)
                    if (!first) out.append(',')
                    first = false
                    writeString(key, out)
                    out.append(':')
                    writeCanonical(entry, out)
                }
                out.append('}')
            }
        }
    }

    private fun writeString(value: String, out: StringBuilder) {
        out.append('"')
        for (char in value) {
            when (char) {
                '"' -> out.append("\\\"")
                '\\' -> out.append("\\\\")
                '\b' -> out.append("\\b")
                '\u000C' -> out.append("\\f")
                '\n' -> out.append("\\n")
                '\r' -> out.append("\\r")
                '\t' -> out.append("\\t")
                else -> if (char < ' ') {
                    out.append("\\u").append(char.code.toString(16).padStart(4, '0'))
                } else {
                    out.append(char)
                }
            }
        }
        out.append('"')
    }

    fun parse(text: String): JsonValue {
        val parser = Parser(text)
        parser.skipWhitespace()
        val value = parser.readValue()
        parser.skipWhitespace()
        if (!parser.atEnd) throw IllegalArgumentException("Beklenmeyen JSON eki.")
        return value
    }

    fun parseOrNull(text: String?): JsonValue? = try {
        if (text.isNullOrBlank()) null else parse(text)
    } catch (error: IllegalArgumentException) {
        null
    }

    private class Parser(private val text: String) {
        private var index = 0

        val atEnd: Boolean get() = index >= text.length

        fun skipWhitespace() {
            while (index < text.length && text[index].isWhitespace()) index++
        }

        fun readValue(): JsonValue {
            skipWhitespace()
            if (atEnd) throw IllegalArgumentException("Boş JSON.")
            return when (val char = text[index]) {
                '{' -> readObject()
                '[' -> readArray()
                '"' -> JsonValue.Str(readString())
                't' -> readLiteral("true", JsonValue.Bool(true))
                'f' -> readLiteral("false", JsonValue.Bool(false))
                'n' -> readLiteral("null", JsonValue.Null)
                else -> if (char == '-' || char.isDigit()) readNumber() else {
                    throw IllegalArgumentException("Geçersiz JSON karakteri: $char")
                }
            }
        }

        private fun readLiteral(literal: String, value: JsonValue): JsonValue {
            if (!text.startsWith(literal, index)) throw IllegalArgumentException("Geçersiz JSON sabiti.")
            index += literal.length
            return value
        }

        private fun readObject(): JsonValue {
            expect('{')
            val entries = LinkedHashMap<String, JsonValue>()
            skipWhitespace()
            if (peek() == '}') {
                index++
                return JsonValue.Obj(entries)
            }
            while (true) {
                skipWhitespace()
                val key = readString()
                skipWhitespace()
                expect(':')
                entries[key] = readValue()
                skipWhitespace()
                when (peek()) {
                    ',' -> index++
                    '}' -> {
                        index++
                        return JsonValue.Obj(entries)
                    }

                    else -> throw IllegalArgumentException("Geçersiz JSON nesnesi.")
                }
            }
        }

        private fun readArray(): JsonValue {
            expect('[')
            val items = mutableListOf<JsonValue>()
            skipWhitespace()
            if (peek() == ']') {
                index++
                return JsonValue.Arr(items)
            }
            while (true) {
                items.add(readValue())
                skipWhitespace()
                when (peek()) {
                    ',' -> index++
                    ']' -> {
                        index++
                        return JsonValue.Arr(items)
                    }

                    else -> throw IllegalArgumentException("Geçersiz JSON dizisi.")
                }
            }
        }

        private fun readString(): String {
            expect('"')
            val builder = StringBuilder()
            while (true) {
                if (atEnd) throw IllegalArgumentException("Kapanmamış JSON metni.")
                when (val char = text[index++]) {
                    '"' -> return builder.toString()
                    '\\' -> {
                        if (atEnd) throw IllegalArgumentException("Kapanmamış JSON kaçışı.")
                        when (val escape = text[index++]) {
                            '"' -> builder.append('"')
                            '\\' -> builder.append('\\')
                            '/' -> builder.append('/')
                            'b' -> builder.append('\b')
                            'f' -> builder.append('\u000C')
                            'n' -> builder.append('\n')
                            'r' -> builder.append('\r')
                            't' -> builder.append('\t')
                            'u' -> {
                                val hex = text.substring(index, index + 4)
                                index += 4
                                builder.append(hex.toInt(16).toChar())
                            }

                            else -> throw IllegalArgumentException("Geçersiz JSON kaçışı: $escape")
                        }
                    }

                    else -> builder.append(char)
                }
            }
        }

        private fun readNumber(): JsonValue {
            val start = index
            if (peek() == '-') index++
            while (!atEnd && (text[index].isDigit() || text[index] in ".eE+-")) index++
            val slice = text.substring(start, index)
            return JsonValue.Num(slice.toDoubleOrNull() ?: throw IllegalArgumentException("Geçersiz JSON sayısı."))
        }

        private fun peek(): Char = if (atEnd) ' ' else text[index]

        private fun expect(char: Char) {
            if (peek() != char) throw IllegalArgumentException("JSON içinde $char bekleniyordu.")
            index++
        }
    }
}
