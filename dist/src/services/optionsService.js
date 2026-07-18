"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.hasAdminPassword = exports.verifyAdminPassword = exports.setAdminPassword = exports.saveEventOptions = exports.getEventOptions = void 0;
const config_1 = __importDefault(require("../db/config"));
// Default options for any event with no EventOptions rows yet — including brand-new events,
// since createEvent doesn't write any options rows itself.
const DEFAULTS = {
    game_grossdblbogey: false,
    game_netdblbogey: false,
    game_maxhdcp: '',
    game_defaultholes: '18h',
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
    skins_maxonestroke: true,
    skins_payin: '5.00',
    skins_validation_score: false,
    skins_validation_par: true,
    skins_halfpar3: true,
    skins_nonepar3: false,
    skins_halfall: false,
    skins_maxone: false,
    ups_enabled: false,
    ups_minevents: '',
    ups_numscores: '',
    ups_numplayers: '',
    ups_includeprioryears: false,
    ups_yearsexemption: '',
    ups_majorsauto: false,
    checkpaid: false,
    hidden_from_search: false,
};
const BOOLEAN_KEYS = [
    'game_grossdblbogey', 'game_netdblbogey',
    'teams_lastholeall', 'teams2_lastholeall', 'teams3_lastholeall', 'teams4_lastholeall',
    'teams_blinddraw', 'teams2_blinddraw', 'teams3_blinddraw', 'teams4_blinddraw',
    'teams_partnerteams', 'teams2_partnerteams', 'teams3_partnerteams', 'teams4_partnerteams',
    'skins_maxonestroke', 'skins_validation_score', 'skins_validation_par',
    'skins_halfpar3', 'skins_nonepar3', 'skins_halfall', 'skins_maxone',
    'ups_enabled', 'ups_includeprioryears', 'ups_majorsauto', 'checkpaid',
    'hidden_from_search',
];
const TEXT_KEYS = [
    'game_maxhdcp', 'game_defaultholes', 'game_netpayin', 'game_netplaces',
    'game_netpct1', 'game_netpct2', 'game_netpct3', 'game_netpct4',
    'teams_netcut', 'teams_netcut9', 'teams_payin', 'teams_places',
    'teams_pct1', 'teams_pct2', 'teams_pct3', 'teams_pct4',
    'teams_teamsize', 'teams_keepcount', 'teams_extra_count',
    'teams2_netcut', 'teams2_netcut9', 'teams2_payin', 'teams2_places',
    'teams2_pct1', 'teams2_pct2', 'teams2_pct3', 'teams2_pct4',
    'teams2_teamsize', 'teams2_keepcount',
    'teams3_netcut', 'teams3_netcut9', 'teams3_payin', 'teams3_places',
    'teams3_pct1', 'teams3_pct2', 'teams3_pct3', 'teams3_pct4',
    'teams3_teamsize', 'teams3_keepcount',
    'teams4_netcut', 'teams4_netcut9', 'teams4_payin', 'teams4_places',
    'teams4_pct1', 'teams4_pct2', 'teams4_pct3', 'teams4_pct4',
    'teams4_teamsize', 'teams4_keepcount',
    'skins_payin',
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
