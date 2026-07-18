import express from 'express';
import cors from 'cors';
import pool from './src/db/config';
import { searchEvents, getEventById, createEvent } from './src/services/eventService';
import { initializeGame } from './src/services/gameService';
import { savePlayerScores, getPlayerScores } from './src/services/scoreService';
import { getOrCreateGame } from './src/services/gameService';
import { getLatestGameId, getLeaderboard } from './src/services/leaderboardService';

const app = express();
app.use(cors());
app.use(express.json());

// Search events endpoint
app.get('/api/events', async (req, res) => {
  try {
    const query = req.query.q as string || '';
    const events = await searchEvents(query);
    res.json(events);
  } catch (error: any) {
    console.error('Error searching events:', error.message);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

// Get single event endpoint
app.get('/api/events/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const event = await getEventById(id);
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }
    res.json(event);
  } catch (error: any) {
    console.error('Error fetching event:', error.message);
    res.status(500).json({ error: 'Failed to fetch event' });
  }
});

// Initialize a game session endpoint
app.post('/api/game/init', async (req, res) => {
  try {
    const { eventId, courseId, side, players } = req.body;

    if (!eventId || !courseId) {
      return res.status(400).json({ error: 'Event ID and Course ID are required' });
    }

    const session = await initializeGame({
      eventId: parseInt(eventId),
      courseId: parseInt(courseId),
      side: side || '18h',
      players: players || [],
    });

    res.json(session);
  } catch (error: any) {
    console.error('Error initializing game:', error.message);
    res.status(500).json({ error: 'Failed to initialize game' });
  }
});

// Get all courses endpoint
app.get('/api/courses', async (_req, res) => {
  try {
    const [rows] = await pool.query('SELECT CourseID AS id, CourseName AS name FROM Course ORDER BY CourseName');
    res.json(rows);
  } catch (error: any) {
    console.error('Error fetching courses:', error.message);
    res.status(500).json({ error: 'Failed to fetch courses' });
  }
});

// Get course details (par and handicap per hole) endpoint
app.get('/api/courses/:id/details', async (req, res) => {
  try {
    const courseId = parseInt(req.params.id);
    const [rows] = await pool.query(
      'SELECT HoleNum AS holeNum, Par AS par, Hdcp AS hdcp FROM CourseDetails WHERE CourseID = ? ORDER BY HoleNum',
      [courseId]
    );
    res.json(rows);
  } catch (error: any) {
    console.error('Error fetching course details:', error.message);
    res.status(500).json({ error: 'Failed to fetch course details' });
  }
});

// Get players for an event endpoint
app.get('/api/events/:id/players', async (req, res) => {
  try {
    const eventId = parseInt(req.params.id);
    const [rows] = await pool.query(
      `SELECT p.PlayerID AS id, p.LastName, p.FirstName 
       FROM Player p
       WHERE p.PlayerID IN (
         SELECT ep.PlayerID FROM EventPlayers ep WHERE ep.EventID = ?
       )
       ORDER BY p.LastName, p.FirstName`,
      [eventId]
    );
    res.json(rows);
  } catch (error: any) {
    console.error('Error fetching players:', error.message);
    res.status(500).json({ error: 'Failed to fetch players' });
  }
});

// Get latest handicap for a player endpoint
app.get('/api/players/:id/handicap', async (req, res) => {
  try {
    const playerId = parseInt(req.params.id);
    // Mirror the PHP query: SELECT h.Hdcp FROM Hdcp WHERE PlayerID = ? ORDER BY LastUpdateDt DESC LIMIT 1
    const [rows] = await pool.query<any[]>(
      `SELECT h.Hdcp FROM Hdcp h WHERE h.PlayerID = ? ORDER BY h.LastUpdateDt DESC LIMIT 1`,
      [playerId]
    );
    if (rows.length > 0) {
      res.json({ handicap: rows[0].Hdcp });
    } else {
      res.json({ handicap: '' });
    }
  } catch (error: any) {
    console.error('Error fetching handicap:', error.message);
    res.status(500).json({ error: 'Failed to fetch handicap' });
  }
});

// Create event endpoint
app.post('/api/events', async (req, res) => {
  try {
    const { eventName, courseName } = req.body;
    if (!eventName || !courseName) {
      return res.status(400).json({ error: 'Event name and course are required' });
    }
    const event = await createEvent({ eventName, courseName });
    res.status(201).json(event);
  } catch (error: any) {
    console.error('Error creating event:', error.message);
    res.status(500).json({ error: 'Failed to create event' });
  }
});

// Get tee times for an event endpoint
app.get('/api/events/:id/teetimes', async (req, res) => {
  try {
    const eventId = parseInt(req.params.id);
    const [rows] = await pool.query(
      `SELECT TeeDate, Time1, Time2, Time3, Time4, Time5
       FROM TeeTimes
       WHERE GroupID = ? AND TeeDate >= CURDATE()
       ORDER BY TeeDate`,
      [eventId]
    );
    res.json(rows);
  } catch (error: any) {
    console.error('Error fetching tee times:', error.message);
    res.status(500).json({ error: 'Failed to fetch tee times' });
  }
});

// Get player status for a date endpoint
app.get('/api/events/:id/status', async (req, res) => {
  try {
    const eventId = parseInt(req.params.id);
    const teeDate = req.query.teeDate as string;
    if (!teeDate) {
      return res.status(400).json({ error: 'teeDate query param required' });
    }
    const [rows] = await pool.query(
      `SELECT p.LastName, p.FirstName, ps.Status
       FROM PlayerStatus ps
       INNER JOIN Player p ON p.PlayerID = ps.PlayerID
       WHERE ps.GroupID = ? AND ps.TeeDate = ?
       ORDER BY ps.LastUpdateDt ASC`,
      [eventId, teeDate]
    );
    res.json(rows);
  } catch (error: any) {
    console.error('Error fetching player status:', error.message);
    res.status(500).json({ error: 'Failed to fetch player status' });
  }
});

// Save player In/Out status endpoint
app.post('/api/events/:id/status', async (req, res) => {
  try {
    const eventId = parseInt(req.params.id);
    const { playerId, teeDate, status } = req.body;
    if (!playerId || !teeDate || !status) {
      return res.status(400).json({ error: 'playerId, teeDate, and status are required' });
    }
    // Validate status value
    const validStatuses = ['I', 'E', 'L', 'X', 'O'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status. Must be one of: I, E, L, X, O' });
    }
    await pool.query(
      `INSERT INTO PlayerStatus (GroupID, TeeDate, PlayerID, Status)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE Status = VALUES(Status)`,
      [eventId, teeDate, playerId, status]
    );
    res.json({ message: 'Status saved' });
  } catch (error: any) {
    console.error('Error saving status:', error.message);
    res.status(500).json({ error: 'Failed to save status' });
  }
});

// Get or create game endpoint
app.post('/api/game', async (req, res) => {
  try {
    const { eventId, courseId } = req.body;
    if (!eventId || !courseId) {
      return res.status(400).json({ error: 'Event ID and course ID are required' });
    }
    
    const gameId = await getOrCreateGame(eventId, courseId);
    res.json({ gameId });
  } catch (error: any) {
    console.error('Error getting or creating game:', error.message);
    res.status(500).json({ error: 'Failed to get or create game' });
  }
});

// Save player scores endpoint
app.post('/api/scores', async (req, res) => {
  try {
    console.log('[SCORES DEBUG] === STARTING SCORE SAVE ===');
    console.log('[SCORES DEBUG] Raw body:', JSON.stringify(req.body));
    console.log('[SCORES DEBUG] gameId:', req.body.gameId);
    console.log('[SCORES DEBUG] playerId:', req.body.playerId);
    console.log('[SCORES DEBUG] scores array length:', req.body.scores?.length);
    
    const { gameId, playerId, scores } = req.body;
    if (!playerId || !scores) {
      return res.status(400).json({ error: 'Player ID and scores are required' });
    }
    
    // scores is now an array of pre-calculated entries from the frontend
    const success = await savePlayerScores(gameId, playerId, scores);
    if (success) {
      res.json({ message: 'Scores saved successfully' });
    } else {
      res.status(500).json({ error: 'Failed to save scores' });
    }
  } catch (error: any) {
    console.error('Error saving scores:', error.message);
    res.status(500).json({ error: 'Failed to save scores' });
  }
});

// Get player scores endpoint
app.get('/api/scores/:eventId/:playerId', async (req, res) => {
  try {
    const eventId = parseInt(req.params.eventId);
    const playerId = parseInt(req.params.playerId);
    
    if (!eventId || !playerId) {
      return res.status(400).json({ error: 'Event ID and player ID are required' });
    }
    
    const scores = await getPlayerScores(eventId, playerId);
    res.json(scores);
  } catch (error: any) {
    console.error('Error getting scores:', error.message);
    res.status(500).json({ error: 'Failed to get scores' });
  }
});

// Get latest game for an event endpoint
app.get('/api/events/:id/latest-game', async (req, res) => {
  try {
    const eventId = parseInt(req.params.id);
    const gameInfo = await getLatestGameId(eventId);
    if (!gameInfo) {
      return res.status(404).json({ error: 'No games found for this event' });
    }
    res.json(gameInfo);
  } catch (error: any) {
    console.error('Error fetching latest game:', error.message);
    res.status(500).json({ error: 'Failed to fetch latest game' });
  }
});

// Get leaderboard for a game endpoint
app.get('/api/games/:id/leaderboard', async (req, res) => {
  try {
    const gameId = parseInt(req.params.id);
    const scoreType = req.query.scoreType as 'G' | 'N';
    if (!scoreType || !['G', 'N'].includes(scoreType)) {
      return res.status(400).json({ error: 'scoreType query param required (G or N)' });
    }
    const rows = await getLeaderboard(gameId, scoreType);
    res.json(rows);
  } catch (error: any) {
    console.error('Error fetching leaderboard:', error.message);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'running',
    environment: process.env.NODE_ENV || 'development',
    isBeta: process.env.BETA === 'true',
    port: PORT,
    timestamp: new Date().toISOString()
  });
});

// Database connectivity test endpoint
app.get('/api/db-test', async (req, res) => {
  try {
    const [rows] = await pool.query<any[]>('SELECT VERSION() AS version');
    res.json({ status: 'connected', database: rows[0], timestamp: new Date().toISOString() });
  } catch (error: any) {
    console.error('Database connection failed:', error.message);
    res.status(503).json({ 
      status: 'disconnected', 
      error: error.message,
      host: process.env.DB_HOST || (process.env.NODE_ENV === 'production' ? '68.178.198.174' : 'localhost'),
      timestamp: new Date().toISOString() 
    });
  }
});

const PORT = parseInt(process.env.PORT || '3000', 10);
app.listen(PORT, '0.0.0.0', () => {
  const env = process.env.NODE_ENV || 'development';
  const beta = process.env.BETA === 'true' ? ' - BETA' : '';
  console.log(`API server running on http://0.0.0.0:${PORT} [${env}${beta}]`);
});
