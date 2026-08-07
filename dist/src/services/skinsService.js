"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getScoredHoles = getScoredHoles;
exports.findFollowUpHole = findFollowUpHole;
exports.getSkinsForHole = getSkinsForHole;
exports.invalidateSkinsCache = invalidateSkinsCache;
exports.recalculateAllSkins = recalculateAllSkins;
exports.getGameSkinsSummary = getGameSkinsSummary;
exports.getSkinsTotals = getSkinsTotals;
const config_1 = __importDefault(require("../db/config"));
const optionsService_1 = require("./optionsService");
const handicap_1 = require("../utils/handicap");
const gameService_1 = require("./gameService");
const money_1 = require("../utils/money");
/** Mirrors app/game.tsx's reading of the skins_* Options into the 3 modes computeHoleScoring
 * switches on — a single source of truth so a hole's skins score can be recomputed live from
 * gross + par + stroke index + handicap, without depending on whatever value a caller may (or,
 * as this fixed 2026-07-09, may NOT) have already precomputed and stored in Score.SkinsScore. */
function resolveSkinsModes(options) {
    const par3Mode = options?.skins_nonepar3 ? 'none' : options?.skins_halfpar3 ? 'half' : 'full';
    const par45Mode = options?.skins_maxone ? 'none' : options?.skins_halfall ? 'half' : 'full';
    return { par3Mode, par45Mode, maxOneStrokeSkins: !!options?.skins_maxonestroke };
}
/** Same reduction as app/game.tsx's computeHoleScoring's skins branch. */
function computeSkinsScoreValue(gross, par, holeHdcp, playerHdcp, modes) {
    const strokes = (0, handicap_1.getStrokes)(playerHdcp, holeHdcp);
    const skinsStrokes = modes.maxOneStrokeSkins ? Math.min(strokes, 1) : strokes;
    if (par === 3) {
        if (modes.par3Mode === 'none')
            return gross;
        if (modes.par3Mode === 'full')
            return gross - skinsStrokes;
        return gross - skinsStrokes * 0.5;
    }
    if (modes.par45Mode === 'none')
        return gross;
    if (modes.par45Mode === 'half')
        return gross - skinsStrokes * 0.5;
    return gross - skinsStrokes;
}
/** Every given player's handicap for a specific game, in one query — prefers the exact game's
 * recorded Hdcp (normal case, saved when Start Game submits the foursome), falling back to the
 * most recent handicap on or before the game's date, or the earliest on record, so this still
 * resolves sensibly for scores that were never entered through the normal Start Game ->
 * save-handicap flow (e.g. a fixture/import). Mirrors randomTeamsService.ts's
 * getRandomTeamsListing resolveHdcp fallback.
 *
 * Batched across every player at once rather than one query per player — with a full field
 * (40+ players) this was being called once per player per hole (e.g. 44 players x 18 holes =
 * 792 individual round trips just for this), which is what made `recalculateAllSkins` take over
 * a minute and time out mid-recompute during a large event (confirmed 2026-07-12). */
async function resolvePlayerHdcps(gameId, gameDate, playerIds) {
    const result = new Map();
    if (playerIds.length === 0)
        return result;
    const [rows] = await config_1.default.query('SELECT PlayerID, GameID, Hdcp, LastUpdateDt FROM Hdcp WHERE PlayerID IN (?) ORDER BY LastUpdateDt ASC', [playerIds]);
    const byPlayer = new Map();
    for (const r of rows) {
        if (!byPlayer.has(r.PlayerID))
            byPlayer.set(r.PlayerID, []);
        byPlayer.get(r.PlayerID).push(r);
    }
    for (const playerId of playerIds) {
        const playerRows = byPlayer.get(playerId) ?? [];
        if (playerRows.length === 0) {
            result.set(playerId, 0);
            continue;
        }
        const exact = playerRows.find((r) => r.GameID === gameId);
        if (exact) {
            result.set(playerId, exact.Hdcp);
            continue;
        }
        const priorOrSame = playerRows.filter((r) => r.LastUpdateDt <= gameDate);
        result.set(playerId, priorOrSame.length > 0 ? priorOrSame[priorOrSame.length - 1].Hdcp : playerRows[0].Hdcp);
    }
    return result;
}
/**
 * Get the hole numbers that actually have recorded scores for a game, ascending.
 * Used to skip holes that haven't been played yet (e.g. a back-9-only round).
 */
async function getScoredHoles(gameId) {
    const [rows] = await config_1.default.query('SELECT DISTINCT HoleID FROM Score WHERE GameID = ? ORDER BY HoleID', [gameId]);
    return rows.map((r) => r.HoleID);
}
/** Same rule `getValidationMode` applies, for a caller that already has the event's Options in
 * scope (avoids re-fetching Game + Options it already has, e.g. inside `getSkinsForHole`). */
function validationModeFromOptions(options) {
    if (options.skins_validation_score)
        return 'lowestNet';
    if (options.skins_validation_par)
        return 'par';
    return 'none';
}
/**
 * Get the event's Validate Skins By mode for a game, via its event's Options.
 */
async function getValidationMode(gameId) {
    const [rows] = await config_1.default.query('SELECT GroupID FROM Game WHERE GameID = ?', [gameId]);
    if (rows.length === 0)
        return 'par';
    const options = await (0, optionsService_1.getEventOptions)(rows[0].GroupID);
    return validationModeFromOptions(options);
}
/**
 * Find the next hole to check for skin validation, skipping to the other side's first
 * hole if this side hasn't been played (mirrors skins.php's wraparound logic so a
 * front-9-only or back-9-only round still validates against a hole that was played).
 * Exported for grossSkinsService.ts's follow-up validation, which uses the identical
 * wraparound rule against gross score/par instead of net.
 */
async function findFollowUpHole(gameId, holeId) {
    if (holeId === 18) {
        const [rows] = await config_1.default.query('SELECT COUNT(Score) AS cnt FROM Score WHERE GameID = ? AND HoleID = 1', [gameId]);
        return rows[0].cnt > 0 ? 1 : 10;
    }
    if (holeId === 9) {
        const [rows] = await config_1.default.query('SELECT COUNT(Score) AS cnt FROM Score WHERE GameID = ? AND HoleID = 10', [gameId]);
        return rows[0].cnt > 0 ? 10 : 1;
    }
    return holeId + 1;
}
/**
 * Get (and (re)validate) the net skins winner for a single hole — mirrors skins.php.
 * Recomputes from scratch each time it's viewed: clears this hole's previously stored
 * Skins row and re-derives it from the current scores, since scores may have changed
 * since the last time this hole was checked. Only ever touches this one hole's row —
 * with lots of people checking skins concurrently after a round, wiping anything more
 * than the single hole being viewed would blank out other holes/Summary for everyone
 * else mid-read.
 *
 * The per-player skins score (gross adjusted for par/stroke-index/handicap/skins options) is
 * recomputed live here from Score.Score, rather than trusting whatever Score.SkinsScore already
 * holds — fixed 2026-07-09 after a script-inserted test fixture left SkinsScore NULL on every
 * row (it bypassed app/game.tsx, the only place that used to compute it), which silently made
 * every hole look like "no skins found" instead of erroring. Also writes the freshly computed
 * value back into Score.SkinsScore for every player on this hole, so the Scorecard-by-Skins-type
 * view and the Leaderboard's own SkinsScore sum (both read that stored column directly) self-heal
 * too, regardless of how the underlying Score rows were written.
 *
 * `context`: when `recalculateAllSkins` already has the Game row and event Options in hand (the
 * same for every hole in the game), it passes them in here so each hole skips re-fetching them —
 * confirmed real savings on a 40+-player field where every hole was independently re-querying the
 * identical Game/Options rows. Omitted by every other caller (the single-hole live view), which
 * fetches them itself same as before.
 */
async function getSkinsForHole(gameId, holeId, context) {
    await config_1.default.query('DELETE FROM Skins WHERE GameID = ? AND HoleID = ?', [gameId, holeId]);
    let groupId;
    let courseId;
    let gameDate;
    let options;
    if (context) {
        ({ groupId, courseId, gameDate, options } = context);
    }
    else {
        const [gameRows] = await config_1.default.query('SELECT GroupID, CourseID, GameDate FROM Game WHERE GameID = ?', [gameId]);
        if (gameRows.length === 0)
            return { rows: [], validation: null };
        ({ GroupID: groupId, CourseID: courseId, GameDate: gameDate } = gameRows[0]);
        options = await (0, optionsService_1.getEventOptions)(groupId);
    }
    const [holeRows] = await config_1.default.query('SELECT Par, Hdcp FROM CourseDetails WHERE CourseID = ? AND HoleNum = ?', [courseId, holeId]);
    if (holeRows.length === 0)
        return { rows: [], validation: null };
    const { Par: par, Hdcp: holeHdcp } = holeRows[0];
    const modes = resolveSkinsModes(options);
    const [scoreRows] = await config_1.default.query(`SELECT p.PlayerID, CONCAT(p.LastName, ', ', p.FirstName) AS name, s.Score, s.NetScore
     FROM Score s
     INNER JOIN Player p ON p.PlayerID = s.PlayerID
     WHERE s.GameID = ? AND s.HoleID = ?
       AND s.PlayerID NOT IN (SELECT o.PlayerID FROM OptOut o WHERE o.GameID = ?)`, [gameId, holeId, gameId]);
    const playerIds = scoreRows.map((r) => r.PlayerID);
    const [playerHdcps, playerGenders, genderedHdcps] = await Promise.all([
        resolvePlayerHdcps(gameId, gameDate, playerIds),
        (0, gameService_1.getPlayerGenders)(playerIds),
        (0, gameService_1.getGenderedHoleHdcps)(courseId),
    ]);
    const computed = [];
    for (const r of scoreRows) {
        const playerHdcp = playerHdcps.get(r.PlayerID) ?? 0;
        const gender = playerGenders.get(r.PlayerID) ?? 'M';
        const playerHoleHdcp = (0, handicap_1.hdcpForPlayer)({ hdcp: holeHdcp, hdcpMale: genderedHdcps.male.get(holeId) ?? null, hdcpFemale: genderedHdcps.female.get(holeId) ?? null }, gender);
        const skinsScore = computeSkinsScoreValue(r.Score, par, playerHoleHdcp, playerHdcp, modes);
        computed.push({ PlayerID: r.PlayerID, name: r.name, Score: r.Score, NetScore: r.NetScore, skinsScore });
    }
    // One batched UPDATE for the whole hole instead of one round trip per player — same fix as
    // the handicap lookup above.
    if (computed.length > 0) {
        const caseClauses = computed.map(() => 'WHEN ? THEN ?').join(' ');
        const caseParams = computed.flatMap((c) => [c.PlayerID, c.skinsScore]);
        const playerIds = computed.map((c) => c.PlayerID);
        await config_1.default.query(`UPDATE Score SET SkinsScore = CASE PlayerID ${caseClauses} END
       WHERE GameID = ? AND HoleID = ? AND PlayerID IN (?)`, [...caseParams, gameId, holeId, playerIds]);
    }
    const minSkins = computed.length > 0 ? Math.min(...computed.map((c) => c.skinsScore)) : null;
    const rows = computed
        .filter((c) => c.skinsScore === minSkins)
        .sort((a, b) => a.name.localeCompare(b.name));
    const result = {
        rows: rows.map((r) => ({ name: r.name, gross: r.Score, skins: r.skinsScore })),
        validation: null,
    };
    // A skin only counts when exactly one player has the outright low score (no tie)
    if (rows.length === 1) {
        const winner = rows[0];
        const mode = validationModeFromOptions(options);
        if (mode === 'none') {
            // No follow-up check required — it's a skin outright.
            await config_1.default.query(`INSERT INTO Skins (GroupID, GameID, HoleID, PlayerID, Score, NetScore, Validated, LastUpdateUser)
         VALUES (?, ?, ?, ?, ?, ?, 'T', 'App')
         ON DUPLICATE KEY UPDATE
           PlayerID = VALUES(PlayerID),
           Score = VALUES(Score),
           NetScore = VALUES(NetScore),
           Validated = VALUES(Validated)`, [groupId, gameId, holeId, winner.PlayerID, winner.Score, winner.NetScore]);
            result.validation = { mode: 'none', validated: true };
        }
        else {
            const followUpHole = await findFollowUpHole(gameId, holeId);
            const [followUpRows] = await config_1.default.query(`SELECT s.Score, s.NetScore, cd.Par
         FROM Score s
         INNER JOIN CourseDetails cd ON cd.CourseID = s.CourseID AND cd.HoleNum = s.HoleID
         WHERE s.GameID = ? AND s.PlayerID = ? AND s.HoleID = ?`, [gameId, winner.PlayerID, followUpHole]);
            // If the follow-up hole hasn't been scored yet, leave the skin unvalidated for now
            if (followUpRows.length > 0) {
                const followUp = followUpRows[0];
                let validated;
                let lowestNet;
                let lowestNetHolder;
                if (mode === 'par') {
                    validated = followUp.NetScore <= followUp.Par;
                }
                else {
                    // 'lowestNet' — the winner must match the lowest net score anyone shot on the follow-up hole
                    const [lowRows] = await config_1.default.query(`SELECT CONCAT(p.LastName, ', ', p.FirstName) AS name, s.NetScore
             FROM Score s
             INNER JOIN Player p ON p.PlayerID = s.PlayerID
             WHERE s.GameID = ? AND s.HoleID = ?
               AND s.PlayerID NOT IN (SELECT o.PlayerID FROM OptOut o WHERE o.GameID = ?)
               AND s.NetScore = (
                 SELECT MIN(sc.NetScore) FROM Score sc
                 WHERE sc.GameID = ? AND sc.HoleID = ?
                   AND sc.PlayerID NOT IN (SELECT o.PlayerID FROM OptOut o WHERE o.GameID = ?)
               )`, [gameId, followUpHole, gameId, gameId, followUpHole, gameId]);
                    lowestNet = Number(lowRows[0]?.NetScore ?? followUp.NetScore);
                    validated = followUp.NetScore <= lowestNet;
                    if (!validated) {
                        lowestNetHolder = lowRows.length === 1 ? lowRows[0].name : 'Multiple players';
                    }
                }
                await config_1.default.query(`INSERT INTO Skins (GroupID, GameID, HoleID, PlayerID, Score, NetScore, Validated, LastUpdateUser)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'App')
           ON DUPLICATE KEY UPDATE
             PlayerID = VALUES(PlayerID),
             Score = VALUES(Score),
             NetScore = VALUES(NetScore),
             Validated = VALUES(Validated)`, [groupId, gameId, holeId, winner.PlayerID, winner.Score, winner.NetScore, validated ? 'T' : 'F']);
                result.validation = {
                    mode,
                    validated,
                    holeId: followUpHole,
                    par: followUp.Par,
                    score: followUp.Score,
                    netScore: followUp.NetScore,
                    lowestNet,
                    lowestNetHolder,
                };
            }
        }
    }
    return result;
}
/**
 * Mark a game's Skins as needing a full recompute the next time `recalculateAllSkins` runs —
 * call this from anywhere that changes data a skins calculation actually depends on: a score
 * entered/edited, a handicap saved, an opt-out/opt-in, a player swap or removal. Cheap (one
 * DELETE) and safe to call even when nothing was actually cached yet.
 */
async function invalidateSkinsCache(gameId) {
    await config_1.default.query('DELETE FROM SkinsCalcStatus WHERE GameID = ?', [gameId]);
}
/**
 * Recompute every scored hole's skins from scratch. Used to bring the Skins table fully up
 * to date in one pass — e.g. whenever the Summary view is opened — instead of relying on
 * whatever partial state it's been left in by however many individual holes different
 * viewers happened to page through during the round. Safe to run any time, including mid-round
 * (only whatever holes have scores so far get recomputed) and concurrently with other viewers
 * (each hole's recompute only ever touches that hole's own row).
 *
 * Skips the recompute entirely if nothing has invalidated the cache since the last time this
 * ran for this game (see `invalidateSkinsCache`) — a full 18-hole/40+-player recompute is
 * expensive even after the N+1 query fix (confirmed real 2026-07-12: went from 91s to ~9s for a
 * 44-player field), and most opens of Summary happen with nothing having changed since the last
 * one. `getSkinsForHole` itself (the single-hole live view during play) is unaffected — it
 * always computes fresh, since that has to be responsive as someone enters a score right now.
 *
 * When a recompute IS needed, every hole's `getSkinsForHole` runs concurrently (`Promise.all`)
 * rather than one at a time — each hole only ever touches its own `Skins`/`Score.SkinsScore`
 * rows (keyed by HoleID), so there's no cross-hole write ordering to preserve. The Game row and
 * event Options are also fetched once here and handed to every hole via `SkinsHoleContext`,
 * instead of each of the up-to-18 holes independently re-querying the identical rows (confirmed
 * real 2026-07-19: this was the other big chunk of the ~9s, on top of the sequential-await cost).
 */
async function recalculateAllSkins(gameId) {
    const [[status]] = await config_1.default.query('SELECT GameID FROM SkinsCalcStatus WHERE GameID = ?', [gameId]);
    if (status)
        return;
    const [gameRows] = await config_1.default.query('SELECT GroupID, CourseID, GameDate FROM Game WHERE GameID = ?', [gameId]);
    if (gameRows.length === 0)
        return;
    const { GroupID: groupId, CourseID: courseId, GameDate: gameDate } = gameRows[0];
    const options = await (0, optionsService_1.getEventOptions)(groupId);
    const context = { groupId, courseId, gameDate, options };
    // One bad hole (bad data, a transient DB hiccup, whatever) must not take down every other
    // hole's result with it -- Promise.all rejects the whole batch the instant any single promise
    // rejects, which left one hole's row deleted-but-never-reinserted (getSkinsForHole deletes its
    // hole's row before recomputing) while ALSO throwing before SkinsCalcStatus ever got marked,
    // so the next Summary open retried from scratch and hit the exact same failure every time --
    // confirmed real case 2026-07-26: hole 7 alone came back empty, live during a real event.
    // allSettled + a per-hole try/catch means a failing hole just logs and stays whatever it last
    // was, while every other hole (and SkinsCalcStatus) still completes normally.
    const holes = await getScoredHoles(gameId);
    const results = await Promise.allSettled(holes.map((holeId) => getSkinsForHole(gameId, holeId, context).catch((error) => {
        console.error(`Error recalculating skins for GameID ${gameId}, HoleID ${holeId}:`, error);
        throw error;
    })));
    const failedHoles = results
        .map((r, i) => (r.status === 'rejected' ? holes[i] : null))
        .filter((h) => h !== null);
    if (failedHoles.length > 0) {
        console.error(`Skins recalculation failed for GameID ${gameId}, holes: ${failedHoles.join(', ')}`);
    }
    await config_1.default.query('INSERT INTO SkinsCalcStatus (GameID, CalculatedAt) VALUES (?, NOW()) ON DUPLICATE KEY UPDATE CalculatedAt = NOW()', [gameId]);
}
/**
 * Every skin won so far in this game, one row per hole that has a winner, in hole order —
 * powers the live "Skins" button next to Swap Side during scoring, distinct from
 * `getSkinsTotals`'s post-round payout summary. Recalculates from scratch first so it always
 * reflects the current scores, same as opening the Summary view already does.
 */
async function getGameSkinsSummary(gameId) {
    await recalculateAllSkins(gameId);
    const [rows] = await config_1.default.query(`SELECT sk.HoleID, CONCAT(p.LastName, ', ', p.FirstName) AS name, sk.Score, sk.Validated
     FROM Skins sk
     INNER JOIN Player p ON p.PlayerID = sk.PlayerID
     WHERE sk.GameID = ?
     ORDER BY sk.HoleID`, [gameId]);
    return rows.map((r) => ({
        holeId: r.HoleID,
        name: r.name,
        score: r.Score,
        validated: r.Validated === 'T',
    }));
}
/**
 * Get the skins totals summary (skin count, which holes, and payout per player) for a game.
 * The pot is the event's Skins Pay In amount times the number of actual (non-opted-out)
 * players, split evenly across however many skins were validated — unvalidated skins are still
 * listed (in `holes`, flagged) so a player can see a near-miss, but never count toward `skins`
 * or `payout`.
 */
async function getSkinsTotals(gameId) {
    const [countRows] = await config_1.default.query(`SELECT COUNT(DISTINCT s.PlayerID) AS numPlayers,
            (SELECT COUNT(*) FROM Skins sk
             WHERE sk.GameID = ? AND sk.Validated = 'T'
               AND sk.PlayerID NOT IN (SELECT o.PlayerID FROM OptOut o WHERE o.GameID = ?)) AS numSkins
     FROM Score s
     WHERE s.GameID = ?
       AND s.PlayerID NOT IN (SELECT o.PlayerID FROM OptOut o WHERE o.GameID = ?)`, [gameId, gameId, gameId, gameId]);
    const [gameRows] = await config_1.default.query('SELECT GroupID FROM Game WHERE GameID = ?', [gameId]);
    const options = gameRows.length > 0 ? await (0, optionsService_1.getEventOptions)(gameRows[0].GroupID) : null;
    const payIn = options?.skins_payin ? Number(options.skins_payin) : 0;
    const validationMode = await getValidationMode(gameId);
    const numPlayers = countRows[0].numPlayers;
    const numSkins = countRows[0].numSkins;
    const perSkin = numSkins > 0 ? (numPlayers * payIn) / numSkins : 0;
    const [rows] = await config_1.default.query(`SELECT p.PlayerID, p.LastName, p.FirstName, sk.HoleID, sk.Validated
     FROM Skins sk
     INNER JOIN Player p ON p.PlayerID = sk.PlayerID
     WHERE sk.GameID = ?
       AND sk.PlayerID NOT IN (SELECT o.PlayerID FROM OptOut o WHERE o.GameID = ?)
     ORDER BY sk.HoleID, p.LastName, p.FirstName`, [gameId, gameId]);
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
        validationMode,
        // Truncated, not rounded -- never pay out more than the pot actually collected (a per-skin
        // rate rarely divides evenly; confirmed real 2026-08-05 this was the source of a payout
        // total showing a few cents more than was actually brought in).
        rows: Array.from(byPlayer.values()).map((row) => ({
            ...row,
            payout: perSkin > 0 ? (0, money_1.truncateMoneyValue)(row.skins * perSkin) : null,
        })),
    };
}
