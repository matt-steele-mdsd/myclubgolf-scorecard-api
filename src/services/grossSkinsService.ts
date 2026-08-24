import pool from '../db/config';
import { getEventOptions } from './optionsService';
import { findFollowUpHole } from './skinsService';
import { truncateMoneyValue } from '../utils/money';

/**
 * Gross Skins — a separate, optional side game from net Skins (see skinsService.ts), scoped
 * with Matt 2026-08-04:
 * - Raw gross Score decides each hole outright, with no handicap/stroke adjustment at all.
 * - Participants are players marked paid for Gross Skins that tee date (GSkinsPaid table, set via
 *   Admin -> Gross Skins Tracker) who ALSO actually have scores for the game -- a much smaller,
 *   separately-paying subset than net Skins' OptOut-based field. The Score requirement matters
 *   for the pot math specifically (getGrossSkinsTotals's numPaid): GSkinsPaid has no automatic
 *   cleanup when someone who paid later marks Out (or is otherwise removed), so a raw GSkinsPaid
 *   count alone can overstate who's actually splitting the pot (confirmed real, Matt 2026-08-23).
 * - A tied low score carries the skin to the next hole, same as net Skins, but validation is
 *   always "gross score <= par on the next hole played" -- no configurable mode, unlike net
 *   Skins' Validate Skins By option, since gross skins only ever needs this one rule.
 * - No caching layer (unlike skinsService.ts's SkinsCalcStatus) -- net Skins needed one because
 *   a full field (40+ players x 18 holes) made repeat recomputes genuinely expensive; Gross
 *   Skins' paid-only field is small enough that a fresh recompute every time is cheap.
 *
 * Results are stored in `GrossSkinsResult`, a brand-new table -- deliberately NOT the legacy
 * `GSkins` table (which already exists in the schema, referenced only by the cleanup/orphan/merge
 * services). Confirmed via direct DB inspection 2026-08-04: GSkins already holds ~270 real rows
 * from the old PHP app (LastUpdateUser = 'Web', not this app's 'App'), for games having nothing to
 * do with this new feature. Reusing it would have meant this feature's delete-then-recompute
 * (`getGrossSkinsForHole`) silently overwriting that old historical data the first time anyone
 * opened the new tab for a game that happened to share a GameID -- caught before it shipped.
 */

export interface GrossSkinsHoleRow {
  name: string;
  gross: number;
}

export interface GrossSkinsValidation {
  validated: boolean;
  holeId?: number;
  par?: number;
  score?: number;
}

export interface GrossSkinsHoleResult {
  rows: GrossSkinsHoleRow[];
  validation: GrossSkinsValidation | null;
}

/**
 * Get (and (re)validate) the gross skins winner for a single hole — mirrors skinsService.ts's
 * getSkinsForHole. Recomputes from scratch each time: clears this hole's previously stored
 * GrossSkinsResult row and re-derives it from the current scores.
 */
export async function getGrossSkinsForHole(gameId: number, holeId: number): Promise<GrossSkinsHoleResult> {
  await pool.query('DELETE FROM GrossSkinsResult WHERE GameID = ? AND HoleID = ?', [gameId, holeId]);

  const [gameRows] = await pool.query<any[]>('SELECT GroupID, GameDate FROM Game WHERE GameID = ?', [gameId]);
  if (gameRows.length === 0) return { rows: [], validation: null };
  const { GroupID: groupId, GameDate: gameDate } = gameRows[0];

  const [scoreRows] = await pool.query<any[]>(
    `SELECT p.PlayerID, CONCAT(p.LastName, ', ', p.FirstName) AS name, s.Score
     FROM Score s
     INNER JOIN Player p ON p.PlayerID = s.PlayerID
     INNER JOIN GSkinsPaid gp ON gp.GroupID = ? AND gp.TeeDate = ? AND gp.PlayerID = s.PlayerID
     WHERE s.GameID = ? AND s.HoleID = ?`,
    [groupId, gameDate, gameId, holeId]
  );

  const minGross = scoreRows.length > 0 ? Math.min(...scoreRows.map((r) => r.Score)) : null;
  const rows = scoreRows
    .filter((r) => r.Score === minGross)
    .sort((a, b) => a.name.localeCompare(b.name));

  const result: GrossSkinsHoleResult = {
    rows: rows.map((r) => ({ name: r.name, gross: r.Score })),
    validation: null,
  };

  // A skin only counts when exactly one paid player has the outright low score (no tie)
  if (rows.length === 1) {
    const winner = rows[0];
    const followUpHole = await findFollowUpHole(gameId, holeId);

    const [followUpRows] = await pool.query<any[]>(
      `SELECT s.Score, cd.Par
       FROM Score s
       INNER JOIN CourseDetails cd ON cd.CourseID = s.CourseID AND cd.HoleNum = s.HoleID
       WHERE s.GameID = ? AND s.PlayerID = ? AND s.HoleID = ?`,
      [gameId, winner.PlayerID, followUpHole]
    );

    // If the follow-up hole hasn't been scored yet, leave the skin unvalidated for now
    if (followUpRows.length > 0) {
      const followUp = followUpRows[0];
      const validated = followUp.Score <= followUp.Par;

      await pool.query(
        `INSERT INTO GrossSkinsResult (GroupID, GameID, HoleID, PlayerID, Score, Validated, LastUpdateUser)
         VALUES (?, ?, ?, ?, ?, ?, 'App')
         ON DUPLICATE KEY UPDATE
           PlayerID = VALUES(PlayerID),
           Score = VALUES(Score),
           Validated = VALUES(Validated)`,
        [groupId, gameId, holeId, winner.PlayerID, winner.Score, validated ? 'T' : 'F']
      );

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
export async function recalculateAllGrossSkins(gameId: number, scoredHoles: number[]): Promise<void> {
  const results = await Promise.allSettled(
    scoredHoles.map((holeId) =>
      getGrossSkinsForHole(gameId, holeId).catch((error) => {
        console.error(`Error recalculating gross skins for GameID ${gameId}, HoleID ${holeId}:`, error);
        throw error;
      })
    )
  );
  const failedHoles = results
    .map((r, i) => (r.status === 'rejected' ? scoredHoles[i] : null))
    .filter((h): h is number => h !== null);
  if (failedHoles.length > 0) {
    console.error(`Gross skins recalculation failed for GameID ${gameId}, holes: ${failedHoles.join(', ')}`);
  }
}

export interface GrossSkinsTotalsHole {
  holeId: number;
  validated: boolean;
}

export interface GrossSkinsTotalsRow {
  name: string;
  skins: number;
  holes: GrossSkinsTotalsHole[];
  payout: number | null;
}

export interface GrossSkinsTotals {
  perSkin: number;
  rows: GrossSkinsTotalsRow[];
}

/**
 * Get the gross skins totals summary (skin count, which holes, and payout per player) for a
 * game — mirrors skinsService.ts's getSkinsTotals. The pot is Gross Skins' own pay-in amount
 * times however many players are marked paid for it that tee date (not the whole field), split
 * evenly across however many gross skins were validated.
 */
export async function getGrossSkinsTotals(gameId: number): Promise<GrossSkinsTotals> {
  const [gameRows] = await pool.query<any[]>('SELECT GroupID, GameDate FROM Game WHERE GameID = ?', [gameId]);
  if (gameRows.length === 0) return { perSkin: 0, rows: [] };
  const { GroupID: groupId, GameDate: gameDate } = gameRows[0];

  const [countRows] = await pool.query<any[]>(
    // numPaid requires an actual Score row for THIS game, not just a GSkinsPaid row -- a player
    // who paid then marked Out (or was otherwise removed) still has their GSkinsPaid row sitting
    // around (nothing clears it automatically), but they didn't actually play, so they shouldn't
    // count toward the pot split. Mirrors how the regular Skins/hole-in-one pot counts (Score
    // JOIN, not just OptOut/registration) -- confirmed real, Matt 2026-08-23: Cron Sunday showed
    // 11 paid when only 9 people actually played.
    `SELECT (SELECT COUNT(DISTINCT gp.PlayerID) FROM GSkinsPaid gp
             INNER JOIN Score s ON s.PlayerID = gp.PlayerID AND s.GameID = ?
             WHERE gp.GroupID = ? AND gp.TeeDate = ?) AS numPaid,
            (SELECT COUNT(*) FROM GrossSkinsResult WHERE GameID = ? AND Validated = 'T') AS numSkins`,
    [gameId, groupId, gameDate, gameId]
  );

  const options = await getEventOptions(groupId);
  const payIn = options?.gross_skins_payin ? Number(options.gross_skins_payin) : 0;

  const numPaid = countRows[0].numPaid;
  const numSkins = countRows[0].numSkins;
  const perSkin = numSkins > 0 ? (numPaid * payIn) / numSkins : 0;

  const [rows] = await pool.query<any[]>(
    `SELECT p.PlayerID, p.LastName, p.FirstName, gs.HoleID, gs.Validated
     FROM GrossSkinsResult gs
     INNER JOIN Player p ON p.PlayerID = gs.PlayerID
     WHERE gs.GameID = ?
     ORDER BY gs.HoleID, p.LastName, p.FirstName`,
    [gameId]
  );

  const byPlayer = new Map<string, GrossSkinsTotalsRow>();
  for (const r of rows) {
    const name = `${r.LastName}, ${r.FirstName}`;
    if (!byPlayer.has(name)) {
      byPlayer.set(name, { name, skins: 0, holes: [], payout: null });
    }
    const row = byPlayer.get(name)!;
    const validated = r.Validated === 'T';
    row.holes.push({ holeId: r.HoleID, validated });
    if (validated) row.skins += 1;
  }

  return {
    perSkin,
    // Truncated, not rounded -- never pay out more than the pot actually collected.
    rows: Array.from(byPlayer.values()).map((row) => ({
      ...row,
      payout: perSkin > 0 ? truncateMoneyValue(row.skins * perSkin) : null,
    })),
  };
}
