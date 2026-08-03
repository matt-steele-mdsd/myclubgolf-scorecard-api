"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getHoleInOneWinners = getHoleInOneWinners;
exports.getHoleInOneCelebration = getHoleInOneCelebration;
exports.syncGamePayoutLedger = syncGamePayoutLedger;
exports.getPayoutReviewForEvent = getPayoutReviewForEvent;
exports.getSeasonPayoutSummary = getSeasonPayoutSummary;
const config_1 = __importDefault(require("../db/config"));
const payout_1 = require("../utils/payout");
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
 * removed team game) just result in no rows, which is the correct "nothing to pay" state. */
async function syncOnePayoutType(gameId, gameType, amounts) {
    await config_1.default.query('DELETE FROM PlayerPayouts WHERE GameID = ? AND GameType = ?', [gameId, gameType]);
    const entries = Array.from(amounts.entries()).filter(([, amt]) => amt > 0.001);
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
        const share = totalPot / holeInOneWinners.length;
        await syncOnePayoutType(gameId, 'holeinone', new Map(holeInOneWinners.map((w) => [w.playerId, share])));
        return;
    }
    await syncNetPayout(gameId, eventOptions, payoutValues);
    for (const { prefix, slot } of TEAM_SLOTS) {
        await syncOneTeamSlotPayout(gameId, prefix, slot, eventOptions, payoutValues);
    }
    await syncSkinsPayout(gameId, eventOptions);
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
    const [teamAppearanceRows] = await config_1.default.query(`SELECT DISTINCT tgp.PlayerID, tg.TeamGameID, tg.Slot
     FROM TeamGamePlayer tgp
     INNER JOIN TeamGame tg ON tg.TeamGameID = tgp.TeamGameID
     INNER JOIN Game g ON g.GameID = tg.GameID
     WHERE g.GroupID = ?`, [eventId]);
    const eventOptions = await (0, optionsService_1.getEventOptions)(eventId);
    const netPayIn = Number(eventOptions.game_netpayin) || 0;
    const skinsPayIn = Number(eventOptions.skins_payin) || 0;
    const paidById = new Map();
    const addPaid = (rows, rate) => {
        for (const r of rows) {
            paidById.set(r.PlayerID, (paidById.get(r.PlayerID) ?? 0) + r.gamesPlayed * rate);
        }
    };
    addPaid(netPaidRows, netPayIn);
    addPaid(skinsPaidRows, skinsPayIn);
    for (const r of teamAppearanceRows) {
        const slot = r.Slot ?? 1;
        const prefix = slot === 1 ? 'teams' : `teams${slot}`;
        const rate = Number(eventOptions[`${prefix}_payin`]) || 0;
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
