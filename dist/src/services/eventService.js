"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createEvent = exports.renameEventCourse = exports.renameEvent = exports.getEventById = exports.searchAllEventsForMaster = exports.searchEvents = void 0;
const config_1 = __importDefault(require("../db/config"));
// Events flagged 'hidden_from_search' (EventOptions) never show up here — they're only
// reachable by navigating straight to them with a known EventID. Used for master/admin-only
// events that shouldn't be discoverable by normal event search.
const HIDDEN_EVENTS_SUBQUERY = `EventID NOT IN (
  SELECT EventID FROM EventOptions WHERE OptionName = 'hidden_from_search' AND OptionValue = 'T'
)`;
/**
 * Search events by name or course name (case-insensitive partial match). Hidden events are the
 * one exception to partial matching — typing any partial substring of a hidden event's name
 * never surfaces it, but typing its *exact* full name (case-insensitive) does. That's the only
 * way in to a hidden/master event from the search screen, since there's no other in-app way to
 * reach one by EventID on native (no address bar like on web).
 */
const searchEvents = async (query) => {
    if (!query.trim()) {
        const [rows] = await config_1.default.query(`SELECT EventID as id, EventName AS eventName, EventCourse AS courseName FROM Events WHERE ${HIDDEN_EVENTS_SUBQUERY} ORDER BY EventCourse, EventName`);
        return rows;
    }
    const trimmed = query.trim();
    const searchPattern = `%${query}%`;
    const [rows] = await config_1.default.query(`SELECT EventID as id, EventName AS eventName, EventCourse AS courseName FROM Events
     WHERE (EventName LIKE ? OR EventCourse LIKE ?)
     AND (${HIDDEN_EVENTS_SUBQUERY} OR LOWER(EventName) = LOWER(?))
     ORDER BY EventCourse, EventName`, [searchPattern, searchPattern, trimmed]);
    return rows;
};
exports.searchEvents = searchEvents;
/**
 * Search every event, including hidden/master ones — for Master Tools screens only (e.g.
 * Change Event Password), which need full visibility unlike the public search screen.
 */
const searchAllEventsForMaster = async (query) => {
    if (!query.trim()) {
        const [rows] = await config_1.default.query('SELECT EventID as id, EventName AS eventName, EventCourse AS courseName FROM Events ORDER BY EventCourse, EventName');
        return rows;
    }
    const searchPattern = `%${query}%`;
    const [rows] = await config_1.default.query('SELECT EventID as id, EventName AS eventName, EventCourse AS courseName FROM Events WHERE EventName LIKE ? OR EventCourse LIKE ? ORDER BY EventCourse, EventName', [searchPattern, searchPattern]);
    return rows;
};
exports.searchAllEventsForMaster = searchAllEventsForMaster;
/**
 * Get a single event by ID
 */
const getEventById = async (id) => {
    const [rows] = await config_1.default.query('SELECT EventID as id, EventName AS eventName, EventCourse AS courseName FROM Events WHERE EventID = ?', [id]);
    return rows[0];
};
exports.getEventById = getEventById;
/** Rename an event's display name. */
const renameEvent = async (eventId, eventName) => {
    const trimmed = eventName.trim();
    if (!trimmed)
        return { ok: false, error: 'Event name cannot be empty.' };
    await config_1.default.query('UPDATE Events SET EventName = ?, LastUpdateUser = ? WHERE EventID = ?', [trimmed, 'app', eventId]);
    return { ok: true };
};
exports.renameEvent = renameEvent;
/** Rename an event's default course label. */
const renameEventCourse = async (eventId, courseName) => {
    const trimmed = courseName.trim();
    if (!trimmed)
        return { ok: false, error: 'Course name cannot be empty.' };
    await config_1.default.query('UPDATE Events SET EventCourse = ?, LastUpdateUser = ? WHERE EventID = ?', [trimmed, 'app', eventId]);
    return { ok: true };
};
exports.renameEventCourse = renameEventCourse;
/**
 * Create a new event
 */
const createEvent = async (event) => {
    const result = await config_1.default.query('INSERT INTO Events (EventName, EventCourse, LastUpdateUser) VALUES (?, ?, ?)', [event.eventName, event.courseName, 'Web']);
    const insertResult = result;
    const newId = typeof insertResult.insertId === 'number' ? insertResult.insertId : insertResult[0].insertId;
    return {
        id: newId,
        eventName: event.eventName,
        courseName: event.courseName,
    };
};
exports.createEvent = createEvent;
