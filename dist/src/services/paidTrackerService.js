"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPaidTrackerList = getPaidTrackerList;
exports.getRefundNeededList = getRefundNeededList;
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
/**
 * Everyone marked Out for this tee date who still has a PaidTracker row -- i.e. paid, then
 * un-committed. Empty in the overwhelmingly common case (nobody paid-then-backed-out), which is
 * exactly why this doesn't reuse getPaidTrackerList's broader "everyone but Out" query -- that
 * one deliberately excludes Out entirely, the opposite of what this needs.
 */
async function getRefundNeededList(eventId, teeDate) {
    const [rows] = await config_1.default.query(`SELECT ps.PlayerID, CONCAT(p.LastName, ', ', p.FirstName) AS name
     FROM PlayerStatus ps
     INNER JOIN Player p ON p.PlayerID = ps.PlayerID
     INNER JOIN PaidTracker pt ON pt.GroupID = ps.GroupID AND pt.TeeDate = ps.TeeDate AND pt.PlayerID = ps.PlayerID
     WHERE ps.GroupID = ? AND ps.TeeDate = ? AND ps.Status = 'O'
     ORDER BY p.LastName, p.FirstName`, [eventId, teeDate]);
    return rows.map((r) => ({ playerId: r.PlayerID, name: r.name }));
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
