"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCourseHoleHistory = getCourseHoleHistory;
const config_1 = __importDefault(require("../db/config"));
async function getCourseHoleHistory(courseId) {
    const [rows] = await config_1.default.query(`SELECT c.HoleNum AS holeNum, c.Par AS par, c.Hdcp AS hdcp,
            FORMAT(AVG(s.Score), 2) AS avgScore, FORMAT(AVG(s.NetScore), 2) AS avgNet
     FROM CourseDetails c
     LEFT OUTER JOIN Score s ON s.CourseID = c.CourseID AND s.HoleID = c.HoleNum
     WHERE c.CourseID = ?
     GROUP BY c.HoleNum, c.Par, c.Hdcp
     ORDER BY c.HoleNum`, [courseId]);
    return rows.map((r) => ({
        holeNum: r.holeNum,
        par: r.par,
        hdcp: r.hdcp,
        avgScore: r.avgScore,
        avgNet: r.avgNet,
    }));
}
