"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.submitFeedback = submitFeedback;
exports.getFeedback = getFeedback;
exports.deleteFeedback = deleteFeedback;
const config_1 = __importDefault(require("../db/config"));
async function submitFeedback(type, title, description, submittedBy) {
    await config_1.default.query(`INSERT INTO Feedback (Type, Title, Description, SubmittedBy) VALUES (?, ?, ?, ?)`, [type, title, description, submittedBy]);
}
async function getFeedback() {
    const [rows] = await config_1.default.query(`SELECT FeedbackID, Type, Title, Description, SubmittedBy, DateEntered FROM Feedback ORDER BY DateEntered DESC`);
    return rows.map((r) => ({
        id: r.FeedbackID,
        type: r.Type,
        title: r.Title,
        description: r.Description || '',
        submittedBy: r.SubmittedBy || '',
        dateEntered: r.DateEntered,
    }));
}
/** Delete one feedback entry (spam/duplicate cleanup) -- Matt, 2026-08-22: the master ("mdsd")
 * event should be able to see and clean up this app-wide log, since it's the one place already
 * used for cross-event admin tools (Master Tools). Feedback itself stays un-scoped to any event
 * (see the interface's own doc comment) -- only the ABILITY to delete is gated to the master
 * event, in app/feedback.tsx, the same way Master Tools itself is gated (EventOptions.hidden_from_search). */
async function deleteFeedback(feedbackId) {
    await config_1.default.query('DELETE FROM Feedback WHERE FeedbackID = ?', [feedbackId]);
}
