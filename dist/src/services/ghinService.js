"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getNaughtyList = getNaughtyList;
exports.recheckLatePosting = recheckLatePosting;
exports.getGhinPlayerList = getGhinPlayerList;
exports.setPlayerGhinSkip = setPlayerGhinSkip;
exports.getGhinSummary = getGhinSummary;
exports.getGhinBearerToken = getGhinBearerToken;
exports.searchGhinGolfers = searchGhinGolfers;
exports.linkPlayerGhin = linkPlayerGhin;
exports.getPlayerOwnRounds = getPlayerOwnRounds;
exports.searchGhinWithHistoryFallback = searchGhinWithHistoryFallback;
exports.findEasyGhinLinks = findEasyGhinLinks;
exports.getGhinYears = getGhinYears;
exports.refreshGhinIndexes = refreshGhinIndexes;
exports.searchGhinCourses = searchGhinCourses;
exports.getGhinCourseDetail = getGhinCourseDetail;
exports.getPlayerCourseHandicaps = getPlayerCourseHandicaps;
const config_1 = __importDefault(require("../db/config"));
const courseService_1 = require("./courseService");
/**
 * GHIN posting compliance for a game: every player with a registered GHIN number,
 * their gross/net score, and what they actually posted to GHIN (0/0 if they never
 * posted). Mirrors posted_scores.php, which naughty.php calls via AJAX, except sorted
 * by Net instead of Gross.
 */
async function getNaughtyList(gameId) {
    const [rows] = await config_1.default.query(`SELECT p.PlayerID, CONCAT(p.LastName, ',', p.FirstName) AS name, p.GHIN,
            SUM(sc.Score) AS gross, SUM(sc.NetScore) AS net,
            COALESCE(pg.PostedScore, 0) AS postedScore, COALESCE(pg.PostedID, 0) AS postedId
     FROM Score sc
     INNER JOIN Player p ON p.PlayerID = sc.PlayerID
     LEFT JOIN PostedGHIN pg ON pg.PlayerID = sc.PlayerID AND pg.GameID = sc.GameID
     WHERE sc.GameID = ? AND p.GHIN IS NOT NULL AND p.GHIN != 0
     GROUP BY sc.PlayerID
     ORDER BY net ASC, p.LastName, p.FirstName`, [gameId]);
    return rows.map((r) => ({
        playerId: r.PlayerID,
        name: r.name,
        ghin: r.GHIN,
        // SUM() comes back as a string via mysql2 — coerce so mismatch comparisons work.
        gross: Number(r.gross),
        net: Number(r.net),
        postedScore: r.postedScore,
        postedId: r.postedId,
    }));
}
/**
 * Manually re-check GHIN for one "not posted" Naughty List row, widening the window from the
 * cron scripts' exact game date to the game date plus the following 7 days, and matching on
 * the round's exact gross score rather than just "first score found that day". Catches players
 * who post to GHIN a day or more after actually playing (confirmed real case: PJ Weiss played
 * the 7/5/2026 Cron game but posted it under 7/7/2026 — posted_ghin.py/posted_ghin_live.py's
 * exact-date search never finds this, and once posted_ghin.py's daily sweep has already
 * recorded a "not posted" pass for that GameID+PlayerID, it never rechecks on its own). Widening
 * the date range alone isn't enough since a player can post multiple real rounds within a week
 * (confirmed: PJ had two scores at the same course on the same later date, only one matching
 * gross) — the exact-gross filter is what picks the right one out.
 */
async function recheckLatePosting(gameId, playerId) {
    const [rows] = await config_1.default.query(`SELECT p.GHIN, SUM(sc.Score) AS gross, SUM(sc.NetScore) AS net, g.GameDate
     FROM Score sc
     INNER JOIN Player p ON p.PlayerID = sc.PlayerID
     INNER JOIN Game g ON g.GameID = sc.GameID
     WHERE sc.GameID = ? AND sc.PlayerID = ?
     GROUP BY sc.PlayerID`, [gameId, playerId]);
    const row = rows[0];
    if (!row || !row.GHIN)
        return { found: false };
    const ghin = row.GHIN;
    const gross = Number(row.gross);
    const net = Number(row.net);
    const gameDate = new Date(row.GameDate);
    const fromStr = gameDate.toISOString().slice(0, 10);
    const toStr = new Date(gameDate.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const token = await getGhinBearerToken();
    const url = `https://ghin-apiproxy.usga.org/api/v1/scores/search.json?format=json&golfer_id=${ghin}&from_date_played=${fromStr}&to_date_played=${toStr}&per_page=20&page=1&include_9_holes=true`;
    const response = await fetch(url, {
        headers: { 'Content-Type': 'application/json; charset=utf-8', Accept: 'application/json', Authorization: `Bearer ${token}` },
    });
    if (!response.ok)
        return { found: false };
    const data = (await response.json());
    const scores = data.Scores ?? [];
    const match = scores.find((s) => Number(s.adjusted_gross_score) === gross);
    if (!match)
        return { found: false };
    const postedScore = Number(match.adjusted_gross_score);
    const [existing] = await config_1.default.query('SELECT 1 FROM PostedGHIN WHERE PlayerID = ? AND GameID = ?', [
        playerId,
        gameId,
    ]);
    if (existing.length > 0) {
        await config_1.default.query('UPDATE PostedGHIN SET PostedID = ?, PostedScore = ?, UpdateDt = CURRENT_DATE(), UpdatedBy = ? WHERE PlayerID = ? AND GameID = ?', [match.id, postedScore, 'manual-recheck', playerId, gameId]);
    }
    else {
        await config_1.default.query(`INSERT INTO PostedGHIN (PlayerID, GameID, GHIN, Score, NetScore, PostedID, PostedScore, UpdateDt, UpdatedBy)
       VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_DATE(), ?)`, [playerId, gameId, ghin, gross, net, match.id, postedScore, 'manual-recheck']);
    }
    return { found: true, postedScore };
}
/**
 * Every player linked to this event, eligible for GHIN linking — mirrors
 * ghin_playerlist.php. Guest placeholder rows (name contains "Guest") are excluded,
 * matching the original query.
 */
async function getGhinPlayerList(eventId) {
    const [rows] = await config_1.default.query(`SELECT PlayerID, CONCAT(LastName, ',', FirstName) AS name, GHIN, SkipGhin
     FROM Player
     WHERE PlayerID IN (SELECT PlayerID FROM EventPlayers WHERE EventID = ?)
     AND IsGuest = 0
     AND FirstName NOT LIKE '%Guest%' AND LastName NOT LIKE '%Guest%'
     ORDER BY LastName, FirstName`, [eventId]);
    return rows.map((r) => ({
        playerId: r.PlayerID,
        name: r.name,
        ghin: r.GHIN,
        skipped: !!r.SkipGhin,
    }));
}
/** Skip (or un-skip) a player from the GHIN-linking flow — see `GhinPlayerRow.skipped`. */
async function setPlayerGhinSkip(playerId, skip) {
    await config_1.default.query('UPDATE Player SET SkipGhin = ? WHERE PlayerID = ?', [skip ? 1 : 0, playerId]);
}
/**
 * GHIN posting record per player for a given year (by the round's GameDate, not the
 * PostedGHIN row's UpdateDt), scoped to rounds played within this event — mirrors
 * ghin_summary.php, except the original totals a player's postings across every event
 * and year they've ever played, not just this one and this year.
 * Only players with at least one PostedGHIN row that year appear. `perfect` (no DNPs,
 * no mismatches) mirrors the original's green row highlight.
 */
async function getGhinSummary(eventId, year) {
    const [rows] = await config_1.default.query(`SELECT p.PlayerID, CONCAT(p.LastName, ',', p.FirstName) AS name,
            SUM(CASE WHEN pg.PostedID IS NULL OR pg.PostedID = 0 THEN 1 ELSE 0 END) AS dnp,
            SUM(CASE WHEN pg.PostedID IS NOT NULL AND pg.PostedID != 0 AND pg.PostedScore = pg.Score THEN 1 ELSE 0 END) AS matchCount,
            SUM(CASE WHEN pg.PostedID IS NOT NULL AND pg.PostedID != 0 AND pg.PostedScore > pg.Score THEN 1 ELSE 0 END) AS higher,
            SUM(CASE WHEN pg.PostedID IS NOT NULL AND pg.PostedID != 0 AND pg.PostedScore < pg.Score THEN 1 ELSE 0 END) AS lower
     FROM PostedGHIN pg
     INNER JOIN Player p ON p.PlayerID = pg.PlayerID
     INNER JOIN Game g ON g.GameID = pg.GameID
     WHERE p.PlayerID IN (SELECT PlayerID FROM EventPlayers WHERE EventID = ?)
     AND p.FirstName NOT LIKE '%Guest%' AND p.LastName NOT LIKE '%Guest%'
     AND g.GroupID = ?
     AND YEAR(g.GameDate) = ?
     GROUP BY pg.PlayerID
     ORDER BY p.LastName, p.FirstName`, [eventId, eventId, year]);
    return rows.map((r) => {
        const dnp = Number(r.dnp);
        const higher = Number(r.higher);
        const lower = Number(r.lower);
        return {
            playerId: r.PlayerID,
            name: r.name,
            match: Number(r.matchCount),
            dnp,
            higher,
            lower,
            perfect: dnp === 0 && higher === 0 && lower === 0,
        };
    });
}
// The site's own GHIN.com login, used only to authenticate to the GHIN Network API on golfers'
// behalf — mirrors search_ghin.php, which hardcodes the same account the same way.
const GHIN_LOGIN_NUMBER = '4240722';
const GHIN_LOGIN_PASSWORD = 'Ohiostate1';
async function getGhinBearerToken() {
    const response = await fetch('https://ghin-apiproxy.usga.org/api/v1/golfer_login.json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8', Accept: 'application/json' },
        body: JSON.stringify({
            user: { email_or_ghin: GHIN_LOGIN_NUMBER, password: GHIN_LOGIN_PASSWORD, remember_me: 'true' },
            token: 'nonblank',
        }),
    });
    const data = (await response.json());
    return data.golfer_user.golfer_user_token;
}
/**
 * Search the real GHIN Network for golfers by name (and optionally state) — mirrors
 * search_ghin.php, which is what link_ghin.php calls to find a player's real GHIN number
 * before linking it. Requires logging into the GHIN API with the site's own GHIN account
 * first to get a bearer token, then searching on the golfer's behalf.
 *
 * GHIN's search requires either a `state` or a `country` (confirmed: a blank state returns a
 * 400 "last_name and state... are not present" error) — so a blank/falsy `state` here searches
 * `country=USA` instead, covering every state in one request rather than looping through all 50.
 * This also catches golfers whose own `state` field is blank/null in GHIN's data despite playing
 * at one of our courses (confirmed against real players), so it's strictly more complete than a
 * single-state search. `country=USA` triples up every result for some reason, so exact-duplicate
 * entries (same GHIN *and* same club) are deduped — but a golfer can legitimately show up more
 * than once under the *same* GHIN with *different* clubs (a primary/secondary club affiliation;
 * confirmed against real players), so dedup is keyed on ghin+club, not ghin alone, to avoid
 * silently discarding a club affiliation `pickEasyMatch` needs to see.
 */
async function searchGhinGolfers(firstName, lastName, state, token) {
    const authToken = token ?? (await getGhinBearerToken());
    const locationParam = state ? `state=${encodeURIComponent(state)}` : 'country=USA';
    // api2.ghin.com (what ghin.com's own site/app calls) matches first_name as a PREFIX
    // (first_name=R finds "Richard"), unlike ghin-apiproxy.usga.org's golfers/search.json which
    // requires an exact first-name match and silently misses nicknames/initials. Same bearer
    // token and response shape as the old endpoint, so only the URL changed.
    const url = `https://api2.ghin.com/api/v1/golfers.json?status=Active&from_ghin=true&per_page=50&sorting_criteria=full_name&order=asc&page=1&source=GHINcom&last_name=${encodeURIComponent(lastName)}&first_name=${encodeURIComponent(firstName)}&${locationParam}`;
    const response = await fetch(url, {
        headers: { 'Content-Type': 'application/json; charset=utf-8', Accept: 'application/json', Authorization: `Bearer ${authToken}` },
    });
    if (!response.ok)
        return [];
    const data = (await response.json());
    const golfers = data.golfers ?? [];
    const seenKeys = new Set();
    const results = [];
    for (const g of golfers) {
        const ghin = Number(g.ghin);
        const key = `${ghin}|${g.club_name}`;
        if (seenKeys.has(key))
            continue;
        seenKeys.add(key);
        results.push({
            name: `${g.first_name} ${g.last_name}`,
            club: g.club_name,
            state: g.state,
            handicapIndex: g.handicap_index,
            status: g.status,
            ghin,
        });
    }
    return results;
}
/** Link a player to a real GHIN number found via `searchGhinGolfers` — mirrors save_ghin.php —
 * and immediately pull their current index in too, otherwise a freshly-linked player's index
 * would sit blank/stale until the next app-launch refresh (see `refreshGhinIndexes`). The link
 * itself still succeeds even if this lookup fails (e.g. GHIN's API is briefly down); it just
 * falls back to the normal refresh, or Start Game's own live-fallback path. */
async function linkPlayerGhin(playerId, ghin) {
    await config_1.default.query('UPDATE Player SET GHIN = ? WHERE PlayerID = ?', [ghin, playerId]);
    try {
        const token = await getGhinBearerToken();
        const index = await getGolferIndex(ghin, token);
        if (index !== null) {
            await config_1.default.query('UPDATE Player SET GHINIndex = ?, GHINIndexUpdatedDt = CURDATE() WHERE PlayerID = ?', [index, playerId]);
        }
    }
    catch (error) {
        console.error(`Error syncing index for newly-linked GHIN ${ghin} (player ${playerId}):`, error.message);
    }
}
function normalizeForCompare(value) {
    return (value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}
// A search is "easy" (unambiguous) only if we can confirm the match actually belongs to our own
// course — a name search runs nationwide, so a single result is not by itself safe: it just means
// no one else in the country shares that name, not that this particular golfer is ours (e.g. a
// "Joey Ball" whose only GHIN hit is at a Westbrook Country Club across the state is someone
// else's Joey Ball, not the one who plays at our course). `ghinClubName` (Course.GHINClubName) is
// the name GHIN itself uses for this course, e.g. "York GC" for our "York Golf Club" — confirmed
// by scanning already-linked players' real GHIN club and taking the majority. When it's on file,
// require an exact match against it, no matter how many total results came back. Only when we
// don't have a confirmed GHIN club name for this course do we fall back to the weaker heuristic
// of trusting a lone nationwide result or fuzzy-matching our own course name against GHIN's.
function pickEasyMatch(results, course, ghinClubName) {
    if (ghinClubName) {
        const normalizedTarget = normalizeForCompare(ghinClubName);
        const clubMatches = results.filter((r) => normalizeForCompare(r.club) === normalizedTarget);
        return clubMatches.length === 1 ? clubMatches[0] : null;
    }
    if (results.length === 1)
        return results[0];
    if (results.length > 1 && course) {
        const normalizedCourse = normalizeForCompare(course);
        const courseMatches = results.filter((r) => {
            const normalizedClub = normalizeForCompare(r.club);
            return normalizedClub && (normalizedClub.includes(normalizedCourse) || normalizedCourse.includes(normalizedClub));
        });
        if (courseMatches.length === 1)
            return courseMatches[0];
    }
    return null;
}
// Common English nickname/formal-name groups — GHIN's own name search is an exact match on
// first name (no prefix/fuzzy matching), so a player stored as "Matt" is invisible to GHIN if
// their real GHIN account is registered as "Matthew" (confirmed 2026-07-07 against real players:
// "Matt Napoleon" only turns up searching "Matthew", "Dave Meikrantz" only under "David"). Being
// generous here is safe even for loosely-related groupings (e.g. "Jack"/"John") because a wrong
// person would also need to share the exact last name AND be confirmed against the course's own
// GHINClubName in `pickEasyMatch` — the club check is what actually prevents false links, not
// how narrow this list is.
const NICKNAME_GROUPS = [
    ['matt', 'matthew'],
    ['mike', 'michael', 'mikey'],
    ['dave', 'david', 'davey'],
    ['tom', 'thomas', 'tommy'],
    ['jim', 'james', 'jimmy'],
    ['bill', 'william', 'billy', 'will', 'willy'],
    ['bob', 'robert', 'bobby', 'rob', 'robbie'],
    ['rick', 'richard', 'ricky', 'dick'],
    ['nick', 'nicholas', 'nicky'],
    ['chris', 'christopher'],
    ['steve', 'steven', 'stephen'],
    ['dan', 'daniel', 'danny'],
    ['ken', 'kenneth', 'kenny'],
    ['greg', 'gregory'],
    ['jeff', 'jeffrey'],
    ['joe', 'joseph', 'joey'],
    ['ed', 'edward', 'eddie', 'ted', 'teddy'],
    ['andy', 'andrew', 'drew'],
    ['al', 'albert', 'alan', 'allen'],
    ['alex', 'alexander'],
    ['sam', 'samuel', 'sammy'],
    ['pat', 'patrick'],
    ['frank', 'francis', 'franklin'],
    ['ron', 'ronald', 'ronnie'],
    ['larry', 'lawrence'],
    ['ben', 'benjamin', 'benny'],
    ['charlie', 'charles', 'chuck'],
    ['tony', 'anthony'],
    ['vince', 'vincent'],
    ['phil', 'philip'],
    ['zach', 'zachary', 'zack'],
    ['nate', 'nathan', 'nathaniel'],
    ['josh', 'joshua'],
    ['jon', 'jonathan', 'johnny'],
    ['tim', 'timothy', 'timmy'],
    ['wes', 'wesley'],
    ['doug', 'douglas'],
    ['russ', 'russell'],
    ['stan', 'stanley'],
    ['walt', 'walter'],
    ['fred', 'frederick', 'freddy'],
    ['gene', 'eugene'],
    ['marty', 'martin'],
    ['pete', 'peter'],
    ['art', 'arthur'],
    ['curt', 'curtis'],
    ['don', 'donald', 'donnie'],
    ['gabe', 'gabriel'],
    ['hank', 'henry'],
    ['harry', 'harold'],
    ['jack', 'john', 'jackson'],
    ['jerry', 'gerald', 'jeremy'],
    ['lenny', 'leonard'],
    ['lou', 'louis', 'lewis'],
    ['marv', 'marvin'],
    ['max', 'maxwell'],
    ['randy', 'randall'],
    ['ray', 'raymond'],
    ['stu', 'stuart'],
    ['ty', 'tyler'],
    ['vic', 'victor'],
];
const NICKNAME_VARIANTS = new Map();
for (const group of NICKNAME_GROUPS) {
    for (const name of group) {
        const variants = group.filter((n) => n !== name);
        const existing = NICKNAME_VARIANTS.get(name) || [];
        NICKNAME_VARIANTS.set(name, [...new Set([...existing, ...variants])]);
    }
}
function firstNameVariants(firstName) {
    return NICKNAME_VARIANTS.get(firstName.trim().toLowerCase()) || [];
}
// Searches every name variant (stored first name + nicknames) against GHIN and merges the
// results, deduped by ghin+club (see `searchGhinGolfers` for why club matters in the key).
async function searchAllNameVariants(firstName, lastName, state, token) {
    const namesToTry = [firstName, ...firstNameVariants(firstName)];
    const seenKeys = new Set();
    const merged = [];
    for (const name of namesToTry) {
        const results = await searchGhinGolfers(name, lastName, state, token);
        for (const result of results) {
            const key = `${result.ghin}|${result.club}`;
            if (!seenKeys.has(key)) {
                seenKeys.add(key);
                merged.push(result);
            }
        }
    }
    return merged;
}
// Fetches this GHIN's entire score history (no date filter — we don't know which of their
// rounds, if any, were at our course ahead of time) and returns only the entries posted at our
// own course, regardless of what club GHIN has on file for them.
async function getScoresAtCourse(ghin, courseName, token) {
    const url = `https://ghin-apiproxy.usga.org/api/v1/scores.json?golfer_id=${ghin}`;
    const response = await fetch(url, {
        headers: { 'Content-Type': 'application/json; charset=utf-8', Accept: 'application/json', Authorization: `Bearer ${token}` },
    });
    if (!response.ok)
        return [];
    const data = (await response.json());
    const scores = data.scores ?? [];
    const normalizedCourse = normalizeForCompare(courseName);
    return scores
        .filter((s) => normalizeForCompare(s.course_name || s.facility_name || '') === normalizedCourse)
        .map((s) => ({ playedAt: s.played_at, gross: Number(s.adjusted_gross_score) }));
}
/**
 * Every round we have on file for this player (any game, any course) — mirrors the shape needed
 * to cross-check against `CourseScoreEntry` from GHIN. Not scoped to a specific course since a
 * match against GHIN's own course-filtered history already implies it happened at our course.
 */
async function getPlayerOwnRounds(playerId) {
    const [rows] = await config_1.default.query(`SELECT g.GameDate, SUM(s.Score) as gross
     FROM Score s
     INNER JOIN Game g ON g.GameID = s.GameID
     WHERE s.PlayerID = ?
     GROUP BY s.GameID`, [playerId]);
    return rows.map((r) => ({ date: new Date(r.GameDate).toISOString().slice(0, 10), gross: Number(r.gross) }));
}
// Does any of this GHIN's rounds at our course exactly match one of our own recorded rounds for
// this player (same date, same gross score)? A much stronger signal than "has posted here at
// some point" — used to break a tie when more than one nationwide candidate has played our course.
function matchesOwnRounds(courseScores, ownRounds) {
    return courseScores.some((cs) => ownRounds.some((own) => own.date === cs.playedAt && own.gross === cs.gross));
}
/**
 * Manual "Link GHIN" search (ghinplayerlist.tsx) — same idea as `findEasyGhinLinks`'s two passes,
 * but for a single admin-driven search rather than an auto-picked batch match, so every result is
 * shown for a human to review rather than requiring an unambiguous single hit. Runs the normal
 * name/state search, then also checks nationwide for anyone (not already found) who has actually
 * posted a round at our course before — those get appended with `postedAtCourse: true` so the
 * admin can spot a real match even when their GHIN club affiliation is stale or from elsewhere.
 * Skipped entirely if no `course` is given (keeps existing callers unaffected).
 */
async function searchGhinWithHistoryFallback(firstName, lastName, state, course) {
    const token = await getGhinBearerToken();
    const stateResults = await searchGhinGolfers(firstName, lastName, state, token);
    if (!course)
        return stateResults;
    const nationwideResults = await searchGhinGolfers(firstName, lastName, '', token);
    const alreadyFound = new Set(stateResults.map((r) => `${r.ghin}|${r.club}`));
    const remainingGhins = new Map();
    for (const result of nationwideResults) {
        if (!alreadyFound.has(`${result.ghin}|${result.club}`) && !remainingGhins.has(result.ghin)) {
            remainingGhins.set(result.ghin, result);
        }
    }
    const historyMatches = [];
    for (const [ghin, result] of remainingGhins) {
        const courseScores = await getScoresAtCourse(ghin, course, token);
        if (courseScores.length > 0) {
            historyMatches.push({ ...result, postedAtCourse: true });
        }
    }
    return [...stateResults, ...historyMatches];
}
function toEasyLinkCandidate(row, match, matchedVia) {
    return {
        playerId: row.PlayerID,
        name: `${row.LastName},${row.FirstName}`,
        ghin: match.ghin,
        club: match.club,
        state: match.state,
        handicapIndex: match.handicapIndex,
        status: match.status,
        matchedVia,
    };
}
/**
 * Finds GHIN Network matches for every player linked to this event who has no GHIN on file and
 * isn't a guest — one bearer token is fetched up front and reused across all searches so a batch
 * of players doesn't re-login to the GHIN API once per player. Two passes, both trying common
 * nickname variants of the player's first name (see `NICKNAME_GROUPS`) since GHIN's name search
 * is an exact match, not fuzzy:
 *
 * Pass 1 (narrow, default): search scoped to the course's own state only, matched via
 * `pickEasyMatch`'s exact `GHINClubName` check. Deliberately never searches nationwide here —
 * a same-name golfer in a different state is very plausibly a different real person, and
 * auto-linking on name alone across state lines isn't safe.
 *
 * Pass 2 (fallback, only for players pass 1 couldn't resolve): broadens to a nationwide search,
 * but instead of trusting GHIN's club-affiliation text (which pass 1 relies on, and which can be
 * stale/blank), only accepts a nationwide candidate if that specific GHIN number has actually
 * posted a round at our own course before (`getScoresAtCourse`) — real playing history at our
 * course is a much stronger signal than a name match alone. If exactly one nationwide candidate
 * clears that bar, that's the match. If *more than one* does (e.g. two different real people who
 * both happen to be named "Andrew Lewis" and both play here), narrows further by checking for an
 * exact date+gross-score match against our own recorded rounds for this player
 * (`getPlayerOwnRounds`/`matchesOwnRounds`) — confirmed against a real ambiguous case 2026-07,
 * see [[ghin_easy_link_matching]].
 */
async function findEasyGhinLinks(eventId) {
    const [rows] = await config_1.default.query(`SELECT p.PlayerID, p.FirstName, p.LastName, p.Course, c.GHINClubName, c.CourseState
     FROM Player p
     LEFT JOIN Course c ON c.CourseName = p.Course
     WHERE p.PlayerID IN (SELECT PlayerID FROM EventPlayers WHERE EventID = ?)
     AND p.IsGuest = 0
     AND (p.GHIN IS NULL OR p.GHIN = 0)
     AND p.SkipGhin = 0
     ORDER BY p.LastName, p.FirstName`, [eventId]);
    if (rows.length === 0)
        return [];
    const token = await getGhinBearerToken();
    const candidates = [];
    for (const row of rows) {
        const lastName = String(row.LastName).trim();
        const firstName = String(row.FirstName).trim();
        const homeState = row.CourseState || 'OH';
        const pass1Results = await searchAllNameVariants(firstName, lastName, homeState, token);
        const pass1Match = pickEasyMatch(pass1Results, row.Course, row.GHINClubName);
        if (pass1Match) {
            candidates.push(toEasyLinkCandidate(row, pass1Match, 'club'));
            continue;
        }
        // GHIN's `country=USA` search is NOT a reliable superset of a state-scoped search — confirmed
        // it can silently omit a golfer that a plain state search finds fine (real case: two "Andrew
        // Lewis, York GC" GHINs findable under state=OH vanished entirely from the country=USA
        // results for the same name). So the pass 2 candidate pool is the union of pass 1's
        // already-fetched state results plus the nationwide search, not the nationwide search alone.
        const pass2Results = await searchAllNameVariants(firstName, lastName, '', token);
        const distinctGhins = new Map();
        for (const result of [...pass1Results, ...pass2Results]) {
            if (!distinctGhins.has(result.ghin))
                distinctGhins.set(result.ghin, result);
        }
        const postedHere = [];
        for (const [ghin, result] of distinctGhins) {
            const courseScores = await getScoresAtCourse(ghin, row.Course, token);
            if (courseScores.length > 0) {
                postedHere.push({ result, courseScores });
            }
        }
        if (postedHere.length === 1) {
            candidates.push(toEasyLinkCandidate(row, postedHere[0].result, 'history'));
        }
        else if (postedHere.length > 1) {
            // More than one nationwide candidate has played our course (e.g. two different real
            // people who both happen to be named "Andrew Lewis" and both play here) — narrow down by
            // checking which one's history actually lines up with a round we have on file for this
            // specific player (exact date + gross score), not just "has played here at some point".
            const ownRounds = await getPlayerOwnRounds(row.PlayerID);
            const scoreMatches = postedHere.filter((p) => matchesOwnRounds(p.courseScores, ownRounds));
            if (scoreMatches.length === 1) {
                candidates.push(toEasyLinkCandidate(row, scoreMatches[0].result, 'score'));
            }
        }
    }
    return candidates;
}
/**
 * Distinct years (by round GameDate) that have GHIN posting data for rounds played
 * within this event, newest first — powers the Year Summary's year picker.
 */
async function getGhinYears(eventId) {
    const [rows] = await config_1.default.query(`SELECT DISTINCT YEAR(g.GameDate) AS yr
     FROM PostedGHIN pg
     INNER JOIN Game g ON g.GameID = pg.GameID
     WHERE pg.PlayerID IN (SELECT PlayerID FROM EventPlayers WHERE EventID = ?)
     AND g.GroupID = ?
     ORDER BY yr DESC`, [eventId, eventId]);
    return rows.map((r) => Number(r.yr));
}
// Exact current index by GHIN number (not inferred from score history) — the same lookup
// GHIN's own site uses, confirmed against a real player 2026-07-07 (hi_value matched their
// most recent rev_date exactly).
async function getGolferIndex(ghin, token) {
    const url = `https://ghin-apiproxy.usga.org/api/v1/golfers/search.json?golfer_id=${ghin}&per_page=1&page=1`;
    const response = await fetch(url, {
        headers: { 'Content-Type': 'application/json; charset=utf-8', Accept: 'application/json', Authorization: `Bearer ${token}` },
    });
    if (!response.ok)
        return null;
    const data = (await response.json());
    const golfer = (data.golfers ?? [])[0];
    if (!golfer)
        return null;
    const index = Number(golfer.hi_value ?? golfer.handicap_index);
    return Number.isNaN(index) ? null : index;
}
/**
 * Refresh every GHIN-linked player's cached index (`Player.GHINIndex`/`GHINIndexUpdatedDt`) —
 * ported from RyderCup's `refreshGhinHandicaps`. Meant to be called fire-and-forget on app
 * launch (see `app/_layout.tsx`) and by the nightly 4am cron (`refresh_handicaps.py` ->
 * `POST /api/ghin/refresh-indexes`), not from Start Game: the SQL filter below is what keeps
 * every visitor's app open from triggering its own round of real GHIN API calls — only players
 * not yet refreshed today are selected, and when that's nobody, this returns without ever
 * fetching a bearer token or calling GHIN at all. Built specifically to get GHIN off Start
 * Game's live path (2026-07 — pounding GHIN with a live index+teeset lookup per player click was
 * a real cause of problems during the 41-player test event).
 *
 * `force` skips the "already refreshed today" filter and re-pulls every GHIN-linked player
 * regardless — for a future manual "Refresh GHIN" admin action, same as RyderCup's.
 */
async function refreshGhinIndexes(force = false) {
    const [rows] = await config_1.default.query(force
        ? `SELECT PlayerID, GHIN FROM Player WHERE GHIN IS NOT NULL AND GHIN != 0`
        : `SELECT PlayerID, GHIN FROM Player
         WHERE GHIN IS NOT NULL AND GHIN != 0
           AND (GHINIndexUpdatedDt IS NULL OR GHINIndexUpdatedDt < CURDATE())`);
    if (rows.length === 0)
        return;
    const token = await getGhinBearerToken();
    await Promise.all(rows.map(async (r) => {
        const index = await getGolferIndex(Number(r.GHIN), token);
        if (index !== null) {
            await config_1.default.query('UPDATE Player SET GHINIndex = ?, GHINIndexUpdatedDt = CURDATE() WHERE PlayerID = ?', [index, r.PlayerID]);
        }
    }));
}
/**
 * Search GHIN's own course database (CRDB) by name, optionally narrowed to a state — powers Add
 * Course's "Search GHIN Course Database" flow, so par/handicap/yardage come from GHIN's own
 * numbers instead of an OCR scan or manual entry.
 *
 * GHIN's search silently returns zero results unless state is prefixed `US-` (e.g. `US-NC`) — a
 * bare `NC` is accepted with a 200 but matches nothing (confirmed building this for RyderCup).
 */
async function searchGhinCourses(name, state) {
    const token = await getGhinBearerToken();
    const locationParam = state ? `state=${encodeURIComponent(`US-${state.toUpperCase()}`)}` : 'country=USA';
    const url = `https://ghin-apiproxy.usga.org/api/v1/courses/search.json?name=${encodeURIComponent(name)}&per_page=25&${locationParam}`;
    const response = await fetch(url, {
        headers: { 'Content-Type': 'application/json; charset=utf-8', Accept: 'application/json', Authorization: `Bearer ${token}` },
    });
    if (!response.ok)
        return [];
    const data = (await response.json());
    const courses = data.courses ?? [];
    return courses.map((c) => ({
        courseId: c.CourseID,
        courseName: c.CourseName,
        facilityName: c.FacilityName,
        city: c.City ?? null,
        state: (c.State || '').replace(/^US-/, '') || null,
    }));
}
/**
 * Full tee-set detail for one GHIN course search result — every tee GHIN has complete 18-hole
 * data for (a handful of CRDB entries are legacy/incomplete and would otherwise show up as
 * unusable blank rows, so those are filtered out here).
 */
async function getGhinCourseDetail(courseId) {
    const token = await getGhinBearerToken();
    const url = `https://ghin-apiproxy.usga.org/api/v1/courses/${courseId}.json`;
    const response = await fetch(url, {
        headers: { 'Content-Type': 'application/json; charset=utf-8', Accept: 'application/json', Authorization: `Bearer ${token}` },
    });
    if (!response.ok)
        return null;
    const data = (await response.json());
    const teeSets = (data.TeeSets ?? [])
        .filter((t) => Array.isArray(t.Holes) && t.Holes.length === 18)
        .map((t) => {
        const totalRating = (t.Ratings ?? []).find((r) => r.RatingType === 'Total');
        return {
            teeSetId: t.TeeSetRatingId,
            teeName: t.TeeSetRatingName,
            gender: t.Gender,
            courseRating: totalRating?.CourseRating ?? null,
            slopeRating: totalRating?.SlopeRating ?? null,
            totalPar: t.TotalPar,
            totalYardage: t.TotalYardage,
            holes: [...t.Holes]
                .sort((a, b) => a.Number - b.Number)
                .map((h) => ({ holeNum: h.Number, par: h.Par, hdcp: h.Allocation, yards: h.Length })),
        };
    });
    return {
        courseId: data.CourseId,
        courseName: data.CourseName,
        facilityName: data.Facility?.FacilityName ?? data.CourseName,
        city: data.CourseCity ?? null,
        state: (data.CourseState || '').replace(/^US-/, '') || null,
        teeSets,
    };
}
/**
 * For a GHIN-linked player, their index plus a Course Handicap for every tee GHIN has on file
 * for this course that matches their gender — powers Start Game's tee picker. Returns null if
 * the player has no GHIN on file or this course has no known GHIN course id yet (falls back to
 * manual handicap entry either way). Course Handicap = index × (slope/113) + (rating − par),
 * rounded to the nearest whole number, using each tee's own par (a couple of York's tees are
 * rated at both par 71 and par 72 for the same physical tee, so par is read per tee set, not
 * assumed constant across the course).
 *
 * Both the index and the course's tee sets are read from local caches first, so this almost
 * never hits GHIN live:
 * - The index comes from `Player.GHINIndex` when `refreshGhinIndexes` already refreshed it today
 *   (the normal case — that runs fire-and-forget on app launch and via the nightly 4am cron).
 *   Falls back to a live per-player fetch (and backfills the cache) only when today's cache is
 *   missing — e.g. a player linked after this morning's refresh already ran.
 * - The tee sets come from `CourseTeeSet`/`CourseTeeHole` (cached at Add Course time, see
 *   `saveCourseTeeSets`) when this course has ever been cached. Falls back to a live
 *   `getGhinCourseDetail` fetch (and backfills the cache) for a course that predates this
 *   caching, or was added via a scan/manual entry rather than the GHIN search.
 *
 * Either fallback keeps Start Game working exactly as before for the one player/course it
 * affects — it's the *normal* case (everyone already cached) that's meant to never touch GHIN.
 */
async function getPlayerCourseHandicaps(playerId, courseId) {
    const [playerRows] = await config_1.default.query(`SELECT GHIN, Gender, GHINIndex, (GHINIndexUpdatedDt = CURDATE()) AS indexFreshToday
     FROM Player WHERE PlayerID = ?`, [playerId]);
    const player = playerRows[0];
    if (!player || !player.GHIN)
        return null;
    const [courseRows] = await config_1.default.query('SELECT GHINCourseId FROM Course WHERE CourseID = ?', [courseId]);
    const ghinCourseId = courseRows[0]?.GHINCourseId;
    if (!ghinCourseId)
        return null;
    let index = player.indexFreshToday ? Number(player.GHINIndex) : null;
    if (index === null) {
        const token = await getGhinBearerToken();
        index = await getGolferIndex(player.GHIN, token);
        if (index === null)
            return null;
        config_1.default
            .query('UPDATE Player SET GHINIndex = ?, GHINIndexUpdatedDt = CURDATE() WHERE PlayerID = ?', [index, playerId])
            .catch((e) => console.error('Failed to backfill GHIN index cache:', e.message));
    }
    let teeSets = await (0, courseService_1.getCachedCourseTeeSets)(courseId);
    if (teeSets === null) {
        const detail = await getGhinCourseDetail(Number(ghinCourseId));
        teeSets = detail?.teeSets ?? [];
        if (teeSets.length > 0) {
            (0, courseService_1.saveCourseTeeSets)(courseId, teeSets).catch((e) => console.error('Failed to cache course tee sets:', e.message));
        }
    }
    const genderName = player.Gender === 'F' ? 'Female' : 'Male';
    const matching = teeSets.filter((ts) => ts.gender === genderName && ts.courseRating !== null && ts.slopeRating !== null);
    const options = matching.map((ts) => {
        const courseHandicap = Math.round(index * (Number(ts.slopeRating) / 113) + (Number(ts.courseRating) - ts.totalPar));
        return { teeSetId: ts.teeSetId, teeName: ts.teeName, courseHandicap };
    });
    options.sort((a, b) => b.courseHandicap - a.courseHandicap);
    return { index, options };
}
