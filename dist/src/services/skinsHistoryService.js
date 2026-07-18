"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPlayerSkinsStats = getPlayerSkinsStats;
exports.getPlayerRecentSkins = getPlayerRecentSkins;
const config_1 = __importDefault(require("../db/config"));
/**
 * Get a player's all-time validated/unvalidated skins counts, across every game the
 * Skins table has ever been computed for.
 */
async function getPlayerSkinsStats(playerId) {
    const [rows] = await config_1.default.query(`SELECT
       SUM(CASE WHEN Validated = 'T' THEN 1 ELSE 0 END) AS totalValidated,
       SUM(CASE WHEN Validated = 'F' THEN 1 ELSE 0 END) AS totalUnvalidated
     FROM Skins
     WHERE PlayerID = ?`, [playerId]);
    return {
        totalValidated: Number(rows[0]?.totalValidated) || 0,
        totalUnvalidated: Number(rows[0]?.totalUnvalidated) || 0,
    };
}
/**
 * Get a player's 20 most recent skins, newest first.
 */
async function getPlayerRecentSkins(playerId) {
    const [rows] = await config_1.default.query(`SELECT sk.GameID AS gameId, g.GameDate AS gameDate, sk.HoleID AS holeId, sk.Validated AS validated
     FROM Skins sk
     INNER JOIN Game g ON g.GameID = sk.GameID
     WHERE sk.PlayerID = ?
     ORDER BY g.GameDate DESC, sk.HoleID DESC
     LIMIT 20`, [playerId]);
    return rows.map((r) => ({
        gameId: r.gameId,
        gameDate: r.gameDate,
        holeId: r.holeId,
        validated: r.validated === 'T',
    }));
}
