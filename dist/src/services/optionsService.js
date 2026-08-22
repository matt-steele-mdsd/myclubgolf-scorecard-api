"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.saveGameDblBogeyOverride = exports.getGameDblBogeyOverride = exports.resetGamePayoutOverrides = exports.saveGamePayoutOverrides = exports.getEffectiveGamePayoutOptions = exports.getGamePayoutOverrides = exports.PAYOUT_OVERRIDE_KEYS = exports.getVenmoUsername = exports.setVenmoUsername = exports.VENMO_USERNAME_PATTERN = exports.hasAdminPassword = exports.verifyAdminPassword = exports.setAdminPassword = exports.saveEventOptions = exports.getEventOptions = void 0;
const config_1 = __importDefault(require("../db/config"));
// Default options for any event with no EventOptions rows yet — including brand-new events,
// since createEvent doesn't write any options rows itself.
const DEFAULTS = {
    game_grossdblbogey: false,
    game_netdblbogey: false,
    game_maxhdcp: '',
    game_defaultholes: '18h',
    women_hdcp_holes: true,
    game_netpayin: '',
    game_netplaces: '3',
    game_netpct1: '',
    game_netpct2: '',
    game_netpct3: '',
    game_netpct4: '',
    teams_netcut: '',
    teams_netcut9: '',
    teams_payin: '',
    teams_places: '3',
    teams_pct1: '',
    teams_pct2: '',
    teams_pct3: '',
    teams_pct4: '',
    teams_teamsize: '2',
    teams_keepcount: '1',
    teams_lastholeall: false,
    teams_blinddraw: false,
    teams_partnerteams: false,
    teams_format: 'custom',
    teams_extra_count: '0',
    teams2_netcut: '',
    teams2_netcut9: '',
    teams2_payin: '',
    teams2_places: '3',
    teams2_pct1: '',
    teams2_pct2: '',
    teams2_pct3: '',
    teams2_pct4: '',
    teams2_teamsize: '2',
    teams2_keepcount: '1',
    teams2_lastholeall: false,
    teams2_blinddraw: false,
    teams2_partnerteams: false,
    teams2_format: 'custom',
    teams3_netcut: '',
    teams3_netcut9: '',
    teams3_payin: '',
    teams3_places: '3',
    teams3_pct1: '',
    teams3_pct2: '',
    teams3_pct3: '',
    teams3_pct4: '',
    teams3_teamsize: '2',
    teams3_keepcount: '1',
    teams3_lastholeall: false,
    teams3_blinddraw: false,
    teams3_partnerteams: false,
    teams3_format: 'custom',
    teams4_netcut: '',
    teams4_netcut9: '',
    teams4_payin: '',
    teams4_places: '3',
    teams4_pct1: '',
    teams4_pct2: '',
    teams4_pct3: '',
    teams4_pct4: '',
    teams4_teamsize: '2',
    teams4_keepcount: '1',
    teams4_lastholeall: false,
    teams4_blinddraw: false,
    teams4_partnerteams: false,
    teams4_format: 'custom',
    skins_maxonestroke: true,
    skins_payin: '5.00',
    skins_validation_score: false,
    skins_validation_par: true,
    skins_halfpar3: true,
    skins_nonepar3: false,
    skins_halfall: false,
    skins_maxone: false,
    gross_skins_enabled: false,
    gross_skins_payin: '',
    ups_enabled: false,
    ups_minevents: '',
    ups_numscores: '',
    ups_numplayers: '',
    ups_includeprioryears: false,
    ups_yearsexemption: '',
    ups_majorsauto: false,
    checkpaid: false,
    hidden_from_search: false,
    venmo_autopay_enabled: false,
};
const BOOLEAN_KEYS = [
    'game_grossdblbogey', 'game_netdblbogey', 'women_hdcp_holes',
    'teams_lastholeall', 'teams2_lastholeall', 'teams3_lastholeall', 'teams4_lastholeall',
    'teams_blinddraw', 'teams2_blinddraw', 'teams3_blinddraw', 'teams4_blinddraw',
    'teams_partnerteams', 'teams2_partnerteams', 'teams3_partnerteams', 'teams4_partnerteams',
    'skins_maxonestroke', 'skins_validation_score', 'skins_validation_par',
    'skins_halfpar3', 'skins_nonepar3', 'skins_halfall', 'skins_maxone',
    'gross_skins_enabled',
    'ups_enabled', 'ups_includeprioryears', 'ups_majorsauto', 'checkpaid',
    'hidden_from_search', 'venmo_autopay_enabled',
];
const TEXT_KEYS = [
    'game_maxhdcp', 'game_defaultholes', 'game_netpayin', 'game_netplaces',
    'game_netpct1', 'game_netpct2', 'game_netpct3', 'game_netpct4',
    'teams_netcut', 'teams_netcut9', 'teams_payin', 'teams_places',
    'teams_pct1', 'teams_pct2', 'teams_pct3', 'teams_pct4',
    'teams_teamsize', 'teams_keepcount', 'teams_format', 'teams_extra_count',
    'teams2_netcut', 'teams2_netcut9', 'teams2_payin', 'teams2_places',
    'teams2_pct1', 'teams2_pct2', 'teams2_pct3', 'teams2_pct4',
    'teams2_teamsize', 'teams2_keepcount', 'teams2_format',
    'teams3_netcut', 'teams3_netcut9', 'teams3_payin', 'teams3_places',
    'teams3_pct1', 'teams3_pct2', 'teams3_pct3', 'teams3_pct4',
    'teams3_teamsize', 'teams3_keepcount', 'teams3_format',
    'teams4_netcut', 'teams4_netcut9', 'teams4_payin', 'teams4_places',
    'teams4_pct1', 'teams4_pct2', 'teams4_pct3', 'teams4_pct4',
    'teams4_teamsize', 'teams4_keepcount', 'teams4_format',
    'skins_payin', 'gross_skins_payin',
    'ups_minevents', 'ups_numscores', 'ups_numplayers', 'ups_yearsexemption',
];
/** Get an event's options (mirrors options.php), falling back to legacy defaults for any unset option. */
const getEventOptions = async (eventId) => {
    const [rows] = await config_1.default.query('SELECT OptionName, OptionValue FROM EventOptions WHERE EventID = ?', [eventId]);
    const result = { ...DEFAULTS };
    for (const row of rows) {
        const name = row.OptionName;
        if (BOOLEAN_KEYS.includes(name)) {
            result[name] = row.OptionValue === 'T';
        }
        else if (TEXT_KEYS.includes(name)) {
            result[name] = row.OptionValue ?? '';
        }
    }
    return result;
};
exports.getEventOptions = getEventOptions;
/** Save an event's options (mirrors saveoptions.php), upserting every option field. */
const saveEventOptions = async (eventId, options) => {
    const entries = [
        ...BOOLEAN_KEYS.map((key) => [key, options[key] ? 'T' : 'F']),
        ...TEXT_KEYS.map((key) => [key, options[key] ?? '']),
    ];
    for (const [name, value] of entries) {
        await config_1.default.query(`INSERT INTO EventOptions (EventID, OptionName, OptionValue, LastUpdateUser)
       VALUES (?, ?, ?, 'app')
       ON DUPLICATE KEY UPDATE OptionValue = VALUES(OptionValue), LastUpdateDt = CURRENT_TIMESTAMP`, [eventId, name, value]);
    }
};
exports.saveEventOptions = saveEventOptions;
/**
 * Set (or replace) an event's Admin password. Stored as its own EventOptions row
 * (`admin_password`), kept out of `EventOptionsData`/the Options screen entirely so it never
 * round-trips through `getEventOptions`/`saveEventOptions` or gets displayed anywhere.
 */
const setAdminPassword = async (eventId, password) => {
    await config_1.default.query(`INSERT INTO EventOptions (EventID, OptionName, OptionValue, LastUpdateUser)
     VALUES (?, 'admin_password', ?, 'app')
     ON DUPLICATE KEY UPDATE OptionValue = VALUES(OptionValue), LastUpdateDt = CURRENT_TIMESTAMP`, [eventId, password]);
};
exports.setAdminPassword = setAdminPassword;
/**
 * Check a candidate password against an event's stored Admin password. Only meaningful once
 * `hasAdminPassword` is true — see there for the no-password-set case.
 */
const verifyAdminPassword = async (eventId, password) => {
    const [rows] = await config_1.default.query(`SELECT OptionValue FROM EventOptions WHERE EventID = ? AND OptionName = 'admin_password'`, [eventId]);
    if (rows.length === 0 || !rows[0].OptionValue)
        return false;
    return rows[0].OptionValue === password;
};
exports.verifyAdminPassword = verifyAdminPassword;
/**
 * Whether an event currently has an Admin password set. New events default to none — anyone
 * can open Admin freely until the organizer sets one from inside Admin itself (Set Admin
 * Password). Once set, the menu's Admin button prompts for it; clearing it back to blank via
 * the same screen removes the prompt again.
 */
const hasAdminPassword = async (eventId) => {
    const [rows] = await config_1.default.query(`SELECT OptionValue FROM EventOptions WHERE EventID = ? AND OptionName = 'admin_password'`, [eventId]);
    return rows.length > 0 && !!rows[0].OptionValue;
};
exports.hasAdminPassword = hasAdminPassword;
// Venmo usernames are 5-30 chars: letters, numbers, underscore, hyphen, must start with a
// letter (Venmo's real signup rule) -- format-only, there's no public API to confirm an account
// actually exists. Exported so the client can validate before even attempting a save.
exports.VENMO_USERNAME_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{4,29}$/;
/**
 * Set (or replace) the admin's Venmo username for this event, used by Tee Times' "pay now"
 * prompt as the payment recipient. Stored as its own EventOptions row ('venmo_username'), same
 * pattern as admin_password -- kept out of EventOptionsData/the normal Options round-trip since
 * it's admin identity data, not a per-game rule. Rejects an obviously malformed value rather
 * than silently saving something Venmo's own app would never accept.
 */
const setVenmoUsername = async (eventId, username) => {
    const trimmed = username.trim();
    if (trimmed !== '' && !exports.VENMO_USERNAME_PATTERN.test(trimmed))
        return false;
    await config_1.default.query(`INSERT INTO EventOptions (EventID, OptionName, OptionValue, LastUpdateUser)
     VALUES (?, 'venmo_username', ?, 'app')
     ON DUPLICATE KEY UPDATE OptionValue = VALUES(OptionValue), LastUpdateDt = CURRENT_TIMESTAMP`, [eventId, trimmed]);
    return true;
};
exports.setVenmoUsername = setVenmoUsername;
/** The admin's saved Venmo username for this event, or '' if none is set yet. */
const getVenmoUsername = async (eventId) => {
    const [rows] = await config_1.default.query(`SELECT OptionValue FROM EventOptions WHERE EventID = ? AND OptionName = 'venmo_username'`, [eventId]);
    return rows.length > 0 ? rows[0].OptionValue ?? '' : '';
};
exports.getVenmoUsername = getVenmoUsername;
// Places-to-pay and split-percentage keys only, for Net and each of the 4 possible Teams cards —
// the subset of EventOptionsData a single week's game can override without touching pay-in,
// team size, or any other event-wide rule. Stored in their own GameOptions table (GameID,
// OptionName, OptionValue — same shape as EventOptions, just keyed per-game instead of per-event)
// so overriding one week's payout split never affects any other week of a recurring event.
//
// Up to 10 places per section here, vs. the event-level Options screen's fixed max of 4 — a
// per-game override can pay more places than the event's own default ever could, e.g. a week
// with an unusually large field. Places 5-10 have no event-level default to fall back to (that
// interface only has pct1-4), so they're only ever populated by an explicit override.
// Note the inconsistent separator, matching EventOptionsData's existing (pre-existing, not
// introduced here) naming: "game_net" concatenates directly (game_netplaces), while the Teams
// prefixes have a trailing underscore (teams_places, teams2_places, ...).
const PAYOUT_PREFIXES = ['game_net', 'teams_', 'teams2_', 'teams3_', 'teams4_'];
exports.PAYOUT_OVERRIDE_KEYS = PAYOUT_PREFIXES.flatMap((prefix) => [
    `${prefix}places`,
    ...Array.from({ length: 10 }, (_, i) => `${prefix}pct${i + 1}`),
]);
/** Which payout fields (if any) this specific game has overridden from its event's defaults. */
const getGamePayoutOverrides = async (gameId) => {
    const [rows] = await config_1.default.query('SELECT OptionName, OptionValue FROM GameOptions WHERE GameID = ?', [gameId]);
    const result = {};
    for (const row of rows) {
        const name = row.OptionName;
        if (exports.PAYOUT_OVERRIDE_KEYS.includes(name)) {
            result[name] = row.OptionValue ?? '';
        }
    }
    return result;
};
exports.getGamePayoutOverrides = getGamePayoutOverrides;
/**
 * Merge an event's default payout settings with this game's overrides (override wins per-key),
 * plus exactly which keys are overridden — the UI uses `overriddenKeys` per-section (Net vs.
 * each Teams slot independently) to show "customized for this week" vs. the event default.
 */
const getEffectiveGamePayoutOptions = async (gameId, eventId) => {
    const [eventOptions, overrides] = await Promise.all([
        (0, exports.getEventOptions)(eventId),
        (0, exports.getGamePayoutOverrides)(gameId),
    ]);
    const values = {};
    for (const key of exports.PAYOUT_OVERRIDE_KEYS) {
        values[key] = overrides[key] ?? eventOptions[key] ?? '';
    }
    return { values, overriddenKeys: Object.keys(overrides) };
};
exports.getEffectiveGamePayoutOptions = getEffectiveGamePayoutOptions;
/** Save this game's payout overrides — only the provided keys are written/updated. */
const saveGamePayoutOverrides = async (gameId, overrides) => {
    for (const [name, value] of Object.entries(overrides)) {
        await config_1.default.query(`INSERT INTO GameOptions (GameID, OptionName, OptionValue, LastUpdateUser)
       VALUES (?, ?, ?, 'app')
       ON DUPLICATE KEY UPDATE OptionValue = VALUES(OptionValue), LastUpdateDt = CURRENT_TIMESTAMP`, [gameId, name, value ?? '']);
    }
};
exports.saveGamePayoutOverrides = saveGamePayoutOverrides;
/** Clear this game's payout overrides entirely, reverting it back to the event's defaults. */
/**
 * Clear specific payout override keys for this game (e.g. just the Net keys, or just one Teams
 * slot's keys), reverting only that section back to the event's default -- a different Teams
 * game's override on the same week, if any, is left alone.
 */
const resetGamePayoutOverrides = async (gameId, keys) => {
    if (keys.length === 0)
        return;
    await config_1.default.query(`DELETE FROM GameOptions WHERE GameID = ? AND OptionName IN (${keys.map(() => '?').join(',')})`, [gameId, ...keys]);
};
exports.resetGamePayoutOverrides = resetGamePayoutOverrides;
/** Reuses the same GameOptions table as the payout overrides above (GameID/OptionName/
 * OptionValue), under its own 'dblbogey_mode' key -- Matt, 2026-08-22: some weeks are also a
 * course event/tournament with no double bogey max, and that needs to be settable per week, not
 * just at the event level. Unlike the payout overrides (a subset of fields a game can tweak),
 * this is a single tri-state value: row absent = follow the event's own game_grossdblbogey/
 * game_netdblbogey default; row present = this week explicitly uses that mode instead, 'off'
 * included (there's no event-level way to say "off" explicitly -- both booleans false already
 * means off at the event level, but a per-game override needs its own explicit "off" so it's
 * distinguishable from "no override, whatever off/gross/net the event happens to default to"). */
const getGameDblBogeyOverride = async (gameId) => {
    const [rows] = await config_1.default.query(`SELECT OptionValue FROM GameOptions WHERE GameID = ? AND OptionName = 'dblbogey_mode'`, [gameId]);
    if (rows.length === 0)
        return null;
    const v = rows[0].OptionValue;
    return v === 'off' || v === 'gross' || v === 'net' ? v : null;
};
exports.getGameDblBogeyOverride = getGameDblBogeyOverride;
/** Set (or, with `mode: null`, clear) this week's Double Bogey Max override. Clearing deletes the
 * row entirely, reverting back to following the event's own default. */
const saveGameDblBogeyOverride = async (gameId, mode) => {
    if (mode === null) {
        await config_1.default.query(`DELETE FROM GameOptions WHERE GameID = ? AND OptionName = 'dblbogey_mode'`, [gameId]);
        return;
    }
    await config_1.default.query(`INSERT INTO GameOptions (GameID, OptionName, OptionValue, LastUpdateUser) VALUES (?, 'dblbogey_mode', ?, 'app')
     ON DUPLICATE KEY UPDATE OptionValue = VALUES(OptionValue), LastUpdateDt = CURRENT_TIMESTAMP`, [gameId, mode]);
};
exports.saveGameDblBogeyOverride = saveGameDblBogeyOverride;
