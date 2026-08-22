import pool from '../db/config';
import { getEventOptions } from './optionsService';
import { getQualifyingDates } from './calendarService';

/**
 * A recorded UPS Cup winner for a given year — used to mark players exempt from the normal
 * qualifying criteria under the "Include Previous Winners" option (Options screen), for
 * however many years back "Number of Years Exemption" says. Just the record of who won which
 * year for now; the actual eligibility check against these records is a follow-up.
 */
export interface UpsCupWinner {
  year: number;
  playerId: number;
  playerName: string;
}

export async function getUpsCupWinners(eventId: number): Promise<UpsCupWinner[]> {
  const [rows] = await pool.query<any[]>(
    `SELECT w.Year, w.PlayerID, CONCAT(p.LastName, ', ', p.FirstName) AS name
     FROM UpsCupWinner w
     INNER JOIN Player p ON p.PlayerID = w.PlayerID
     WHERE w.EventID = ?
     ORDER BY w.Year DESC`,
    [eventId]
  );
  return rows.map((r) => ({ year: r.Year, playerId: r.PlayerID, playerName: r.name }));
}

/** Set (or replace) the winner for a given event/year. */
export async function setUpsCupWinner(eventId: number, year: number, playerId: number): Promise<void> {
  await pool.query(
    `INSERT INTO UpsCupWinner (EventID, Year, PlayerID, LastUpdateUser)
     VALUES (?, ?, ?, 'app')
     ON DUPLICATE KEY UPDATE PlayerID = VALUES(PlayerID), LastUpdateDt = CURRENT_TIMESTAMP`,
    [eventId, year, playerId]
  );
}

export async function deleteUpsCupWinner(eventId: number, year: number): Promise<void> {
  await pool.query('DELETE FROM UpsCupWinner WHERE EventID = ? AND Year = ?', [eventId, year]);
}

/** Who automatically qualified for the UPS Cup by winning a Major that year, and on which date.
 * `playerId`/`playerName` are null/'TBD' for a Major that hasn't been played yet. `metMinimum`
 * is null for a TBD row, otherwise whether the winner has *already* played enough qualifying
 * events to satisfy "Minimum Number of Events to Qualify" as of today — winning a Major doesn't
 * by itself guarantee a spot if they haven't (yet) met that minimum. */
export interface MajorWinner {
  date: string; // yyyy-mm-dd
  playerId: number | null;
  playerName: string;
  metMinimum: boolean | null;
}

/**
 * Shared groundwork for both `getMajorWinners` and `getIneligiblePlayers`: how many qualifying
 * days remain this year, and how many of those each player has already played (a score
 * recorded, not opted out) among the ones that have already happened — mirrors cleanupService's
 * `GameDate < CURDATE()` convention for "already happened." Qualifying days are the 'event'/
 * 'major' calendar days if this event/year has a calendar set up, or every date this event
 * actually played a game that year if it doesn't (see `getQualifyingDates`).
 */
async function getQualifyingPlayedCounts(
  eventId: number, year: number
): Promise<{ playedCount: Map<number, number>; remaining: number; minEvents: number }> {
  const options = await getEventOptions(eventId);
  const minEvents = parseInt(options.ups_minevents, 10) || 0;

  const [todayRows] = await pool.query<any[]>("SELECT DATE_FORMAT(CURDATE(), '%Y-%m-%d') AS today");
  const today: string = todayRows[0].today;

  const qualifyingDates = await getQualifyingDates(eventId, year);
  const pastDates = qualifyingDates.filter((d) => d < today);
  const remaining = qualifyingDates.filter((d) => d >= today).length;

  const playedCount = new Map<number, number>();
  for (const date of pastDates) {
    const [games] = await pool.query<any[]>('SELECT GameID FROM Game WHERE GroupID = ? AND GameDate = ?', [eventId, date]);
    if (games.length === 0) continue;
    const gameId = games[0].GameID;
    const [scoreRows] = await pool.query<any[]>(
      `SELECT DISTINCT s.PlayerID
       FROM Score s
       WHERE s.GameID = ? AND s.PlayerID NOT IN (SELECT o.PlayerID FROM OptOut o WHERE o.GameID = ?)`,
      [gameId, gameId]
    );
    for (const r of scoreRows) {
      playedCount.set(r.PlayerID, (playedCount.get(r.PlayerID) || 0) + 1);
    }
  }

  return { playedCount, remaining, minEvents };
}

interface NetTotal {
  PlayerID: number;
  name: string;
  net: number;
}

/**
 * Break a tie among `candidatePlayerIds` for a game by comparing net score hole-by-hole,
 * starting from the *last* hole played and working backward — first hole where scores differ,
 * whoever has the lower net there wins. If every hole matches (a true dead tie), just returns
 * the first candidate.
 */
async function scorecardTiebreak(gameId: number, candidatePlayerIds: number[]): Promise<number> {
  const [holeRows] = await pool.query<any[]>(
    'SELECT DISTINCT HoleID FROM Score WHERE GameID = ? ORDER BY HoleID DESC',
    [gameId]
  );
  const holesDescending: number[] = holeRows.map((r) => r.HoleID);

  const [rows] = await pool.query<any[]>(
    'SELECT PlayerID, HoleID, NetScore FROM Score WHERE GameID = ? AND PlayerID IN (?)',
    [gameId, candidatePlayerIds]
  );
  const netByPlayerHole = new Map<number, Map<number, number>>();
  for (const r of rows) {
    if (!netByPlayerHole.has(r.PlayerID)) netByPlayerHole.set(r.PlayerID, new Map());
    netByPlayerHole.get(r.PlayerID)!.set(r.HoleID, r.NetScore);
  }

  let remaining = [...candidatePlayerIds];
  for (const hole of holesDescending) {
    if (remaining.length <= 1) break;
    let bestNet = Infinity;
    for (const pid of remaining) {
      const net = netByPlayerHole.get(pid)?.get(hole);
      if (net !== undefined && net < bestNet) bestNet = net;
    }
    remaining = remaining.filter((pid) => netByPlayerHole.get(pid)?.get(hole) === bestNet);
  }
  return remaining[0];
}

/**
 * Determine each Major's automatic qualifier for a given year — mirrors "Winner of Majors
 * Automatically In" (Options screen): the lowest net score for that day's game wins. Ties are
 * broken by first excluding anyone already qualified (having won an *earlier* Major that same
 * year, or being within the "Include Previous Winners"/"Number of Years Exemption" window) —
 * whoever's left is the new qualifier, since the already-qualified person doesn't need the
 * spot. If that exclusion doesn't leave exactly one candidate (nobody was already qualified,
 * or more than one new contender remains), the tie is broken by `scorecardTiebreak`. Majors
 * are processed in date order within the year since a later Major's "already won a Major this
 * year" check depends on earlier Majors already having been resolved.
 */
export async function getMajorWinners(eventId: number, year: number): Promise<MajorWinner[]> {
  const [majorRows] = await pool.query<any[]>(
    `SELECT DATE_FORMAT(EventDate, '%Y-%m-%d') AS date
     FROM EventCalendar
     WHERE EventID = ? AND YEAR(EventDate) = ? AND DayType = 'major'
     ORDER BY EventDate ASC`,
    [eventId, year]
  );

  const options = await getEventOptions(eventId);
  const yearsExemption = parseInt(options.ups_yearsexemption, 10) || 0;

  let priorWinnersExempt = new Set<number>();
  if (options.ups_includeprioryears) {
    const [winnerRows] = await pool.query<any[]>(
      'SELECT DISTINCT PlayerID FROM UpsCupWinner WHERE EventID = ? AND Year >= ?',
      [eventId, year - yearsExemption]
    );
    priorWinnersExempt = new Set(winnerRows.map((r) => r.PlayerID));
  }

  const { playedCount, minEvents } = await getQualifyingPlayedCounts(eventId, year);

  const wonMajorThisYear = new Set<number>();
  const results: MajorWinner[] = [];

  for (const row of majorRows) {
    const [games] = await pool.query<any[]>('SELECT GameID FROM Game WHERE GroupID = ? AND GameDate = ?', [eventId, row.date]);
    if (games.length === 0) {
      results.push({ date: row.date, playerId: null, playerName: 'TBD', metMinimum: null });
      continue;
    }

    const gameId = games[0].GameID;
    const [totalRows] = await pool.query<any[]>(
      `SELECT s.PlayerID, CONCAT(p.LastName, ', ', p.FirstName) AS name, SUM(s.NetScore) AS net
       FROM Score s
       INNER JOIN Player p ON p.PlayerID = s.PlayerID
       WHERE s.GameID = ? AND s.PlayerID NOT IN (SELECT o.PlayerID FROM OptOut o WHERE o.GameID = ?)
       GROUP BY s.PlayerID`,
      [gameId, gameId]
    );
    if (totalRows.length === 0) {
      results.push({ date: row.date, playerId: null, playerName: 'TBD', metMinimum: null });
      continue;
    }

    const totals: NetTotal[] = totalRows.map((r) => ({ PlayerID: r.PlayerID, name: r.name, net: Number(r.net) }));
    const minNet = Math.min(...totals.map((t) => t.net));
    const tied = totals.filter((t) => t.net === minNet);

    let winner: NetTotal;
    if (tied.length === 1) {
      winner = tied[0];
    } else {
      const alreadyQualified = (pid: number) => wonMajorThisYear.has(pid) || priorWinnersExempt.has(pid);
      const notYetQualified = tied.filter((t) => !alreadyQualified(t.PlayerID));
      // Nobody left after excluding already-qualified players (everyone tied is already in) —
      // fall back to breaking the tie across the full tied group instead.
      const candidates = notYetQualified.length === 0 ? tied : notYetQualified;

      if (candidates.length === 1) {
        winner = candidates[0];
      } else {
        const winnerId = await scorecardTiebreak(gameId, candidates.map((c) => c.PlayerID));
        winner = candidates.find((c) => c.PlayerID === winnerId)!;
      }
    }

    wonMajorThisYear.add(winner.PlayerID);
    const metMinimum = minEvents <= 0 || (playedCount.get(winner.PlayerID) || 0) >= minEvents;
    results.push({ date: row.date, playerId: winner.PlayerID, playerName: winner.name, metMinimum });
  }

  return results;
}

/** A player who's mathematically eliminated from UPS Cup qualification, and why. */
export interface IneligiblePlayer {
  playerId: number;
  name: string;
  played: number;
  remaining: number;
  reason: string;
}

/**
 * Find players mathematically eliminated from UPS Cup qualification this year, two ways:
 *
 *  - Can't reach "Minimum Number of Events to Qualify" (Options screen) — even if they played
 *    every remaining qualifying event this year, they still wouldn't hit the minimum.
 *  - Can't crack "Number of Players That Make the UPS Cup" (Options screen) even in the best
 *    case — even if they won every remaining qualifying event outright (1 point each week,
 *    the best possible UPS Points score), their resulting average still wouldn't beat today's
 *    cutoff for the last qualifying spot among paid players. Only checked for paid players,
 *    since only paid players are eligible for a spot at all (see "UPS Cup Paid Players");
 *    skipped for anyone already flagged by the first check, since they're a lost cause for an
 *    even more basic reason.
 *
 * Only 'event'/'major' calendar days count as qualifying events; 'upscup' days (the UPS Cup
 * itself) and 'note' days don't. A day counts as "played" only once it's actually happened
 * (mirrors cleanupService's `GameDate < CURDATE()` convention) and the player has a recorded
 * score for it; "remaining" is every qualifying day from today onward, played or not, since
 * it's still a future opportunity.
 */
export async function getIneligiblePlayers(eventId: number, year: number): Promise<IneligiblePlayer[]> {
  const { playedCount, remaining, minEvents } = await getQualifyingPlayedCounts(eventId, year);

  const ineligible: IneligiblePlayer[] = [];
  const alreadyFlagged = new Set<number>();

  if (minEvents > 0) {
    const [playerRows] = await pool.query<any[]>(
      `SELECT p.PlayerID AS id, CONCAT(p.LastName, ', ', p.FirstName) AS name
       FROM Player p
       WHERE p.PlayerID IN (SELECT PlayerID FROM EventPlayers WHERE EventID = ?)`,
      [eventId]
    );

    for (const player of playerRows) {
      const played = playedCount.get(player.id) || 0;
      // Skip anyone who hasn't played a single qualifying event yet -- of course they "can't
      // qualify" in that trivial sense, but that's not a meaningful elimination the way it is
      // for someone who tried and ran out of remaining events; it's just noise from every
      // never-showed-up roster member (confirmed with Matt 2026-08-22).
      if (played === 0) continue;
      if (played + remaining < minEvents) {
        ineligible.push({
          playerId: player.id,
          name: player.name,
          played,
          remaining,
          reason: `Not enough events remaining to meet minimum requirement (played ${played}, ${remaining} remaining, need ${minEvents})`,
        });
        alreadyFlagged.add(player.id);
      }
    }
  }

  const { pointsByPlayer, paidSet, numScores, numPlayers } = await getStandingsRawData(eventId, year);
  if (numScores > 0 && numPlayers > 0) {
    const paidAverages: number[] = [];
    for (const [playerId, { points }] of pointsByPlayer) {
      if (!paidSet.has(playerId)) continue;
      paidAverages.push(averageOf([...points].sort((a, b) => a - b), numScores));
    }
    paidAverages.sort((a, b) => a - b);

    if (paidAverages.length > 0) {
      const cutoffAverage = paidAverages[Math.min(numPlayers, paidAverages.length) - 1];

      for (const [playerId, { name, points }] of pointsByPlayer) {
        if (!paidSet.has(playerId) || alreadyFlagged.has(playerId)) continue;

        const bestCasePoints = [...points, ...Array(remaining).fill(1)].sort((a, b) => a - b);
        const bestCaseAverage = averageOf(bestCasePoints, numScores);

        if (bestCaseAverage > cutoffAverage) {
          ineligible.push({
            playerId,
            name,
            played: points.length,
            remaining,
            reason: `Cannot mathematically reach the top ${numPlayers} qualifying spots (best possible average ${bestCaseAverage.toFixed(2)}, current cutoff ${cutoffAverage.toFixed(2)})`,
          });
        }
      }
    }
  }

  return ineligible.sort((a, b) => a.name.localeCompare(b.name));
}

/** One player's UPS Cup points for a single event (game). */
export interface UpsPointsRow {
  playerId: number;
  name: string;
  net: number;
  points: number;
}

/**
 * UPS Cup points for a game: standard competition ("1224") ranking by net score — lowest net
 * gets 1 point, next gets 2, and so on. Players tied on net get the same (lower) points value,
 * and the next distinct score skips ahead by however many players tied (e.g. two players tied
 * at 11 both get 11 points, and whoever's next gets 13, not 12).
 */
export async function getUpsPointsForGame(gameId: number): Promise<UpsPointsRow[]> {
  const [rows] = await pool.query<any[]>(
    `SELECT s.PlayerID, CONCAT(p.LastName, ', ', p.FirstName) AS name, SUM(s.NetScore) AS net
     FROM Score s
     INNER JOIN Player p ON p.PlayerID = s.PlayerID
     WHERE s.GameID = ? AND s.PlayerID NOT IN (SELECT o.PlayerID FROM OptOut o WHERE o.GameID = ?)
     GROUP BY s.PlayerID
     ORDER BY net ASC, p.LastName, p.FirstName`,
    [gameId, gameId]
  );

  const results: UpsPointsRow[] = [];
  let prevNet: number | null = null;
  let prevPoints = 0;
  rows.forEach((r, i) => {
    const net = Number(r.net);
    const points = net === prevNet ? prevPoints : i + 1;
    results.push({ playerId: r.PlayerID, name: r.name, net, points });
    prevNet = net;
    prevPoints = points;
  });

  return results;
}

/** A player's current UPS Cup standing. */
export interface StandingsRow {
  playerId: number;
  name: string;
  played: number;
  average: number;
  metRequirement: boolean;
  /** Whether this player is within "Number of Players That Make the UPS Cup" (Options screen)
   * — the top N averages qualify, and anyone tied with the Nth-place average also qualifies.
   * Always false for an unpaid player — paying to enter is a prerequisite for qualifying at
   * all, so they never take up one of the N spots regardless of how good their average is. */
  qualifies: boolean;
  /** Whether this player has paid their UPS Cup entry for this year (Admin's "UPS Cup Paid
   * Players" screen). Everyone still gets an average here — weekly UPS Points themselves don't
   * care about paid status — but only paid players count toward the qualifying cutoff. */
  paid: boolean;
}

/**
 * Shared groundwork for `getCurrentStandings` and `getIneligiblePlayers`' "can't mathematically
 * crack the top spots" check: each player's raw per-game UPS Points list this year (qualifying
 * days only — see `getQualifyingDates`), who's paid, and the two Options settings both need.
 */
async function getStandingsRawData(
  eventId: number, year: number
): Promise<{
  pointsByPlayer: Map<number, { name: string; points: number[] }>;
  paidSet: Set<number>;
  numScores: number;
  numPlayers: number;
}> {
  const options = await getEventOptions(eventId);
  const numScores = parseInt(options.ups_numscores, 10) || 0;
  const numPlayers = parseInt(options.ups_numplayers, 10) || 0;

  const qualifyingDates = await getQualifyingDates(eventId, year);

  const pointsByPlayer = new Map<number, { name: string; points: number[] }>();
  for (const date of qualifyingDates) {
    const [games] = await pool.query<any[]>('SELECT GameID FROM Game WHERE GroupID = ? AND GameDate = ?', [eventId, date]);
    if (games.length === 0) continue;

    const gamePoints = await getUpsPointsForGame(games[0].GameID);
    for (const p of gamePoints) {
      if (!pointsByPlayer.has(p.playerId)) pointsByPlayer.set(p.playerId, { name: p.name, points: [] });
      pointsByPlayer.get(p.playerId)!.points.push(p.points);
    }
  }

  const [paidRows] = await pool.query<any[]>(
    'SELECT PlayerID FROM UpsCupPaid WHERE EventID = ? AND Year = ?',
    [eventId, year]
  );
  const paidSet = new Set(paidRows.map((r) => r.PlayerID));

  return { pointsByPlayer, paidSet, numScores, numPlayers };
}

/** Averages the lowest `numScores` of a sorted points list (or all of them if there aren't
 * `numScores` yet), rounded to 2 decimals — the shared "UPS Cup average" formula. */
function averageOf(sortedPoints: number[], numScores: number): number {
  const taken = sortedPoints.length >= numScores ? sortedPoints.slice(0, numScores) : sortedPoints;
  const avg = taken.reduce((sum, v) => sum + v, 0) / taken.length;
  return Math.round(avg * 100) / 100;
}

/**
 * Current UPS Cup standings for a year: each player's average of their lowest "Number of
 * Scores Taken Into Consideration" (Options screen) UPS Points across qualifying ('event'/
 * 'major', not 'upscup'/'note') games played this year — the golf-style lower-is-better
 * average used to rank the field. Someone who hasn't yet played that many qualifying games
 * gets averaged over however many they *have* played instead, flagged via `metRequirement:
 * false` (mirrors the Major Winners "has not met minimum requirement" treatment) rather than
 * being excluded outright. Returns everyone (paid or not) in one average-sorted list; the
 * caller decides whether to display unpaid players (e.g. an opt-in "Show unpaid players"
 * toggle) since they can never actually qualify.
 */
export async function getCurrentStandings(eventId: number, year: number): Promise<StandingsRow[]> {
  const { pointsByPlayer, paidSet, numScores, numPlayers } = await getStandingsRawData(eventId, year);
  if (numScores <= 0) return [];

  const results: StandingsRow[] = [];
  for (const [playerId, { name, points }] of pointsByPlayer) {
    const sorted = [...points].sort((a, b) => a - b);
    results.push({
      playerId, name, played: sorted.length,
      average: averageOf(sorted, numScores), metRequirement: sorted.length >= numScores, qualifies: false,
      paid: paidSet.has(playerId),
    });
  }

  results.sort((a, b) => a.average - b.average);

  // Top N averages qualify (Number of Players That Make the UPS Cup) — anyone tied with the
  // Nth-place average also qualifies, so the cutoff can admit more than N players on a tie.
  // Only paid players are eligible for a spot, so the cutoff is computed among just them.
  const paidResults = results.filter((r) => r.paid);
  if (numPlayers > 0 && paidResults.length > 0) {
    const cutoffAverage = paidResults[Math.min(numPlayers, paidResults.length) - 1].average;
    for (const r of results) {
      if (r.paid) r.qualifies = r.average <= cutoffAverage;
    }
  }

  return results;
}

/** A player who's paid their UPS Cup entry for a given year. */
export interface PaidPlayer {
  playerId: number;
  name: string;
}

export async function getPaidPlayers(eventId: number, year: number): Promise<PaidPlayer[]> {
  const [rows] = await pool.query<any[]>(
    `SELECT pp.PlayerID, CONCAT(p.LastName, ', ', p.FirstName) AS name
     FROM UpsCupPaid pp
     INNER JOIN Player p ON p.PlayerID = pp.PlayerID
     WHERE pp.EventID = ? AND pp.Year = ?
     ORDER BY p.LastName, p.FirstName`,
    [eventId, year]
  );
  return rows.map((r) => ({ playerId: r.PlayerID, name: r.name }));
}

export async function setPlayerPaid(eventId: number, year: number, playerId: number): Promise<void> {
  await pool.query(
    `INSERT IGNORE INTO UpsCupPaid (EventID, Year, PlayerID, LastUpdateUser) VALUES (?, ?, ?, 'app')`,
    [eventId, year, playerId]
  );
}

export async function removePlayerPaid(eventId: number, year: number, playerId: number): Promise<void> {
  await pool.query('DELETE FROM UpsCupPaid WHERE EventID = ? AND Year = ? AND PlayerID = ?', [eventId, year, playerId]);
}
