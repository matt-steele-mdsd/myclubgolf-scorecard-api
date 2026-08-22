"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getHoleInOneWinners = getHoleInOneWinners;
exports.getHoleInOneCelebration = getHoleInOneCelebration;
exports.getWeekPurse = getWeekPurse;
exports.syncGamePayoutLedger = syncGamePayoutLedger;
exports.getPayoutReviewForEvent = getPayoutReviewForEvent;
exports.getSeasonPayoutSummary = getSeasonPayoutSummary;
const config_1 = __importDefault(require("../db/config"));
const payout_1 = require("../utils/payout");
const money_1 = require("../utils/money");
const weekResultsService_1 = require("./weekResultsService");
const optionsService_1 = require("./optionsService");
const randomTeamsService_1 = require("./randomTeamsService");
const TEAM_SLOTS = [
    { prefix: 'teams', slot: 1 },
    { prefix: 'teams2', slot: 2 },
    { prefix: 'teams3', slot: 3 },
    { prefix: 'teams4', slot: 4 },
];
async function getGameEventId(gameId) {
    const [rows] = await config_1.default.query('SELECT GroupID FROM Game WHERE GameID = ?', [gameId]);
    return rows.length > 0 ? rows[0].GroupID : null;
}
/** Replace this game+type's ledger rows wholesale -- the delete-then-reinsert the admin asked
 * for instead of a "finalize" step. Amounts of 0 (or a game type no longer in play, e.g. a
 * removed team game) just result in no rows, which is the correct "nothing to pay" state.
 *
 * Every amount is truncated to 2 decimals here -- the one chokepoint every payout type (Net,
 * every Teams slot, Skins, Gross Skins, Hole-in-One) funnels through before hitting the DB --
 * rather than only at display time. Splitting a pot rarely divides evenly (e.g. $125 / 3 =
 * $41.666...); storing the raw split and truncating only for display meant each *individual*
 * amount looked right on screen, but summing several raw amounts and truncating the total (e.g.
 * this session's new Total Payouts footers) could come out a few cents higher than the sum of
 * what actually gets truncated-and-paid person by person -- confirmed real 2026-08-05, a $375.03
 * total against a $375.00 pot. Never round up: the admin must never owe more than was collected. */
async function syncOnePayoutType(gameId, gameType, amounts) {
    await config_1.default.query('DELETE FROM PlayerPayouts WHERE GameID = ? AND GameType = ?', [gameId, gameType]);
    const entries = Array.from(amounts.entries())
        .map(([playerId, amount]) => [playerId, (0, money_1.truncateMoneyValue)(amount)])
        .filter(([, amt]) => amt > 0.001);
    if (entries.length === 0)
        return;
    const values = entries.map(([playerId, amount]) => [gameId, playerId, gameType, amount]);
    await config_1.default.query('INSERT INTO PlayerPayouts (GameID, PlayerID, GameType, Amount) VALUES ?', [values]);
}
async function syncNetPayout(gameId, eventOptions, payoutValues) {
    const netResults = await (0, weekResultsService_1.getWeekResults)(gameId, 'N');
    const payIn = Number(eventOptions.game_netpayin) || 0;
    if (payIn <= 0 || netResults.length === 0) {
        await syncOnePayoutType(gameId, 'net', new Map());
        return;
    }
    const pot = payIn * netResults.length;
    const places = Math.max(0, Math.min(10, Number(payoutValues.game_netplaces) || 0));
    const pctArr = Array.from({ length: places }, (_, i) => payoutValues[`game_netpct${i + 1}`] ?? '');
    const placeAmounts = (0, payout_1.computePlaceAmounts)(pot, places, pctArr);
    const tiePayouts = (0, payout_1.computeTiePayouts)(netResults.map((r) => ({ key: r.playerId, value: r.net })), placeAmounts);
    await syncOnePayoutType(gameId, 'net', new Map(tiePayouts.map((p) => [p.key, p.amount])));
}
/**
 * One Teams slot's payout, split per-player across each winning team's roster. Written as fresh
 * SQL (not reusing teamService.ts's getTeamResults/TeamResultRow) because that type only exposes
 * player names, not PlayerIDs -- the ledger needs real IDs to attribute money correctly.
 */
async function syncOneTeamSlotPayout(gameId, prefix, slot, eventOptions, payoutValues) {
    const [tgRows] = await config_1.default.query(slot === 1
        ? 'SELECT TeamGameID FROM TeamGame WHERE GameID = ? AND (Slot = 1 OR Slot IS NULL) ORDER BY TeamGameID LIMIT 1'
        : 'SELECT TeamGameID FROM TeamGame WHERE GameID = ? AND Slot = ? ORDER BY TeamGameID LIMIT 1', slot === 1 ? [gameId] : [gameId, slot]);
    const payIn = Number(eventOptions[`${prefix}_payin`]) || 0;
    if (tgRows.length === 0 || payIn <= 0) {
        await syncOnePayoutType(gameId, prefix, new Map());
        return;
    }
    const teamGameId = tgRows[0].TeamGameID;
    const [rosterRows] = await config_1.default.query('SELECT TeamNumber, PlayerID FROM TeamGamePlayer WHERE TeamGameID = ?', [teamGameId]);
    if (rosterRows.length === 0) {
        await syncOnePayoutType(gameId, prefix, new Map());
        return;
    }
    const rosterByTeam = new Map();
    for (const r of rosterRows) {
        if (!rosterByTeam.has(r.TeamNumber))
            rosterByTeam.set(r.TeamNumber, []);
        rosterByTeam.get(r.TeamNumber).push(r.PlayerID);
    }
    // Best-ball net front+back per team -- same shape as teamService.ts's getTeamResults query.
    const [totalsRows] = await config_1.default.query(`SELECT allTeams.TeamNumber,
            IFNULL(f.TeamNetFront, 0) + IFNULL(b.TeamNetBack, 0) AS total
     FROM (SELECT DISTINCT TeamNumber FROM TeamGamePlayer WHERE TeamGameID = ?) allTeams
     LEFT OUTER JOIN (
       SELECT t1.TeamNumber, SUM(t1.HoleNet) AS TeamNetFront
       FROM (
         SELECT t.TeamNumber, s.HoleID, MIN(s.NetScore) AS HoleNet
         FROM TeamGamePlayer t
         INNER JOIN Score s ON s.GameID = ? AND s.PlayerID = t.PlayerID AND s.HoleID < 10
         WHERE t.TeamGameID = ?
         GROUP BY t.TeamNumber, s.HoleID
       ) t1 GROUP BY t1.TeamNumber
     ) f ON f.TeamNumber = allTeams.TeamNumber
     LEFT OUTER JOIN (
       SELECT t2.TeamNumber, SUM(t2.HoleNet) AS TeamNetBack
       FROM (
         SELECT t.TeamNumber, s.HoleID, MIN(s.NetScore) AS HoleNet
         FROM TeamGamePlayer t
         INNER JOIN Score s ON s.GameID = ? AND s.PlayerID = t.PlayerID AND s.HoleID > 9
         WHERE t.TeamGameID = ?
         GROUP BY t.TeamNumber, s.HoleID
       ) t2 GROUP BY t2.TeamNumber
     ) b ON b.TeamNumber = allTeams.TeamNumber`, [teamGameId, gameId, teamGameId, gameId, teamGameId]);
    // Pot size is based on everyone who actually played this format that day, not just who made
    // the drawn team roster -- a random-assignment team game excludes anyone over the Net Score to
    // Make Cut line from the roster entirely (see createRandomTeamGameTeams), but the $X buy-in
    // applies to every participant regardless of whether they personally made the cut (confirmed
    // with Matt: the cut only gates who can WIN, not who pays in). getGameEligibility's
    // eligiblePlayerIds + excludedOverCut together give the full field that finished this side,
    // cut or no cut.
    const eligibility = await (0, randomTeamsService_1.getGameEligibility)(gameId, prefix);
    const potPlayerCount = eligibility.eligiblePlayerIds.length + eligibility.excludedOverCut.length;
    const pot = payIn * potPlayerCount;
    const places = Math.max(0, Math.min(10, Number(payoutValues[`${prefix}_places`]) || 0));
    const pctArr = Array.from({ length: places }, (_, i) => payoutValues[`${prefix}_pct${i + 1}`] ?? '');
    const placeAmounts = (0, payout_1.computePlaceAmounts)(pot, places, pctArr);
    const teamPayouts = (0, payout_1.computeTiePayouts)(totalsRows.map((t) => ({ key: t.TeamNumber, value: Number(t.total) })), placeAmounts);
    const perPlayerAmounts = new Map();
    for (const tp of teamPayouts) {
        if (tp.amount <= 0)
            continue;
        const roster = rosterByTeam.get(tp.key) ?? [];
        if (roster.length === 0)
            continue;
        const share = tp.amount / roster.length;
        for (const playerId of roster) {
            perPlayerAmounts.set(playerId, (perPlayerAmounts.get(playerId) ?? 0) + share);
        }
    }
    await syncOnePayoutType(gameId, prefix, perPlayerAmounts);
}
/**
 * A one-off team game's own payout (Pay In / Places / Pct1-4 stored directly on its TeamGame
 * row, not read from an Options "Teams N" card) — same best-ball net split as
 * syncOneTeamSlotPayout, but sourced from the row's own columns instead of eventOptions/
 * payoutValues, and keyed under a per-TeamGameID GameType ('oneoff<TeamGameID>') since an event
 * can have any number of these in a week, unlike the 4 fixed Teams slots.
 *
 * Deliberately out of scope for now: computeTotalDayPot's hole-in-one combined pot and
 * getPayoutReviewForEvent's weekly Net/Teams review don't include one-off team games — both are
 * built around the fixed 4-slot assumption, and folding a variable number of ad hoc one-off games
 * into those is a separate piece of work. A hole-in-one day therefore doesn't zero out or
 * resync a one-off team game's payout the way it does Net/Teams/Skins (see syncGamePayoutLedger).
 */
async function syncOneOffTeamGamePayout(gameId, teamGameId) {
    const gameType = `oneoff${teamGameId}`;
    const [tgRows] = await config_1.default.query('SELECT PayIn, Places, Pct1, Pct2, Pct3, Pct4 FROM TeamGame WHERE TeamGameID = ?', [teamGameId]);
    const payIn = tgRows.length > 0 ? Number(tgRows[0].PayIn) || 0 : 0;
    if (payIn <= 0) {
        await config_1.default.query('DELETE FROM PlayerPayouts WHERE GameID = ? AND GameType = ?', [gameId, gameType]);
        return;
    }
    const [rosterRows] = await config_1.default.query('SELECT TeamNumber, PlayerID FROM TeamGamePlayer WHERE TeamGameID = ?', [teamGameId]);
    if (rosterRows.length === 0) {
        await config_1.default.query('DELETE FROM PlayerPayouts WHERE GameID = ? AND GameType = ?', [gameId, gameType]);
        return;
    }
    const rosterByTeam = new Map();
    for (const r of rosterRows) {
        if (!rosterByTeam.has(r.TeamNumber))
            rosterByTeam.set(r.TeamNumber, []);
        rosterByTeam.get(r.TeamNumber).push(r.PlayerID);
    }
    // Same best-ball net front+back per team query as syncOneTeamSlotPayout.
    const [totalsRows] = await config_1.default.query(`SELECT allTeams.TeamNumber,
            IFNULL(f.TeamNetFront, 0) + IFNULL(b.TeamNetBack, 0) AS total
     FROM (SELECT DISTINCT TeamNumber FROM TeamGamePlayer WHERE TeamGameID = ?) allTeams
     LEFT OUTER JOIN (
       SELECT t1.TeamNumber, SUM(t1.HoleNet) AS TeamNetFront
       FROM (
         SELECT t.TeamNumber, s.HoleID, MIN(s.NetScore) AS HoleNet
         FROM TeamGamePlayer t
         INNER JOIN Score s ON s.GameID = ? AND s.PlayerID = t.PlayerID AND s.HoleID < 10
         WHERE t.TeamGameID = ?
         GROUP BY t.TeamNumber, s.HoleID
       ) t1 GROUP BY t1.TeamNumber
     ) f ON f.TeamNumber = allTeams.TeamNumber
     LEFT OUTER JOIN (
       SELECT t2.TeamNumber, SUM(t2.HoleNet) AS TeamNetBack
       FROM (
         SELECT t.TeamNumber, s.HoleID, MIN(s.NetScore) AS HoleNet
         FROM TeamGamePlayer t
         INNER JOIN Score s ON s.GameID = ? AND s.PlayerID = t.PlayerID AND s.HoleID > 9
         WHERE t.TeamGameID = ?
         GROUP BY t.TeamNumber, s.HoleID
       ) t2 GROUP BY t2.TeamNumber
     ) b ON b.TeamNumber = allTeams.TeamNumber`, [teamGameId, gameId, teamGameId, gameId, teamGameId]);
    // Pot size covers everyone who actually played this one-off's own cut line, cut or no cut --
    // same "the buy-in applies to the whole field, the cut only gates who can WIN" rule as
    // syncOneTeamSlotPayout, using this row's own Net Cut / Net Cut 9 instead of an Options prefix.
    const netCut = tgRows.length > 0 && tgRows[0].NetCut !== null && tgRows[0].NetCut !== undefined ? Number(tgRows[0].NetCut) : null;
    const netCut9 = tgRows.length > 0 && tgRows[0].NetCut9 !== null && tgRows[0].NetCut9 !== undefined ? Number(tgRows[0].NetCut9) : null;
    const eligibility = await (0, randomTeamsService_1.getGameEligibility)(gameId, 'none', { full18: netCut, nineHole: netCut9 });
    const potPlayerCount = eligibility.eligiblePlayerIds.length + eligibility.excludedOverCut.length;
    const pot = payIn * potPlayerCount;
    const places = Math.max(0, Math.min(4, Number(tgRows[0]?.Places) || 0));
    const pctArr = [tgRows[0]?.Pct1, tgRows[0]?.Pct2, tgRows[0]?.Pct3, tgRows[0]?.Pct4]
        .slice(0, places)
        .map((v) => (v === null || v === undefined ? '' : String(v)));
    const placeAmounts = (0, payout_1.computePlaceAmounts)(pot, places, pctArr);
    const teamPayouts = (0, payout_1.computeTiePayouts)(totalsRows.map((t) => ({ key: t.TeamNumber, value: Number(t.total) })), placeAmounts);
    const perPlayerAmounts = new Map();
    for (const tp of teamPayouts) {
        if (tp.amount <= 0)
            continue;
        const roster = rosterByTeam.get(tp.key) ?? [];
        if (roster.length === 0)
            continue;
        const share = tp.amount / roster.length;
        for (const playerId of roster) {
            perPlayerAmounts.set(playerId, (perPlayerAmounts.get(playerId) ?? 0) + share);
        }
    }
    await config_1.default.query('DELETE FROM PlayerPayouts WHERE GameID = ? AND GameType = ?', [gameId, gameType]);
    const entries = Array.from(perPlayerAmounts.entries())
        .map(([playerId, amount]) => [playerId, (0, money_1.truncateMoneyValue)(amount)])
        .filter(([, amt]) => amt > 0.001);
    if (entries.length === 0)
        return;
    const values = entries.map(([playerId, amount]) => [gameId, playerId, gameType, amount]);
    await config_1.default.query('INSERT INTO PlayerPayouts (GameID, PlayerID, GameType, Amount) VALUES ?', [values]);
}
async function syncSkinsPayout(gameId, eventOptions) {
    const [countRows] = await config_1.default.query(`SELECT COUNT(DISTINCT s.PlayerID) AS numPlayers,
            (SELECT COUNT(*) FROM Skins sk
             WHERE sk.GameID = ? AND sk.Validated = 'T'
               AND sk.PlayerID NOT IN (SELECT o.PlayerID FROM OptOut o WHERE o.GameID = ?)) AS numSkins
     FROM Score s
     WHERE s.GameID = ?
       AND s.PlayerID NOT IN (SELECT o.PlayerID FROM OptOut o WHERE o.GameID = ?)`, [gameId, gameId, gameId, gameId]);
    const payIn = Number(eventOptions.skins_payin) || 0;
    const numPlayers = countRows[0]?.numPlayers ?? 0;
    const numSkins = countRows[0]?.numSkins ?? 0;
    if (payIn <= 0 || numSkins === 0) {
        await syncOnePayoutType(gameId, 'skins', new Map());
        return;
    }
    const perSkin = (numPlayers * payIn) / numSkins;
    const [skinsRows] = await config_1.default.query(`SELECT sk.PlayerID, COUNT(*) AS skinCount
     FROM Skins sk
     WHERE sk.GameID = ? AND sk.Validated = 'T'
       AND sk.PlayerID NOT IN (SELECT o.PlayerID FROM OptOut o WHERE o.GameID = ?)
     GROUP BY sk.PlayerID`, [gameId, gameId]);
    const amounts = new Map(skinsRows.map((r) => [r.PlayerID, r.skinCount * perSkin]));
    await syncOnePayoutType(gameId, 'skins', amounts);
}
/** Gross Skins' own pot -- same split logic as syncSkinsPayout, but sourced from
 * GrossSkinsResult/GSkinsPaid (a separately-paid-for, much smaller field) instead of
 * Skins/OptOut, and gated on the event's Gross Skins toggle being on at all. Deliberately reads
 * GrossSkinsResult, NOT the legacy GSkins table -- see grossSkinsService.ts's module docstring
 * for why they must stay separate. */
async function syncGrossSkinsPayout(gameId, groupId, gameDate, eventOptions) {
    if (!eventOptions.gross_skins_enabled) {
        await syncOnePayoutType(gameId, 'grossskins', new Map());
        return;
    }
    const [countRows] = await config_1.default.query(`SELECT (SELECT COUNT(*) FROM GSkinsPaid WHERE GroupID = ? AND TeeDate = ?) AS numPaid,
            (SELECT COUNT(*) FROM GrossSkinsResult WHERE GameID = ? AND Validated = 'T') AS numSkins`, [groupId, gameDate, gameId]);
    const payIn = Number(eventOptions.gross_skins_payin) || 0;
    const numPaid = countRows[0]?.numPaid ?? 0;
    const numSkins = countRows[0]?.numSkins ?? 0;
    if (payIn <= 0 || numSkins === 0 || numPaid === 0) {
        await syncOnePayoutType(gameId, 'grossskins', new Map());
        return;
    }
    const perSkin = (numPaid * payIn) / numSkins;
    const [skinsRows] = await config_1.default.query(`SELECT gs.PlayerID, COUNT(*) AS skinCount FROM GrossSkinsResult gs WHERE gs.GameID = ? AND gs.Validated = 'T' GROUP BY gs.PlayerID`, [gameId]);
    const amounts = new Map(skinsRows.map((r) => [r.PlayerID, r.skinCount * perSkin]));
    await syncOnePayoutType(gameId, 'grossskins', amounts);
}
/** Every hole-in-one (gross Score = 1) recorded for a game, excluding opted-out players. */
async function getHoleInOneWinners(gameId) {
    const [rows] = await config_1.default.query(`SELECT s.PlayerID AS playerId, CONCAT(p.LastName, ', ', p.FirstName) AS name, s.HoleID AS holeId
     FROM Score s
     INNER JOIN Player p ON p.PlayerID = s.PlayerID
     WHERE s.GameID = ? AND s.Score = 1
       AND s.PlayerID NOT IN (SELECT o.PlayerID FROM OptOut o WHERE o.GameID = ?)
     ORDER BY s.HoleID`, [gameId, gameId]);
    return rows.map((r) => ({ playerId: r.playerId, name: r.name, holeId: r.holeId }));
}
/** The full day's pot across Net + every Teams slot + Skins -- what a hole-in-one wins outright.
 * Just headcount x pay-in per game type (the same pot math each syncOneXPayout already does),
 * not the placed/split amounts -- a hole-in-one takes all of it, not whatever would normally be
 * paid out to the field. */
async function computeTotalDayPot(gameId, eventOptions) {
    let total = 0;
    const netPayIn = Number(eventOptions.game_netpayin) || 0;
    if (netPayIn > 0) {
        const netResults = await (0, weekResultsService_1.getWeekResults)(gameId, 'N');
        total += netPayIn * netResults.length;
    }
    for (const { prefix, slot } of TEAM_SLOTS) {
        const payIn = Number(eventOptions[`${prefix}_payin`]) || 0;
        if (payIn <= 0)
            continue;
        const [tgRows] = await config_1.default.query(slot === 1
            ? 'SELECT TeamGameID FROM TeamGame WHERE GameID = ? AND (Slot = 1 OR Slot IS NULL) ORDER BY TeamGameID LIMIT 1'
            : 'SELECT TeamGameID FROM TeamGame WHERE GameID = ? AND Slot = ? ORDER BY TeamGameID LIMIT 1', slot === 1 ? [gameId] : [gameId, slot]);
        if (tgRows.length === 0)
            continue;
        const [rosterRows] = await config_1.default.query('SELECT DISTINCT PlayerID FROM TeamGamePlayer WHERE TeamGameID = ?', [tgRows[0].TeamGameID]);
        total += payIn * rosterRows.length;
    }
    const skinsPayIn = Number(eventOptions.skins_payin) || 0;
    if (skinsPayIn > 0) {
        const [countRows] = await config_1.default.query(`SELECT COUNT(DISTINCT s.PlayerID) AS numPlayers FROM Score s
       WHERE s.GameID = ? AND s.PlayerID NOT IN (SELECT o.PlayerID FROM OptOut o WHERE o.GameID = ?)`, [gameId, gameId]);
        total += skinsPayIn * (countRows[0]?.numPlayers ?? 0);
    }
    const grossSkinsPayIn = Number(eventOptions.gross_skins_payin) || 0;
    if (eventOptions.gross_skins_enabled && grossSkinsPayIn > 0) {
        const [gameRows] = await config_1.default.query('SELECT GroupID, GameDate FROM Game WHERE GameID = ?', [gameId]);
        if (gameRows.length > 0) {
            const [countRows] = await config_1.default.query('SELECT COUNT(*) AS numPaid FROM GSkinsPaid WHERE GroupID = ? AND TeeDate = ?', [gameRows[0].GroupID, gameRows[0].GameDate]);
            total += grossSkinsPayIn * (countRows[0]?.numPaid ?? 0);
        }
    }
    return total;
}
async function getHoleInOneCelebration(gameId) {
    const winners = await getHoleInOneWinners(gameId);
    if (winners.length === 0)
        return null;
    const eventId = await getGameEventId(gameId);
    if (eventId === null)
        return null;
    const eventOptions = await (0, optionsService_1.getEventOptions)(eventId);
    const totalPot = await computeTotalDayPot(gameId, eventOptions);
    return { winners, totalPot };
}
/**
 * Everyone's total winnings for one week, across every payout type at once (Net, every Teams
 * slot, Skins, Gross Skins, Hole-in-One) -- what the admin actually Venmos people, in one place
 * instead of flipping between the Skins/Teams/Gross Skins tabs and adding it up by hand
 * (confirmed with Matt 2026-08-04: buy-ins are collected up front in cash, so this is winnings
 * only, not a paid-vs-won net balance like `getSeasonPayoutSummary`).
 *
 * Purely a read over `PlayerPayouts`, which `syncGamePayoutLedger` already keeps current every
 * time Week Results loads a week -- no separate recompute needed here, unlike Skins/Gross Skins'
 * own hole-by-hole/summary views which store results in their own dedicated tables.
 */
async function getWeekPurse(gameId) {
    const [rows] = await config_1.default.query(`SELECT pp.PlayerID, CONCAT(p.LastName, ', ', p.FirstName) AS name, pp.GameType, pp.Amount
     FROM PlayerPayouts pp
     INNER JOIN Player p ON p.PlayerID = pp.PlayerID
     WHERE pp.GameID = ?
     ORDER BY p.LastName, p.FirstName`, [gameId]);
    const byPlayer = new Map();
    for (const r of rows) {
        if (!byPlayer.has(r.PlayerID)) {
            byPlayer.set(r.PlayerID, { playerId: r.PlayerID, name: r.name, total: 0, breakdown: [] });
        }
        const row = byPlayer.get(r.PlayerID);
        const amount = Number(r.Amount);
        if (amount <= 0.001)
            continue;
        row.breakdown.push({ gameType: r.GameType, amount });
        row.total += amount;
    }
    return Array.from(byPlayer.values())
        .filter((row) => row.total > 0.001)
        .sort((a, b) => b.total - a.total);
}
/**
 * Recompute and persist every payout type (Net, each Teams slot, Skins) for one game/week,
 * wholesale replacing whatever was there before. No separate "finalize" step -- called whenever
 * Week Results computes a week's payouts, whether that's just browsing to it or saving an
 * explicit Adjust Payout override, so the ledger always mirrors current settings automatically.
 * UPS Cup is deliberately out of scope (no payout concept exists for it yet).
 *
 * A hole-in-one overrides all of this: every normal payout type is zeroed out and the entire
 * day's combined pot goes to the hole-in-one shooter(s) instead, under the 'holeinone' game type
 * (confirmed with Matt 2026-07-26).
 */
async function syncGamePayoutLedger(gameId) {
    const eventId = await getGameEventId(gameId);
    if (eventId === null)
        return;
    const eventOptions = await (0, optionsService_1.getEventOptions)(eventId);
    const { values: payoutValues } = await (0, optionsService_1.getEffectiveGamePayoutOptions)(gameId, eventId);
    const holeInOneWinners = await getHoleInOneWinners(gameId);
    if (holeInOneWinners.length > 0) {
        const totalPot = await computeTotalDayPot(gameId, eventOptions);
        await syncOnePayoutType(gameId, 'net', new Map());
        for (const { prefix } of TEAM_SLOTS) {
            await syncOnePayoutType(gameId, prefix, new Map());
        }
        await syncOnePayoutType(gameId, 'skins', new Map());
        await syncOnePayoutType(gameId, 'grossskins', new Map());
        const share = totalPot / holeInOneWinners.length;
        await syncOnePayoutType(gameId, 'holeinone', new Map(holeInOneWinners.map((w) => [w.playerId, share])));
        return;
    }
    await syncNetPayout(gameId, eventOptions, payoutValues);
    for (const { prefix, slot } of TEAM_SLOTS) {
        await syncOneTeamSlotPayout(gameId, prefix, slot, eventOptions, payoutValues);
    }
    const [oneOffRows] = await config_1.default.query(`SELECT TeamGameID FROM TeamGame WHERE GameID = ? AND Slot IS NULL AND (Skipped IS NULL OR Skipped != 'T')`, [gameId]);
    for (const r of oneOffRows) {
        await syncOneOffTeamGamePayout(gameId, r.TeamGameID);
    }
    await syncSkinsPayout(gameId, eventOptions);
    const [gameRows] = await config_1.default.query('SELECT GroupID, GameDate FROM Game WHERE GameID = ?', [gameId]);
    if (gameRows.length > 0) {
        await syncGrossSkinsPayout(gameId, gameRows[0].GroupID, gameRows[0].GameDate, eventOptions);
    }
}
/**
 * Net + Teams payout totals (Skins excluded -- flat $5 all year, nothing to review) for every
 * week marked on this event's calendar at all, except explicit non-play "note" days (rain-outs,
 * holiday skips). Broader than calendarService's getQualifyingDates (which filters to only
 * 'event'/'major' for UPS Cup/Birdie Race eligibility) -- that's the wrong fit here. Falls back
 * to every played date if the event has no calendar set up at all. Read-only, computed live from
 * current settings -- doesn't touch PlayerPayouts. Used by the Payout Review screen, where the
 * admin walks each week and taps through to Week Results' existing Adjust Payout flow for any
 * that need correcting to match what was actually paid out in cash.
 */
async function getPayoutReviewForEvent(eventId) {
    const [calRows] = await config_1.default.query(`SELECT DISTINCT DATE_FORMAT(EventDate, '%Y-%m-%d') AS date
     FROM EventCalendar WHERE EventID = ? AND DayType != 'note' AND EventDate <= CURDATE()`, [eventId]);
    let qualifyingDates = calRows.length > 0 ? new Set(calRows.map((r) => r.date)) : null;
    const [gameRows] = await config_1.default.query(`SELECT GameID, DATE_FORMAT(GameDate, '%Y-%m-%d') AS date FROM Game
     WHERE GroupID = ? AND GameDate <= CURDATE() ORDER BY GameDate DESC`, [eventId]);
    // No calendar entries at all for this event -- don't hide anything, include every played date.
    const qualifyingGames = qualifyingDates === null ? gameRows : gameRows.filter((g) => qualifyingDates.has(g.date));
    if (qualifyingGames.length === 0)
        return [];
    const eventOptions = await (0, optionsService_1.getEventOptions)(eventId);
    const netPayIn = Number(eventOptions.game_netpayin) || 0;
    const weeks = [];
    for (const g of qualifyingGames) {
        const { values: payoutValues, overriddenKeys } = await (0, optionsService_1.getEffectiveGamePayoutOptions)(g.GameID, eventId);
        let netTotal = 0;
        if (netPayIn > 0) {
            const netResults = await (0, weekResultsService_1.getWeekResults)(g.GameID, 'N');
            if (netResults.length > 0) {
                const places = Math.max(0, Math.min(10, Number(payoutValues.game_netplaces) || 0));
                const pctArr = Array.from({ length: places }, (_, i) => payoutValues[`game_netpct${i + 1}`] ?? '');
                netTotal = (0, payout_1.computePlaceAmounts)(netPayIn * netResults.length, places, pctArr).reduce((a, b) => a + b, 0);
            }
        }
        const netOverridden = overriddenKeys.some((k) => k.startsWith('game_net'));
        let teamsTotal = 0;
        let teamsOverridden = false;
        for (const { prefix, slot } of TEAM_SLOTS) {
            const payIn = Number(eventOptions[`${prefix}_payin`]) || 0;
            if (payIn <= 0)
                continue;
            const [tgRows] = await config_1.default.query(slot === 1
                ? 'SELECT TeamGameID FROM TeamGame WHERE GameID = ? AND (Slot = 1 OR Slot IS NULL) ORDER BY TeamGameID LIMIT 1'
                : 'SELECT TeamGameID FROM TeamGame WHERE GameID = ? AND Slot = ? ORDER BY TeamGameID LIMIT 1', slot === 1 ? [g.GameID] : [g.GameID, slot]);
            if (tgRows.length === 0)
                continue;
            const [rosterRows] = await config_1.default.query('SELECT DISTINCT PlayerID FROM TeamGamePlayer WHERE TeamGameID = ?', [tgRows[0].TeamGameID]);
            if (rosterRows.length === 0)
                continue;
            const places = Math.max(0, Math.min(10, Number(payoutValues[`${prefix}_places`]) || 0));
            const pctArr = Array.from({ length: places }, (_, i) => payoutValues[`${prefix}_pct${i + 1}`] ?? '');
            teamsTotal += (0, payout_1.computePlaceAmounts)(payIn * rosterRows.length, places, pctArr).reduce((a, b) => a + b, 0);
            if (overriddenKeys.some((k) => k.startsWith(`${prefix}_`)))
                teamsOverridden = true;
        }
        weeks.push({ gameId: g.GameID, date: g.date, netTotal, netOverridden, teamsTotal, teamsOverridden });
    }
    return weeks;
}
/**
 * Season-long ledger for an event: how much each player has won (summed from PlayerPayouts
 * across every week) alongside how much they've paid in (derived live from participation --
 * pay-in rates aren't per-week-overridable, so this doesn't need its own persisted record).
 */
async function getSeasonPayoutSummary(eventId) {
    const [wonRows] = await config_1.default.query(`SELECT pp.PlayerID, SUM(pp.Amount) AS won
     FROM PlayerPayouts pp
     INNER JOIN Game g ON g.GameID = pp.GameID
     WHERE g.GroupID = ?
     GROUP BY pp.PlayerID`, [eventId]);
    const [netPaidRows] = await config_1.default.query(`SELECT s.PlayerID, COUNT(DISTINCT s.GameID) AS gamesPlayed
     FROM Score s
     INNER JOIN Game g ON g.GameID = s.GameID
     WHERE g.GroupID = ?
       AND s.PlayerID NOT IN (SELECT o.PlayerID FROM OptOut o WHERE o.GameID = s.GameID)
     GROUP BY s.PlayerID`, [eventId]);
    const [skinsPaidRows] = await config_1.default.query(`SELECT s.PlayerID, COUNT(DISTINCT s.GameID) AS gamesPlayed
     FROM Score s
     INNER JOIN Game g ON g.GameID = s.GameID
     WHERE g.GroupID = ?
       AND s.PlayerID NOT IN (SELECT o.PlayerID FROM OptOut o WHERE o.GameID = s.GameID)
     GROUP BY s.PlayerID`, [eventId]);
    // One row per (player, TeamGameID) they appeared in -- DISTINCT so a player duplicated onto a
    // 2nd team within the same TeamGameID (the odd-roster fairness case) is only counted once, same
    // as the payout-splitting logic above. Each TeamGame's own Slot decides which of that event's
    // (potentially differently-priced) Teams cards applies -- a single event can run two different
    // team games the same week (e.g. a blind-draw Teams 1 and a separate 4-man Teams 2), each with
    // its own pay-in, and a player can be in both and owes both.
    const [teamAppearanceRows] = await config_1.default.query(`SELECT DISTINCT tgp.PlayerID, tg.TeamGameID, tg.Slot, tg.PayIn
     FROM TeamGamePlayer tgp
     INNER JOIN TeamGame tg ON tg.TeamGameID = tgp.TeamGameID
     INNER JOIN Game g ON g.GameID = tg.GameID
     WHERE g.GroupID = ?`, [eventId]);
    // Gross Skins paid-in is tracked directly (GSkinsPaid, one explicit row per player per tee
    // date), unlike net Skins/Net above which derive "paid" from participation -- gross skins
    // participation isn't everyone who played, only whoever was marked paid for it that week.
    const [grossSkinsPaidRows] = await config_1.default.query(`SELECT PlayerID, COUNT(*) AS gamesPlayed FROM GSkinsPaid WHERE GroupID = ? GROUP BY PlayerID`, [eventId]);
    const eventOptions = await (0, optionsService_1.getEventOptions)(eventId);
    const netPayIn = Number(eventOptions.game_netpayin) || 0;
    const skinsPayIn = Number(eventOptions.skins_payin) || 0;
    const grossSkinsPayIn = eventOptions.gross_skins_enabled ? Number(eventOptions.gross_skins_payin) || 0 : 0;
    const paidById = new Map();
    const addPaid = (rows, rate) => {
        for (const r of rows) {
            paidById.set(r.PlayerID, (paidById.get(r.PlayerID) ?? 0) + r.gamesPlayed * rate);
        }
    };
    addPaid(netPaidRows, netPayIn);
    addPaid(skinsPaidRows, skinsPayIn);
    addPaid(grossSkinsPaidRows, grossSkinsPayIn);
    for (const r of teamAppearanceRows) {
        // A one-off team game (Slot null) has its own PayIn stored directly on its row -- it must
        // NOT fall back to Teams 1's Options rate the way `slot ?? 1` used to (fixed 2026-08-21: every
        // one-off team game player was silently being charged Teams 1's pay-in here, regardless of
        // what the one-off's own Pay In was actually set to, or whether Teams 1 even had a payout).
        const rate = r.Slot === null || r.Slot === undefined
            ? Number(r.PayIn) || 0
            : Number(eventOptions[`${r.Slot === 1 ? 'teams' : `teams${r.Slot}`}_payin`]) || 0;
        if (rate > 0) {
            paidById.set(r.PlayerID, (paidById.get(r.PlayerID) ?? 0) + rate);
        }
    }
    const wonById = new Map(wonRows.map((r) => [r.PlayerID, Number(r.won)]));
    const allPlayerIds = new Set([...paidById.keys(), ...wonById.keys()]);
    if (allPlayerIds.size === 0)
        return [];
    const [nameRows] = await config_1.default.query(`SELECT PlayerID, CONCAT(LastName, ', ', FirstName) AS name FROM Player WHERE PlayerID IN (${Array.from(allPlayerIds).map(() => '?').join(',')})`, Array.from(allPlayerIds));
    const nameById = new Map(nameRows.map((r) => [r.PlayerID, r.name]));
    return Array.from(allPlayerIds)
        .map((playerId) => {
        const paid = paidById.get(playerId) ?? 0;
        const won = wonById.get(playerId) ?? 0;
        return { playerId, name: nameById.get(playerId) ?? `Player ${playerId}`, paid, won, balance: won - paid };
    })
        .sort((a, b) => a.name.localeCompare(b.name));
}
