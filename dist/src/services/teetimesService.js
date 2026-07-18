"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.addTeeTime = addTeeTime;
const config_1 = __importDefault(require("../db/config"));
/**
 * Replace the tee times for an event/date — mirrors addtimes.php: deletes any existing
 * row for this GroupID+TeeDate, then inserts the submitted one.
 */
async function addTeeTime(eventId, input) {
    await config_1.default.query('DELETE FROM TeeTimes WHERE GroupID = ? AND TeeDate = ?', [eventId, input.teeDate]);
    await config_1.default.query(`INSERT INTO TeeTimes (GroupID, TeeDate, Time1, Time2, Time3, Time4, Time5, LastUpdateUser)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'App')`, [
        eventId,
        input.teeDate,
        input.time1 || null,
        input.time2 || null,
        input.time3 || null,
        input.time4 || null,
        input.time5 || null,
    ]);
}
