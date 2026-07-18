"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMergeSuggestions = getMergeSuggestions;
exports.ignoreMergeSuggestion = ignoreMergeSuggestion;
const config_1 = __importDefault(require("../db/config"));
/** Standard edit distance (insert/delete/substitute) between two strings, case-sensitive —
 * callers should lowercase both inputs first. Short names only (a handful of characters), so a
 * plain O(n*m) DP table is plenty fast. */
function levenshtein(a, b) {
    const m = a.length;
    const n = b.length;
    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++)
        dp[i][0] = i;
    for (let j = 0; j <= n; j++)
        dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            dp[i][j] = a[i - 1] === b[j - 1]
                ? dp[i - 1][j - 1]
                : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
        }
    }
    return dp[m][n];
}
/**
 * Scan every player for likely duplicate identities — same first initial, and either an exact
 * last-name match (e.g. "Rob Smith"/"Robert Smith") or a small last-name edit distance (e.g.
 * "Chris Dietz"/"Chris Deitz", 1 letter transposed) — the same shape of bug documented in
 * [[data_model_gotchas]] (Corey/Cory Sickles, Dietz/Deitz). Guests are excluded — "Guest N"
 * placeholders are never real duplicate identities. Pairs already marked "not the same person"
 * via `ignoreMergeSuggestion` are excluded until un-skipped.
 */
async function getMergeSuggestions() {
    const [players] = await config_1.default.query(`SELECT p.PlayerID, p.FirstName, p.LastName, p.Course, p.GHIN,
            GROUP_CONCAT(DISTINCT e.EventName ORDER BY e.EventName SEPARATOR ', ') AS events
     FROM Player p
     LEFT JOIN EventPlayers ep ON ep.PlayerID = p.PlayerID
     LEFT JOIN Events e ON e.EventID = ep.EventID
     WHERE p.IsGuest = 0
     GROUP BY p.PlayerID
     ORDER BY p.LastName, p.FirstName`);
    const [ignoredRows] = await config_1.default.query('SELECT PlayerID1, PlayerID2 FROM MergeIgnored');
    const ignoredSet = new Set(ignoredRows.map((r) => `${r.PlayerID1}-${r.PlayerID2}`));
    const meta = (p) => `${p.Course || 'no course'} · GHIN: ${p.GHIN || 'none'} · ${p.events || 'no events'}`;
    const suggestions = [];
    for (let i = 0; i < players.length; i++) {
        for (let j = i + 1; j < players.length; j++) {
            const a = players[i];
            const b = players[j];
            const aFirst = (a.FirstName || '').trim();
            const bFirst = (b.FirstName || '').trim();
            const aLast = (a.LastName || '').trim();
            const bLast = (b.LastName || '').trim();
            if (!aFirst || !bFirst || !aLast || !bLast)
                continue;
            if (aFirst[0].toLowerCase() !== bFirst[0].toLowerCase())
                continue;
            const distance = levenshtein(aLast.toLowerCase(), bLast.toLowerCase());
            if (distance > 2)
                continue;
            const id1 = Math.min(a.PlayerID, b.PlayerID);
            const id2 = Math.max(a.PlayerID, b.PlayerID);
            if (ignoredSet.has(`${id1}-${id2}`))
                continue;
            const reason = distance === 0
                ? 'Same last name, same first initial'
                : `Possible misspelling — last names differ by ${distance} letter${distance === 1 ? '' : 's'}`;
            suggestions.push({
                key: `${id1}-${id2}`,
                player1Id: a.PlayerID,
                player1Name: `${a.LastName}, ${a.FirstName}`,
                player1Meta: meta(a),
                player2Id: b.PlayerID,
                player2Name: `${b.LastName}, ${b.FirstName}`,
                player2Meta: meta(b),
                reason,
            });
        }
    }
    return suggestions;
}
/** Mark a pair as reviewed and confirmed NOT the same person — excluded from future scans until
 * un-skipped (there's no un-skip UI yet, matching the "leave be" vs "skip" distinction: leaving a
 * suggestion alone with no action means it reappears next scan; skipping is the deliberate
 * permanent dismissal). */
async function ignoreMergeSuggestion(playerId1, playerId2) {
    const id1 = Math.min(playerId1, playerId2);
    const id2 = Math.max(playerId1, playerId2);
    await config_1.default.query(`INSERT INTO MergeIgnored (PlayerID1, PlayerID2, LastUpdateUser) VALUES (?, ?, 'App')
     ON DUPLICATE KEY UPDATE LastUpdateUser = VALUES(LastUpdateUser)`, [id1, id2]);
}
