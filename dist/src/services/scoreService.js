"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.savePlayerScores = savePlayerScores;
exports.deletePlayerHoleScores = deletePlayerHoleScores;
exports.getPlayerScores = getPlayerScores;
exports.getPlayerScorecard = getPlayerScorecard;
const config_1 = __importDefault(require("../db/config"));
const skinsService_1 = require("./skinsService");
/**
 * Save multiple scores for a single player across all holes in an event.
 * Expects `scores` to be an array of pre-calculated entries from the frontend:
 *   [{ gameId, playerId, holeNumber, grossScore, netScore, skinsScore }, ...]
 */
async function savePlayerScores(gameId, playerId, scores) {
    try {
        if (scores.length === 0)
            return true;
        const rowPlaceholders = scores.map(() => `(?, ?, ?, ?, ?, ?, ?, ?, 'game.tsx', NOW())`).join(', ');
        const sql = `
      INSERT INTO Score (GameID, PlayerID, CourseID, TeeID, HoleID, Score, NetScore, SkinsScore, LastUpdateUser, LastUpdateDt)
      VALUES ${rowPlaceholders}
      ON DUPLICATE KEY UPDATE
        Score = VALUES(Score),
        NetScore = VALUES(NetScore),
        SkinsScore = VALUES(SkinsScore),
        LastUpdateUser = VALUES(LastUpdateUser),
        LastUpdateDt = VALUES(LastUpdateDt)
    `;
        // Flatten all score entries for this player into params matching the placeholders above
        const params = [];
        for (const entry of scores) {
            params.push(entry.gameId, entry.playerId, entry.courseId, 0, entry.holeNumber, entry.grossScore, entry.netScore, entry.skinsScore);
        }
        await config_1.default.query(sql, params);
        await (0, skinsService_1.invalidateSkinsCache)(gameId);
        return true;
    }
    catch (error) {
        console.error('Error saving player scores:', error.message, error.sqlState, error.code);
        return false;
    }
}
/**
 * Delete a player's saved scores (and any skins) for specific holes in a game — used by the
 * "swap sides" action once a hole's score has been moved to its mirrored hole, to remove the
 * old entry rather than leaving it behind as stray data.
 */
async function deletePlayerHoleScores(gameId, playerId, holeNumbers) {
    try {
        if (holeNumbers.length === 0)
            return true;
        await config_1.default.query('DELETE FROM Score WHERE GameID = ? AND PlayerID = ? AND HoleID IN (?)', [gameId, playerId, holeNumbers]);
        await config_1.default.query('DELETE FROM Skins WHERE GameID = ? AND PlayerID = ? AND HoleID IN (?)', [gameId, playerId, holeNumbers]);
        await (0, skinsService_1.invalidateSkinsCache)(gameId);
        return true;
    }
    catch (error) {
        console.error('Error deleting player hole scores:', error.message);
        return false;
    }
}
/**
 * Get all saved scores for a player within a game, keyed by hole number
 */
async function getPlayerScores(gameId, playerId) {
    try {
        const sql = `
      SELECT HoleID, Score
      FROM Score
      WHERE GameID = ? AND PlayerID = ?
    `;
        const [rows] = await config_1.default.query(sql, [gameId, playerId]);
        // Convert to record format: { 1: 4, 2: 3, ... }
        const scores = {};
        for (const row of rows) {
            scores[row.HoleID] = row.Score;
        }
        return scores;
    }
    catch (error) {
        console.error('Error getting player scores:', error.message);
        return {};
    }
}
/**
 * One player's hole-by-hole gross AND net scores for a side of a game -- mirrors
 * teamService.ts's getTeamScorecard (same side-filtered query shape, same F/B/T modal this
 * powers), but for a single player and both score types instead of one team's net-only roster.
 */
async function getPlayerScorecard(gameId, playerId, side) {
    const holeStart = side === 'B' ? 10 : 1;
    const holeEnd = side === 'F' ? 9 : 18;
    const [rows] = await config_1.default.query(`SELECT HoleID, Score, NetScore FROM Score
     WHERE GameID = ? AND PlayerID = ? AND HoleID >= ? AND HoleID <= ?
     ORDER BY HoleID`, [gameId, playerId, holeStart, holeEnd]);
    let totalGross = 0;
    let totalNet = 0;
    const holes = rows.map((r) => {
        const gross = r.Score;
        const net = Number(r.NetScore);
        totalGross += gross;
        totalNet += net;
        return { hole: r.HoleID, gross, net };
    });
    return { holes, totalGross, totalNet };
}
