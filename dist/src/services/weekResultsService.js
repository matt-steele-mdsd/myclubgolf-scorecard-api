"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getWeekResults = getWeekResults;
const config_1 = __importDefault(require("../db/config"));
/**
 * Get individual gross/net totals for every player in a game, excluding anyone
 * who opted out of that game. Mirrors indivscores.php.
 */
async function getWeekResults(gameId, scoreType) {
    const orderColumn = scoreType === 'G' ? 'score' : 'net';
    const [rows] = await config_1.default.query(`SELECT s.PlayerID AS playerId,
            CONCAT(p.LastName, ', ', p.FirstName) AS name,
            SUM(s.Score) AS score,
            SUM(s.NetScore) AS net
     FROM Score s
     INNER JOIN Player p ON p.PlayerID = s.PlayerID
     WHERE s.GameID = ?
       AND s.PlayerID NOT IN (
         SELECT o.PlayerID FROM OptOut o WHERE o.GameID = ?
       )
     GROUP BY s.PlayerID
     ORDER BY ${orderColumn} ASC, p.LastName, p.FirstName`, [gameId, gameId]);
    return rows.map((r) => ({ playerId: r.playerId, name: r.name, score: r.score, net: r.net }));
}
