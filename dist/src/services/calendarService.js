"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCalendarForYear = getCalendarForYear;
exports.setCalendarDay = setCalendarDay;
exports.deleteCalendarDay = deleteCalendarDay;
exports.getQualifyingDates = getQualifyingDates;
const config_1 = __importDefault(require("../db/config"));
async function getCalendarForYear(eventId, year) {
    const [rows] = await config_1.default.query(`SELECT DATE_FORMAT(EventDate, '%Y-%m-%d') AS date, DayType, Note
     FROM EventCalendar
     WHERE EventID = ? AND YEAR(EventDate) = ?
     ORDER BY EventDate`, [eventId, year]);
    return rows.map((r) => ({ date: r.date, dayType: r.DayType, note: r.Note || '' }));
}
/** Set (or replace) a single day's entry. */
async function setCalendarDay(eventId, date, dayType, note) {
    await config_1.default.query(`INSERT INTO EventCalendar (EventID, EventDate, DayType, Note, LastUpdateUser)
     VALUES (?, ?, ?, ?, 'app')
     ON DUPLICATE KEY UPDATE
       DayType = VALUES(DayType), Note = VALUES(Note), LastUpdateDt = CURRENT_TIMESTAMP`, [eventId, date, dayType, note]);
}
/** Remove a day's entry entirely (back to unmarked). */
async function deleteCalendarDay(eventId, date) {
    await config_1.default.query('DELETE FROM EventCalendar WHERE EventID = ? AND EventDate = ?', [eventId, date]);
}
/**
 * The dates that count as "official" qualifying events for a year — shared by every feature
 * that scopes itself to real event dates (UPS Cup, Birdie Race). If this event/year actually
 * has a calendar set up, that's just its 'event'/'major' days ('upscup' and 'note' days don't
 * count). If no calendar has been set up for this event/year at all, nothing should be excluded
 * yet, so every date this event actually played a game that year counts instead.
 */
async function getQualifyingDates(eventId, year) {
    const [calRows] = await config_1.default.query(`SELECT DATE_FORMAT(EventDate, '%Y-%m-%d') AS date, DayType
     FROM EventCalendar
     WHERE EventID = ? AND YEAR(EventDate) = ?
     ORDER BY EventDate ASC`, [eventId, year]);
    if (calRows.length === 0) {
        const [gameRows] = await config_1.default.query(`SELECT DATE_FORMAT(GameDate, '%Y-%m-%d') AS date
       FROM Game
       WHERE GroupID = ? AND YEAR(GameDate) = ?
       ORDER BY GameDate ASC`, [eventId, year]);
        return gameRows.map((r) => r.date);
    }
    return calRows.filter((r) => r.DayType === 'event' || r.DayType === 'major').map((r) => r.date);
}
