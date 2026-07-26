"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLatestGameId = getLatestGameId;
exports.getLeaderboard = getLeaderboard;
exports.getDefaultScorecardSide = getDefaultScorecardSide;
exports.getGameScorecard = getGameScorecard;
const config_1 = __importDefault(require("../db/config"));
/**
 * Get the most recent game ID for an event (mirrors showleaderboard.php query).
 */
async function getLatestGameId(eventId) {
    const [rows] = await config_1.default.query(`SELECT DISTINCT g.GameID, c.CourseName, g.GameDate
     FROM Game g
     INNER JOIN Score s ON s.GameID = g.GameID
     INNER JOIN Course c ON c.CourseID = g.CourseID
     WHERE g.GroupID = ?
     ORDER BY g.GameDate DESC
     LIMIT 1`, [eventId]);
    if (rows.length === 0)
        return null;
    const row = rows[0];
    return { gameId: row.GameID, courseName: row.CourseName, gameDate: row.GameDate };
}
async function getLeaderboard(gameId, scoreType) {
    const orderClause = scoreType === 'G'
        ? '(SUM(sc.Score) - SUM(cd.Par)) ASC'
        : '(SUM(sc.NetScore) - SUM(cd.Par)) ASC';
    const [rows] = await config_1.default.query(`SELECT CONCAT(p.LastName, ', ', p.FirstName) AS Name,
            MAX(sc.HoleID) AS Thru,
            CASE
              WHEN (SUM(${scoreType === 'G' ? 'sc.Score' : 'sc.NetScore'}) - SUM(cd.Par)) = 0 THEN 'Even'
              WHEN (SUM(${scoreType === 'G' ? 'sc.Score' : 'sc.NetScore'}) - SUM(cd.Par)) > 0 THEN CONCAT('+', (SUM(${scoreType === 'G' ? 'sc.Score' : 'sc.NetScore'}) - SUM(cd.Par)))
              WHEN (SUM(${scoreType === 'G' ? 'sc.Score' : 'sc.NetScore'}) - SUM(cd.Par)) < 0 THEN CONCAT('-', ABS(SUM(${scoreType === 'G' ? 'sc.Score' : 'sc.NetScore'}) - SUM(cd.Par)))
            END AS Standing
     FROM Score sc
     INNER JOIN CourseDetails cd ON cd.CourseID = sc.CourseID AND cd.HoleNum = sc.HoleID
     INNER JOIN Player p ON p.PlayerID = sc.PlayerID
     WHERE sc.GameID = ? AND sc.Score > 0
     GROUP BY sc.PlayerID
     ORDER BY ${orderClause}, p.LastName, p.FirstName`, [gameId]);
    return rows.map((r) => ({ name: r.Name, thru: r.Thru, score: r.Standing }));
}
/**
 * Which side (Front 9 / Back 9) the scorecard grid should default to opening on, based on
 * which side the majority of players in the game actually played. A player who scored any
 * hole 10-18 but no hole 1-9 counts as "back only"; everyone else (front-only or full 18)
 * counts toward front. Ties default to front.
 */
async function getDefaultScorecardSide(gameId) {
    const [rows] = await config_1.default.query(`SELECT PlayerID,
            MAX(CASE WHEN HoleID <= 9 THEN 1 ELSE 0 END) AS playedFront,
            MAX(CASE WHEN HoleID >= 10 THEN 1 ELSE 0 END) AS playedBack
     FROM Score
     WHERE GameID = ? AND Score > 0
     GROUP BY PlayerID`, [gameId]);
    if (rows.length === 0)
        return 'F';
    const backOnlyCount = rows.filter((r) => !r.playedFront && r.playedBack).length;
    return backOnlyCount > rows.length / 2 ? 'B' : 'F';
}
const SCORECARD_SCORE_COLUMN = {
    G: 'Score',
    N: 'NetScore',
    S: 'SkinsScore',
};
/**
 * Get every player's hole-by-hole scores for a game and side (mirrors showscorecard.php).
 * Unlike the PHP original, Out/In/Tot subtotals are actually computed and returned.
 */
async function getGameScorecard(gameId, side, scoreType) {
    const holeStart = side === 'B' ? 10 : 1;
    const holeEnd = side === 'F' ? 9 : 18;
    const scoreColumn = SCORECARD_SCORE_COLUMN[scoreType];
    const [rows] = await config_1.default.query(`SELECT sc.PlayerID, CONCAT(p.LastName, ', ', p.FirstName) AS name, sc.HoleID, sc.${scoreColumn} AS score
     FROM Score sc
     INNER JOIN Player p ON p.PlayerID = sc.PlayerID
     WHERE sc.GameID = ? AND sc.HoleID >= ? AND sc.HoleID <= ?
     ORDER BY sc.PlayerID, sc.HoleID`, [gameId, holeStart, holeEnd]);
    const byPlayer = new Map();
    for (const r of rows) {
        if (!byPlayer.has(r.PlayerID)) {
            byPlayer.set(r.PlayerID, { name: r.name, holes: {}, out: 0, in: 0, total: 0 });
        }
        const entry = byPlayer.get(r.PlayerID);
        // SkinsScore is a DECIMAL column — mysql2 returns decimals as strings, so coerce before summing.
        const score = Number(r.score);
        entry.holes[r.HoleID] = score;
        entry.total += score;
        if (r.HoleID <= 9)
            entry.out = (entry.out ?? 0) + score;
        else
            entry.in = (entry.in ?? 0) + score;
    }
    const result = Array.from(byPlayer.values()).map((row) => ({
        ...row,
        out: side === 'B' ? null : row.out,
        in: side === 'F' ? null : row.in,
    }));
    // Sort by the subtotal for the requested side: Out for front 9, In for back 9, Tot for full 18.
    const sortKey = side === 'F' ? 'out' : side === 'B' ? 'in' : 'total';
    result.sort((a, b) => (a[sortKey] ?? 0) - (b[sortKey] ?? 0));
    return result;
}
