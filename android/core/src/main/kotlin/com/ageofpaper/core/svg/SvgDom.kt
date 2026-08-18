package com.ageofpaper.core.svg

import org.w3c.dom.Document
import org.w3c.dom.Element
import org.w3c.dom.Node
import java.io.ByteArrayInputStream
import javax.xml.parsers.DocumentBuilderFactory

class SvgParseException(message: String) : IllegalArgumentException(message)

/**
 * DOM helpers standing in for the browser APIs used by `src/game/mapImporter.js`
 * and `src/game/mapMetadata.js`.
 *
 * The document is parsed without namespace awareness so every attribute,
 * including `xmlns` and prefixed names such as `xlink:href`, survives round
 * tripping exactly as written. That keeps [SvgDom.serialize] close to the
 * `XMLSerializer` output the web client hashes.
 */
object SvgDom {

    const val SVG_NS = "http://www.w3.org/2000/svg"

    fun parse(svgText: String?): Document {
        val text = svgText.orEmpty()
        if (text.isBlank()) throw SvgParseException("Dosya geçerli bir SVG değil.")
        val factory = DocumentBuilderFactory.newInstance().apply {
            isNamespaceAware = false
            isValidating = false
            runCatching { setFeature("http://apache.org/xml/features/nonvalidating/load-external-dtd", false) }
            runCatching { setFeature("http://xml.org/sax/features/external-general-entities", false) }
            runCatching { setFeature("http://xml.org/sax/features/external-parameter-entities", false) }
        }
        val document = try {
            factory.newDocumentBuilder().apply {
                setEntityResolver { _, _ -> org.xml.sax.InputSource(java.io.StringReader("")) }
            }.parse(ByteArrayInputStream(text.toByteArray(Charsets.UTF_8)))
        } catch (error: Exception) {
            throw SvgParseException("Dosya geçerli bir SVG değil.")
        }
        val root = document.documentElement ?: throw SvgParseException("Dosya geçerli bir SVG değil.")
        if (!root.tagName.equals("svg", ignoreCase = true)) {
            throw SvgParseException("Dosya geçerli bir SVG değil.")
        }
        return document
    }

    /**
     * Mirrors `XMLSerializer.serializeToString(element)`: no XML declaration,
     * empty elements collapse to `<tag/>`, attributes keep document order.
     */
    fun serialize(element: Element): String = buildString { writeElement(element, this) }

    private fun writeElement(element: Element, out: StringBuilder) {
        out.append('<').append(element.tagName)
        val attributes = element.attributes
        for (index in 0 until attributes.length) {
            val attribute = attributes.item(index)
            out.append(' ').append(attribute.nodeName).append("=\"")
            writeAttributeValue(attribute.nodeValue.orEmpty(), out)
            out.append('"')
        }
        val children = element.childNodes
        if (children.length == 0) {
            out.append("/>")
            return
        }
        out.append('>')
        for (index in 0 until children.length) {
            writeNode(children.item(index), out)
        }
        out.append("</").append(element.tagName).append('>')
    }

    private fun writeNode(node: Node, out: StringBuilder) {
        when (node.nodeType) {
            Node.ELEMENT_NODE -> writeElement(node as Element, out)
            Node.TEXT_NODE -> writeText(node.nodeValue.orEmpty(), out)
            Node.CDATA_SECTION_NODE -> out.append("<![CDATA[").append(node.nodeValue.orEmpty()).append("]]>")
            Node.COMMENT_NODE -> out.append("<!--").append(node.nodeValue.orEmpty()).append("-->")
            Node.PROCESSING_INSTRUCTION_NODE ->
                out.append("<?").append(node.nodeName).append(' ').append(node.nodeValue.orEmpty()).append("?>")

            else -> Unit
        }
    }

    private fun writeText(value: String, out: StringBuilder) {
        for (char in value) {
            when (char) {
                '&' -> out.append("&amp;")
                '<' -> out.append("&lt;")
                '>' -> out.append("&gt;")
                else -> out.append(char)
            }
        }
    }

    private fun writeAttributeValue(value: String, out: StringBuilder) {
        for (char in value) {
            when (char) {
                '&' -> out.append("&amp;")
                '<' -> out.append("&lt;")
                '"' -> out.append("&quot;")
                '\t' -> out.append("&#9;")
                '\n' -> out.append("&#10;")
                '\r' -> out.append("&#13;")
                else -> out.append(char)
            }
        }
    }
}

/** Depth-first element sequence, matching `querySelectorAll('*')` order. */
fun Element.descendants(): Sequence<Element> = sequence {
    val children = childNodes
    for (index in 0 until children.length) {
        val node = children.item(index)
        if (node is Element) {
            yield(node)
            yieldAll(node.descendants())
        }
    }
}

fun Element.selfAndDescendants(): Sequence<Element> = sequenceOf(this) + descendants()

fun Element.attr(name: String): String? = if (hasAttribute(name)) getAttribute(name) else null

fun Element.attrOrEmpty(name: String): String = getAttribute(name).orEmpty()

fun Element.tag(): String = tagName.lowercase()

fun Element.parentElement(): Element? = parentNode as? Element

/** `Element.closest(selector)` restricted to a set of tag names. */
fun Element.closestTag(tags: Set<String>): Element? {
    var current: Element? = this
    while (current != null) {
        if (tags.contains(current.tag())) return current
        current = current.parentElement()
    }
    return null
}

fun Element.hasAncestorTag(tags: Set<String>): Boolean {
    var current: Element? = parentElement()
    while (current != null) {
        if (tags.contains(current.tag())) return true
        current = current.parentElement()
    }
    return false
}

fun Element.remove() {
    parentNode?.removeChild(this)
}

fun Element.textContentOrEmpty(): String = textContent.orEmpty()

fun Document.rootElement(): Element = documentElement

fun Document.elementsByTag(tags: Set<String>): List<Element> =
    documentElement.selfAndDescendants().filter { tags.contains(it.tag()) }.toList()

fun Document.elementById(id: String): Element? =
    documentElement.selfAndDescendants().firstOrNull { it.attr("id") == id }
