"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBirdieLeaderboard = getBirdieLeaderboard;
exports.getPlayerBirdieStatus = getPlayerBirdieStatus;
exports.getHoleBirdieDetail = getHoleBirdieDetail;
const config_1 = __importDefault(require("../db/config"));
const calendarService_1 = require("./calendarService");
/**
 * Shared data pass for all three Birdie Race screens: walks this event's real qualifying dates
 * (see `getQualifyingDates`) in chronological order and records, per player per hole, the first
 * time they ever recorded a net birdie or better (NetScore <= Par - 1, regardless of the hole's
 * par value — an eagle or albatross still counts as having birdied it) on it.
 */
async function collectBirdieData(eventId, year) {
    const qualifyingDates = await (0, calendarService_1.getQualifyingDates)(eventId, year);
    const parByHole = new Map();
    const playerNames = new Map();
    const perPlayerHole = new Map();
    const perPlayerHoleLowestGross = new Map();
    const playedPlayers = new Set();
    for (const date of qualifyingDates) {
        const [games] = await config_1.default.query('SELECT GameID, CourseID FROM Game WHERE GroupID = ? AND GameDate = ?', [eventId, date]);
        if (games.length === 0)
            continue;
        const { GameID: gameId, CourseID: courseId } = games[0];
        const [holeRows] = await config_1.default.query('SELECT HoleNum, Par FROM CourseDetails WHERE CourseID = ?', [courseId]);
        for (const h of holeRows) {
            if (!parByHole.has(h.HoleNum))
                parByHole.set(h.HoleNum, h.Par);
        }
        const [scoreRows] = await config_1.default.query(`SELECT s.PlayerID, s.HoleID, s.Score, s.NetScore, CONCAT(p.LastName, ', ', p.FirstName) AS name
       FROM Score s
       INNER JOIN Player p ON p.PlayerID = s.PlayerID
       WHERE s.GameID = ? AND s.PlayerID NOT IN (SELECT o.PlayerID FROM OptOut o WHERE o.GameID = ?)`, [gameId, gameId]);
        for (const r of scoreRows) {
            playedPlayers.add(r.PlayerID);
            if (!playerNames.has(r.PlayerID))
                playerNames.set(r.PlayerID, r.name);
            if (!perPlayerHoleLowestGross.has(r.PlayerID))
                perPlayerHoleLowestGross.set(r.PlayerID, new Map());
            const lowestGrossMap = perPlayerHoleLowestGross.get(r.PlayerID);
            const currentLowest = lowestGrossMap.get(r.HoleID);
            if (currentLowest === undefined || r.Score < currentLowest) {
                lowestGrossMap.set(r.HoleID, r.Score);
            }
            const par = parByHole.get(r.HoleID);
            if (par === undefined || r.NetScore > par - 1)
                continue;
            if (!perPlayerHole.has(r.PlayerID))
                perPlayerHole.set(r.PlayerID, new Map());
            const holesMap = perPlayerHole.get(r.PlayerID);
            if (!holesMap.has(r.HoleID)) {
                holesMap.set(r.HoleID, { net: r.NetScore, gross: r.Score, date });
            }
        }
    }
    return { parByHole, playerNames, perPlayerHole, perPlayerHoleLowestGross, playedPlayers };
}
/**
 * Birdie Race Leaderboard: ranks players by how many distinct holes they've net-birdied this
 * year (out of 18) — the winner of the Birdie Race is whoever is first to reach all 18. Once
 * someone (or several players tied on the same day) gets there, they're pinned at the top as
 * the winner(s); everyone else keeps being tracked normally below, sorted by holes birdied.
 * Front 9/Back 9 are broken out separately too, since some leagues mainly play one side.
 */
async function getBirdieLeaderboard(eventId, year) {
    const { playerNames, perPlayerHole, playedPlayers } = await collectBirdieData(eventId, year);
    const rows = [];
    for (const playerId of playedPlayers) {
        const holesMap = perPlayerHole.get(playerId);
        const holesBirdied = holesMap?.size ?? 0;
        const holeNumbers = holesMap ? [...holesMap.keys()] : [];
        const front9Birdied = holeNumbers.filter((h) => h <= 9).length;
        const back9Birdied = holeNumbers.filter((h) => h > 9).length;
        const completionDate = holesBirdied === 18 && holesMap
            ? [...holesMap.values()].map((v) => v.date).sort().pop()
            : null;
        rows.push({
            playerId,
            name: playerNames.get(playerId) || '',
            front9Birdied,
            back9Birdied,
            holesBirdied,
            completionDate,
            isWinner: false,
        });
    }
    const completionDates = rows.map((r) => r.completionDate).filter((d) => d !== null).sort();
    const earliestCompletion = completionDates[0];
    if (earliestCompletion) {
        for (const r of rows) {
            if (r.completionDate === earliestCompletion)
                r.isWinner = true;
        }
    }
    rows.sort((a, b) => {
        if (a.isWinner !== b.isWinner)
            return a.isWinner ? -1 : 1;
        return b.holesBirdied - a.holesBirdied || a.name.localeCompare(b.name);
    });
    return rows;
}
/**
 * Player Status: for one player, all 18 holes with whether they've net-birdied each one yet
 * (and the date they first did, if so) — the holes without a date are the ones they still need.
 */
async function getPlayerBirdieStatus(eventId, year, playerId) {
    const { parByHole, perPlayerHole } = await collectBirdieData(eventId, year);
    const holesMap = perPlayerHole.get(playerId);
    const rows = [];
    for (let hole = 1; hole <= 18; hole++) {
        const entry = holesMap?.get(hole);
        rows.push({
            hole,
            par: parByHole.get(hole) ?? null,
            gross: entry?.gross ?? null,
            net: entry?.net ?? null,
            birdied: !!entry,
            date: entry?.date ?? null,
        });
    }
    return rows;
}
/**
 * Birdie Hole-by-Hole: for one hole, every player who has net-birdied it this year, with the
 * date they first did — sorted by date so it reads as a race for that hole.
 */
async function getHoleBirdieDetail(eventId, year, hole) {
    const { playerNames, perPlayerHole, perPlayerHoleLowestGross } = await collectBirdieData(eventId, year);
    const rows = [];
    for (const [playerId, holesMap] of perPlayerHole) {
        const entry = holesMap.get(hole);
        if (entry) {
            rows.push({
                playerId,
                name: playerNames.get(playerId) || '',
                net: entry.net,
                date: entry.date,
                lowestGross: perPlayerHoleLowestGross.get(playerId)?.get(hole) ?? entry.gross,
            });
        }
    }
    rows.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
    return rows;
}
