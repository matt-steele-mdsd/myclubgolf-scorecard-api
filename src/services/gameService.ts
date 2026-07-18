import pool from '../db/config';

export interface PlayerData {
  id: string;
  name: string;
  hdcp: number;
  pot: boolean;
}

export interface GameParams {
  eventId: number;
  courseId: number;
  side: string;
  players: PlayerData[];
}

/**
 * Find existing game for today or create a new one.
 */
export async function getOrCreateGame(eventId: number, courseId: number): Promise<number> {
  const [existing] = await pool.query<any[]>(
    `SELECT GameID FROM Game WHERE GroupID = ? AND CourseID = ? AND GameDate = CURRENT_DATE()`,
    [eventId, courseId]
  );

  if (existing.length > 0) {
    return existing[0].GameID;
  }

  await pool.query(
    `INSERT INTO Game (GroupID, CourseID, GameDate, LastUpdateUser) VALUES (?, ?, CURRENT_DATE(), 'app')`,
    [eventId, courseId]
  );

  const [result] = await pool.query<any[]>('SELECT LAST_INSERT_ID() AS GameID');
  return result[0].GameID;
}

/**
 * Handle pot opt-in/opt-out for a player.
 */
export async function updatePotOptOut(gameId: number, playerId: number, inPot: boolean): Promise<void> {
  if (!inPot) {
    // Opt out — insert into OptOut (ignore duplicates)
    await pool.query(
      `INSERT IGNORE INTO OptOut (GameID, PlayerID, LastUpdateUser) VALUES (?, ?, 'app')`,
      [gameId, playerId]
    );
  } else {
    // Opt in — remove from OptOut if present
    await pool.query(
      `DELETE FROM OptOut WHERE GameID = ? AND PlayerID = ?`,
      [gameId, playerId]
    );
  }
}

/**
 * Get existing scores for a player on this game with net/skins calculations.
 */
export interface HoleScore {
  hole: number;
  gross: string | null;
  par: number;
  hdcp: number;
  net: string | null;
  skins: string | null;
}

function calcNetAndSkins(
  score: number,
  playerHdcp: number,
  holePar: number,
  holeHdcp: number
): { net: number; skins: number } {
  let net = score;
  let skins = score;

  if (playerHdcp >= holeHdcp) {
    if (holePar == 3) {
      skins = score - 0.5;
    } else {
      net--;
      skins = net;
    }
  }

  if ((playerHdcp - 18) >= holeHdcp) net--;
  if ((playerHdcp - 36) >= holeHdcp) net--;

  return { net, skins };
}

export async function getPlayerScores(
  gameId: number,
  courseId: number,
  playerId: number,
  playerHdcp: number
): Promise<HoleScore[]> {
  const [rows] = await pool.query<any[]>(
    `SELECT sc.HoleID, sc.Score, cd.Par, cd.Hdcp
     FROM Score sc
     INNER JOIN CourseDetails cd ON cd.CourseID = sc.CourseID AND cd.HoleNum = sc.HoleID
     WHERE sc.GameID = ? AND sc.CourseID = ? AND sc.PlayerID = ?
     ORDER BY sc.HoleID`,
    [gameId, courseId, playerId]
  );

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

/**
 * Get course details (par and handicap per hole).
 */
export interface CourseHole {
  holeNum: number;
  par: number;
  hdcp: number;
}

export async function getCourseDetails(courseId: number): Promise<CourseHole[]> {
  const [rows] = await pool.query<any[]>(
    `SELECT HoleNum, Par, Hdcp FROM CourseDetails WHERE CourseID = ? ORDER BY HoleNum`,
    [courseId]
  );
  return rows.map((r) => ({ holeNum: r.HoleNum, par: r.Par, hdcp: r.Hdcp }));
}

/**
 * Initialize a game session — returns all data needed by the game screen.
 */
export interface GameSession {
  gameId: number;
  startingHole: number;
  courseDetails: CourseHole[];
  players: {
    id: string;
    name: string;
    hdcp: number;
    pot: boolean;
    scores: HoleScore[];
  }[];
}

export async function initializeGame(params: GameParams): Promise<GameSession> {
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
  if (params.side === '9b') startingHole = 10;

  // Load scores for each player
  const players: GameSession['players'] = [];
  for (const p of params.players) {
    if (!p.id) continue;
    const scores = await getPlayerScores(gameId, params.courseId, parseInt(p.id), p.hdcp);
    players.push({ ...p, scores });
  }

  return { gameId, startingHole, courseDetails, players };
}
