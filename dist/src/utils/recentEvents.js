"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRecentEvents = getRecentEvents;
exports.addRecentEvent = addRecentEvent;
const async_storage_1 = __importDefault(require("@react-native-async-storage/async-storage"));
const STORAGE_KEY = 'recentEvents';
const MAX_RECENT = 3;
/**
 * The last few events this device has opened, most-recent-first — so a regular player can jump
 * straight back in without re-searching every time. Stored locally per device (there's no login/
 * account system in this app), not synced anywhere.
 */
async function getRecentEvents() {
    try {
        const raw = await async_storage_1.default.getItem(STORAGE_KEY);
        if (!raw)
            return [];
        return JSON.parse(raw);
    }
    catch (error) {
        console.error('Error reading recent events:', error);
        return [];
    }
}
/** Record an event as just-opened — moves it to the front if already present, trims to the
 * most recent 3. Call this anywhere a user actually picks an event (search results or the
 * recent list itself), so re-selecting a recent event refreshes its position/name/course. */
async function addRecentEvent(event) {
    try {
        const existing = await getRecentEvents();
        const deduped = existing.filter((e) => e.id !== event.id);
        const updated = [event, ...deduped].slice(0, MAX_RECENT);
        await async_storage_1.default.setItem(STORAGE_KEY, JSON.stringify(updated));
    }
    catch (error) {
        console.error('Error saving recent event:', error);
    }
}
