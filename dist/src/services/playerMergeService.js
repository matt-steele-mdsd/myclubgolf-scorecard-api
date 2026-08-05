"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.searchAllPlayers = searchAllPlayers;
exports.getMergePreview = getMergePreview;
exports.mergePlayers = mergePlayers;
exports.getOrphanedPlayers = getOrphanedPlayers;
exports.deleteOrphanedPlayers = deleteOrphanedPlayers;
exports.getOrphanedEventLinks = getOrphanedEventLinks;
exports.deleteOrphanedEventLinks = deleteOrphanedEventLinks;
exports.getEmptyGames = getEmptyGames;
exports.deleteEmptyGames = deleteEmptyGames;
exports.getInvalidNamePlayers = getInvalidNamePlayers;
exports.searchPlayersInEvent = searchPlayersInEvent;
exports.getGameSwapPreview = getGameSwapPreview;
exports.swapPlayersInGame = swapPlayersInGame;
const config_1 = __importDefault(require("../db/config"));
const gameService_1 = require("./gameService");
const skinsService_1 = require("./skinsService");
/**
 * Master Tools -> Merge Players. For when the same real person got added as two separate
 * Player rows (usually a name-spelling mismatch, e.g. "Tom"/"Thomas") instead of being linked
 * via Link Players into their other event(s) — see [[data_model_gotchas]] and the
 * Rod/Rodd Zeller and Tom/Thomas Barker merges this generalizes.
 */
/** Every table that stores rows keyed (in part) by PlayerID, and needs reassigning on a merge.
 * Deliberately excludes 'Team' -- dropped from production 2026-07-13 (see ARCHITECTURE.md),
 * superseded by TeamGame/TeamGamePlayer; querying it here 500'd Merge Players/Orphaned Players. */
const SIMPLE_PLAYER_TABLES = [
    'Score', 'Skins', 'Hdcp', 'PostedGHIN', 'PlayerStatus', 'GSkins', 'GrossSkinsResult', 'GSkinsPaid', 'OptOut',
    'InGrossBirdie', 'InNetBirdie', 'InUPSCup', 'UpsCupPaid', 'UpsCupWinner', 'PaidTracker',
    'PlayingGroup', 'TeamGamePlayer',
];
/** Search every player in the system by name — not scoped to one event's roster, since the
 * duplicate of a player usually lives in a *different* event than the one you're looking at.
 * Course is included since it's now part of a player's real identity (see [[data_model_gotchas]])
 * — a same-named player at a *different* course is a different real person, not a duplicate. */
async function searchAllPlayers(query) {
    const pattern = `%${query}%`;
    const [rows] = await config_1.default.query(`SELECT p.PlayerID, p.FirstName, p.LastName, p.Course, p.GHIN,
            GROUP_CONCAT(DISTINCT e.EventName ORDER BY e.EventName SEPARATOR ', ') AS events
     FROM Player p
     LEFT JOIN EventPlayers ep ON ep.PlayerID = p.PlayerID
     LEFT JOIN Events e ON e.EventID = ep.EventID
     WHERE p.FirstName LIKE ? OR p.LastName LIKE ? OR CONCAT(p.FirstName, ' ', p.LastName) LIKE ?
     GROUP BY p.PlayerID
     ORDER BY p.LastName, p.FirstName
     LIMIT 30`, [pattern, pattern, pattern]);
    return rows.map((r) => ({
        playerId: r.PlayerID,
        name: `${r.LastName}, ${r.FirstName}`,
        course: r.Course || '',
        ghin: r.GHIN || null,
        events: r.events || '',
    }));
}
/** Row counts per affected table for both players, so an admin can sanity-check before
 * committing to a merge (e.g. "these don't look like the same person" if events never overlap
 * and nothing lines up). */
async function getMergePreview(duplicateId, targetId) {
    const playerQuery = `SELECT p.PlayerID, p.FirstName, p.LastName, p.Course, p.GHIN,
            GROUP_CONCAT(DISTINCT e.EventName ORDER BY e.EventName SEPARATOR ', ') AS events
     FROM Player p
     LEFT JOIN EventPlayers ep ON ep.PlayerID = p.PlayerID
     LEFT JOIN Events e ON e.EventID = ep.EventID
     WHERE p.PlayerID = ? GROUP BY p.PlayerID`;
    const [duplicateResult, targetResult] = await Promise.all([
        config_1.default.query(playerQuery, [duplicateId]),
        config_1.default.query(playerQuery, [targetId]),
    ]);
    const duplicate = duplicateResult[0][0];
    const target = targetResult[0][0];
    const toRow = (r) => r
        ? { playerId: r.PlayerID, name: `${r.LastName}, ${r.FirstName}`, course: r.Course || '', ghin: r.GHIN || null, events: r.events || '' }
        : null;
    const rows = [];
    for (const table of [...SIMPLE_PLAYER_TABLES, 'EventPlayers']) {
        const [[dCount]] = await config_1.default.query(`SELECT COUNT(*) as cnt FROM ${table} WHERE PlayerID = ?`, [duplicateId]);
        const [[tCount]] = await config_1.default.query(`SELECT COUNT(*) as cnt FROM ${table} WHERE PlayerID = ?`, [targetId]);
        rows.push({ table, duplicateCount: dCount.cnt, targetCount: tCount.cnt });
    }
    return { duplicate: toRow(duplicate), target: toRow(target), rows };
}
/**
 * Merge `duplicateId` into `targetId`: every row across every known per-player table gets
 * reassigned to `targetId`, `EventPlayers` links are transferred (or dropped if `targetId`
 * already has that event), the target's GHIN/Email/Phone get filled in from the duplicate if
 * blank, and the duplicate's Player row is deleted. Runs in a transaction — if any table has a
 * genuine data conflict (both players already have a row for the same key, which usually means
 * they aren't actually the same person, or already got manually reconciled), the whole merge is
 * rolled back rather than silently dropping rows.
 */
async function mergePlayers(duplicateId, targetId) {
    if (duplicateId === targetId) {
        return { ok: false, error: 'Cannot merge a player into themselves.' };
    }
    const conn = await config_1.default.getConnection();
    try {
        await conn.beginTransaction();
        for (const table of SIMPLE_PLAYER_TABLES) {
            await conn.query(`UPDATE ${table} SET PlayerID = ? WHERE PlayerID = ?`, [targetId, duplicateId]);
        }
        // EventPlayers: transfer any event the duplicate has that the target doesn't; drop the rest
        // as redundant (target is already linked to those events).
        const [dupEvents] = await conn.query('SELECT EventID FROM EventPlayers WHERE PlayerID = ?', [duplicateId]);
        const [targetEvents] = await conn.query('SELECT EventID FROM EventPlayers WHERE PlayerID = ?', [targetId]);
        const targetEventIds = new Set(targetEvents.map((r) => r.EventID));
        for (const row of dupEvents) {
            if (targetEventIds.has(row.EventID)) {
                await conn.query('DELETE FROM EventPlayers WHERE PlayerID = ? AND EventID = ?', [duplicateId, row.EventID]);
            }
            else {
                await conn.query('UPDATE EventPlayers SET PlayerID = ? WHERE PlayerID = ? AND EventID = ?', [
                    targetId,
                    duplicateId,
                    row.EventID,
                ]);
            }
        }
        // Fill in the target's GHIN/Email/Phone from the duplicate if the target's are blank.
        const [[duplicatePlayer]] = await conn.query('SELECT GHIN, Email, Phone FROM Player WHERE PlayerID = ?', [duplicateId]);
        const [[targetPlayer]] = await conn.query('SELECT GHIN, Email, Phone FROM Player WHERE PlayerID = ?', [targetId]);
        if (duplicatePlayer && targetPlayer) {
            const ghin = !targetPlayer.GHIN && duplicatePlayer.GHIN ? duplicatePlayer.GHIN : targetPlayer.GHIN;
            const email = !targetPlayer.Email && duplicatePlayer.Email ? duplicatePlayer.Email : targetPlayer.Email;
            const phone = !targetPlayer.Phone && duplicatePlayer.Phone ? duplicatePlayer.Phone : targetPlayer.Phone;
            await conn.query('UPDATE Player SET GHIN = ?, Email = ?, Phone = ? WHERE PlayerID = ?', [ghin, email, phone, targetId]);
        }
        await conn.query('DELETE FROM Player WHERE PlayerID = ?', [duplicateId]);
        await conn.commit();
        return { ok: true };
    }
    catch (error) {
        await conn.rollback();
        if (error.code === 'ER_DUP_ENTRY') {
            return {
                ok: false,
                error: 'These two players have conflicting data in the same game — they may not be the same person. Merge cancelled, nothing was changed.',
            };
        }
        return { ok: false, error: error.message };
    }
    finally {
        conn.release();
    }
}
/**
 * Every player not linked to any event via EventPlayers — usually a stale placeholder/guest
 * row, but sometimes (like PlayerID 166, found 2026-07-06) one that still has real leftover
 * score data from games it was never actually registered for. Reports what data (if any) each
 * one still has so an admin can judge whether it's safe to delete outright.
 */
async function getOrphanedPlayers() {
    const [players] = await config_1.default.query(`SELECT PlayerID, FirstName, LastName FROM Player
     WHERE PlayerID NOT IN (SELECT DISTINCT PlayerID FROM EventPlayers)
     ORDER BY LastName, FirstName`);
    const candidates = [];
    for (const p of players) {
        const nameParts = [p.LastName, p.FirstName].map((s) => (s || '').trim()).filter(Boolean);
        const description = nameParts.length > 0 ? nameParts.join(', ') : '(blank name)';
        const dataFound = [];
        for (const table of SIMPLE_PLAYER_TABLES) {
            const [[count]] = await config_1.default.query(`SELECT COUNT(*) as cnt FROM ${table} WHERE PlayerID = ?`, [p.PlayerID]);
            if (count.cnt > 0)
                dataFound.push(`${count.cnt} ${table}`);
        }
        candidates.push({
            key: String(p.PlayerID),
            playerId: p.PlayerID,
            description,
            reason: dataFound.length === 0
                ? 'No event link and no data anywhere — safe to delete.'
                : `No event link, but still has data: ${dataFound.join(', ')}.`,
        });
    }
    return candidates;
}
/** Delete orphaned players entirely — every row they have across every per-player table, then
 * the Player row itself. Only meaningful for players `getOrphanedPlayers` returned. */
async function deleteOrphanedPlayers(playerIds) {
    for (const playerId of playerIds) {
        for (const table of SIMPLE_PLAYER_TABLES) {
            await config_1.default.query(`DELETE FROM ${table} WHERE PlayerID = ?`, [playerId]);
        }
        await config_1.default.query('DELETE FROM EventPlayers WHERE PlayerID = ?', [playerId]);
        await config_1.default.query('DELETE FROM Player WHERE PlayerID = ?', [playerId]);
    }
}
async function getOrphanedEventLinks() {
    const [phantomRows] = await config_1.default.query(`SELECT DISTINCT EventID FROM (
       SELECT ep.EventID FROM EventPlayers ep LEFT JOIN Events e ON e.EventID = ep.EventID WHERE e.EventID IS NULL
       UNION
       SELECT eo.EventID FROM EventOptions eo LEFT JOIN Events e ON e.EventID = eo.EventID WHERE e.EventID IS NULL
       UNION
       SELECT ec.EventID FROM EventCalendar ec LEFT JOIN Events e ON e.EventID = ec.EventID WHERE e.EventID IS NULL
       UNION
       SELECT tt.GroupID AS EventID FROM TeeTimes tt LEFT JOIN Events e ON e.EventID = tt.GroupID WHERE e.EventID IS NULL
     ) AS phantoms`);
    const candidates = [];
    for (const { EventID: eventId } of phantomRows) {
        const [[playerCount]] = await config_1.default.query('SELECT COUNT(*) as cnt FROM EventPlayers WHERE EventID = ?', [eventId]);
        const [[optionsCount]] = await config_1.default.query('SELECT COUNT(*) as cnt FROM EventOptions WHERE EventID = ?', [eventId]);
        const [[calendarCount]] = await config_1.default.query('SELECT COUNT(*) as cnt FROM EventCalendar WHERE EventID = ?', [eventId]);
        const [[teeTimesCount]] = await config_1.default.query('SELECT COUNT(*) as cnt FROM TeeTimes WHERE GroupID = ?', [eventId]);
        const [[gameInfo]] = await config_1.default.query('SELECT COUNT(*) as cnt, MIN(GameDate) as first, MAX(GameDate) as last FROM Game WHERE GroupID = ?', [eventId]);
        const parts = [];
        if (playerCount.cnt > 0)
            parts.push(`${playerCount.cnt} player link${playerCount.cnt === 1 ? '' : 's'}`);
        if (optionsCount.cnt > 0)
            parts.push(`${optionsCount.cnt} option row${optionsCount.cnt === 1 ? '' : 's'}`);
        if (calendarCount.cnt > 0)
            parts.push(`${calendarCount.cnt} calendar row${calendarCount.cnt === 1 ? '' : 's'}`);
        if (teeTimesCount.cnt > 0)
            parts.push(`${teeTimesCount.cnt} tee time row${teeTimesCount.cnt === 1 ? '' : 's'}`);
        let reason = `Events row is missing, but ${parts.join(', ') || 'stray rows'} still reference it.`;
        if (gameInfo.cnt > 0) {
            const first = new Date(gameInfo.first).toLocaleDateString('en-US');
            const last = new Date(gameInfo.last).toLocaleDateString('en-US');
            reason += ` Warning: ${gameInfo.cnt} real game${gameInfo.cnt === 1 ? '' : 's'} still exist under this ID (${first}${first === last ? '' : ` - ${last}`}) — deleting here only removes the player/option/calendar/tee-time links, not those games or their scores.`;
        }
        candidates.push({ key: `phantom-event-${eventId}`, eventId, description: `Event ID ${eventId} (deleted)`, reason });
    }
    return candidates;
}
/** Delete the leftover EventPlayers/EventOptions/EventCalendar/TeeTimes rows for a phantom
 * EventID. Deliberately does NOT touch Game/Score under the same GroupID — those are real
 * played rounds, out of scope for "clean up the roster/config links" even when the event itself
 * is gone. */
async function deleteOrphanedEventLinks(eventIds) {
    for (const eventId of eventIds) {
        await config_1.default.query('DELETE FROM EventPlayers WHERE EventID = ?', [eventId]);
        await config_1.default.query('DELETE FROM EventOptions WHERE EventID = ?', [eventId]);
        await config_1.default.query('DELETE FROM EventCalendar WHERE EventID = ?', [eventId]);
        await config_1.default.query('DELETE FROM TeeTimes WHERE GroupID = ?', [eventId]);
    }
}
async function getEmptyGames() {
    const [rows] = await config_1.default.query(`SELECT g.GameID, g.GameDate, g.GroupID, e.EventName, c.CourseName
     FROM Game g
     LEFT JOIN Events e ON e.EventID = g.GroupID
     LEFT JOIN Course c ON c.CourseID = g.CourseID
     WHERE g.GameID NOT IN (SELECT DISTINCT GameID FROM Score)
     ORDER BY g.GameDate DESC`);
    return rows.map((r) => ({
        key: String(r.GameID),
        gameId: r.GameID,
        description: `${r.EventName || `Event ID ${r.GroupID} (deleted)`} — ${new Date(r.GameDate).toLocaleDateString('en-US')}`,
        reason: `${r.CourseName || 'Unknown course'} — no scores were ever recorded for this game.`,
    }));
}
/** Delete empty games entirely — same whole-game deletion `deleteCleanupCandidates` does
 * (TeamGamePlayer/OptOut/Skins can still exist even with zero scores, e.g. a team was picked
 * before anyone bailed), plus the Game row itself. */
async function deleteEmptyGames(gameIds) {
    for (const gameId of gameIds) {
        await config_1.default.query('DELETE FROM Skins WHERE GameID = ?', [gameId]);
        await config_1.default.query('DELETE FROM OptOut WHERE GameID = ?', [gameId]);
        await config_1.default.query('DELETE FROM TeamGamePlayer WHERE TeamGameID IN (SELECT TeamGameID FROM TeamGame WHERE GameID = ?)', [gameId]);
        await config_1.default.query('DELETE FROM TeamGame WHERE GameID = ?', [gameId]);
        await config_1.default.query('DELETE FROM Game WHERE GameID = ?', [gameId]);
    }
}
/**
 * Invalid Name — the first check is a blank FirstName *and* LastName (unlike the "no event
 * link" special case, this looks regardless of whether the player is actually linked to real
 * events, since a real event's roster can still contain a completely unnamed placeholder row).
 * More invalid-name shapes can be added here later (e.g. single-character names, all-numeric
 * names) as their own checks feeding the same candidate list.
 */
async function getInvalidNamePlayers() {
    const [players] = await config_1.default.query(`SELECT PlayerID FROM Player WHERE TRIM(COALESCE(FirstName, '')) = '' AND TRIM(COALESCE(LastName, '')) = ''`);
    const candidates = [];
    for (const p of players) {
        const [[eventCount]] = await config_1.default.query('SELECT COUNT(*) as cnt FROM EventPlayers WHERE PlayerID = ?', [p.PlayerID]);
        const dataFound = [];
        for (const table of SIMPLE_PLAYER_TABLES) {
            const [[count]] = await config_1.default.query(`SELECT COUNT(*) as cnt FROM ${table} WHERE PlayerID = ?`, [p.PlayerID]);
            if (count.cnt > 0)
                dataFound.push(`${count.cnt} ${table}`);
        }
        const parts = [];
        if (eventCount.cnt > 0)
            parts.push(`linked to ${eventCount.cnt} event${eventCount.cnt === 1 ? '' : 's'}`);
        if (dataFound.length > 0)
            parts.push(`data: ${dataFound.join(', ')}`);
        candidates.push({
            key: String(p.PlayerID),
            playerId: p.PlayerID,
            description: '(blank name)',
            reason: parts.length > 0 ? `Blank first/last name — ${parts.join('; ')}.` : 'Blank first/last name, no other data — safe to delete.',
        });
    }
    return candidates;
}
/** Search players within one event's own roster — unlike `searchAllPlayers` (system-wide, for
 * finding a duplicate that lives in a *different* event), Swap Players' "Correct Player" must
 * already be part of this event, since a swap only makes sense between two people who could
 * plausibly have played in the same round. */
async function searchPlayersInEvent(eventId, query) {
    const pattern = `%${query}%`;
    const [rows] = await config_1.default.query(`SELECT p.PlayerID, p.FirstName, p.LastName, p.Course, p.GHIN,
            GROUP_CONCAT(DISTINCT e.EventName ORDER BY e.EventName SEPARATOR ', ') AS events
     FROM Player p
     INNER JOIN EventPlayers ep ON ep.PlayerID = p.PlayerID AND ep.EventID = ?
     LEFT JOIN EventPlayers ep2 ON ep2.PlayerID = p.PlayerID
     LEFT JOIN Events e ON e.EventID = ep2.EventID
     WHERE p.FirstName LIKE ? OR p.LastName LIKE ? OR CONCAT(p.FirstName, ' ', p.LastName) LIKE ?
     GROUP BY p.PlayerID
     ORDER BY p.LastName, p.FirstName
     LIMIT 30`, [eventId, pattern, pattern, pattern]);
    return rows.map((r) => ({
        playerId: r.PlayerID,
        name: `${r.LastName}, ${r.FirstName}`,
        course: r.Course || '',
        ghin: r.GHIN || null,
        events: r.events || '',
    }));
}
/** Tables where a single game's data can be misattributed to the wrong player — the Tom/Thomas
 * Barker and Denny/Dennis English GameID-level fixes this generalizes. Narrower than
 * SIMPLE_PLAYER_TABLES: EventPlayers/PostedGHIN/PlayerStatus aren't scoped to one GameID the same
 * way, so they're left alone here — a swap only touches what actually happened *in that game*.
 * 'Team' excluded, same reason as SIMPLE_PLAYER_TABLES above (dropped from production 2026-07-13). */
const GAME_SWAP_TABLES = ['Score', 'Skins', 'Hdcp'];
/** What a swap would actually move for one player, in terms an admin can sanity-check at a
 * glance — the real gross score total for this game (not a row count, which is just the number
 * of holes played and not useful for spotting a wrong-player mixup) and their on-file handicap
 * for this game, if any. Team/Skins still move as part of the swap itself (see
 * `swapPlayersInGame`), just not shown here — there's nothing to sanity-check about them. */
async function getGameSwapPlayerInfo(gameId, playerId) {
    const [[player]] = await config_1.default.query(`SELECT PlayerID, CONCAT(LastName, ', ', FirstName) AS name FROM Player WHERE PlayerID = ?`, [playerId]);
    const [[scoreRow]] = await config_1.default.query(`SELECT SUM(Score) as grossScore FROM Score WHERE GameID = ? AND PlayerID = ?`, [gameId, playerId]);
    const [[hdcpRow]] = await config_1.default.query(`SELECT Hdcp FROM Hdcp WHERE GameID = ? AND PlayerID = ?`, [gameId, playerId]);
    return {
        playerId,
        name: player?.name || '(unknown player)',
        grossScore: scoreRow?.grossScore !== null && scoreRow?.grossScore !== undefined ? Number(scoreRow.grossScore) : null,
        hdcp: hdcpRow?.Hdcp ?? null,
    };
}
/** Preview of what a swap would move, for both players, so an admin can confirm before
 * committing — scoped to one GameID instead of a player's whole history. */
async function getGameSwapPreview(gameId, playerAId, playerBId) {
    const [playerA, playerB] = await Promise.all([
        getGameSwapPlayerInfo(gameId, playerAId),
        getGameSwapPlayerInfo(gameId, playerBId),
    ]);
    return { playerA, playerB };
}
/**
 * Swap two players' data for a single game — for when whoever entered scores picked the wrong
 * same-surname (or similarly confused) player from the roster, e.g. Dennis English's scores
 * actually belonging to Denny English for the 2026-07-05 Cron round. Unlike Merge Players (a
 * permanent, whole-history identity merge), this only touches what happened in one specific
 * GameID and leaves both players' Player rows and all their other games untouched. A true swap
 * (not just a one-way move) via a temporary sentinel PlayerID, so it degrades correctly even
 * when only one side actually has data (the common case) or both sides have some.
 *
 * `playerBHandicap`, if given, is the real handicap the *correct* player should have played this
 * round at — the moved Score/Hdcp rows carry whatever handicap the wrong player was entered
 * under, which is often different. When provided: the Hdcp row for playerB in this game is set
 * to it, every one of playerB's Score rows gets NetScore recomputed against it (same formula
 * `game.tsx` uses when scores are first saved), and Skins are fully recalculated — SkinsScore is
 * a *separate* computation from NetScore (different stroke-allocation rules per Options), so it
 * has to be redone via `recalculateAllSkins`, not derived from the new NetScore.
 */
async function swapPlayersInGame(gameId, playerAId, playerBId, playerBHandicap) {
    if (playerAId === playerBId) {
        return { ok: false, error: 'Cannot swap a player with themselves.' };
    }
    const conn = await config_1.default.getConnection();
    try {
        await conn.beginTransaction();
        const SENTINEL_ID = -1; // never a real PlayerID (auto_increment starts at 1)
        for (const table of GAME_SWAP_TABLES) {
            await conn.query(`UPDATE ${table} SET PlayerID = ? WHERE GameID = ? AND PlayerID = ?`, [SENTINEL_ID, gameId, playerAId]);
            await conn.query(`UPDATE ${table} SET PlayerID = ? WHERE GameID = ? AND PlayerID = ?`, [playerAId, gameId, playerBId]);
            await conn.query(`UPDATE ${table} SET PlayerID = ? WHERE GameID = ? AND PlayerID = ?`, [playerBId, gameId, SENTINEL_ID]);
        }
        await conn.commit();
    }
    catch (error) {
        await conn.rollback();
        return { ok: false, error: error.message };
    }
    finally {
        conn.release();
    }
    // The swap just moved Score/Skins PlayerIDs around, which the cache has no way to know about
    // on its own (it wasn't a Score edit or Hdcp save, the paths that normally invalidate it).
    await (0, skinsService_1.invalidateSkinsCache)(gameId);
    if (playerBHandicap !== undefined && !Number.isNaN(playerBHandicap)) {
        await config_1.default.query(`INSERT INTO Hdcp (GameID, PlayerID, Hdcp, LastUpdateUser) VALUES (?, ?, ?, 'App')
       ON DUPLICATE KEY UPDATE Hdcp = VALUES(Hdcp)`, [gameId, playerBId, playerBHandicap]);
        const [holeRows] = await config_1.default.query(`SELECT s.HoleID, s.Score, cd.Par, cd.Hdcp
       FROM Score s
       INNER JOIN CourseDetails cd ON cd.CourseID = s.CourseID AND cd.HoleNum = s.HoleID
       WHERE s.GameID = ? AND s.PlayerID = ?`, [gameId, playerBId]);
        for (const row of holeRows) {
            const { net } = (0, gameService_1.calcNetAndSkins)(row.Score, playerBHandicap, row.Par, row.Hdcp);
            await config_1.default.query('UPDATE Score SET NetScore = ? WHERE GameID = ? AND PlayerID = ? AND HoleID = ?', [
                net,
                gameId,
                playerBId,
                row.HoleID,
            ]);
        }
        await (0, skinsService_1.recalculateAllSkins)(gameId);
    }
    return { ok: true };
}
