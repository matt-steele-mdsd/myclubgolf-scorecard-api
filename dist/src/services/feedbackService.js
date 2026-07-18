"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.submitFeedback = submitFeedback;
exports.getFeedback = getFeedback;
const config_1 = __importDefault(require("../db/config"));
async function submitFeedback(type, title, description, submittedBy) {
    await config_1.default.query(`INSERT INTO Feedback (Type, Title, Description, SubmittedBy) VALUES (?, ?, ?, ?)`, [type, title, description, submittedBy]);
}
async function getFeedback() {
    const [rows] = await config_1.default.query(`SELECT Type, Title, Description, SubmittedBy, DateEntered FROM Feedback ORDER BY DateEntered DESC`);
    return rows.map((r) => ({
        type: r.Type,
        title: r.Title,
        description: r.Description || '',
        submittedBy: r.SubmittedBy || '',
        dateEntered: r.DateEntered,
    }));
}
