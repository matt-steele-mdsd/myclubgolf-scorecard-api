"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAllEventsWithCounts = getAllEventsWithCounts;
exports.deleteEvent = deleteEvent;
const config_1 = __importDefault(require("../db/config"));
/**
 * Every event with a quick count of how much real data it holds — lets an organizer spot
 * junk/test events at a glance before deleting them via `deleteEvent`. Includes hidden/master
 * events, same "full visibility" convention as `searchAllEventsForMaster` in `eventService.ts`.
 */
async function getAllEventsWithCounts() {
    const [rows] = await config_1.default.query(`SELECT e.EventID AS id, e.EventName AS eventName, e.EventCourse AS courseName,
       (SELECT COUNT(*) FROM EventPlayers ep WHERE ep.EventID = e.EventID) AS linkedPlayers,
       (SELECT COUNT(*) FROM Score s INNER JOIN Game g ON g.GameID = s.GameID WHERE g.GroupID = e.EventID) AS scoreCount,
       EXISTS(
         SELECT 1 FROM EventOptions eo
         WHERE eo.EventID = e.EventID AND eo.OptionName = 'hidden_from_search' AND eo.OptionValue = 'T'
       ) AS isMasterEvent
     FROM Events e
     ORDER BY e.EventName`);
    return rows.map((r) => ({
        id: r.id,
        eventName: r.eventName,
        courseName: r.courseName,
        linkedPlayers: Number(r.linkedPlayers),
        scoreCount: Number(r.scoreCount),
        isMasterEvent: r.isMasterEvent === 1,
    }));
}
/**
 * Permanently delete an event and every row of data it owns across the schema — mirrors the
 * transactional style of `mergePlayers`/`swapPlayersInGame` in `playerMergeService.ts` (the only
 * other genuinely destructive multi-table operations in this codebase), since a crash mid-delete
 * must not leave an event half-deleted. Deliberately excludes `Player` (players are a global
 * identity shared across events — only their `EventPlayers` link to this event is removed) and
 * `Course`/`CourseDetails` (shared across events, never owned by just one).
 */
async function deleteEvent(eventId) {
    const conn = await config_1.default.getConnection();
    try {
        await conn.beginTransaction();
        const [gameRows] = await conn.query('SELECT GameID FROM Game WHERE GroupID = ?', [eventId]);
        const gameIds = gameRows.map((r) => r.GameID);
        if (gameIds.length > 0) {
            await conn.query('DELETE FROM TeamGamePlayer WHERE TeamGameID IN (SELECT TeamGameID FROM TeamGame WHERE GameID IN (?))', [gameIds]);
            await conn.query('DELETE FROM TeamGame WHERE GameID IN (?)', [gameIds]);
            await conn.query('DELETE FROM Score WHERE GameID IN (?)', [gameIds]);
            await conn.query('DELETE FROM Skins WHERE GameID IN (?)', [gameIds]);
            await conn.query('DELETE FROM OptOut WHERE GameID IN (?)', [gameIds]);
            await conn.query('DELETE FROM Hdcp WHERE GameID IN (?)', [gameIds]);
            await conn.query('DELETE FROM PlayingGroup WHERE GameID IN (?)', [gameIds]);
            await conn.query('DELETE FROM Game WHERE GroupID = ?', [eventId]);
        }
        await conn.query('DELETE FROM GSkins WHERE GroupID = ?', [eventId]);
        await conn.query('DELETE FROM TeeTimes WHERE GroupID = ?', [eventId]);
        await conn.query('DELETE FROM PaidTracker WHERE GroupID = ?', [eventId]);
        await conn.query('DELETE FROM PlayerStatus WHERE GroupID = ?', [eventId]);
        await conn.query('DELETE FROM EventCalendar WHERE EventID = ?', [eventId]);
        await conn.query('DELETE FROM EventOptions WHERE EventID = ?', [eventId]);
        await conn.query('DELETE FROM EventPlayers WHERE EventID = ?', [eventId]);
        await conn.query('DELETE FROM CleanupIgnored WHERE EventID = ?', [eventId]);
        await conn.query('DELETE FROM UpsCupWinner WHERE EventID = ?', [eventId]);
        await conn.query('DELETE FROM UpsCupPaid WHERE EventID = ?', [eventId]);
        await conn.query('DELETE FROM InGrossBirdie WHERE EventID = ?', [eventId]);
        await conn.query('DELETE FROM InNetBirdie WHERE EventID = ?', [eventId]);
        await conn.query('DELETE FROM InUPSCup WHERE EventID = ?', [eventId]);
        await conn.query('DELETE FROM Events WHERE EventID = ?', [eventId]);
        await conn.commit();
    }
    catch (error) {
        await conn.rollback();
        throw error;
    }
    finally {
        conn.release();
    }
}
