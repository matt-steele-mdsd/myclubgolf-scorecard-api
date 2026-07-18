"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getActivePlayersForGame = getActivePlayersForGame;
exports.removePlayers = removePlayers;
const config_1 = __importDefault(require("../db/config"));
const skinsService_1 = require("./skinsService");
/**
 * Get every player who has scores in a game, so a partial removal (e.g. an OptOut row inserted
 * without deleting Score, such as the legacy PHP admin page's removeplayers.php does) can be
 * finished from here. `optedOut` flags anyone already in OptOut for this game — via the Pot
 * checkbox or a prior partial removal — so the UI can surface who still needs cleaning up.
 */
async function getActivePlayersForGame(gameId) {
    const [rows] = await config_1.default.query(`SELECT DISTINCT p.PlayerID, p.LastName, p.FirstName,
            (o.PlayerID IS NOT NULL) AS OptedOut
     FROM Player p
     INNER JOIN Score s ON s.PlayerID = p.PlayerID AND s.GameID = ?
     LEFT JOIN OptOut o ON o.PlayerID = p.PlayerID AND o.GameID = ?
     ORDER BY p.LastName, p.FirstName`, [gameId, gameId]);
    return rows.map((r) => ({ id: r.PlayerID, lastName: r.LastName, firstName: r.FirstName, optedOut: !!r.OptedOut }));
}
/**
 * Remove one or more players from a game entirely — mirrors removeplayers.php. For someone who
 * quit mid-round, distinct from the Pot checkbox's `updatePotOptOut` (gameService.ts), which
 * keeps a player's score on purpose when they just opt out of the money games. Their score for
 * this game is deleted immediately — nothing worth keeping remains once someone's fully removed
 * (confirmed with the user 2026-07-06). Both mechanisms happen to share the `OptOut` table, but
 * are otherwise unrelated — don't let the shared table name blur the two together.
 */
async function removePlayers(gameId, playerIds) {
    if (playerIds.length === 0)
        return;
    for (const playerId of playerIds) {
        await config_1.default.query('DELETE FROM Score WHERE GameID = ? AND PlayerID = ?', [gameId, playerId]);
        await config_1.default.query('DELETE FROM Skins WHERE GameID = ? AND PlayerID = ?', [gameId, playerId]);
        await config_1.default.query('DELETE FROM TeamGamePlayer WHERE PlayerID = ? AND TeamGameID IN (SELECT TeamGameID FROM TeamGame WHERE GameID = ?)', [playerId, gameId]);
    }
    const rowPlaceholders = playerIds.map(() => `(?, ?, 'App')`).join(', ');
    const params = playerIds.flatMap((playerId) => [gameId, playerId]);
    await config_1.default.query(`INSERT IGNORE INTO OptOut (GameID, PlayerID, LastUpdateUser) VALUES ${rowPlaceholders}`, params);
    await (0, skinsService_1.invalidateSkinsCache)(gameId);
}
