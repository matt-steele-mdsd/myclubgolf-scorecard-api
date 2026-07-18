"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const config_1 = __importDefault(require("./src/db/config"));
const eventService_1 = require("./src/services/eventService");
const gameService_1 = require("./src/services/gameService");
const scoreService_1 = require("./src/services/scoreService");
const gameService_2 = require("./src/services/gameService");
const leaderboardService_1 = require("./src/services/leaderboardService");
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// Search events endpoint
app.get('/api/events', async (req, res) => {
    try {
        const query = req.query.q || '';
        const events = await (0, eventService_1.searchEvents)(query);
        res.json(events);
    }
    catch (error) {
        console.error('Error searching events:', error.message);
        res.status(500).json({ error: 'Failed to fetch events' });
    }
});
// Get single event endpoint
app.get('/api/events/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const event = await (0, eventService_1.getEventById)(id);
        if (!event) {
            return res.status(404).json({ error: 'Event not found' });
        }
        res.json(event);
    }
    catch (error) {
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
        const session = await (0, gameService_1.initializeGame)({
            eventId: parseInt(eventId),
            courseId: parseInt(courseId),
            side: side || '18h',
            players: players || [],
        });
        res.json(session);
    }
    catch (error) {
        console.error('Error initializing game:', error.message);
        res.status(500).json({ error: 'Failed to initialize game' });
    }
});
// Get all courses endpoint
app.get('/api/courses', async (_req, res) => {
    try {
        const [rows] = await config_1.default.query('SELECT CourseID AS id, CourseName AS name FROM Course ORDER BY CourseName');
        res.json(rows);
    }
    catch (error) {
        console.error('Error fetching courses:', error.message);
        res.status(500).json({ error: 'Failed to fetch courses' });
    }
});
// Get course details (par and handicap per hole) endpoint
app.get('/api/courses/:id/details', async (req, res) => {
    try {
        const courseId = parseInt(req.params.id);
        const [rows] = await config_1.default.query('SELECT HoleNum AS holeNum, Par AS par, Hdcp AS hdcp FROM CourseDetails WHERE CourseID = ? ORDER BY HoleNum', [courseId]);
        res.json(rows);
    }
    catch (error) {
        console.error('Error fetching course details:', error.message);
        res.status(500).json({ error: 'Failed to fetch course details' });
    }
});
// Get players for an event endpoint
app.get('/api/events/:id/players', async (req, res) => {
    try {
        const eventId = parseInt(req.params.id);
        const [rows] = await config_1.default.query(`SELECT p.PlayerID AS id, p.LastName, p.FirstName 
       FROM Player p
       WHERE p.PlayerID IN (
         SELECT ep.PlayerID FROM EventPlayers ep WHERE ep.EventID = ?
       )
       ORDER BY p.LastName, p.FirstName`, [eventId]);
        res.json(rows);
    }
    catch (error) {
        console.error('Error fetching players:', error.message);
        res.status(500).json({ error: 'Failed to fetch players' });
    }
});
// Get latest handicap for a player endpoint
app.get('/api/players/:id/handicap', async (req, res) => {
    try {
        const playerId = parseInt(req.params.id);
        // Mirror the PHP query: SELECT h.Hdcp FROM Hdcp WHERE PlayerID = ? ORDER BY LastUpdateDt DESC LIMIT 1
        const [rows] = await config_1.default.query(`SELECT h.Hdcp FROM Hdcp h WHERE h.PlayerID = ? ORDER BY h.LastUpdateDt DESC LIMIT 1`, [playerId]);
        if (rows.length > 0) {
            res.json({ handicap: rows[0].Hdcp });
        }
        else {
            res.json({ handicap: '' });
        }
    }
    catch (error) {
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
        const event = await (0, eventService_1.createEvent)({ eventName, courseName });
        res.status(201).json(event);
    }
    catch (error) {
        console.error('Error creating event:', error.message);
        res.status(500).json({ error: 'Failed to create event' });
    }
});
// Get tee times for an event endpoint
app.get('/api/events/:id/teetimes', async (req, res) => {
    try {
        const eventId = parseInt(req.params.id);
        const [rows] = await config_1.default.query(`SELECT TeeDate, Time1, Time2, Time3, Time4, Time5
       FROM TeeTimes
       WHERE GroupID = ? AND TeeDate >= CURDATE()
       ORDER BY TeeDate`, [eventId]);
        res.json(rows);
    }
    catch (error) {
        console.error('Error fetching tee times:', error.message);
        res.status(500).json({ error: 'Failed to fetch tee times' });
    }
});
// Get player status for a date endpoint
app.get('/api/events/:id/status', async (req, res) => {
    try {
        const eventId = parseInt(req.params.id);
        const teeDate = req.query.teeDate;
        if (!teeDate) {
            return res.status(400).json({ error: 'teeDate query param required' });
        }
        const [rows] = await config_1.default.query(`SELECT p.LastName, p.FirstName, ps.Status
       FROM PlayerStatus ps
       INNER JOIN Player p ON p.PlayerID = ps.PlayerID
       WHERE ps.GroupID = ? AND ps.TeeDate = ?
       ORDER BY ps.LastUpdateDt ASC`, [eventId, teeDate]);
        res.json(rows);
    }
    catch (error) {
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
        await config_1.default.query(`INSERT INTO PlayerStatus (GroupID, TeeDate, PlayerID, Status)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE Status = VALUES(Status)`, [eventId, teeDate, playerId, status]);
        res.json({ message: 'Status saved' });
    }
    catch (error) {
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
        const gameId = await (0, gameService_2.getOrCreateGame)(eventId, courseId);
        res.json({ gameId });
    }
    catch (error) {
        console.error('Error getting or creating game:', error.message);
        res.status(500).json({ error: 'Failed to get or create game' });
    }
});
// Save player scores endpoint
app.post('/api/scores', async (req, res) => {
    try {
        const { gameId, playerId, scores } = req.body;
        if (!playerId || !scores) {
            return res.status(400).json({ error: 'Player ID and scores are required' });
        }
        // scores is now an array of pre-calculated entries from the frontend
        const success = await (0, scoreService_1.savePlayerScores)(gameId, playerId, scores);
        if (success) {
            res.json({ message: 'Scores saved successfully' });
        }
        else {
            res.status(500).json({ error: 'Failed to save scores' });
        }
    }
    catch (error) {
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
        const scores = await (0, scoreService_1.getPlayerScores)(eventId, playerId);
        res.json(scores);
    }
    catch (error) {
        console.error('Error getting scores:', error.message);
        res.status(500).json({ error: 'Failed to get scores' });
    }
});
// Get latest game for an event endpoint
app.get('/api/events/:id/latest-game', async (req, res) => {
    try {
        const eventId = parseInt(req.params.id);
        const gameInfo = await (0, leaderboardService_1.getLatestGameId)(eventId);
        if (!gameInfo) {
            return res.status(404).json({ error: 'No games found for this event' });
        }
        res.json(gameInfo);
    }
    catch (error) {
        console.error('Error fetching latest game:', error.message);
        res.status(500).json({ error: 'Failed to fetch latest game' });
    }
});
// Get leaderboard for a game endpoint
app.get('/api/games/:id/leaderboard', async (req, res) => {
    try {
        const gameId = parseInt(req.params.id);
        const scoreType = req.query.scoreType;
        if (!scoreType || !['G', 'N'].includes(scoreType)) {
            return res.status(400).json({ error: 'scoreType query param required (G or N)' });
        }
        const rows = await (0, leaderboardService_1.getLeaderboard)(gameId, scoreType);
        res.json(rows);
    }
    catch (error) {
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
        const [rows] = await config_1.default.query('SELECT VERSION() AS version');
        res.json({ status: 'connected', database: rows[0], timestamp: new Date().toISOString() });
    }
    catch (error) {
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
