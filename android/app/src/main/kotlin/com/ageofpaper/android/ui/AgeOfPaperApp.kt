package com.ageofpaper.android.ui

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Snackbar
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.ageofpaper.android.ui.screens.ChatOverlay
import com.ageofpaper.android.ui.screens.ClaimCommandCard
import com.ageofpaper.android.ui.screens.ClaimCompleteCard
import com.ageofpaper.android.ui.screens.GameScreen
import com.ageofpaper.android.ui.screens.JoinRequestRow
import com.ageofpaper.android.ui.screens.JoinWaitingScreen
import com.ageofpaper.android.ui.screens.LobbyScreen
import com.ageofpaper.android.ui.screens.LoginScreen
import com.ageofpaper.android.ui.screens.LogisticsCommandCard
import com.ageofpaper.android.ui.screens.MapPrepareScreen
import com.ageofpaper.android.ui.screens.MenuSheet
import com.ageofpaper.android.ui.screens.VictoryScreen
import com.ageofpaper.android.ui.screens.WarCommandCard
import com.ageofpaper.android.ui.theme.AopType
import com.ageofpaper.android.ui.theme.Ink
import com.ageofpaper.core.model.JoinRequestStatus
import com.ageofpaper.core.rules.ClaimRules
import com.ageofpaper.core.rules.Economy
import com.ageofpaper.core.rules.JoinRequests
import com.ageofpaper.core.rules.Phases

/** Root composable: routes between the design screens and hosts the overlays. */
@Composable
fun AgeOfPaperApp(viewModel: GameViewModel) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val context = LocalContext.current

    val pickMap = rememberLauncherForActivityResult(
        ActivityResultContracts.OpenDocument(),
    ) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        val name = uri.lastPathSegment?.substringAfterLast('/')?.removeSuffix(".svg") ?: "Harita"
        val text = runCatching {
            context.contentResolver.openInputStream(uri)?.bufferedReader()?.use { it.readText() }
        }.getOrNull()
        if (text != null) viewModel.importMap(text, name)
    }

    Box(modifier = Modifier.fillMaxSize().background(Ink.Background)) {
        when {
            state.route == Route.LOGIN -> LoginScreen(
                nickname = state.nickname,
                backendMode = state.backendMode,
                busy = state.busy,
                onNicknameChange = viewModel::setNickname,
                onCreateRoom = viewModel::createRoom,
                onJoinRoom = viewModel::joinRoom,
            )

            state.route == Route.JOIN_WAITING -> JoinWaitingScreen(
                commanderName = state.nickname,
                roomCode = state.roomCode,
                remaining = state.joinRequestRemaining(),
                onCancel = viewModel::cancelJoinRequest,
            )

            state.room == null -> Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center,
            ) {
                Text("Oda yükleniyor…", style = AopType.BodySmall)
            }

            state.phase == Phases.FINISHED -> VictoryScreen(
                room = state.room!!,
                onOpenChat = { viewModel.setChatVisible(true) },
                onLeave = viewModel::leaveRoom,
            )

            state.phase == Phases.LOBBY -> LobbyScreen(
                room = state.room!!,
                isHost = state.isHost,
                busy = state.busy,
                pendingImport = state.pendingImport,
                onPickMap = { pickMap.launch(arrayOf("image/svg+xml", "text/xml", "application/xml", "*/*")) },
                onApplyMap = viewModel::applyPendingMap,
                onDiscardMap = viewModel::discardPendingMap,
                onOpenPrepare = { viewModel.setMapPrepareVisible(true) },
                onStart = viewModel::startGame,
                onLeave = viewModel::leaveRoom,
            )

            else -> GameScreen(
                state = state,
                onRegionTap = viewModel::selectRegion,
                onOpenChat = { viewModel.setChatVisible(true) },
                onOpenMenu = { viewModel.setMenuVisible(true) },
                commandCard = { CommandCardHost(state, viewModel) },
            )
        }

        if (state.chatVisible) {
            ChatOverlay(
                messages = state.room?.chat.orEmpty(),
                commanderCount = state.room?.players?.size ?: 0,
                busy = state.busy,
                onSend = viewModel::sendChat,
                onDismiss = { viewModel.setChatVisible(false) },
            )
        }

        if (state.menuVisible) {
            MenuSheet(
                phase = state.phase,
                isHost = state.isHost,
                navalPolicy = state.room?.mapDefinition?.navalPolicy,
                pendingRequests = state.pendingJoinRequests(),
                busy = state.busy,
                onDismiss = { viewModel.setMenuVisible(false) },
                onLeave = viewModel::leaveRoom,
                onSkipOffline = viewModel::skipOfflinePlayer,
                onOpenPrepare = {
                    viewModel.setMenuVisible(false)
                    viewModel.setMapPrepareVisible(true)
                },
                onNavalPolicy = viewModel::setNavalPolicy,
                onAcceptRequest = viewModel::acceptJoinRequest,
                onRejectRequest = viewModel::rejectJoinRequest,
                onVoteRequest = viewModel::voteJoinRequest,
            )
        }

        val prepared = state.pendingImport
        if (state.mapPrepareVisible && prepared != null) {
            MapPrepareScreen(
                prepared = prepared,
                busy = state.busy,
                onTerrainChange = viewModel::setSurfaceTerrain,
                onPortChange = viewModel::setPortPreference,
                onNavalPolicy = viewModel::setPendingNavalPolicy,
                onToggleRoute = viewModel::togglePendingRoute,
                onApply = viewModel::applyPendingMap,
                onClose = { viewModel.setMapPrepareVisible(false) },
            )
        }

        val error = state.error
        if (error != null) {
            Snackbar(
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .navigationBarsPadding()
                    .padding(16.dp)
                    .fillMaxWidth(),
                containerColor = Ink.WarSurface,
                contentColor = Ink.Text,
                action = {
                    Text(
                        "Tamam",
                        style = AopType.Label.copy(color = Ink.Gold),
                        modifier = Modifier
                            .clickable(onClick = viewModel::dismissError)
                            .padding(8.dp),
                    )
                },
            ) {
                Text(error, style = AopType.BodySmall.copy(color = Ink.Text))
            }
        }
    }
}

@Composable
private fun CommandCardHost(state: UiState, viewModel: GameViewModel) {
    val room = state.room ?: return
    when (state.phase) {
        Phases.CLAIMING -> {
            val region = state.selectedRegion
            val eligibility = region?.let {
                ClaimRules.claimEligibility(
                    phase = room.phase,
                    mapDefinition = room.mapDefinition,
                    claims = room.claims,
                    playerId = state.userId,
                    regionId = it.id,
                    money = state.me?.money,
                    isActive = state.isMyTurn,
                )
            }
            ClaimCommandCard(
                region = region,
                ownerName = room.claims[region?.id]?.ownerId?.let { room.players[it]?.name },
                eligibility = eligibility,
                income = Economy.calculateIncome(room.mapDefinition, room.claims, state.userId),
                isMyTurn = state.isMyTurn,
                busy = state.busy,
                onBuy = viewModel::buySelected,
                onSaveIncome = viewModel::saveIncome,
            )
        }

        Phases.CLAIM_COMPLETE -> ClaimCompleteCard(
            isHost = state.isHost,
            busy = state.busy,
            onStartMobilization = viewModel::startMobilization,
        )

        Phases.MOBILIZATION -> {
            val regionId = state.selectedRegionId
            LogisticsCommandCard(
                region = state.selectedRegion,
                claim = room.claims[regionId],
                money = state.me?.money ?: 0L,
                canBuildPort = viewModel.canBuildPort(regionId),
                isMyTurn = state.isMyTurn,
                busy = state.busy,
                onRecruit = { regionId?.let(viewModel::recruitSoldiers) },
                onBuildPort = { regionId?.let(viewModel::buildPort) },
                onBuyShip = { regionId?.let(viewModel::buyShip) },
                onReady = viewModel::finishMobilizationTurn,
            )
        }

        Phases.WAR -> WarCommandCard(
            room = room,
            plan = state.warPlan,
            isMyTurn = state.isMyTurn,
            busy = state.busy,
            onPickOperation = viewModel::beginWarOperation,
            onAmountChange = viewModel::changeWarAmount,
            onBack = {
                if (state.warPlan.step == WarStep.CONFIRM) viewModel.backToTargetStep() else viewModel.cancelWarPlan()
            },
            onSubmit = viewModel::submitWarPlan,
            onEndTurn = viewModel::endWarTurn,
        )

        else -> Unit
    }
}

private fun UiState.joinRequestRemaining(): String {
    val request = room?.joinRequests?.get(userId) ?: return "—"
    val remaining = ((request.expiresAt - System.currentTimeMillis()) / 1000).coerceAtLeast(0)
    return "%d:%02d".format(remaining / 60, remaining % 60)
}

private fun UiState.pendingJoinRequests(): List<JoinRequestRow> {
    val room = room ?: return emptyList()
    val now = System.currentTimeMillis()
    return room.joinRequests.values
        .filter { it.status == JoinRequestStatus.PENDING && !JoinRequests.isExpired(it, now) && it.uid != userId }
        .map { request ->
            val summary = JoinRequests.voteSummary(room, request)
            JoinRequestRow(
                uid = request.uid,
                name = request.name,
                approvedCount = summary.approvedCount,
                requiredCount = summary.requiredCount,
            )
        }
}
