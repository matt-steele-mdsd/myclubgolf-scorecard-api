"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.addPlayer = addPlayer;
exports.getUnlinkedPlayers = getUnlinkedPlayers;
exports.linkPlayers = linkPlayers;
exports.assignGuestPlayer = assignGuestPlayer;
exports.getPlayerListForEvent = getPlayerListForEvent;
exports.renamePlayer = renamePlayer;
const config_1 = __importDefault(require("../db/config"));
/**
 * Add (or re-link) a player to an event — mirrors addplayer.php's insert_player().
 * Player rows are keyed by (Course, FirstName, LastName) — not globally unique by name alone,
 * since different clubs (courses) will have unrelated real people who happen to share a name
 * (see [[data_model_gotchas]]). A new player defaults to their event's course (`Events.EventCourse`);
 * re-submitting an existing name at the same course just refreshes their Email/Phone and
 * re-links them via EventPlayers.
 */
async function addPlayer(eventId, input) {
    const firstName = input.firstName.trim();
    const lastName = input.lastName.trim();
    const [eventRows] = await config_1.default.query('SELECT EventCourse FROM Events WHERE EventID = ?', [eventId]);
    const course = eventRows[0]?.EventCourse || '';
    await config_1.default.query(`INSERT INTO Player (GroupID, FirstName, LastName, Course, Nickname, Email, Phone, LastUpdateUser)
     VALUES (?, ?, ?, ?, '', ?, ?, 'App')
     ON DUPLICATE KEY UPDATE Email = VALUES(Email), Phone = VALUES(Phone)`, [eventId, firstName, lastName, course, input.email, input.phone]);
    const [rows] = await config_1.default.query('SELECT PlayerID FROM Player WHERE Course = ? AND FirstName = ? AND LastName = ?', [course, firstName, lastName]);
    const playerId = rows[0]?.PlayerID;
    if (!playerId)
        return;
    await config_1.default.query(`INSERT INTO EventPlayers (EventID, PlayerID, LastUpdateUser)
     VALUES (?, ?, 'App')
     ON DUPLICATE KEY UPDATE LastUpdateUser = 'App'`, [eventId, playerId]);
}
/**
 * Players not yet linked to this event — mirrors linkplayers.php, which also excludes
 * anyone already linked to EventID 6 or 7 (hardcoded in the original query). Unlike the
 * original, rows with no name at all are filtered out — there's nothing for an admin to
 * identify or link there.
 */
async function getUnlinkedPlayers(eventId) {
    const [rows] = await config_1.default.query(`SELECT PlayerID, FirstName, LastName, Phone
     FROM Player
     WHERE PlayerID NOT IN (SELECT PlayerID FROM EventPlayers WHERE EventID IN (?, 6, 7))
     AND (TRIM(COALESCE(FirstName, '')) != '' OR TRIM(COALESCE(LastName, '')) != '')
     ORDER BY LastName, FirstName`, [eventId]);
    return rows.map((r) => ({
        id: r.PlayerID,
        firstName: r.FirstName || '',
        lastName: r.LastName || '',
        phone: r.Phone || '',
    }));
}
/**
 * Link a batch of existing players to an event — mirrors savelinked.php's insert loop.
 */
async function linkPlayers(eventId, playerIds) {
    if (playerIds.length === 0)
        return;
    const rowPlaceholders = playerIds.map(() => `(?, ?, 'App')`).join(', ');
    const params = playerIds.flatMap((playerId) => [eventId, playerId]);
    await config_1.default.query(`INSERT INTO EventPlayers (EventID, PlayerID, LastUpdateUser)
     VALUES ${rowPlaceholders}
     ON DUPLICATE KEY UPDATE LastUpdateUser = VALUES(LastUpdateUser)`, params);
}
/**
 * Assign a guest player for a round — the fix for the app's biggest source of junk Player rows.
 * Previously, including a walk-on guest in the pot meant inventing a name for a real Player row
 * (blank names, "Guest2", "Brady-Burghardt-Banner", etc.) since there was no dedicated guest
 * concept. This reuses an existing "Guest N" player at this course who isn't already playing in
 * today's game for this event/course (or already picked for one of the other slots in the same
 * foursome being set up right now, via `excludePlayerIds`), only minting a new "Guest N+1" once
 * every existing one is taken. Since a new day's Game is a fresh GameID (see `getOrCreateGame`),
 * the same "Guest 1" Player row is safe to reuse indefinitely across different rounds — nothing
 * in this app treats a guest as a tracked individual across games the way it does real players.
 */
async function assignGuestPlayer(eventId, courseId, excludePlayerIds) {
    const [courseRows] = await config_1.default.query('SELECT CourseName FROM Course WHERE CourseID = ?', [courseId]);
    const course = courseRows[0]?.CourseName || '';
    // Today's game for this event/course, if one already exists — read-only lookup mirroring
    // getOrCreateGame's own, since a guest can be picked before the Game row itself exists.
    const [gameRows] = await config_1.default.query('SELECT GameID FROM Game WHERE GroupID = ? AND CourseID = ? AND GameDate = CURRENT_DATE()', [eventId, courseId]);
    const gameId = gameRows[0]?.GameID;
    let usedTodayIds = [];
    if (gameId) {
        const [usedRows] = await config_1.default.query(`SELECT PlayerID FROM Score WHERE GameID = ?
       UNION
       SELECT PlayerID FROM TeamGamePlayer WHERE TeamGameID IN (SELECT TeamGameID FROM TeamGame WHERE GameID = ?)`, [gameId, gameId]);
        usedTodayIds = usedRows.map((r) => r.PlayerID);
    }
    const unavailable = new Set([...usedTodayIds, ...excludePlayerIds]);
    const [existingGuests] = await config_1.default.query(`SELECT PlayerID, FirstName FROM Player WHERE Course = ? AND IsGuest = 1
     ORDER BY CAST(SUBSTRING(FirstName, 7) AS UNSIGNED)`, [course]);
    const linkToEvent = (playerId) => config_1.default.query(`INSERT INTO EventPlayers (EventID, PlayerID, LastUpdateUser) VALUES (?, ?, 'App')
       ON DUPLICATE KEY UPDATE LastUpdateUser = 'App'`, [eventId, playerId]);
    for (const guest of existingGuests) {
        if (!unavailable.has(guest.PlayerID)) {
            await linkToEvent(guest.PlayerID);
            return { id: guest.PlayerID, displayName: guest.FirstName };
        }
    }
    // Every existing guest slot at this course is taken today — mint a new one.
    const numbers = existingGuests
        .map((g) => parseInt(String(g.FirstName).replace('Guest ', ''), 10))
        .filter((n) => !isNaN(n));
    const nextNumber = numbers.length > 0 ? Math.max(...numbers) + 1 : 1;
    const firstName = `Guest ${nextNumber}`;
    await config_1.default.query(`INSERT INTO Player (GroupID, FirstName, LastName, Course, Nickname, IsGuest, LastUpdateUser)
     VALUES (?, ?, '', ?, '', 1, 'App')`, [eventId, firstName, course]);
    const [newRows] = await config_1.default.query('SELECT PlayerID FROM Player WHERE Course = ? AND FirstName = ? AND LastName = ?', [course, firstName, '']);
    const playerId = newRows[0].PlayerID;
    await linkToEvent(playerId);
    return { id: playerId, displayName: firstName };
}
/**
 * Players linked to this event, with contact info — mirrors playerlist.php.
 */
async function getPlayerListForEvent(eventId) {
    const [rows] = await config_1.default.query(`SELECT PlayerID, LastName, FirstName, Phone, Email
     FROM Player
     WHERE PlayerID IN (SELECT PlayerID FROM EventPlayers WHERE EventID = ?)
     ORDER BY LastName, FirstName`, [eventId]);
    return rows.map((r) => ({
        id: r.PlayerID,
        firstName: r.FirstName || '',
        lastName: r.LastName || '',
        phone: r.Phone || '',
        email: r.Email || '',
    }));
}
/**
 * Rename a player in place (same PlayerID, so every Score/EventPlayers/history row stays
 * linked exactly as before — only the name changes). `(Course, FirstName, LastName)` share a
 * single table-wide unique index (`ix_player`), so the new name is checked for a collision
 * against every player at the *same course*, not just this event's roster — a name that's free
 * within this event could still collide with an unrelated player elsewhere on the same course
 * and the database would reject the update outright. A same-named player at a *different*
 * course is a different real person and never blocks the rename.
 */
async function renamePlayer(playerId, firstName, lastName) {
    const trimmedFirst = firstName.trim();
    const trimmedLast = lastName.trim();
    if (!trimmedFirst || !trimmedLast) {
        return { ok: false, error: 'First and last name are required.' };
    }
    const [dupRows] = await config_1.default.query(`SELECT p2.PlayerID FROM Player p1
     INNER JOIN Player p2 ON p2.Course = p1.Course
     WHERE p1.PlayerID = ? AND p2.PlayerID != ? AND LOWER(p2.FirstName) = LOWER(?) AND LOWER(p2.LastName) = LOWER(?)`, [playerId, playerId, trimmedFirst, trimmedLast]);
    if (dupRows.length > 0) {
        return { ok: false, error: `A player named ${trimmedFirst} ${trimmedLast} already exists at this course.` };
    }
    await config_1.default.query('UPDATE Player SET FirstName = ?, LastName = ?, LastUpdateUser = ? WHERE PlayerID = ?', [trimmedFirst, trimmedLast, 'app', playerId]);
    return { ok: true };
}
