"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.upsertPlayingGroup = upsertPlayingGroup;
exports.getPlayingGroup = getPlayingGroup;
const config_1 = __importDefault(require("../db/config"));
/**
 * Always-on "who played together today" tracker — completely separate from TeamGame/TeamGamePlayer
 * scoring. Every Start Game submission (regardless of whether the event has opted into any team
 * game) records the foursome here so that if the app crashes or gets closed mid-round, Start Game
 * can recognize a returning player and offer to instantly restore their whole group instead of
 * re-searching everyone from scratch. Never surfaced as a "team," never scored, never shown in
 * any Teams-tab or team-game screen.
 */
async function upsertPlayingGroup(gameId, playerIds) {
    if (playerIds.length < 2)
        return;
    const [maxRows] = await config_1.default.query('SELECT IFNULL(MAX(GroupNumber), 0) AS maxGroup FROM PlayingGroup WHERE GameID = ?', [gameId]);
    const nextGroupNumber = maxRows[0].maxGroup + 1;
    const rowPlaceholders = playerIds.map(() => `(?, ?, ?, 'App')`).join(', ');
    const params = playerIds.flatMap((playerId) => [gameId, nextGroupNumber, playerId]);
    await config_1.default.query(`INSERT INTO PlayingGroup (GameID, GroupNumber, PlayerID, LastUpdateUser) VALUES ${rowPlaceholders}
     ON DUPLICATE KEY UPDATE GroupNumber = VALUES(GroupNumber), LastUpdateUser = VALUES(LastUpdateUser)`, params);
}
/**
 * Get the other players recorded as part of this player's current group for today's round, if
 * any — powers Start Game's "resume this group?" prompt. Returns an empty array if this player
 * hasn't been grouped with anyone today.
 */
async function getPlayingGroup(gameId, playerId) {
    const [rows] = await config_1.default.query(`SELECT PlayerID FROM PlayingGroup
     WHERE GameID = ? AND PlayerID != ? AND GroupNumber = (
       SELECT GroupNumber FROM PlayingGroup WHERE GameID = ? AND PlayerID = ?
     )`, [gameId, playerId, gameId, playerId]);
    return rows.map((r) => r.PlayerID);
}
