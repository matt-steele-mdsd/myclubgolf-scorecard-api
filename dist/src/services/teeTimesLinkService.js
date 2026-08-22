"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLinkedEventId = getLinkedEventId;
exports.ensurePlayerLinkedToEvent = ensurePlayerLinkedToEvent;
const config_1 = __importDefault(require("../db/config"));
/**
 * Resolves the "Link Tee Times" partner event for a given event -- one direction only. If Cron
 * links to Tommy Davis, Cron's own Tee Times shows both events combined, but Tommy Davis's screen
 * is completely unaffected -- it has no link of its own configured, so it just shows his own
 * event, same as always (corrected with Matt 2026-08-22: originally built symmetric, i.e. both
 * sides would see the merge, which was wrong -- Tommy Davis never opted into anything and
 * shouldn't have his screen changed by a decision Cron made unilaterally). Returns null if this
 * event hasn't linked to anything.
 */
async function getLinkedEventId(eventId) {
    const [rows] = await config_1.default.query(`SELECT
       MAX(CASE WHEN OptionName = 'link_teetimes_enabled' THEN OptionValue END) AS enabled,
       MAX(CASE WHEN OptionName = 'link_teetimes_eventid' THEN OptionValue END) AS partnerId
     FROM EventOptions
     WHERE EventID = ? AND OptionName IN ('link_teetimes_enabled', 'link_teetimes_eventid')`, [eventId]);
    const row = rows[0];
    const partnerId = Number(row?.partnerId);
    if (row?.enabled === 'T' && Number.isFinite(partnerId) && partnerId > 0) {
        return partnerId;
    }
    return null;
}
/**
 * Ensures a player who just signed up on one side of a link is also a roster member
 * (EventPlayers row) of the other linked event -- so their name shows up in that event's own
 * player-picker going forward too, without the admin ever adding them twice. Safe to call
 * unconditionally: both linked events share the same course (confirmed with Matt 2026-08-22), so
 * this can never create a duplicate Player row -- Player is deduped by Course+FirstName+LastName,
 * this only ever adds a second EventPlayers membership row for an ID that already exists.
 */
async function ensurePlayerLinkedToEvent(playerId, otherEventId) {
    await config_1.default.query(`INSERT INTO EventPlayers (EventID, PlayerID, LastUpdateUser)
     VALUES (?, ?, 'App')
     ON DUPLICATE KEY UPDATE LastUpdateUser = 'App'`, [otherEventId, playerId]);
}
