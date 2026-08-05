"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getGrossSkinsForHole = getGrossSkinsForHole;
exports.recalculateAllGrossSkins = recalculateAllGrossSkins;
exports.getGrossSkinsTotals = getGrossSkinsTotals;
const config_1 = __importDefault(require("../db/config"));
const optionsService_1 = require("./optionsService");
const skinsService_1 = require("./skinsService");
const money_1 = require("../utils/money");
/**
 * Get (and (re)validate) the gross skins winner for a single hole — mirrors skinsService.ts's
 * getSkinsForHole. Recomputes from scratch each time: clears this hole's previously stored
 * GrossSkinsResult row and re-derives it from the current scores.
 */
async function getGrossSkinsForHole(gameId, holeId) {
    await config_1.default.query('DELETE FROM GrossSkinsResult WHERE GameID = ? AND HoleID = ?', [gameId, holeId]);
    const [gameRows] = await config_1.default.query('SELECT GroupID, GameDate FROM Game WHERE GameID = ?', [gameId]);
    if (gameRows.length === 0)
        return { rows: [], validation: null };
    const { GroupID: groupId, GameDate: gameDate } = gameRows[0];
    const [scoreRows] = await config_1.default.query(`SELECT p.PlayerID, CONCAT(p.LastName, ', ', p.FirstName) AS name, s.Score
     FROM Score s
     INNER JOIN Player p ON p.PlayerID = s.PlayerID
     INNER JOIN GSkinsPaid gp ON gp.GroupID = ? AND gp.TeeDate = ? AND gp.PlayerID = s.PlayerID
     WHERE s.GameID = ? AND s.HoleID = ?`, [groupId, gameDate, gameId, holeId]);
    const minGross = scoreRows.length > 0 ? Math.min(...scoreRows.map((r) => r.Score)) : null;
    const rows = scoreRows
        .filter((r) => r.Score === minGross)
        .sort((a, b) => a.name.localeCompare(b.name));
    const result = {
        rows: rows.map((r) => ({ name: r.name, gross: r.Score })),
        validation: null,
    };
    // A skin only counts when exactly one paid player has the outright low score (no tie)
    if (rows.length === 1) {
        const winner = rows[0];
        const followUpHole = await (0, skinsService_1.findFollowUpHole)(gameId, holeId);
        const [followUpRows] = await config_1.default.query(`SELECT s.Score, cd.Par
       FROM Score s
       INNER JOIN CourseDetails cd ON cd.CourseID = s.CourseID AND cd.HoleNum = s.HoleID
       WHERE s.GameID = ? AND s.PlayerID = ? AND s.HoleID = ?`, [gameId, winner.PlayerID, followUpHole]);
        // If the follow-up hole hasn't been scored yet, leave the skin unvalidated for now
        if (followUpRows.length > 0) {
            const followUp = followUpRows[0];
            const validated = followUp.Score <= followUp.Par;
            await config_1.default.query(`INSERT INTO GrossSkinsResult (GroupID, GameID, HoleID, PlayerID, Score, Validated, LastUpdateUser)
         VALUES (?, ?, ?, ?, ?, ?, 'App')
         ON DUPLICATE KEY UPDATE
           PlayerID = VALUES(PlayerID),
           Score = VALUES(Score),
           Validated = VALUES(Validated)`, [groupId, gameId, holeId, winner.PlayerID, winner.Score, validated ? 'T' : 'F']);
            result.validation = { validated, holeId: followUpHole, par: followUp.Par, score: followUp.Score };
        }
    }
    return result;
}
/**
 * Recompute every scored hole's gross skins from scratch — used whenever the Gross Skins
 * Summary view is opened, same as skinsService.ts's recalculateAllSkins but without a cache-skip
 * check (Gross Skins' paid-only field is small enough a fresh recompute every time is cheap).
 * One bad hole doesn't take down the rest, same reasoning as recalculateAllSkins.
 */
async function recalculateAllGrossSkins(gameId, scoredHoles) {
    const results = await Promise.allSettled(scoredHoles.map((holeId) => getGrossSkinsForHole(gameId, holeId).catch((error) => {
        console.error(`Error recalculating gross skins for GameID ${gameId}, HoleID ${holeId}:`, error);
        throw error;
    })));
    const failedHoles = results
        .map((r, i) => (r.status === 'rejected' ? scoredHoles[i] : null))
        .filter((h) => h !== null);
    if (failedHoles.length > 0) {
        console.error(`Gross skins recalculation failed for GameID ${gameId}, holes: ${failedHoles.join(', ')}`);
    }
}
/**
 * Get the gross skins totals summary (skin count, which holes, and payout per player) for a
 * game — mirrors skinsService.ts's getSkinsTotals. The pot is Gross Skins' own pay-in amount
 * times however many players are marked paid for it that tee date (not the whole field), split
 * evenly across however many gross skins were validated.
 */
async function getGrossSkinsTotals(gameId) {
    const [gameRows] = await config_1.default.query('SELECT GroupID, GameDate FROM Game WHERE GameID = ?', [gameId]);
    if (gameRows.length === 0)
        return { perSkin: 0, rows: [] };
    const { GroupID: groupId, GameDate: gameDate } = gameRows[0];
    const [countRows] = await config_1.default.query(`SELECT (SELECT COUNT(*) FROM GSkinsPaid WHERE GroupID = ? AND TeeDate = ?) AS numPaid,
            (SELECT COUNT(*) FROM GrossSkinsResult WHERE GameID = ? AND Validated = 'T') AS numSkins`, [groupId, gameDate, gameId]);
    const options = await (0, optionsService_1.getEventOptions)(groupId);
    const payIn = options?.gross_skins_payin ? Number(options.gross_skins_payin) : 0;
    const numPaid = countRows[0].numPaid;
    const numSkins = countRows[0].numSkins;
    const perSkin = numSkins > 0 ? (numPaid * payIn) / numSkins : 0;
    const [rows] = await config_1.default.query(`SELECT p.PlayerID, p.LastName, p.FirstName, gs.HoleID, gs.Validated
     FROM GrossSkinsResult gs
     INNER JOIN Player p ON p.PlayerID = gs.PlayerID
     WHERE gs.GameID = ?
     ORDER BY gs.HoleID, p.LastName, p.FirstName`, [gameId]);
    const byPlayer = new Map();
    for (const r of rows) {
        const name = `${r.LastName}, ${r.FirstName}`;
        if (!byPlayer.has(name)) {
            byPlayer.set(name, { name, skins: 0, holes: [], payout: null });
        }
        const row = byPlayer.get(name);
        const validated = r.Validated === 'T';
        row.holes.push({ holeId: r.HoleID, validated });
        if (validated)
            row.skins += 1;
    }
    return {
        perSkin,
        // Truncated, not rounded -- never pay out more than the pot actually collected.
        rows: Array.from(byPlayer.values()).map((row) => ({
            ...row,
            payout: perSkin > 0 ? (0, money_1.truncateMoneyValue)(row.skins * perSkin) : null,
        })),
    };
}
