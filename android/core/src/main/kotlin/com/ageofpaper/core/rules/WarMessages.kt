package com.ageofpaper.core.rules

/**
 * User facing rule messages. Kept identical to the strings in the `src/game`
 * modules so both clients explain a rejected action the same way.
 */
object WarMessages {
    const val NOT_ACTIVE = "Sıra sende değil."
    const val SAME_REGION = "Kaynak ve hedef farklı olmalı."
    const val INVALID_SOURCE = "Kaynak bölge senin değil."
    const val INVALID_TARGET = "Hedef bölge senin değil."
    const val ELIMINATED_ORDER = "Elendiğin için emir veremezsin."
    const val ELIMINATED_ATTACK = "Elendiğin için saldıramazsın."
    const val OPERATION_WRONG_PHASE = "Harekât yalnızca savaş evresinde yapılabilir."
    const val ATTACK_WRONG_PHASE = "Saldırı yalnızca savaş evresinde yapılabilir."
    const val END_TURN_WRONG_PHASE = "Tur yalnızca savaş evresinde bitirilebilir."
    const val READY_WRONG_PHASE = "Hazır emri yalnızca seferberlikte verilir."
    const val LOGISTICS_WRONG_PHASE = "Lojistik yalnızca seferberlik veya savaş sırasında yapılabilir."
    const val MOBILIZATION_WRONG_PHASE = "Seferberlik yalnızca toprak edinme özeti üzerinden başlatılır."
    const val INVALID_TRANSFER_AMOUNT = "Asker sayısı pozitif 1.000 katı olmalı."
    const val INVALID_ATTACK_AMOUNT = "Saldırı pozitif 1.000 asker katı olmalı."
    const val INSUFFICIENT_SOLDIERS = "Kaynakta yeterli asker yok."
    const val INSUFFICIENT_SOLDIERS_SHORT = "Yetersiz asker."
    const val INSUFFICIENT_SHIPS = "Yetersiz gemi kapasitesi."
    const val PORT_REQUIRED_SHORT = "Liman gerekli."
    const val NO_FRIENDLY_PATH = "Bölgeler dost kara hattıyla bağlı değil."
    const val NOT_ADJACENT = "Hedef kaynak bölgenin doğrudan kara komşusu değil."
    const val FRIENDLY_TARGET = "Kendi bölgene saldıramazsın."
    const val ENEMY_TRANSFER_TARGET = "Bu hedef nakil için düşman bölgesi."
    const val FRIENDLY_ATTACK_TARGET = "Bu hedef saldırı için sana ait."
    const val ALREADY_READY = "Bu seferberlik turunu zaten tamamladın."
    const val HOST_ONLY_MOBILIZATION = "Seferberliği yalnızca kurucu başlatabilir."
    const val NO_ACTIVE_PLAYERS = "Seferberliğe katılacak bölge sahibi yok."
    const val NOT_OWNED = "Bu bölge senin yönetiminde değil."
    const val UNKNOWN_REGION = "Bölge harita tanımında bulunmuyor."
    const val INVALID_COUNT = "Adet pozitif bir tam sayı olmalı."
    const val INSUFFICIENT_FUNDS = "Hazinede yeterli altın yok."
    const val HAS_PORT = "Bu bölgede zaten liman var."
    const val PORT_NOT_ALLOWED = "Bu kıyı bölgesinde liman kurulmasına harita hazırlığında izin verilmemiş."
    const val NOT_COASTAL = "Liman yalnızca kıyı bölgesine kurulabilir."
    const val SHIP_PORT_REQUIRED = "Gemi satın almak için kıyı bölgesinde liman gerekir."
}
