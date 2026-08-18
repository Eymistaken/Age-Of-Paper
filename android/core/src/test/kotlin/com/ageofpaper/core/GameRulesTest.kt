package com.ageofpaper.core

import com.ageofpaper.core.model.Claim
import com.ageofpaper.core.model.MapDefinition
import com.ageofpaper.core.model.Player
import com.ageofpaper.core.model.Region
import com.ageofpaper.core.model.Room
import com.ageofpaper.core.rules.ClaimRules
import com.ageofpaper.core.rules.Economy
import com.ageofpaper.core.rules.NavalPolicy
import com.ageofpaper.core.rules.Phases
import com.ageofpaper.core.rules.Pricing
import com.ageofpaper.core.rules.Turns
import com.ageofpaper.core.rules.WarCombat
import com.ageofpaper.core.rules.WarConstants
import com.ageofpaper.core.rules.WarEconomy
import com.ageofpaper.core.rules.WarState
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Mirrors the assertions in the web client rule tests under `src/game`. */
class GameRulesTest {

    private fun region(id: String, price: Long, income: Long, neighbors: List<String>, coastal: Boolean = false) =
        Region(
            id = id,
            name = id.uppercase(),
            price = price,
            income = income,
            landNeighbors = neighbors,
            claimNeighbors = neighbors,
            coastal = coastal,
            coastType = if (coastal) "ocean" else "none",
            portAllowed = coastal,
        )

    private fun sampleMap() = MapDefinition(
        regions = listOf(
            region("a", 10_000, 1_000, listOf("b")),
            region("b", 12_000, 1_200, listOf("a", "c"), coastal = true),
            region("c", 14_000, 1_400, listOf("b"), coastal = true),
        ),
        navalPolicy = NavalPolicy.SELECTED_ROUTES,
        allowedRoutes = listOf("b::c"),
    )

    private fun room(
        phase: String = Phases.CLAIMING,
        claims: Map<String, Claim> = emptyMap(),
        money: Long = 50_000,
    ) = Room(
        phase = phase,
        hostId = "p1",
        mapDefinition = sampleMap(),
        players = mapOf(
            "p1" to Player(id = "p1", name = "Selim", color = "#2F6FA3", money = money),
            "p2" to Player(id = "p2", name = "Deniz", color = "#A33A32", money = money),
        ),
        turnOrder = listOf("p1", "p2"),
        turnIndex = 0,
        turnNumber = 1,
        roundNumber = 1,
        claims = claims,
    )

    @Test
    fun `income starts at the base and adds owned regions`() {
        val claims = mapOf("a" to Claim(ownerId = "p1"), "b" to Claim(ownerId = "p2"))
        assertEquals(Constants.BASE_INCOME + 1_000, Economy.calculateIncome(sampleMap(), claims, "p1"))
        assertEquals(Constants.BASE_INCOME + 1_200, Economy.calculateIncome(sampleMap(), claims, "p2"))
    }

    @Test
    fun `first claim may be any neutral region and later claims must connect`() {
        val start = room()
        assertEquals(listOf("a", "b", "c"), ClaimRules.legalClaims(start.mapDefinition, start.claims, "p1"))

        val afterFirst = ClaimRules.applyClaim(start, "p1", "a").room
        assertEquals(listOf("b"), ClaimRules.legalClaims(afterFirst.mapDefinition, afterFirst.claims, "p1"))
    }

    @Test
    fun `claiming pays the price, recalculates income and advances the turn`() {
        val result = ClaimRules.applyClaim(room(), "p1", "a")
        assertTrue(result.eligibility.legal)
        assertEquals(40_000, result.room.players.getValue("p1").money)
        assertEquals(Constants.BASE_INCOME + 1_000, result.room.players.getValue("p1").income)
        assertEquals("p2", result.room.activePlayerId)
        assertEquals(2, result.room.turnNumber)
    }

    @Test
    fun `claiming is rejected without funds`() {
        val result = ClaimRules.applyClaim(room(money = 500), "p1", "a")
        assertFalse(result.eligibility.legal)
        assertEquals("INSUFFICIENT_FUNDS", result.eligibility.code)
    }

    @Test
    fun `the final claim freezes without advancing the turn`() {
        var current = room(money = 200_000)
        current = ClaimRules.applyClaim(current, "p1", "a").room
        current = ClaimRules.applyClaim(current, "p2", "c").room
        current = ClaimRules.applyClaim(current, "p1", "b").room
        assertEquals(Phases.CLAIM_COMPLETE, current.phase)
        assertEquals("p1", current.activePlayerId)
    }

    @Test
    fun `save income banks the turn income and advances`() {
        val result = ClaimRules.applySaveIncome(room(), "p1")
        assertTrue(result.eligibility.legal)
        assertEquals(50_000 + Constants.BASE_INCOME, result.room.players.getValue("p1").money)
        assertEquals("p2", result.room.activePlayerId)
    }

    @Test
    fun `turn order wraps and counts rounds`() {
        val advanced = Turns.advanceTurn(Turns.advanceTurn(room()))
        assertEquals("p1", advanced.activePlayerId)
        assertEquals(2, advanced.roundNumber)
    }

    @Test
    fun `removing the active player keeps the order consistent`() {
        val removal = Turns.removePlayerFromTurnState(room().copy(turnIndex = 1), "p2")
        assertTrue(removal.activePlayerChanged)
        assertEquals(listOf("p1"), removal.room.turnOrder)
        assertEquals(0, removal.room.turnIndex)
    }

    @Test
    fun `pricing v2 scales with area and clamps`() {
        assertEquals(10_000L, Pricing.priceFromArea(100.0, 100.0))
        assertEquals(5_000L, Pricing.priceFromArea(1.0, 10_000.0))
        assertEquals(30_000L, Pricing.priceFromArea(900.0, 100.0))
        assertEquals(1_000L, Pricing.incomeFromPrice(10_000L))
        assertEquals(500L, Pricing.incomeFromPrice(1_000L))
        assertEquals(4_000L, Pricing.incomeFromPrice(90_000L))
    }

    @Test
    fun `combat is deterministic subtraction`() {
        val captured = WarCombat.resolveDeterministicCombat(4000, 3000)!!
        assertTrue(captured.captured)
        assertEquals(1000, captured.attackersRemaining)

        val held = WarCombat.resolveDeterministicCombat(2000, 3000)!!
        assertFalse(held.captured)
        assertEquals(1000, held.defendersRemaining)

        val equal = WarCombat.resolveDeterministicCombat(3000, 3000)!!
        assertFalse(equal.captured)
        assertEquals(0, equal.defendersRemaining)

        assertNull(WarCombat.resolveDeterministicCombat(1500, 1000))
    }

    @Test
    fun `soldier amounts must be positive multiples of a thousand`() {
        assertTrue(WarConstants.isSoldierAmount(1000))
        assertFalse(WarConstants.isSoldierAmount(0))
        assertFalse(WarConstants.isSoldierAmount(1500))
        assertEquals(2, WarConstants.requiredShips(2000))
        assertEquals(3, WarConstants.requiredShips(3000))
    }

    private fun warRoom(): Room {
        val claims = mapOf(
            "a" to Claim(ownerId = "p1", soldiers = 6000),
            "b" to Claim(ownerId = "p1", soldiers = 6000, hasPort = true, ships = 2),
            "c" to Claim(ownerId = "p2", soldiers = 3000),
        )
        return room(phase = Phases.WAR, claims = claims, money = 100_000).copy(
            players = mapOf(
                "p1" to Player(id = "p1", name = "Selim", color = "#2F6FA3", money = 100_000, lastIncomeTurn = 1),
                "p2" to Player(id = "p2", name = "Deniz", color = "#A33A32", money = 100_000, lastIncomeTurn = 1),
            ),
        )
    }

    @Test
    fun `land attack captures the target and transfers ownership`() {
        val result = WarState.applyWarAttack(warRoom(), "p1", "b", "c", 4000, naval = false)
        assertTrue(result.eligibility.legal)
        assertEquals("p1", result.room.claims.getValue("c").ownerId)
        assertEquals(1000, result.room.claims.getValue("c").soldiers)
        assertEquals(0, result.room.claims.getValue("c").ships)
    }

    @Test
    fun `attacking a non adjacent region is rejected`() {
        val result = WarState.applyWarAttack(warRoom(), "p1", "a", "c", 4000, naval = false)
        assertFalse(result.eligibility.legal)
        assertEquals("NOT_ADJACENT", result.eligibility.code)
    }

    @Test
    fun `naval attack needs a port and enough ship capacity`() {
        val room = warRoom()
        val tooMany = WarState.applyWarAttack(room, "p1", "b", "c", 4000, naval = true)
        assertFalse(tooMany.eligibility.legal)
        assertEquals("INSUFFICIENT_SHIPS", tooMany.eligibility.code)

        val noPort = WarState.applyWarAttack(room, "p1", "a", "c", 2000, naval = true)
        assertFalse(noPort.eligibility.legal)
        assertEquals("STALE_COAST", noPort.eligibility.code)
    }

    @Test
    fun `income is granted once per turn number`() {
        val room = warRoom().copy(turnNumber = 2)
        val first = WarEconomy.grantTurnIncome(room, "p1")
        assertTrue(first.due)
        val second = WarEconomy.grantTurnIncome(first.room, "p1")
        assertFalse(second.due)
        assertEquals(0L, second.granted)
    }

    @Test
    fun `logistics never advances the turn`() {
        val result = WarEconomy.applyRecruitSoldiers(warRoom(), "p1", "a", 1)
        assertTrue(result.eligibility.legal)
        assertEquals(7000, result.room.claims.getValue("a").soldiers)
        assertEquals("p1", result.room.activePlayerId)
    }

    @Test
    fun `ports may only be built on final coastal land`() {
        val inland = WarEconomy.applyBuildPort(warRoom(), "p1", "a")
        assertFalse(inland.eligibility.legal)
        assertEquals("NOT_COASTAL", inland.eligibility.code)
    }

    @Test
    fun `surrender neutralises soldiers and ships but preserves ports`() {
        val room = warRoom().copy(
            claims = warRoom().claims + ("b" to Claim(ownerId = "p1", soldiers = 1000, hasPort = true, ships = 2)),
        )
        val result = WarState.surrenderPlayer(room, "p1")
        assertTrue(result.surrendered)
        val claim = result.room.claims.getValue("b")
        assertNull(claim.ownerId)
        assertEquals(0, claim.soldiers)
        assertEquals(0, claim.ships)
        assertTrue(claim.hasPort)
    }

    @Test
    fun `the last remaining owner wins`() {
        val room = warRoom().copy(
            claims = mapOf(
                "a" to Claim(ownerId = "p1", soldiers = 6000),
                "b" to Claim(ownerId = "p1", soldiers = 1000),
                "c" to Claim(ownerId = "p1", soldiers = 1000),
            ),
        )
        val resolved = WarState.resolveVictory(room)
        assertEquals(Phases.FINISHED, resolved.phase)
        assertEquals("p1", resolved.winnerId)
    }

    @Test
    fun `naval routes normalise into ordered unique keys`() {
        val map = sampleMap()
        assertEquals("b::c", NavalPolicy.routeKey("c", "b"))
        assertTrue(NavalPolicy.isRouteAllowed(map, "b", "c").allowed)
        assertFalse(NavalPolicy.isRouteAllowed(map, "a", "b").allowed)

        val disabled = map.copy(navalPolicy = NavalPolicy.DISABLED)
        assertEquals("NAVAL_DISABLED", NavalPolicy.isRouteAllowed(disabled, "b", "c").code)

        val allCoasts = map.copy(navalPolicy = NavalPolicy.ALL_COASTS, allowedRoutes = emptyList())
        assertTrue(NavalPolicy.isRouteAllowed(allCoasts, "b", "c").allowed)
    }

    @Test
    fun `mobilization resets armies and starts with the next active player`() {
        val claims = mapOf(
            "a" to Claim(ownerId = "p1"),
            "b" to Claim(ownerId = "p2"),
            "c" to Claim(ownerId = "p1"),
        )
        val room = room(phase = Phases.CLAIM_COMPLETE, claims = claims)
        val result = WarState.startMobilization(room, "p1")
        assertTrue(result.eligibility.legal)
        assertEquals(Phases.MOBILIZATION, result.room.phase)
        assertEquals(WarConstants.INITIAL_REGION_SOLDIERS, result.room.claims.getValue("a").soldiers)
        assertEquals("p2", result.room.activePlayerId)
        assertEquals(2, result.room.mobilizationTurnsRemaining)
    }

    @Test
    fun `mobilization ends in the war phase once everyone is ready`() {
        val claims = mapOf("a" to Claim(ownerId = "p1"), "b" to Claim(ownerId = "p2"))
        var current = WarState.startMobilization(room(phase = Phases.CLAIM_COMPLETE, claims = claims), "p1").room
        current = WarState.applyMobilizationReady(current, current.activePlayerId).room
        current = WarState.applyMobilizationReady(current, current.activePlayerId).room
        assertEquals(Phases.WAR, current.phase)
        assertEquals(0, current.mobilizationTurnsRemaining)
    }
}
