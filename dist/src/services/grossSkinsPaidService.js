"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getGrossSkinsPaidList = getGrossSkinsPaidList;
exports.setGrossSkinsPaid = setGrossSkinsPaid;
exports.hasAnyGrossSkinsPaid = hasAnyGrossSkinsPaid;
exports.hasAnyGrossSkinsPaidForGame = hasAnyGrossSkinsPaidForGame;
exports.getGrossSkinsTrackerDates = getGrossSkinsTrackerDates;
const config_1 = __importDefault(require("../db/config"));
/**
 * Everyone registered for a tee date (PlayerStatus 'I'/'E'/'L'/'X' — anything but 'O' Out),
 * with whether they've paid for Gross Skins that date yet — same roster source as the regular
 * Paid Tracker, just a different paid column (GSkinsPaid, not PaidTracker).
 */
async function getGrossSkinsPaidList(eventId, teeDate) {
    const [rows] = await config_1.default.query(`SELECT ps.PlayerID, CONCAT(p.LastName, ', ', p.FirstName) AS name, ps.Status,
            gp.PlayerID IS NOT NULL AS paid
     FROM PlayerStatus ps
     INNER JOIN Player p ON p.PlayerID = ps.PlayerID
     LEFT JOIN GSkinsPaid gp ON gp.GroupID = ps.GroupID AND gp.TeeDate = ps.TeeDate AND gp.PlayerID = ps.PlayerID
     WHERE ps.GroupID = ? AND ps.TeeDate = ? AND ps.Status != 'O'
     ORDER BY p.LastName, p.FirstName`, [eventId, teeDate]);
    return rows.map((r) => ({ playerId: r.PlayerID, name: r.name, status: r.Status, paid: !!r.paid }));
}
/** Mark a player paid (or unpaid) for Gross Skins on a specific event/tee date. */
async function setGrossSkinsPaid(eventId, teeDate, playerId, paid) {
    if (paid) {
        await config_1.default.query(`INSERT INTO GSkinsPaid (GroupID, TeeDate, PlayerID, LastUpdateUser) VALUES (?, ?, ?, 'app')
       ON DUPLICATE KEY UPDATE LastUpdateUser = VALUES(LastUpdateUser), LastUpdateDt = CURRENT_TIMESTAMP`, [eventId, teeDate, playerId]);
    }
    else {
        await config_1.default.query('DELETE FROM GSkinsPaid WHERE GroupID = ? AND TeeDate = ? AND PlayerID = ?', [eventId, teeDate, playerId]);
    }
}
/** Whether at least one player is marked paid for Gross Skins on this tee date — Week Results
 * uses this to decide whether the Gross Skins section should show at all for a given week. */
async function hasAnyGrossSkinsPaid(eventId, teeDate) {
    const [rows] = await config_1.default.query('SELECT 1 FROM GSkinsPaid WHERE GroupID = ? AND TeeDate = ? LIMIT 1', [eventId, teeDate]);
    return rows.length > 0;
}
/** Same check as `hasAnyGrossSkinsPaid`, but keyed off a GameID (what Week Results actually has
 * on hand) instead of requiring the caller to already know the event's GroupID/TeeDate. */
async function hasAnyGrossSkinsPaidForGame(gameId) {
    const [rows] = await config_1.default.query(`SELECT 1 FROM GSkinsPaid gp
     INNER JOIN Game g ON g.GroupID = gp.GroupID AND g.GameDate = gp.TeeDate
     WHERE g.GameID = ? LIMIT 1`, [gameId]);
    return rows.length > 0;
}
/**
 * Date list for Admin -> Gross Skins Tracker. Unlike Paid Tracker's `/teetimes` (deliberately
 * future-only -- paying money is forward-looking), Gross Skins Tracker needs to reach back to
 * recent past weeks too: confirmed with Matt 2026-08-04 -- an admin retroactively setting up gross
 * skins for a game that's already been played (they know who was in from memory) is a real,
 * expected use, not an edge case. Spans the last month through the future, sourced from TeeTimes
 * (the same admin-entered date list Paid Tracker uses, just without the future-only filter) since
 * that's what PlayerStatus rosters are actually keyed against.
 */
async function getGrossSkinsTrackerDates(eventId) {
    const [rows] = await config_1.default.query(`SELECT DISTINCT DATE_FORMAT(TeeDate, '%Y-%m-%d') AS teeDate FROM TeeTimes
     WHERE GroupID = ? AND TeeDate >= DATE_SUB(CURDATE(), INTERVAL 1 MONTH)
     ORDER BY TeeDate`, [eventId]);
    const dates = rows.map((r) => r.teeDate);
    const [calRows] = await config_1.default.query(`SELECT DATE_FORMAT(EventDate, '%Y-%m-%d') AS date FROM EventCalendar
     WHERE EventID = ? AND EventDate >= CURDATE() AND DayType IN ('event', 'major')
     ORDER BY EventDate LIMIT 1`, [eventId]);
    const nextCalendarDate = calRows.length > 0 ? calRows[0].date : null;
    // The picker needs something selectable to actually show the default on -- if the next
    // calendar date hasn't had tee times added for it yet, include it in the list anyway.
    if (nextCalendarDate && !dates.includes(nextCalendarDate)) {
        dates.push(nextCalendarDate);
        dates.sort();
    }
    const defaultDate = nextCalendarDate ?? (dates.length > 0 ? dates[dates.length - 1] : null);
    return { dates, defaultDate };
}
