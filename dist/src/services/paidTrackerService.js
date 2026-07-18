"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPaidTrackerList = getPaidTrackerList;
exports.setPaidTracker = setPaidTracker;
const config_1 = __importDefault(require("../db/config"));
/**
 * Everyone registered for a tee date (PlayerStatus 'I'/'E'/'L'/'X' — anything but 'O' Out)
 * for Admin -> Paid Tracker, with whether they've paid for that date yet.
 */
async function getPaidTrackerList(eventId, teeDate) {
    const [rows] = await config_1.default.query(`SELECT ps.PlayerID, CONCAT(p.LastName, ', ', p.FirstName) AS name, ps.Status,
            pt.PlayerID IS NOT NULL AS paid
     FROM PlayerStatus ps
     INNER JOIN Player p ON p.PlayerID = ps.PlayerID
     LEFT JOIN PaidTracker pt ON pt.GroupID = ps.GroupID AND pt.TeeDate = ps.TeeDate AND pt.PlayerID = ps.PlayerID
     WHERE ps.GroupID = ? AND ps.TeeDate = ? AND ps.Status != 'O'
     ORDER BY p.LastName, p.FirstName`, [eventId, teeDate]);
    return rows.map((r) => ({ playerId: r.PlayerID, name: r.name, status: r.Status, paid: !!r.paid }));
}
/** Mark a player paid (or unpaid) for a specific event/tee date. */
async function setPaidTracker(eventId, teeDate, playerId, paid) {
    if (paid) {
        await config_1.default.query(`INSERT INTO PaidTracker (GroupID, TeeDate, PlayerID, LastUpdateUser) VALUES (?, ?, ?, 'app')
       ON DUPLICATE KEY UPDATE LastUpdateUser = VALUES(LastUpdateUser), LastUpdateDt = CURRENT_TIMESTAMP`, [eventId, teeDate, playerId]);
    }
    else {
        await config_1.default.query('DELETE FROM PaidTracker WHERE GroupID = ? AND TeeDate = ? AND PlayerID = ?', [eventId, teeDate, playerId]);
    }
}
