"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCourse = createCourse;
exports.saveCourseTeeSets = saveCourseTeeSets;
exports.getCachedCourseTeeSets = getCachedCourseTeeSets;
const config_1 = __importDefault(require("../db/config"));
/**
 * Create a new course with its hole-by-hole par/handicap/yardage layout (a single tee,
 * mirroring every existing course in this database — TeeID 1).
 */
async function createCourse(courseName, holes, ghinInfo) {
    const result = await config_1.default.query('INSERT INTO Course (CourseName, CourseCity, CourseState, GHINClubName, GHINCourseId, LastUpdateUser) VALUES (?, ?, ?, ?, ?, ?)', [courseName, ghinInfo?.city ?? null, ghinInfo?.state ?? null, ghinInfo?.ghinClubName ?? null, ghinInfo ? String(ghinInfo.ghinCourseId) : null, 'App']);
    const courseId = result[0].insertId;
    if (holes.length > 0) {
        const rowPlaceholders = holes.map(() => `(?, ?, ?, ?, ?, ?, ?, 'App')`).join(', ');
        const params = holes.flatMap((h) => [courseId, h.holeNum, 1, h.yards ?? null, h.par, h.hdcp, h.hdcp]);
        await config_1.default.query(`INSERT INTO CourseDetails (CourseID, HoleNum, TeeID, Yards, Par, Hdcp, OrigHdcp, LastUpdateUser) VALUES ${rowPlaceholders}`, params);
    }
    return courseId;
}
/**
 * Cache every GHIN tee set for a course (rating/slope/gender/name + full hole-by-hole
 * par/hdcp/yards per tee) — separate from `CourseDetails`, which only ever holds the single tee
 * an admin picked at Add Course time and is read TeeID-blind everywhere else in the app (scoring,
 * leaderboards, skins, course history). Adding more tees' holes into `CourseDetails` itself would
 * silently multiply those joins per extra tee — this table exists specifically so Start Game's
 * tee picker can be cached without touching anything scoring actually reads.
 *
 * Replaces whatever was cached for this course before (delete-then-reinsert) — simplest safe way
 * to handle both the first Add Course save and a later manual "Refresh Course Rating".
 */
async function saveCourseTeeSets(courseId, teeSets) {
    await config_1.default.query('DELETE FROM CourseTeeSet WHERE CourseID = ?', [courseId]);
    for (const ts of teeSets) {
        const result = await config_1.default.query(`INSERT INTO CourseTeeSet (CourseID, GhinTeeSetId, TeeName, Gender, CourseRating, SlopeRating, TotalPar, TotalYardage)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [courseId, ts.teeSetId, ts.teeName, ts.gender, ts.courseRating, ts.slopeRating, ts.totalPar, ts.totalYardage]);
        const courseTeeSetId = result[0].insertId;
        if (ts.holes.length > 0) {
            const rowPlaceholders = ts.holes.map(() => '(?, ?, ?, ?, ?)').join(', ');
            const params = ts.holes.flatMap((h) => [courseTeeSetId, h.holeNum, h.par, h.hdcp, h.yards]);
            await config_1.default.query(`INSERT INTO CourseTeeHole (CourseTeeSetID, HoleNum, Par, Hdcp, Yards) VALUES ${rowPlaceholders}`, params);
        }
    }
}
/**
 * Read back this course's cached GHIN tee sets (see `saveCourseTeeSets`). Returns null when
 * nothing's been cached yet for this course (never GHIN-searched at Add Course time), which
 * callers should treat as "fall back to a live GHIN fetch" — not an empty array, which would mean
 * "cached, and GHIN genuinely has no tee data."
 */
async function getCachedCourseTeeSets(courseId) {
    const [rows] = await config_1.default.query(`SELECT ts.CourseTeeSetID, ts.GhinTeeSetId, ts.TeeName, ts.Gender, ts.CourseRating, ts.SlopeRating, ts.TotalPar, ts.TotalYardage,
            h.HoleNum, h.Par, h.Hdcp, h.Yards
     FROM CourseTeeSet ts
     LEFT JOIN CourseTeeHole h ON h.CourseTeeSetID = ts.CourseTeeSetID
     WHERE ts.CourseID = ?
     ORDER BY ts.CourseTeeSetID, h.HoleNum`, [courseId]);
    if (rows.length === 0)
        return null;
    const byTeeSet = new Map();
    for (const r of rows) {
        if (!byTeeSet.has(r.CourseTeeSetID)) {
            byTeeSet.set(r.CourseTeeSetID, {
                teeSetId: r.GhinTeeSetId,
                teeName: r.TeeName,
                gender: r.Gender,
                courseRating: r.CourseRating !== null ? Number(r.CourseRating) : null,
                slopeRating: r.SlopeRating,
                totalPar: r.TotalPar,
                totalYardage: r.TotalYardage,
                holes: [],
            });
        }
        if (r.HoleNum !== null) {
            byTeeSet.get(r.CourseTeeSetID).holes.push({ holeNum: r.HoleNum, par: r.Par, hdcp: r.Hdcp, yards: r.Yards });
        }
    }
    return Array.from(byTeeSet.values());
}
