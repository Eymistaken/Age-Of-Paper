package com.ageofpaper.android.data.firestore

import com.ageofpaper.android.data.GameActionException
import com.ageofpaper.android.data.JoinOutcome
import com.ageofpaper.android.data.RoomCodec
import com.ageofpaper.android.data.RoomRepository
import com.ageofpaper.core.Constants
import com.ageofpaper.core.model.Eligibility
import com.ageofpaper.core.model.JoinRequestStatus
import com.ageofpaper.core.model.Player
import com.ageofpaper.core.model.Room
import com.ageofpaper.core.model.RoomResult
import com.ageofpaper.core.rules.ClaimRules
import com.ageofpaper.core.rules.JoinRequests
import com.ageofpaper.core.rules.NavalPolicy
import com.ageofpaper.core.rules.Phases
import com.ageofpaper.core.rules.Turns
import com.ageofpaper.core.rules.WarConstants
import com.ageofpaper.core.rules.WarEconomy
import com.ageofpaper.core.rules.WarState
import com.ageofpaper.core.rules.MapValidation
import com.ageofpaper.core.svg.MapAssets
import com.ageofpaper.core.svg.MapImporter
import com.google.firebase.Timestamp
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.DocumentReference
import com.google.firebase.firestore.FieldPath
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.FirebaseFirestoreException
import com.google.firebase.firestore.Transaction
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.tasks.await
import java.util.UUID
import kotlin.random.Random

/**
 * Firestore implementation of [RoomRepository].
 *
 * Every mutation runs inside a transaction that reads the room, replays the
 * shared `core` rules and writes only the fields `firestore.rules` allows for
 * that action, exactly like `src/services/roomService.js`.
 */
class FirestoreRoomRepository(
    private val firestore: FirebaseFirestore,
    private val auth: FirebaseAuth,
) : RoomRepository {

    private companion object {
        const val ROOM_COLLECTION = "rooms"
        const val ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    }

    override val currentUserId: String
        get() = auth.currentUser?.uid.orEmpty()

    override suspend fun signIn(): String {
        auth.currentUser?.let { return it.uid }
        val result = auth.signInAnonymously().await()
        return result.user?.uid ?: throw GameActionException("Giriş yapılamadı.", "AUTH_FAILED")
    }

    private fun roomRef(roomCode: String): DocumentReference =
        firestore.collection(ROOM_COLLECTION).document(roomCode)

    private fun assetRef(roomCode: String, id: String): DocumentReference =
        roomRef(roomCode).collection("mapAssets").document(id)

    override fun observeRoom(roomCode: String): Flow<Room?> = callbackFlow {
        val registration = roomRef(roomCode).addSnapshotListener { snapshot, error ->
            if (error != null) {
                close(GameActionException(error.message ?: "Oda dinlenemedi.", "ROOM_LISTEN_FAILED"))
                return@addSnapshotListener
            }
            trySend(RoomCodec.decodeRoom(roomCode, snapshot?.data))
        }
        awaitClose { registration.remove() }
    }

    private fun requireUser(): String =
        currentUserId.ifEmpty { throw GameActionException("Önce giriş yapmalısın.", "NOT_SIGNED_IN") }

    private fun cleanNickname(nickname: String): String = nickname.trim().take(32)

    private fun randomRoomCode(random: Random = Random.Default): String =
        (1..Constants.ROOM_CODE_LENGTH)
            .map { ROOM_CODE_ALPHABET[random.nextInt(ROOM_CODE_ALPHABET.length)] }
            .joinToString("")

    private fun actionId(turnNumber: Int, type: String, actorId: String, detail: String = ""): String =
        listOf(turnNumber.toString(), type, actorId, detail).filter { it.isNotEmpty() }.joinToString(":")

    private fun readRoom(transaction: Transaction, roomCode: String): Pair<DocumentReference, Room> {
        val reference = roomRef(roomCode)
        val snapshot = transaction.get(reference)
        if (!snapshot.exists()) throw GameActionException("Oda bulunamadı.", "ROOM_NOT_FOUND")
        val room = RoomCodec.decodeRoom(roomCode, snapshot.data)
            ?: throw GameActionException("Oda bulunamadı.", "ROOM_NOT_FOUND")
        return reference to room
    }

    private fun assertWarSchema(room: Room) {
        if (room.schemaVersion != WarConstants.WAR_SCHEMA_VERSION) {
            throw GameActionException("Bu oda güncel savaş şemasını kullanmıyor.", "INCOMPATIBLE_ROOM")
        }
    }

    private fun assertExpectedTurn(room: Room, expected: Int) {
        if (expected > 0 && room.turnNumber != expected) {
            throw GameActionException("Bu hamlenin turu artık geçmiş.", "STALE_TURN")
        }
    }

    private fun throwIfIllegal(eligibility: Eligibility) {
        if (!eligibility.legal) {
            throw GameActionException(eligibility.reason ?: "Emir uygulanamadı.", eligibility.code)
        }
    }

    private fun encodePlayers(room: Room): Map<String, Any?> =
        room.players.mapValues { (_, player) -> RoomCodec.encodePlayer(player) }

    private fun encodeClaims(room: Room): Map<String, Any?> =
        room.claims.mapValues { (_, claim) -> RoomCodec.encodeClaim(claim) }

    /** The field set `campaignFields` writes on the web client. */
    private fun campaignFields(next: Room, action: Map<String, Any?>, now: Timestamp): Map<String, Any?> = mapOf(
        "phase" to next.phase,
        "players" to encodePlayers(next),
        "claims" to encodeClaims(next),
        "turnOrder" to next.turnOrder,
        "turnIndex" to next.turnIndex,
        "turnNumber" to next.turnNumber,
        "roundNumber" to next.roundNumber,
        "mobilizationTurnsRemaining" to next.mobilizationTurnsRemaining,
        "mobilizationPending" to next.mobilizationPending,
        "winnerId" to next.winnerId,
        "completedAt" to if (next.phase == Phases.FINISHED) {
            next.completedAt?.let { Timestamp(java.util.Date(it)) } ?: now
        } else {
            null
        },
        "lastAction" to (action + mapOf("at" to now)),
    )

    override suspend fun createRoom(nickname: String): String {
        val userId = requireUser()
        val name = cleanNickname(nickname)
        if (name.isEmpty()) throw GameActionException("Lütfen bir komutan adı girin.", "INVALID_NAME")

        repeat(8) {
            val code = randomRoomCode()
            val created = runCatching {
                firestore.runTransaction { transaction ->
                    val reference = roomRef(code)
                    if (transaction.get(reference).exists()) {
                        throw GameActionException("Oda kodu çakıştı.", "ROOM_COLLISION")
                    }
                    transaction.set(
                        reference,
                        mapOf(
                            "schemaVersion" to WarConstants.WAR_SCHEMA_VERSION,
                            "phase" to Phases.LOBBY,
                            "hostId" to userId,
                            "createdAt" to com.google.firebase.firestore.FieldValue.serverTimestamp(),
                            "mapSvg" to "",
                            "mapManifest" to null,
                            "mapDefinition" to null,
                            "mapValidation" to mapOf(
                                "valid" to false,
                                "errors" to emptyList<Any>(),
                                "warnings" to emptyList<Any>(),
                                "regionCount" to 0,
                            ),
                            "players" to mapOf(userId to newPlayerFields(userId, name, Constants.COLORS[0])),
                            "turnOrder" to emptyList<String>(),
                            "turnIndex" to 0,
                            "turnNumber" to 0,
                            "roundNumber" to 0,
                            "claims" to emptyMap<String, Any>(),
                            "chat" to emptyList<Any>(),
                            "lastAction" to null,
                            "joinRequests" to emptyMap<String, Any>(),
                            "joinRequestAction" to null,
                            "mobilizationTurnsRemaining" to 0,
                            "mobilizationPending" to emptyList<String>(),
                            "winnerId" to null,
                            "completedAt" to null,
                        ),
                    )
                    code
                }.await()
            }
            if (created.isSuccess) return created.getOrThrow()
            val error = created.exceptionOrNull()
            if ((error as? GameActionException)?.code != "ROOM_COLLISION") throw error!!
        }
        throw GameActionException("Benzersiz oda kodu üretilemedi. Lütfen tekrar deneyin.", "ROOM_CODE_EXHAUSTED")
    }

    private fun newPlayerFields(userId: String, name: String, color: String): Map<String, Any?> = mapOf(
        "id" to userId,
        "name" to name,
        "color" to color,
        "money" to Constants.STARTING_MONEY,
        "income" to Constants.BASE_INCOME,
        "regionIds" to emptyList<String>(),
        "joinedAt" to Timestamp.now(),
        "lastActive" to Timestamp.now(),
        "lastIncomeTurn" to 0,
        "eliminated" to false,
    )

    override suspend fun joinRoom(roomCode: String, nickname: String): JoinOutcome {
        val userId = requireUser()
        val name = cleanNickname(nickname)
        val code = roomCode.trim().uppercase()
        if (name.isEmpty() || code.isEmpty()) {
            throw GameActionException("Komutan adı ve oda kodu gerekli.", "INVALID_JOIN")
        }
        return firestore.runTransaction { transaction ->
            val (reference, room) = readRoom(transaction, code)
            if (room.players.containsKey(userId)) return@runTransaction JoinOutcome.Joined(code)

            if (room.phase == Phases.LOBBY) {
                if (room.players.size >= Constants.MAX_PLAYERS) {
                    throw GameActionException("Oda dolu.", "ROOM_FULL")
                }
                val color = JoinRequests.pickAvailablePlayerColor(room.players)
                    ?: throw GameActionException("Kullanılabilir komutan rengi kalmadı.", "NO_PLAYER_COLOR")
                transaction.update(
                    reference,
                    "players",
                    encodePlayers(room) + (userId to newPlayerFields(userId, name, color)),
                )
                return@runTransaction JoinOutcome.Joined(code)
            }

            assertRequestCanStart(room, userId)?.let { return@runTransaction JoinOutcome.Requested(code) }
            val createdAt = System.currentTimeMillis()
            val request = JoinRequests.createRecord(room, userId, name, createdAt)
            transaction.update(
                reference,
                mapOf(
                    "joinRequests" to encodeJoinRequests(room) + (userId to RoomCodec.encodeJoinRequest(request)),
                    "joinRequestAction" to joinRequestAction("create", userId, userId),
                ),
            )
            JoinOutcome.Requested(code)
        }.await()
    }

    private fun encodeJoinRequests(room: Room): Map<String, Any?> =
        room.joinRequests.mapValues { (_, request) -> RoomCodec.encodeJoinRequest(request) }

    private fun joinRequestAction(type: String, actorId: String, requesterId: String): Map<String, Any?> = mapOf(
        "type" to type,
        "actorId" to actorId,
        "requesterId" to requesterId,
        "at" to Timestamp.now(),
    )

    private fun assertRequestCanStart(room: Room, userId: String): com.ageofpaper.core.model.JoinRequest? {
        if (room.phase != Phases.CLAIMING) {
            throw GameActionException(
                "Toprak edinme tamamlandığı için yeni katılma isteği alınmıyor.",
                "JOIN_REQUEST_CLOSED",
            )
        }
        if (room.players.size >= Constants.MAX_PLAYERS) throw GameActionException("Oda dolu.", "ROOM_FULL")
        val hasNeutral = room.mapDefinition?.regionIds?.any { room.claims[it]?.ownerId == null } == true
        if (!hasNeutral) throw GameActionException("Alınabilecek tarafsız bölge kalmadı.", "NO_NEUTRAL_REGION")
        val own = room.joinRequests[userId]
        if (own?.status == JoinRequestStatus.PENDING &&
            !JoinRequests.isExpired(own, System.currentTimeMillis())
        ) {
            return own
        }
        if (!room.joinRequests.containsKey(userId) && room.joinRequests.size >= Constants.MAX_JOIN_REQUESTS) {
            throw GameActionException("Bu oda çok fazla eski katılma kaydı içeriyor.", "JOIN_REQUEST_LIMIT")
        }
        return null
    }

    override suspend fun leaveRoom(roomCode: String) {
        val userId = requireUser()
        firestore.runTransaction { transaction ->
            val reference = roomRef(roomCode)
            val snapshot = transaction.get(reference)
            if (!snapshot.exists()) return@runTransaction null
            val room = RoomCodec.decodeRoom(roomCode, snapshot.data) ?: return@runTransaction null
            if (!room.players.containsKey(userId)) return@runTransaction null

            val remaining = room.players - userId
            if (remaining.isEmpty()) {
                transaction.delete(reference)
                return@runTransaction null
            }

            val isSurrender = room.phase in setOf(Phases.CLAIM_COMPLETE, Phases.MOBILIZATION, Phases.WAR)
            val next = if (isSurrender) {
                WarState.surrenderPlayer(room, userId).room
            } else {
                val removed = Turns.removePlayerFromTurnState(room, userId).room
                removed.copy(
                    players = remaining,
                    claims = if (room.phase == Phases.CLAIMING) {
                        ClaimRules.releasePlayerClaims(room.claims, userId)
                    } else {
                        room.claims
                    },
                )
            }
            val now = Timestamp.now()
            val oldestId = next.players.values.minWithOrNull(
                compareBy<Player> { it.joinedAt }.thenBy { it.id },
            )?.id
            transaction.update(
                reference,
                mapOf(
                    "players" to encodePlayers(next),
                    "claims" to encodeClaims(next),
                    "hostId" to if (room.hostId == userId) oldestId else room.hostId,
                    "turnOrder" to next.turnOrder,
                    "turnIndex" to next.turnIndex,
                    "turnNumber" to next.turnNumber,
                    "roundNumber" to next.roundNumber,
                    "phase" to next.phase,
                    "mobilizationTurnsRemaining" to next.mobilizationTurnsRemaining,
                    "mobilizationPending" to next.mobilizationPending,
                    "winnerId" to next.winnerId,
                    "completedAt" to if (next.phase == Phases.FINISHED) now else null,
                    "lastAction" to mapOf(
                        "type" to if (isSurrender) "surrender" else "leave",
                        "actorId" to userId,
                        "turnNumber" to next.turnNumber,
                        "winnerId" to next.winnerId,
                        "actionId" to actionId(
                            room.turnNumber,
                            if (isSurrender) "surrender" else "leave",
                            userId,
                        ),
                        "at" to now,
                    ),
                ),
            )
            null
        }.await()
    }

    override suspend fun setRoomMap(roomCode: String, prepared: MapImporter.PreparedMap) {
        val userId = requireUser()
        val validation = MapValidation.validate(prepared.mapDefinition)
        if (!validation.valid) {
            throw GameActionException("Harita doğrulama hataları çözülmeden odaya uygulanamaz.", "INVALID_MAP")
        }
        val assets = MapAssets.build(prepared)
        try {
            firestore.runTransaction { transaction ->
                val reference = roomRef(roomCode)
                val baseReference = assetRef(roomCode, "base_${assets.manifest.baseSvgHash}")
                val metadataReference = assetRef(roomCode, "metadata_${assets.manifest.metadataHash}")
                val snapshot = transaction.get(reference)
                val baseSnapshot = transaction.get(baseReference)
                val metadataSnapshot = transaction.get(metadataReference)
                if (!snapshot.exists()) throw GameActionException("Oda bulunamadı.", "ROOM_NOT_FOUND")
                val room = RoomCodec.decodeRoom(roomCode, snapshot.data)!!
                if (room.hostId != userId) {
                    throw GameActionException("Haritayı yalnızca kurucu değiştirebilir.", "HOST_ONLY")
                }
                if (room.phase != Phases.LOBBY) {
                    throw GameActionException("Oyun başladıktan sonra harita değiştirilemez.", "ROOM_STARTED")
                }
                val createdAt = Timestamp.now()
                if (!baseSnapshot.exists()) {
                    transaction.set(
                        baseReference,
                        mapOf(
                            "kind" to assets.baseAsset.kind,
                            "schemaVersion" to assets.baseAsset.schemaVersion,
                            "hash" to assets.baseAsset.hash,
                            "svg" to assets.baseAsset.svg,
                            "size" to assets.baseAsset.size,
                            "createdAt" to createdAt,
                            "createdBy" to userId,
                        ),
                    )
                }
                if (!metadataSnapshot.exists()) {
                    transaction.set(
                        metadataReference,
                        mapOf(
                            "kind" to assets.metadataAsset.kind,
                            "schemaVersion" to assets.metadataAsset.schemaVersion,
                            "hash" to assets.metadataAsset.hash,
                            "mapId" to assets.metadataAsset.mapId,
                            "revision" to assets.metadataAsset.revision,
                            "metadata" to assets.metadataAsset.metadata,
                            "size" to assets.metadataAsset.size,
                            "createdAt" to createdAt,
                            "createdBy" to userId,
                        ),
                    )
                }
                transaction.update(
                    reference,
                    mapOf(
                        "mapSvg" to "",
                        "mapManifest" to RoomCodec.encodeManifest(assets.manifest),
                        "mapDefinition" to RoomCodec.encodeMapDefinition(prepared.mapDefinition),
                        "mapValidation" to RoomCodec.encodeValidation(validation),
                    ),
                )
                null
            }.await()
        } catch (error: FirebaseFirestoreException) {
            if (error.code == FirebaseFirestoreException.Code.PERMISSION_DENIED) {
                throw GameActionException(
                    "Oda harita assetleri ile manifestin atomik yazımı Firestore Rules tarafından reddedildi. " +
                        "Bu işlem yalnızca lobideki oda kurucusunun uygulama emriyle yapılabilir.",
                    "MAP_ASSET_PERMISSION",
                )
            }
            throw error
        }
    }

    override suspend fun loadRoomSvg(roomCode: String, room: Room): String? {
        if (room.mapSvg.isNotBlank()) return room.mapSvg
        val manifest = room.mapManifest?.takeIf { it.valid } ?: return null
        val baseSnapshot = assetRef(roomCode, "base_${manifest.baseSvgHash}").get().await()
        val metadataSnapshot = assetRef(roomCode, "metadata_${manifest.metadataHash}").get().await()
        val base = baseSnapshot.data ?: return null
        val metadata = metadataSnapshot.data ?: return null
        val resolved = MapAssets.verify(
            manifest = MapAssets.Manifest(
                version = manifest.version,
                mapId = manifest.mapId,
                displayName = manifest.displayName,
                revision = manifest.revision,
                baseSvgHash = manifest.baseSvgHash,
                metadataHash = manifest.metadataHash,
                metadataSchemaVersion = manifest.metadataSchemaVersion,
                analysisAlgorithmVersion = manifest.analysisAlgorithmVersion,
                mapDefinitionVersion = manifest.mapDefinitionVersion,
            ),
            baseAsset = MapAssets.BaseAsset(
                kind = base["kind"] as? String ?: "",
                schemaVersion = (base["schemaVersion"] as? Number)?.toInt() ?: 1,
                hash = base["hash"] as? String ?: "",
                svg = base["svg"] as? String ?: "",
                size = (base["size"] as? Number)?.toInt() ?: 0,
            ),
            metadataAsset = MapAssets.MetadataAsset(
                kind = metadata["kind"] as? String ?: "",
                schemaVersion = (metadata["schemaVersion"] as? Number)?.toInt() ?: 2,
                hash = metadata["hash"] as? String ?: "",
                mapId = metadata["mapId"] as? String ?: "",
                revision = (metadata["revision"] as? Number)?.toInt() ?: 1,
                metadata = metadata["metadata"] as? String ?: "",
                size = (metadata["size"] as? Number)?.toInt() ?: 0,
            ),
        )
        return resolved.svg
    }

    override suspend fun configureNaval(roomCode: String, edit: NavalPolicy.NavalEdit) {
        val userId = requireUser()
        firestore.runTransaction { transaction ->
            val (reference, room) = readRoom(transaction, roomCode)
            if (room.hostId != userId) {
                throw GameActionException("Deniz rotalarını yalnızca kurucu düzenleyebilir.", "HOST_ONLY")
            }
            if (room.phase != Phases.LOBBY) {
                throw GameActionException("Oyun başladıktan sonra deniz rotaları değiştirilemez.", "ROOM_STARTED")
            }
            val definition = room.mapDefinition
                ?: throw GameActionException("Önce geçerli bir harita yükle.", "INVALID_MAP")
            val result = NavalPolicy.applyEdit(definition, edit)
            if (!result.ok) throw GameActionException(result.reason.orEmpty(), result.code.orEmpty())
            val next = result.mapDefinition!!
            transaction.update(
                reference,
                mapOf(
                    "mapDefinition" to RoomCodec.encodeMapDefinition(next),
                    "mapValidation" to RoomCodec.encodeValidation(MapValidation.validate(next)),
                    "lastAction" to mapOf(
                        "type" to "naval_config",
                        "actorId" to userId,
                        "actionId" to "naval_config:$userId:${System.currentTimeMillis()}",
                        "at" to Timestamp.now(),
                    ),
                ),
            )
            null
        }.await()
    }

    override suspend fun startGame(roomCode: String) {
        val userId = requireUser()
        firestore.runTransaction { transaction ->
            val (reference, room) = readRoom(transaction, roomCode)
            if (room.hostId != userId) throw GameActionException("Oyunu yalnızca kurucu başlatabilir.", "HOST_ONLY")
            if (room.phase != Phases.LOBBY) throw GameActionException("Oyun zaten başlatılmış.", "ROOM_STARTED")
            val validation = MapValidation.validate(room.mapDefinition)
            val hasMap = room.mapSvg.isNotBlank() || room.mapManifest?.valid == true
            if (!validation.valid || !hasMap) {
                throw GameActionException("Geçerli bir harita yüklenmeden oyun başlatılamaz.", "INVALID_MAP")
            }
            val turnOrder = room.players.keys.shuffled()
            if (turnOrder.isEmpty()) {
                throw GameActionException("Oyunu başlatmak için bir oyuncu gerekli.", "NO_PLAYERS")
            }
            val players = room.players.mapValues { (_, player) ->
                player.copy(
                    money = Constants.STARTING_MONEY,
                    income = Constants.BASE_INCOME,
                    regionIds = emptyList(),
                    lastIncomeTurn = 0,
                    eliminated = false,
                )
            }
            transaction.update(
                reference,
                mapOf(
                    "phase" to Phases.CLAIMING,
                    "players" to players.mapValues { (_, player) -> RoomCodec.encodePlayer(player) },
                    "claims" to emptyMap<String, Any>(),
                    "turnOrder" to turnOrder,
                    "turnIndex" to 0,
                    "turnNumber" to 1,
                    "roundNumber" to 1,
                    "lastAction" to mapOf(
                        "type" to "start",
                        "actorId" to userId,
                        "turnNumber" to 1,
                        "at" to Timestamp.now(),
                    ),
                ),
            )
            null
        }.await()
    }

    override suspend fun claimRegion(roomCode: String, regionId: String, expectedTurnNumber: Int) {
        val userId = requireUser()
        firestore.runTransaction { transaction ->
            val (reference, room) = readRoom(transaction, roomCode)
            assertExpectedTurn(room, expectedTurnNumber)
            val result = ClaimRules.applyClaim(room, userId, regionId)
            throwIfIllegal(result.eligibility)
            val next = result.room
            transaction.update(
                reference,
                mapOf(
                    "phase" to next.phase,
                    "claims" to encodeClaims(next),
                    "players" to encodePlayers(next),
                    "turnOrder" to next.turnOrder,
                    "turnIndex" to next.turnIndex,
                    "turnNumber" to next.turnNumber,
                    "roundNumber" to next.roundNumber,
                    "lastAction" to mapOf(
                        "type" to "claim",
                        "actorId" to userId,
                        "regionId" to regionId,
                        "turnNumber" to room.turnNumber,
                        "actionId" to actionId(room.turnNumber, "claim", userId, regionId),
                        "at" to Timestamp.now(),
                    ),
                ),
            )
            null
        }.await()
    }

    override suspend fun saveIncome(roomCode: String, expectedTurnNumber: Int) {
        val userId = requireUser()
        firestore.runTransaction { transaction ->
            val (reference, room) = readRoom(transaction, roomCode)
            assertExpectedTurn(room, expectedTurnNumber)
            val result = ClaimRules.applySaveIncome(room, userId)
            throwIfIllegal(result.eligibility)
            val next = result.room
            transaction.update(
                reference,
                mapOf(
                    "players" to encodePlayers(next),
                    "turnIndex" to next.turnIndex,
                    "turnNumber" to next.turnNumber,
                    "roundNumber" to next.roundNumber,
                    "lastAction" to mapOf(
                        "type" to "save_income",
                        "actorId" to userId,
                        "turnNumber" to room.turnNumber,
                        "actionId" to actionId(room.turnNumber, "save_income", userId),
                        "at" to Timestamp.now(),
                    ),
                ),
            )
            null
        }.await()
    }

    override suspend fun startMobilization(roomCode: String) {
        val userId = requireUser()
        firestore.runTransaction { transaction ->
            val (reference, room) = readRoom(transaction, roomCode)
            assertWarSchema(room)
            val result = WarState.startMobilization(room, userId)
            throwIfIllegal(result.eligibility)
            val now = Timestamp.now()
            transaction.update(
                reference,
                campaignFields(
                    result.room,
                    mapOf(
                        "type" to "mobilization_start",
                        "actorId" to userId,
                        "turnNumber" to result.room.turnNumber,
                        "actionId" to actionId(result.room.turnNumber, "mobilization_start", userId),
                    ),
                    now,
                ),
            )
            null
        }.await()
    }

    private suspend fun runLogistics(
        roomCode: String,
        expectedTurnNumber: Int,
        type: String,
        regionId: String,
        count: Int,
        apply: (Room, String) -> RoomResult,
    ) {
        val userId = requireUser()
        firestore.runTransaction { transaction ->
            val (reference, room) = readRoom(transaction, roomCode)
            assertWarSchema(room)
            assertExpectedTurn(room, expectedTurnNumber)
            val result = apply(room, userId)
            throwIfIllegal(result.eligibility)
            transaction.update(
                reference,
                mapOf(
                    "players" to encodePlayers(result.room),
                    "claims" to encodeClaims(result.room),
                    "lastAction" to mapOf(
                        "type" to type,
                        "actorId" to userId,
                        "regionId" to regionId,
                        "count" to count,
                        "cost" to result.eligibility.cost,
                        "turnNumber" to room.turnNumber,
                        "actionId" to actionId(
                            room.turnNumber,
                            type,
                            userId,
                            "$regionId:${System.currentTimeMillis()}",
                        ),
                        "at" to Timestamp.now(),
                    ),
                ),
            )
            null
        }.await()
    }

    override suspend fun recruitSoldiers(
        roomCode: String,
        regionId: String,
        batches: Int,
        expectedTurnNumber: Int,
    ) = runLogistics(roomCode, expectedTurnNumber, "recruit_soldiers", regionId, batches) { room, userId ->
        WarEconomy.applyRecruitSoldiers(room, userId, regionId, batches)
    }

    override suspend fun buildPort(roomCode: String, regionId: String, expectedTurnNumber: Int) =
        runLogistics(roomCode, expectedTurnNumber, "build_port", regionId, 1) { room, userId ->
            WarEconomy.applyBuildPort(room, userId, regionId)
        }

    override suspend fun buyShips(roomCode: String, regionId: String, count: Int, expectedTurnNumber: Int) =
        runLogistics(roomCode, expectedTurnNumber, "buy_ships", regionId, count) { room, userId ->
            WarEconomy.applyBuyShips(room, userId, regionId, count)
        }

    override suspend fun finishMobilizationTurn(roomCode: String, expectedTurnNumber: Int) {
        val userId = requireUser()
        firestore.runTransaction { transaction ->
            val (reference, room) = readRoom(transaction, roomCode)
            assertWarSchema(room)
            assertExpectedTurn(room, expectedTurnNumber)
            val result = WarState.applyMobilizationReady(room, userId)
            throwIfIllegal(result.eligibility)
            transaction.update(
                reference,
                campaignFields(
                    result.room,
                    mapOf(
                        "type" to "mobilization_ready",
                        "actorId" to userId,
                        "turnNumber" to room.turnNumber,
                        "actionId" to actionId(room.turnNumber, "mobilization_ready", userId),
                    ),
                    Timestamp.now(),
                ),
            )
            null
        }.await()
    }

    private suspend fun runOperation(
        roomCode: String,
        expectedTurnNumber: Int,
        type: String,
        sourceId: String?,
        targetId: String?,
        amount: Int,
        apply: (Room, String) -> RoomResult,
    ) {
        val userId = requireUser()
        firestore.runTransaction { transaction ->
            val (reference, room) = readRoom(transaction, roomCode)
            assertWarSchema(room)
            assertExpectedTurn(room, expectedTurnNumber)
            val result = apply(room, userId)
            throwIfIllegal(result.eligibility)
            transaction.update(
                reference,
                campaignFields(
                    result.room,
                    mapOf(
                        "type" to type,
                        "actorId" to userId,
                        "sourceId" to sourceId,
                        "targetId" to targetId,
                        "amount" to amount,
                        "previousOwnerId" to result.eligibility.previousOwnerId,
                        "success" to result.eligibility.combat?.captured,
                        "path" to result.eligibility.path,
                        "winnerId" to result.room.winnerId,
                        "turnNumber" to room.turnNumber,
                        "actionId" to actionId(room.turnNumber, type, userId, targetId.orEmpty()),
                    ),
                    Timestamp.now(),
                ),
            )
            null
        }.await()
    }

    override suspend fun transferTroops(
        roomCode: String,
        sourceId: String,
        targetId: String,
        amount: Int,
        naval: Boolean,
        expectedTurnNumber: Int,
    ) = runOperation(
        roomCode,
        expectedTurnNumber,
        if (naval) "naval_transfer" else "land_transfer",
        sourceId,
        targetId,
        amount,
    ) { room, userId ->
        WarState.applyWarTransfer(room, userId, sourceId, targetId, amount, naval)
    }

    override suspend fun attackRegion(
        roomCode: String,
        sourceId: String,
        targetId: String,
        amount: Int,
        naval: Boolean,
        expectedTurnNumber: Int,
    ) = runOperation(
        roomCode,
        expectedTurnNumber,
        if (naval) "naval_attack" else "land_attack",
        sourceId,
        targetId,
        amount,
    ) { room, userId ->
        WarState.applyWarAttack(room, userId, sourceId, targetId, amount, naval)
    }

    override suspend fun endWarTurn(roomCode: String, expectedTurnNumber: Int) =
        runOperation(roomCode, expectedTurnNumber, "end_war_turn", null, null, 0) { room, userId ->
            WarState.applyWarEndTurn(room, userId)
        }

    override suspend fun skipOfflineTurn(roomCode: String) {
        val userId = requireUser()
        firestore.runTransaction { transaction ->
            val (reference, room) = readRoom(transaction, roomCode)
            if (room.phase !in setOf(Phases.CLAIMING, Phases.MOBILIZATION, Phases.WAR)) {
                throw GameActionException("Bu evrede sıra atlanamaz.", "PHASE_FROZEN")
            }
            if (room.hostId != userId) throw GameActionException("Sırayı yalnızca kurucu atlayabilir.", "HOST_ONLY")
            val activeId = room.activePlayerId
            val lastActive = activeId?.let { room.players[it]?.lastActive } ?: 0L
            if (lastActive <= 0L || System.currentTimeMillis() - lastActive < Constants.OFFLINE_SKIP_TIMEOUT) {
                throw GameActionException("Oyuncu henüz sıra atlama süresini doldurmadı.", "SKIP_TOO_EARLY")
            }
            if (room.phase != Phases.CLAIMING) assertWarSchema(room)
            val next = if (room.phase == Phases.CLAIMING) {
                Turns.advanceTurn(room)
            } else {
                WarState.skipWarTurn(room).room
            }
            transaction.update(
                reference,
                campaignFields(
                    next,
                    mapOf(
                        "type" to "skip_offline",
                        "actorId" to userId,
                        "targetId" to activeId,
                        "skippedPhase" to room.phase,
                        "turnNumber" to room.turnNumber,
                        "actionId" to actionId(room.turnNumber, "skip_offline", userId, activeId.orEmpty()),
                    ),
                    Timestamp.now(),
                ),
            )
            null
        }.await()
    }

    override suspend fun sendChatMessage(roomCode: String, text: String) {
        val userId = requireUser()
        val messageText = text.trim().take(Constants.CHAT_MESSAGE_LIMIT)
        if (messageText.isEmpty()) return
        firestore.runTransaction { transaction ->
            val (reference, room) = readRoom(transaction, roomCode)
            val player = room.players[userId]
                ?: throw GameActionException("Odanın oyuncusu değilsin.", "NOT_PLAYER")
            val nonce = UUID.randomUUID().toString().take(8)
            val message = mapOf(
                "id" to "${userId}_${System.currentTimeMillis()}_$nonce",
                "senderId" to userId,
                "senderName" to player.name,
                "senderColor" to player.color,
                "text" to messageText,
                "createdAt" to System.currentTimeMillis(),
            )
            val chat = room.chat.map { RoomCodec.encodeChat(it) } + listOf(message)
            transaction.update(reference, "chat", chat.takeLast(Constants.CHAT_HISTORY_LIMIT))
            null
        }.await()
    }

    override suspend fun updatePresence(roomCode: String) {
        val userId = currentUserId
        if (userId.isEmpty()) return
        runCatching {
            roomRef(roomCode).update(
                FieldPath.of("players", userId, "lastActive"),
                com.google.firebase.firestore.FieldValue.serverTimestamp(),
            ).await()
        }
    }

    override suspend fun voteJoinRequest(roomCode: String, requesterId: String, approve: Boolean) {
        val userId = requireUser()
        firestore.runTransaction { transaction ->
            val (reference, room) = readRoom(transaction, roomCode)
            val next = JoinRequests.castVote(room, requesterId, userId, approve, System.currentTimeMillis())
            transaction.update(
                reference,
                mapOf(
                    "joinRequests" to encodeJoinRequests(next),
                    "joinRequestAction" to joinRequestAction(
                        if (approve) "approve" else "reject",
                        userId,
                        requesterId,
                    ),
                ),
            )
            null
        }.await()
    }

    override suspend fun acceptJoinRequest(roomCode: String, requesterId: String) {
        val userId = requireUser()
        firestore.runTransaction { transaction ->
            val (reference, room) = readRoom(transaction, roomCode)
            val next = JoinRequests.accept(room, requesterId, userId, System.currentTimeMillis())
            transaction.update(
                reference,
                mapOf(
                    "players" to encodePlayers(next),
                    "turnOrder" to next.turnOrder,
                    "joinRequests" to encodeJoinRequests(next),
                    "joinRequestAction" to joinRequestAction("accept", userId, requesterId),
                ),
            )
            null
        }.await()
    }

    override suspend fun rejectJoinRequest(roomCode: String, requesterId: String) =
        closeJoinRequest(roomCode, requesterId, JoinRequestStatus.REJECTED, "reject_request")

    override suspend fun cancelJoinRequest(roomCode: String) =
        closeJoinRequest(roomCode, requireUser(), JoinRequestStatus.CANCELLED, "cancel")

    private suspend fun closeJoinRequest(
        roomCode: String,
        requesterId: String,
        status: String,
        actionType: String,
    ) {
        val userId = requireUser()
        firestore.runTransaction { transaction ->
            val (reference, room) = readRoom(transaction, roomCode)
            val request = room.joinRequests[requesterId]
                ?: throw GameActionException("Katılma isteği bulunamadı.", "JOIN_REQUEST_NOT_FOUND")
            val now = System.currentTimeMillis()
            val next = room.copy(
                joinRequests = room.joinRequests + (
                    requesterId to request.copy(
                        status = status,
                        updatedAt = now,
                        decisionAt = now,
                        decidedBy = userId,
                    )
                    ),
            )
            transaction.update(
                reference,
                mapOf(
                    "joinRequests" to encodeJoinRequests(next),
                    "joinRequestAction" to joinRequestAction(actionType, userId, requesterId),
                ),
            )
            null
        }.await()
    }
}
