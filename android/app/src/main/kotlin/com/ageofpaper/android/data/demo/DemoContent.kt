package com.ageofpaper.android.data.demo

import com.ageofpaper.core.Constants
import com.ageofpaper.core.model.ChatMessage
import com.ageofpaper.core.model.Player
import com.ageofpaper.core.model.Room
import com.ageofpaper.core.rules.Phases
import com.ageofpaper.core.rules.WarConstants
import com.ageofpaper.core.svg.MapImporter

/** Sample room used by the offline demo mode. */
object DemoContent {

    const val ROOM_CODE = "7KQ2"

    /** Eight touching provinces, the same layout as the phone design. */
    val SAMPLE_SVG = """
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 600">
          <polygon id="kuzey_kiyisi" data-name="Kuzey Kıyısı" points="40,60 150,40 190,130 120,170 45,150" fill="#b7a370"/>
          <polygon id="demir_gecit" data-name="Demir Geçit" points="190,130 300,70 360,140 300,210 200,205" fill="#b7a370"/>
          <polygon id="kuzey_vadisi" data-name="Kuzey Vadisi" points="120,170 200,205 205,300 110,320 55,250" fill="#c6b07a"/>
          <polygon id="tas_ovasi" data-name="Taş Ovası" points="205,300 300,210 365,260 350,360 240,375" fill="#b7a370"/>
          <polygon id="bati_sancagi" data-name="Batı Sancağı" points="110,320 205,300 240,375 180,440 90,410" fill="#b7a370"/>
          <polygon id="gunes_kapisi" data-name="Güneş Kapısı" points="240,375 350,360 370,450 300,500 235,455" fill="#b7a370"/>
          <polygon id="guney_burnu" data-name="Güney Burnu" points="90,410 180,440 235,455 210,540 100,530" fill="#b7a370"/>
          <polygon id="son_liman" data-name="Son Liman" points="300,500 370,450 380,545 300,570" fill="#b7a370"/>
        </svg>
    """.trimIndent()

    private val botNames = listOf("Deniz", "Kaan", "Ela")

    /** Prepared once and reused; the demo map never changes. */
    val preparedMap: MapImporter.PreparedMap by lazy {
        MapImporter.prepare(SAMPLE_SVG, displayName = "Kâğıt Diyarı")
    }

    fun lobby(userId: String, nickname: String): Room {
        val now = System.currentTimeMillis()
        val host = Player(
            id = userId,
            name = nickname.ifBlank { "Selim" },
            color = Constants.COLORS[0],
            money = Constants.STARTING_MONEY,
            income = Constants.BASE_INCOME,
            joinedAt = now,
            lastActive = now,
        )
        val bots = botNames.mapIndexed { index, name ->
            val id = "demo-bot-$index"
            id to Player(
                id = id,
                name = name,
                color = Constants.COLORS[index + 1],
                money = Constants.STARTING_MONEY,
                income = Constants.BASE_INCOME,
                joinedAt = now + index + 1,
                lastActive = now,
            )
        }
        val prepared = preparedMap
        return Room(
            code = ROOM_CODE,
            schemaVersion = WarConstants.WAR_SCHEMA_VERSION,
            phase = Phases.LOBBY,
            hostId = userId,
            createdAt = now,
            mapSvg = prepared.sanitizedSvg,
            mapDefinition = prepared.mapDefinition,
            mapValidation = prepared.validation,
            players = mapOf(userId to host) + bots,
            chat = listOf(
                ChatMessage(
                    id = "demo-1",
                    senderId = bots[0].first,
                    name = "Deniz",
                    color = Constants.COLORS[1],
                    text = "Kuzeyi bırakıyorum, güneyde anlaşalım.",
                    createdAt = now - 120_000,
                ),
                ChatMessage(
                    id = "demo-2",
                    senderId = bots[1].first,
                    name = "Kaan",
                    color = Constants.COLORS[2],
                    text = "Limanı kurdum, deniz rotası artık açık.",
                    createdAt = now - 60_000,
                ),
                ChatMessage(
                    id = "demo-3",
                    senderId = bots[2].first,
                    name = "Ela",
                    color = Constants.COLORS[3],
                    text = "Demir Geçit'e dokunan benimle savaşır.",
                    createdAt = now - 30_000,
                ),
            ),
        )
    }
}
