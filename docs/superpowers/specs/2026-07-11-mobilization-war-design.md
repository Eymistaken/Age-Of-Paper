# Mobilization and War Design

## Scope

Age of Paper gains a complete deterministic campaign after claiming: `claim_complete` remains a frozen review gate, the host starts one mobilization turn per active commander, and war then continues until surrender or conquest leaves one region-owning commander. Existing claiming, chat, join requests, camera geometry, pointer gestures, and responsive drawer behavior remain intact.

## Authority and data flow

Room documents use schema version 4. Pure modules normalize naval topology, grant turn income once, validate logistics and operations, resolve combat, maintain ownership/income, remove eliminated players from turn order, and determine victory. `roomService.js` reads the room in a Firestore transaction, checks schema and expected turn, calls the relevant pure transition, and writes the complete authoritative result plus a stable `lastAction`. Firestore rules independently constrain each action shape and arithmetic; the UI never becomes the authority.

Players add `eliminated`. Claimed regions add `soldiers`, `hasPort`, and `ships` when mobilization begins. Regions in `mapDefinition` always contain `coastal` and symmetric `seaNeighbors`. Rooms add `mobilizationTurnsRemaining`, `mobilizationReady`, `winnerId`, and `completedAt`. Legacy rooms receive safe read defaults, but combat writes require schema 4.

## Turn model

The final claim does not advance the turn. Mobilization begins at the next index in the existing order, increments the monotonic turn number, initializes 1,000 soldiers per claim, and records every active player as still due. Each mobilization ready/skip removes exactly the active player from the due set and advances; the final ready enters war at the next player.

At the beginning of a mobilization or war turn the active player is owed their current income. Every logistics and operation transition first applies that income if `lastIncomeTurn < turnNumber`, so retries and racing clicks cannot duplicate or miss it. Purchases preserve the turn. Ready, transfer, attack, explicit end, and offline skip advance once. Offline skip does not pay the skipped player.

## Military rules

Recruiting, ports, and ships use exported integer constants. Friendly land transfer may cross any owned path. Naval movement and attacks require direct configured routes, a source port, and persistent ship capacity. Combat subtracts the selected attacking force and resolves deterministically against the target force. Capture updates the claim owner, both players' region lists and incomes, destroys target ships, preserves ports, eliminates a former owner with no regions, and finishes immediately when one active region-owning player remains.

Surrender removes membership, neutralizes the player's claims with zero soldiers and ships while preserving ports, safely removes the turn-order entry, transfers host deterministically, and resolves phase/victory.

## Interface

The lobby gets a host-only naval editor after map validation. Region presses select through the existing press-pending pointer state; controls toggle coastal status and create/remove symmetric routes, while dashed route lines use region centers in root viewBox coordinates. Text states accompany all color states.

Mobilization and war reuse a single command model for desktop and mobile. Explicit logistics, movement, and attack modes expose source, target, amount, eligibility reason, and whether the action ends the turn. Attack confirmation is inline and includes the deterministic result. The map paints legal sources/targets, adds compact military badges in world coordinates, and reveals relevant sea routes. Selection resets on turn, phase, map, ownership, or military changes. Remote transfer/attack actions focus only their target through the existing strict transformed-bounds pipeline.

## Verification

Pure tests cover all deterministic transitions and neutral synthetic IDs. Component tests cover shared command-state behavior, pointer/pan safety, responsive rendering, and remote focus. Emulator tests cover accepted and rejected mutation shapes. Final verification runs lint, unit tests, Firestore emulator tests, production build, and a synthetic local browser smoke matrix without production Firebase data.
