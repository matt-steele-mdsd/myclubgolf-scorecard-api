"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOrCreateGame = getOrCreateGame;
exports.getOrCreateGameForDate = getOrCreateGameForDate;
exports.updateGameCourse = updateGameCourse;
exports.updatePotOptOut = updatePotOptOut;
exports.calcNetAndSkins = calcNetAndSkins;
exports.getPlayerScores = getPlayerScores;
exports.getCourseDetails = getCourseDetails;
exports.initializeGame = initializeGame;
const config_1 = __importDefault(require("../db/config"));
const skinsService_1 = require("./skinsService");
/**
 * Find existing game for today or create a new one.
 */
async function getOrCreateGame(eventId, courseId) {
    const [existing] = await config_1.default.query(`SELECT GameID FROM Game WHERE GroupID = ? AND CourseID = ? AND GameDate = CURRENT_DATE()`, [eventId, courseId]);
    if (existing.length > 0) {
        return existing[0].GameID;
    }
    await config_1.default.query(`INSERT INTO Game (GroupID, CourseID, GameDate, LastUpdateUser) VALUES (?, ?, CURRENT_DATE(), 'app')`, [eventId, courseId]);
    const [result] = await config_1.default.query('SELECT LAST_INSERT_ID() AS GameID');
    return result[0].GameID;
}
/**
 * Find or create the Game for a specific date (not just today) — used by Team Games' calendar
 * picker so an admin can set up team games for a future scheduled date in advance (confirmed
 * with the user, 2026-07-09: "you could set up games for the entire year if you want"). Only
 * ever called lazily, the moment an admin actually takes an action (Skip/Set Up/Randomize/
 * one-off) on a future date — merely viewing a future date's preview doesn't create anything.
 * Defaults to the most recently played game's course for this event (Events.EventCourse is free
 * text, not a course reference — see [[data_model_gotchas]]), unless `courseId` is passed
 * explicitly (an admin overriding it for a week that's moved to a different course).
 */
async function getOrCreateGameForDate(eventId, date, courseId) {
    const [existing] = await config_1.default.query(`SELECT GameID FROM Game WHERE GroupID = ? AND GameDate = ?`, [eventId, date]);
    if (existing.length > 0)
        return existing[0].GameID;
    let resolvedCourseId = courseId;
    if (!resolvedCourseId) {
        const [courseRows] = await config_1.default.query(`SELECT CourseID FROM Game WHERE GroupID = ? ORDER BY GameDate DESC LIMIT 1`, [eventId]);
        if (courseRows.length === 0)
            throw new Error('No prior game for this event — cannot determine which course to use');
        resolvedCourseId = courseRows[0].CourseID;
    }
    await config_1.default.query(`INSERT INTO Game (GroupID, CourseID, GameDate, LastUpdateUser) VALUES (?, ?, ?, 'app')`, [eventId, resolvedCourseId, date]);
    const [result] = await config_1.default.query('SELECT LAST_INSERT_ID() AS GameID');
    return result[0].GameID;
}
/** Change which course an already-created Game is played at — e.g. an event shifting a
 * particular week to a different course than usual. */
async function updateGameCourse(gameId, courseId) {
    await config_1.default.query('UPDATE Game SET CourseID = ?, LastUpdateUser = ? WHERE GameID = ?', [courseId, 'app', gameId]);
}
/**
 * Handle pot opt-in/opt-out for a player.
 */
async function updatePotOptOut(gameId, playerId, inPot) {
    if (!inPot) {
        // Opt out — they still want their score tracked, just excluded from Teams/Skins/Net/Birdie
        // Race/UPS Cup for this game (the existing OptOut-exclusion filters in those services handle
        // that). Score is deliberately NOT deleted here — confirmed with the user 2026-07-06 this is
        // different from Remove Player (a quit mid-round, which does delete everything immediately,
        // see removePlayerService.ts's removePlayers): an opt-out score is kept the night of, and
        // only ever cleared later at an admin's discretion via Cleanup Data's "Opted-Out / Removed
        // Players" section.
        await config_1.default.query(`INSERT IGNORE INTO OptOut (GameID, PlayerID, LastUpdateUser) VALUES (?, ?, 'app')`, [gameId, playerId]);
    }
    else {
        // Opt in — remove from OptOut if present
        await config_1.default.query(`DELETE FROM OptOut WHERE GameID = ? AND PlayerID = ?`, [gameId, playerId]);
    }
    await (0, skinsService_1.invalidateSkinsCache)(gameId);
}
function calcNetAndSkins(score, playerHdcp, holePar, holeHdcp) {
    let net = score;
    let skins = score;
    if (playerHdcp >= holeHdcp) {
        if (holePar == 3) {
            skins = score - 0.5;
        }
        else {
            net--;
            skins = net;
        }
    }
    else if (playerHdcp < 0 && holeHdcp >= 19 + playerHdcp) {
        // Plus handicapper (negative playerHdcp): gives a stroke back on their easiest hole(s) —
        // highest hole handicap/stroke-index, the opposite end from where strokes are received
        // above. Always a full stroke on both net and skins, no par-3 exception.
        net++;
        skins = net;
    }
    if ((playerHdcp - 18) >= holeHdcp)
        net--;
    if ((playerHdcp - 36) >= holeHdcp)
        net--;
    return { net, skins };
}
async function getPlayerScores(gameId, courseId, playerId, playerHdcp) {
    const [rows] = await config_1.default.query(`SELECT sc.HoleID, sc.Score, cd.Par, cd.Hdcp
     FROM Score sc
     INNER JOIN CourseDetails cd ON cd.CourseID = sc.CourseID AND cd.HoleNum = sc.HoleID
     WHERE sc.GameID = ? AND sc.CourseID = ? AND sc.PlayerID = ?
     ORDER BY sc.HoleID`, [gameId, courseId, playerId]);
    return rows.map((row) => {
        const score = row.Score ?? null;
        const calc = score !== null ? calcNetAndSkins(score, playerHdcp, row.Par, row.Hdcp) : null;
        return {
            hole: row.HoleID,
            gross: score?.toString() ?? null,
            par: row.Par,
            hdcp: row.Hdcp,
            net: calc ? String(calc.net) : null,
            skins: calc ? String(calc.skins) : null,
        };
    });
}
async function getCourseDetails(courseId) {
    const [rows] = await config_1.default.query(`SELECT HoleNum, Par, Hdcp FROM CourseDetails WHERE CourseID = ? ORDER BY HoleNum`, [courseId]);
    return rows.map((r) => ({ holeNum: r.HoleNum, par: r.Par, hdcp: r.Hdcp }));
}
async function initializeGame(params) {
    const gameId = await getOrCreateGame(params.eventId, params.courseId);
    // Handle pot opt-in/opt-out for each player
    for (const p of params.players) {
        if (p.id) {
            await updatePotOptOut(gameId, parseInt(p.id), p.pot);
        }
    }
    const courseDetails = await getCourseDetails(params.courseId);
    // Determine starting hole
    let startingHole = 1;
    if (params.side === '9b')
        startingHole = 10;
    // Load scores for each player
    const players = [];
    for (const p of params.players) {
        if (!p.id)
            continue;
        const scores = await getPlayerScores(gameId, params.courseId, parseInt(p.id), p.hdcp);
        players.push({ ...p, scores });
    }
    return { gameId, startingHole, courseDetails, players };
}
