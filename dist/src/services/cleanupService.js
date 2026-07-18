"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCleanupCandidates = getCleanupCandidates;
exports.deleteCleanupCandidates = deleteCleanupCandidates;
exports.ignoreCleanupCandidates = ignoreCleanupCandidates;
exports.getIgnoredCleanupItems = getIgnoredCleanupItems;
exports.unignoreCleanupItem = unignoreCleanupItem;
exports.getAllEventsCleanupCandidates = getAllEventsCleanupCandidates;
exports.getOptedOutPlayers = getOptedOutPlayers;
const config_1 = __importDefault(require("../db/config"));
/** A player's shape using a strict, clean-only match — same convention as Random Teams'
 * eligibility check (see randomTeamsService.ts's strictShape), used here to find whoever
 * doesn't match the shape most of the game finished with. */
function strictShape(c) {
    if (c.front === 9 && c.back === 9)
        return 'full18';
    if (c.front === 9 && c.back === 0)
        return 'front9';
    if (c.back === 9 && c.front === 0)
        return 'back9';
    return 'incomplete';
}
/**
 * Find likely test/abandoned games and data-quality issues for an event:
 *
 *  - Games played on a date that isn't a marked event day on the Calendar of Events (Admin ->
 *    Setup Calendar) — typically someone starting a test/practice game on an off day. Only
 *    checked for years the calendar has actually been set up for (current year and beyond,
 *    since past years never had a calendar built for them and a missing entry there means
 *    nothing).
 *  - Games with fewer than 5 non-opted-out players (the whole game is flagged — typically
 *    someone starting a test game they never really played).
 *  - Players who finished the shape most of the game played (full 18 / front-9 / back-9) but
 *    also have a few stray holes recorded on the *other* side — the common "started on the
 *    wrong side, realized it, and switched" case. Only the stray holes are flagged for
 *    deletion here; the player's actual complete round is left alone.
 *  - Players whose whole round was recorded on the opposite side from the majority (a genuine
 *    wrong-side round, not just stray leftovers).
 *  - Players who are genuinely short of the majority's hole count on the majority side (an
 *    incomplete/abandoned round).
 *
 * Only considers games before today — a game still being played right now can legitimately
 * have fewer than 5 players so far, or players who haven't finished yet, and shouldn't show
 * up as "abandoned."
 */
async function getCleanupCandidates(eventId) {
    const [games] = await config_1.default.query(`SELECT DISTINCT g.GameID, g.GameDate, DATE_FORMAT(g.GameDate, '%Y-%m-%d') AS GameDateISO, c.CourseName
     FROM Game g
     INNER JOIN Score s ON s.GameID = g.GameID
     INNER JOIN Course c ON c.CourseID = g.CourseID
     WHERE g.GroupID = ? AND g.GameDate < CURDATE()
     ORDER BY g.GameDate DESC`, [eventId]);
    const [calendarRows] = await config_1.default.query(`SELECT DATE_FORMAT(EventDate, '%Y-%m-%d') AS date, DayType FROM EventCalendar WHERE EventID = ?`, [eventId]);
    // Years the calendar has any entries at all for — a game in a year with no calendar setup
    // can't be judged against it (no data either way), so those years are skipped entirely.
    const calendarYears = new Set(calendarRows.map((r) => r.date.slice(0, 4)));
    // 'note' days are explicitly non-event days, so only 'event'/'major'/'upscup' count as valid.
    const validEventDates = new Set(calendarRows.filter((r) => r.DayType !== 'note').map((r) => r.date));
    const [ignoredRows] = await config_1.default.query('SELECT ItemKey FROM CleanupIgnored WHERE EventID = ?', [eventId]);
    const ignoredKeys = new Set(ignoredRows.map((r) => r.ItemKey));
    const candidates = [];
    for (const game of games) {
        const [holeRows] = await config_1.default.query(`SELECT s.PlayerID, CONCAT(p.LastName, ', ', p.FirstName) AS name, s.HoleID
       FROM Score s
       INNER JOIN Player p ON p.PlayerID = s.PlayerID
       WHERE s.GameID = ? AND s.Score > 0
         AND s.PlayerID NOT IN (SELECT o.PlayerID FROM OptOut o WHERE o.GameID = ?)
       ORDER BY s.PlayerID, s.HoleID`, [game.GameID, game.GameID]);
        const byPlayer = new Map();
        for (const r of holeRows) {
            if (!byPlayer.has(r.PlayerID)) {
                byPlayer.set(r.PlayerID, { playerId: r.PlayerID, name: r.name, front: 0, back: 0, holeIds: [] });
            }
            const entry = byPlayer.get(r.PlayerID);
            entry.holeIds.push(r.HoleID);
            if (r.HoleID <= 9)
                entry.front++;
            else
                entry.back++;
        }
        const counts = Array.from(byPlayer.values());
        if (counts.length === 0)
            continue;
        const gameYear = game.GameDateISO.slice(0, 4);
        if (calendarYears.has(gameYear) && !validEventDates.has(game.GameDateISO)) {
            candidates.push({
                key: `${game.GameID}`,
                scope: 'game',
                gameId: game.GameID,
                playerId: null,
                holeIds: null,
                gameDate: game.GameDate,
                courseName: game.CourseName,
                description: counts.map((c) => c.name).join('; '),
                reason: 'Not an event date',
            });
            continue;
        }
        if (counts.length < 5) {
            candidates.push({
                key: `${game.GameID}`,
                scope: 'game',
                gameId: game.GameID,
                playerId: null,
                holeIds: null,
                gameDate: game.GameDate,
                courseName: game.CourseName,
                description: counts.map((c) => c.name).join('; '),
                reason: `Too few players (${counts.length})`,
            });
            continue;
        }
        const shapeCounts = {};
        for (const c of counts) {
            const shape = strictShape(c);
            shapeCounts[shape] = (shapeCounts[shape] || 0) + 1;
        }
        const shapePriority = ['full18', 'front9', 'back9'];
        let majorityShape = null;
        let bestCount = 0;
        for (const shape of shapePriority) {
            const n = shapeCounts[shape] || 0;
            if (n > bestCount) {
                bestCount = n;
                majorityShape = shape;
            }
        }
        // Nobody has a clean shape at all yet (e.g. everyone's mid-round) — too ambiguous, skip.
        if (majorityShape === null)
            continue;
        for (const c of counts) {
            const shape = strictShape(c);
            if (shape === majorityShape)
                continue;
            const expected = majorityShape === 'full18' ? 18 : 9;
            const majoritySideCount = majorityShape === 'full18' ? c.front + c.back : majorityShape === 'front9' ? c.front : c.back;
            const minoritySideHoleIds = majorityShape === 'full18'
                ? [] // full18 majority has no "other side" — any mismatch here is a genuinely short round
                : majorityShape === 'front9'
                    ? c.holeIds.filter((h) => h > 9)
                    : c.holeIds.filter((h) => h <= 9);
            if (majoritySideCount >= expected && minoritySideHoleIds.length > 0) {
                // Finished the correct side completely, but also has stray holes left over on the
                // other side (e.g. started there by mistake, then switched) — only the stray holes
                // are the problem, not the player's actual complete round.
                candidates.push({
                    key: `${game.GameID}:${c.playerId}:holes`,
                    scope: 'holes',
                    gameId: game.GameID,
                    playerId: c.playerId,
                    holeIds: minoritySideHoleIds,
                    gameDate: game.GameDate,
                    courseName: game.CourseName,
                    description: c.name,
                    reason: `Stray hole${minoritySideHoleIds.length === 1 ? '' : 's'} on other side (${minoritySideHoleIds.length}) — round is otherwise complete`,
                });
            }
            else if (majoritySideCount === 0 && minoritySideHoleIds.length >= expected) {
                // A complete round, just entirely on the wrong side from what everyone else played.
                candidates.push({
                    key: `${game.GameID}:${c.playerId}`,
                    scope: 'player',
                    gameId: game.GameID,
                    playerId: c.playerId,
                    holeIds: null,
                    gameDate: game.GameDate,
                    courseName: game.CourseName,
                    description: c.name,
                    reason: `Wrong side entered (complete ${expected}-hole round on the other side)`,
                });
            }
            else {
                // Genuinely short of the majority's hole count — an incomplete/abandoned round.
                candidates.push({
                    key: `${game.GameID}:${c.playerId}`,
                    scope: 'player',
                    gameId: game.GameID,
                    playerId: c.playerId,
                    holeIds: null,
                    gameDate: game.GameDate,
                    courseName: game.CourseName,
                    description: c.name,
                    reason: `Incomplete round (${majoritySideCount}/${expected} holes)`,
                });
            }
        }
    }
    // Players registered to this event who've never recorded a score in any of its games —
    // could be a stale registration, or just someone new who hasn't played their first round yet.
    const [neverPlayedRows] = await config_1.default.query(`SELECT ep.PlayerID, CONCAT(p.LastName, ', ', p.FirstName) AS name, ep.LastUpdateDt
     FROM EventPlayers ep
     INNER JOIN Player p ON p.PlayerID = ep.PlayerID
     WHERE ep.EventID = ?
     AND ep.PlayerID NOT IN (
       SELECT DISTINCT s.PlayerID FROM Score s INNER JOIN Game g ON g.GameID = s.GameID WHERE g.GroupID = ?
     )
     ORDER BY p.LastName, p.FirstName`, [eventId, eventId]);
    for (const row of neverPlayedRows) {
        candidates.push({
            key: `neverplayed:${row.PlayerID}`,
            scope: 'neverplayed',
            gameId: null,
            playerId: row.PlayerID,
            holeIds: null,
            gameDate: row.LastUpdateDt,
            courseName: 'Registered',
            description: row.name,
            reason: 'Never recorded a score in any game for this event — may just be new, review before removing.',
        });
    }
    return candidates.filter((c) => !ignoredKeys.has(c.key));
}
/**
 * Delete the selected cleanup candidates. A whole-game item removes every player's Score/
 * Skins/OptOut/TeamGamePlayer rows for that GameID plus the Game row itself; a whole-player item
 * removes just that player's rows, leaving the game and everyone else untouched; a 'holes' item
 * removes only the specific stray HoleIDs for that player, leaving the rest of their round
 * intact; a 'neverplayed' item just removes that player's EventPlayers registration for this
 * event.
 */
async function deleteCleanupCandidates(eventId, items) {
    for (const item of items) {
        if (item.scope === 'game' && item.gameId !== null) {
            await config_1.default.query('DELETE FROM Score WHERE GameID = ?', [item.gameId]);
            await config_1.default.query('DELETE FROM Skins WHERE GameID = ?', [item.gameId]);
            await config_1.default.query('DELETE FROM OptOut WHERE GameID = ?', [item.gameId]);
            await config_1.default.query('DELETE FROM TeamGamePlayer WHERE TeamGameID IN (SELECT TeamGameID FROM TeamGame WHERE GameID = ?)', [item.gameId]);
            await config_1.default.query('DELETE FROM TeamGame WHERE GameID = ?', [item.gameId]);
            await config_1.default.query('DELETE FROM Game WHERE GameID = ?', [item.gameId]);
        }
        else if (item.scope === 'player' && item.gameId !== null && item.playerId !== null) {
            await config_1.default.query('DELETE FROM Score WHERE GameID = ? AND PlayerID = ?', [item.gameId, item.playerId]);
            await config_1.default.query('DELETE FROM Skins WHERE GameID = ? AND PlayerID = ?', [item.gameId, item.playerId]);
            await config_1.default.query('DELETE FROM OptOut WHERE GameID = ? AND PlayerID = ?', [item.gameId, item.playerId]);
            await config_1.default.query('DELETE FROM TeamGamePlayer WHERE PlayerID = ? AND TeamGameID IN (SELECT TeamGameID FROM TeamGame WHERE GameID = ?)', [item.playerId, item.gameId]);
        }
        else if (item.scope === 'holes' && item.gameId !== null && item.playerId !== null && item.holeIds && item.holeIds.length > 0) {
            await config_1.default.query('DELETE FROM Score WHERE GameID = ? AND PlayerID = ? AND HoleID IN (?)', [
                item.gameId,
                item.playerId,
                item.holeIds,
            ]);
            await config_1.default.query('DELETE FROM Skins WHERE GameID = ? AND PlayerID = ? AND HoleID IN (?)', [
                item.gameId,
                item.playerId,
                item.holeIds,
            ]);
        }
        else if (item.scope === 'neverplayed' && item.playerId !== null) {
            await config_1.default.query('DELETE FROM EventPlayers WHERE EventID = ? AND PlayerID = ?', [eventId, item.playerId]);
        }
    }
}
/**
 * Mark cleanup candidates as legit so they stop showing up on future scans, without deleting
 * any actual score data — the opposite of `deleteCleanupCandidates`. Reversible via
 * `unignoreCleanupItem`.
 */
async function ignoreCleanupCandidates(eventId, items) {
    for (const item of items) {
        await config_1.default.query(`INSERT INTO CleanupIgnored (EventID, ItemKey, Description, Reason, LastUpdateUser)
       VALUES (?, ?, ?, ?, 'app')
       ON DUPLICATE KEY UPDATE Description = VALUES(Description), Reason = VALUES(Reason), LastUpdateDt = CURRENT_TIMESTAMP`, [eventId, item.key, item.description, item.reason]);
    }
}
/** Everything currently marked as legit for this event, so an admin can review/undo it. */
async function getIgnoredCleanupItems(eventId) {
    const [rows] = await config_1.default.query('SELECT ItemKey, Description, Reason FROM CleanupIgnored WHERE EventID = ? ORDER BY LastUpdateDt DESC', [eventId]);
    return rows.map((r) => ({ key: r.ItemKey, description: r.Description, reason: r.Reason }));
}
/** Un-ignore a single item — it'll show back up as a cleanup candidate if it still applies. */
async function unignoreCleanupItem(eventId, key) {
    await config_1.default.query('DELETE FROM CleanupIgnored WHERE EventID = ? AND ItemKey = ?', [eventId, key]);
}
/**
 * Master Tools -> Cleanup Data's "All Events" view: runs `getCleanupCandidates` for every real
 * event and combines the results, tagging each candidate with which event it came from. Lets an
 * admin review every event's Test/Incomplete Scores (and never-played players) in one place
 * instead of picking through events one at a time.
 */
async function getAllEventsCleanupCandidates() {
    const [events] = await config_1.default.query('SELECT EventID, EventName FROM Events ORDER BY EventName');
    const all = [];
    for (const event of events) {
        const candidates = await getCleanupCandidates(event.EventID);
        for (const c of candidates) {
            // Namespaced by event — the same bare key (e.g. `neverplayed:180`) can otherwise collide
            // across two different events a player is registered to.
            all.push({ ...c, key: `${event.EventID}:${c.key}`, eventId: event.EventID, eventName: event.EventName });
        }
    }
    return all;
}
async function getOptedOutPlayers(eventId) {
    const [rows] = await config_1.default.query(
    // INNER JOIN Score (not just Game/Player) deliberately excludes Remove Player's OptOut rows
    // — those already had their Score deleted immediately, so there'd be nothing left to clean
    // up here. Only a Pot-checkbox opt-out (score deliberately kept) has anything to show.
    `SELECT DISTINCT o.GameID, o.PlayerID, g.GameDate, c.CourseName, CONCAT(p.LastName, ', ', p.FirstName) AS name
     FROM OptOut o
     INNER JOIN Game g ON g.GameID = o.GameID
     INNER JOIN Course c ON c.CourseID = g.CourseID
     INNER JOIN Player p ON p.PlayerID = o.PlayerID
     INNER JOIN Score s ON s.GameID = o.GameID AND s.PlayerID = o.PlayerID
     WHERE g.GroupID = ?
     ORDER BY g.GameDate DESC, p.LastName, p.FirstName`, [eventId]);
    return rows.map((r) => ({
        key: `${r.GameID}:${r.PlayerID}`,
        gameId: r.GameID,
        playerId: r.PlayerID,
        gameDate: r.GameDate,
        courseName: r.CourseName,
        description: r.name,
    }));
}
