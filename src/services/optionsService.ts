import pool from '../db/config';

export interface EventOptionsData {
  game_grossdblbogey: boolean;
  game_netdblbogey: boolean;
  game_maxhdcp: string;
  game_defaultholes: string;
  /** Whether women stroke on their own (women's) handicap holes. On by default. When off,
   * everyone -- women included -- strokes on the MEN's handicap holes (see hdcpForPlayer). Only
   * changes WHICH holes strokes land on, not how many. Mirrors RyderCup's womenHandicapHoles. */
  women_hdcp_holes: boolean;
  game_netpayin: string;
  game_netplaces: string;
  game_netpct1: string;
  game_netpct2: string;
  game_netpct3: string;
  game_netpct4: string;
  teams_netcut: string;
  teams_netcut9: string;
  teams_payin: string;
  teams_places: string;
  teams_pct1: string;
  teams_pct2: string;
  teams_pct3: string;
  teams_pct4: string;
  teams_teamsize: string;
  teams_keepcount: string;
  // Whether this team game's last hole counts every player's score instead of just the kept-best
  // KeepCount (the "Tommy Davis rule") — independent per Teams card, not a shared event setting,
  // since one team game can run it while another doesn't.
  teams_lastholeall: boolean;
  // Whether this team game can ONLY be assigned via the Randomize button — Manual and Playing
  // Groups assignment are disabled for it when on. Independent per Teams card, same as
  // teams_lastholeall.
  teams_blinddraw: boolean;
  // Whether this team game can ONLY be assigned via Playing Groups (teams fill in automatically
  // from foursomes entered together in Start Game) — Random and Manual assignment are disabled
  // for it when on. Mutually exclusive with teams_blinddraw (enforced client-side: turning one on
  // turns the other off), since a team game can't be locked to two different assignment methods
  // at once — both can be off, but not both on.
  teams_partnerteams: boolean;
  // 'custom' (manual Team Size/Keep Count, all fields editable) or '36/48' -- the latter has no
  // fixed Team Size at all (it's whatever headcount actually shows up) and replaces the static
  // Keep Count with a live per-hole team choice during play, so those two fields are hidden
  // whenever format isn't 'custom'.
  teams_format: string;
  // How many additional "Teams" cards (Teams 2, Teams 3, Teams 4) this event has beyond the
  // first — each additional card's fields are stored under a numbered prefix (teams2_payin,
  // teams2_teamsize, etc.) so the original unprefixed teams_* keys keep meaning "Teams 1"
  // and existing events' payout settings (e.g. Cron Pot Game) don't need migrating. Capped at
  // 4 total team games (0-3 extra) to keep this a plain flat set of fields like the rest of
  // EventOptionsData, rather than a dynamically-sized structure.
  teams_extra_count: string;
  teams2_netcut: string;
  teams2_netcut9: string;
  teams2_payin: string;
  teams2_places: string;
  teams2_pct1: string;
  teams2_pct2: string;
  teams2_pct3: string;
  teams2_pct4: string;
  teams2_teamsize: string;
  teams2_keepcount: string;
  teams2_lastholeall: boolean;
  teams2_blinddraw: boolean;
  teams2_partnerteams: boolean;
  teams2_format: string;
  teams3_netcut: string;
  teams3_netcut9: string;
  teams3_payin: string;
  teams3_places: string;
  teams3_pct1: string;
  teams3_pct2: string;
  teams3_pct3: string;
  teams3_pct4: string;
  teams3_teamsize: string;
  teams3_keepcount: string;
  teams3_lastholeall: boolean;
  teams3_blinddraw: boolean;
  teams3_partnerteams: boolean;
  teams3_format: string;
  teams4_netcut: string;
  teams4_netcut9: string;
  teams4_payin: string;
  teams4_places: string;
  teams4_pct1: string;
  teams4_pct2: string;
  teams4_pct3: string;
  teams4_pct4: string;
  teams4_teamsize: string;
  teams4_keepcount: string;
  teams4_lastholeall: boolean;
  teams4_blinddraw: boolean;
  teams4_partnerteams: boolean;
  teams4_format: string;
  skins_maxonestroke: boolean;
  skins_payin: string;
  skins_validation_score: boolean;
  skins_validation_par: boolean;
  skins_halfpar3: boolean;
  skins_nonepar3: boolean;
  skins_halfall: boolean;
  skins_maxone: boolean;
  /** Whether this event runs a separate Gross Skins side game — off by default. When on, Week
   * Results shows a Gross Skins section (hole-by-hole/summary/payout) using raw gross scores and
   * a completely separate paid-participant list (Admin -> Gross Skins Tracker), independent of
   * net Skins' OptOut-based participation. Only meant to ever be turned on for the one event this
   * applies to (confirmed with Matt 2026-08-04: the Sunday Pot Game) — modeled as a normal
   * per-event toggle rather than hardcoded to a specific event, same as every other optional game
   * type here. */
  gross_skins_enabled: boolean;
  /** Gross Skins' own buy-in amount — deliberately separate from skins_payin since gross skins is
   * a smaller, optional, separately-paid-for game most players don't participate in. */
  gross_skins_payin: string;
  /** Whether this event runs a UPS Cup race at all. Off by default — disables the UPS Cup
   * button in Admin and hides UPS Cup Standings from the player menu when off. */
  ups_enabled: boolean;
  ups_minevents: string;
  ups_numscores: string;
  ups_numplayers: string;
  ups_includeprioryears: boolean;
  ups_yearsexemption: string;
  /** Whether major-day winners (see EventCalendar's IsMajor flag) auto-qualify for the UPS Cup. */
  ups_majorsauto: boolean;
  /** Whether this event tracks paid status for upcoming tee dates (Admin -> Paid Tracker). */
  checkpaid: boolean;
  /** Whether this event is hidden from event search entirely — only reachable by navigating
   * straight to its EventID. Used for a private "master" event that opens Master Tools
   * (Admin -> Merge Players, etc.) instead of the normal player menu. */
  hidden_from_search: boolean;
  /** Whether marking yourself "In" for a tee time offers to open Venmo, prefilled to pay the
   * admin, right then -- off by default. Requires the admin to also have a Venmo username saved
   * (see setVenmoUsername/getVenmoUsername below, stored the same special-row way as
   * admin_password, not as a normal EventOptionsData field -- confirmed with Matt 2026-08-22). */
  venmo_autopay_enabled: boolean;
  /** Whether this event's Tee Times screen also shows/merges other events' tee times and
   * sign-ups -- off by default. One-directional: only THIS event's screen shows the merged view;
   * the linked-to events are completely unaffected and just show their own tee times, same as
   * always (corrected with Matt 2026-08-22 -- originally built symmetric, which was wrong: a
   * linked-to event never opted into anything). See teeTimesLinkService.ts's getLinkedEventIds.
   * Requires link_teetimes_eventid to also be set. Real scenario this solves: same-course events
   * ("Cron" and "Tommy Davis") that were being kept in sync by manually entering the same tee
   * times/sign-ups into each, by hand -- Cron links to Tommy Davis and stops double-entering. */
  link_teetimes_enabled: boolean;
  /** Comma-separated list of other events' EventIDs this event links to, when
   * link_teetimes_enabled is on (multiple partners supported since 2026-08-22 -- Matt: "Cron may
   * want to show tee times for more than one other event"). Stored as plain text (no FK enforced
   * anywhere in this schema -- same as every other cross-row reference in the app, see
   * orphanService.ts's ORPHAN_CHECKS). Parsed by teeTimesLinkService.ts's getLinkedEventIds. */
  link_teetimes_eventid: string;
}

// Default options for any event with no EventOptions rows yet — including brand-new events,
// since createEvent doesn't write any options rows itself.
const DEFAULTS: EventOptionsData = {
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
  link_teetimes_enabled: false,
  link_teetimes_eventid: '',
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
  'hidden_from_search', 'venmo_autopay_enabled', 'link_teetimes_enabled',
] as const;

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
  'link_teetimes_eventid',
] as const;

/** Get an event's options (mirrors options.php), falling back to legacy defaults for any unset option. */
export const getEventOptions = async (eventId: number): Promise<EventOptionsData> => {
  const [rows]: any = await pool.query(
    'SELECT OptionName, OptionValue FROM EventOptions WHERE EventID = ?',
    [eventId]
  );
  const result: EventOptionsData = { ...DEFAULTS };
  for (const row of rows) {
    const name = row.OptionName as string;
    if ((BOOLEAN_KEYS as readonly string[]).includes(name)) {
      (result as any)[name] = row.OptionValue === 'T';
    } else if ((TEXT_KEYS as readonly string[]).includes(name)) {
      (result as any)[name] = row.OptionValue ?? '';
    }
  }
  return result;
};

/** Save an event's options (mirrors saveoptions.php), upserting every option field. */
export const saveEventOptions = async (eventId: number, options: EventOptionsData): Promise<void> => {
  const entries: [string, string][] = [
    ...BOOLEAN_KEYS.map((key) => [key, options[key] ? 'T' : 'F'] as [string, string]),
    ...TEXT_KEYS.map((key) => [key, options[key] ?? ''] as [string, string]),
  ];
  for (const [name, value] of entries) {
    await pool.query(
      `INSERT INTO EventOptions (EventID, OptionName, OptionValue, LastUpdateUser)
       VALUES (?, ?, ?, 'app')
       ON DUPLICATE KEY UPDATE OptionValue = VALUES(OptionValue), LastUpdateDt = CURRENT_TIMESTAMP`,
      [eventId, name, value]
    );
  }
};

/**
 * Set (or replace) an event's Admin password. Stored as its own EventOptions row
 * (`admin_password`), kept out of `EventOptionsData`/the Options screen entirely so it never
 * round-trips through `getEventOptions`/`saveEventOptions` or gets displayed anywhere.
 */
export const setAdminPassword = async (eventId: number, password: string): Promise<void> => {
  await pool.query(
    `INSERT INTO EventOptions (EventID, OptionName, OptionValue, LastUpdateUser)
     VALUES (?, 'admin_password', ?, 'app')
     ON DUPLICATE KEY UPDATE OptionValue = VALUES(OptionValue), LastUpdateDt = CURRENT_TIMESTAMP`,
    [eventId, password]
  );
};

/**
 * Check a candidate password against an event's stored Admin password. Only meaningful once
 * `hasAdminPassword` is true — see there for the no-password-set case.
 */
export const verifyAdminPassword = async (eventId: number, password: string): Promise<boolean> => {
  const [rows]: any = await pool.query(
    `SELECT OptionValue FROM EventOptions WHERE EventID = ? AND OptionName = 'admin_password'`,
    [eventId]
  );
  if (rows.length === 0 || !rows[0].OptionValue) return false;
  return rows[0].OptionValue === password;
};

/**
 * Whether an event currently has an Admin password set. New events default to none — anyone
 * can open Admin freely until the organizer sets one from inside Admin itself (Set Admin
 * Password). Once set, the menu's Admin button prompts for it; clearing it back to blank via
 * the same screen removes the prompt again.
 */
export const hasAdminPassword = async (eventId: number): Promise<boolean> => {
  const [rows]: any = await pool.query(
    `SELECT OptionValue FROM EventOptions WHERE EventID = ? AND OptionName = 'admin_password'`,
    [eventId]
  );
  return rows.length > 0 && !!rows[0].OptionValue;
};

// Venmo usernames are 5-30 chars: letters, numbers, underscore, hyphen, must start with a
// letter (Venmo's real signup rule) -- format-only, there's no public API to confirm an account
// actually exists. Exported so the client can validate before even attempting a save.
export const VENMO_USERNAME_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{4,29}$/;

/** Strips a leading "@" and surrounding whitespace -- Venmo's own app always displays/shares
 * usernames with a leading "@" (e.g. "@John-Smith-12"), so admins naturally paste/type it that
 * way even though the underlying username itself never includes it (confirmed with Matt
 * 2026-08-22). Duplicated (not imported) from src/utils/venmoUsername.ts's identical function --
 * same reason as VENMO_USERNAME_PATTERN's own duplication note below. Exported so other
 * server-only files (e.g. teamGameService.ts's one-off game Venmo override) can reuse it instead
 * of duplicating it a third time -- both already live server-side, so no bundling concern. */
export function normalizeVenmoUsername(input: string): string {
  return input.trim().replace(/^@/, '');
}

/**
 * Set (or replace) the admin's Venmo username for this event, used by Tee Times' "pay now"
 * prompt as the payment recipient. Stored as its own EventOptions row ('venmo_username'), same
 * pattern as admin_password -- kept out of EventOptionsData/the normal Options round-trip since
 * it's admin identity data, not a per-game rule. Rejects an obviously malformed value rather
 * than silently saving something Venmo's own app would never accept. Normalizes (strips a
 * leading "@") before validating/storing as defense in depth even though the client already does
 * the same -- this is the actual point of truth for what ends up in the DB.
 */
export const setVenmoUsername = async (eventId: number, username: string): Promise<boolean> => {
  const trimmed = normalizeVenmoUsername(username);
  if (trimmed !== '' && !VENMO_USERNAME_PATTERN.test(trimmed)) return false;
  await pool.query(
    `INSERT INTO EventOptions (EventID, OptionName, OptionValue, LastUpdateUser)
     VALUES (?, 'venmo_username', ?, 'app')
     ON DUPLICATE KEY UPDATE OptionValue = VALUES(OptionValue), LastUpdateDt = CURRENT_TIMESTAMP`,
    [eventId, trimmed]
  );
  return true;
};

/** The admin's saved Venmo username for this event, or '' if none is set yet. */
export const getVenmoUsername = async (eventId: number): Promise<string> => {
  const [rows]: any = await pool.query(
    `SELECT OptionValue FROM EventOptions WHERE EventID = ? AND OptionName = 'venmo_username'`,
    [eventId]
  );
  return rows.length > 0 ? rows[0].OptionValue ?? '' : '';
};

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
const PAYOUT_PREFIXES = ['game_net', 'teams_', 'teams2_', 'teams3_', 'teams4_'] as const;
export const PAYOUT_OVERRIDE_KEYS = PAYOUT_PREFIXES.flatMap((prefix) => [
  `${prefix}places` as const,
  ...Array.from({ length: 10 }, (_, i) => `${prefix}pct${i + 1}` as const),
]);

export type PayoutOverrideKey = (typeof PAYOUT_OVERRIDE_KEYS)[number];
export type GamePayoutOverrides = Partial<Record<PayoutOverrideKey, string>>;

/** Which payout fields (if any) this specific game has overridden from its event's defaults. */
export const getGamePayoutOverrides = async (gameId: number): Promise<GamePayoutOverrides> => {
  const [rows]: any = await pool.query(
    'SELECT OptionName, OptionValue FROM GameOptions WHERE GameID = ?',
    [gameId]
  );
  const result: GamePayoutOverrides = {};
  for (const row of rows) {
    const name = row.OptionName as string;
    if ((PAYOUT_OVERRIDE_KEYS as readonly string[]).includes(name)) {
      (result as any)[name] = row.OptionValue ?? '';
    }
  }
  return result;
};

/**
 * Merge an event's default payout settings with this game's overrides (override wins per-key),
 * plus exactly which keys are overridden — the UI uses `overriddenKeys` per-section (Net vs.
 * each Teams slot independently) to show "customized for this week" vs. the event default.
 */
export const getEffectiveGamePayoutOptions = async (
  gameId: number,
  eventId: number
): Promise<{ values: Record<PayoutOverrideKey, string>; overriddenKeys: PayoutOverrideKey[] }> => {
  const [eventOptions, overrides] = await Promise.all([
    getEventOptions(eventId),
    getGamePayoutOverrides(gameId),
  ]);
  const values = {} as Record<PayoutOverrideKey, string>;
  for (const key of PAYOUT_OVERRIDE_KEYS) {
    values[key] = overrides[key] ?? (eventOptions as any)[key] ?? '';
  }
  return { values, overriddenKeys: Object.keys(overrides) as PayoutOverrideKey[] };
};

/** Save this game's payout overrides — only the provided keys are written/updated. */
export const saveGamePayoutOverrides = async (
  gameId: number,
  overrides: GamePayoutOverrides
): Promise<void> => {
  for (const [name, value] of Object.entries(overrides)) {
    await pool.query(
      `INSERT INTO GameOptions (GameID, OptionName, OptionValue, LastUpdateUser)
       VALUES (?, ?, ?, 'app')
       ON DUPLICATE KEY UPDATE OptionValue = VALUES(OptionValue), LastUpdateDt = CURRENT_TIMESTAMP`,
      [gameId, name, value ?? '']
    );
  }
};

/** Clear this game's payout overrides entirely, reverting it back to the event's defaults. */
/**
 * Clear specific payout override keys for this game (e.g. just the Net keys, or just one Teams
 * slot's keys), reverting only that section back to the event's default -- a different Teams
 * game's override on the same week, if any, is left alone.
 */
export const resetGamePayoutOverrides = async (gameId: number, keys: PayoutOverrideKey[]): Promise<void> => {
  if (keys.length === 0) return;
  await pool.query(
    `DELETE FROM GameOptions WHERE GameID = ? AND OptionName IN (${keys.map(() => '?').join(',')})`,
    [gameId, ...keys]
  );
};

export type DblBogeyMode = 'off' | 'gross' | 'net';

/** Reuses the same GameOptions table as the payout overrides above (GameID/OptionName/
 * OptionValue), under its own 'dblbogey_mode' key -- Matt, 2026-08-22: some weeks are also a
 * course event/tournament with no double bogey max, and that needs to be settable per week, not
 * just at the event level. Unlike the payout overrides (a subset of fields a game can tweak),
 * this is a single tri-state value: row absent = follow the event's own game_grossdblbogey/
 * game_netdblbogey default; row present = this week explicitly uses that mode instead, 'off'
 * included (there's no event-level way to say "off" explicitly -- both booleans false already
 * means off at the event level, but a per-game override needs its own explicit "off" so it's
 * distinguishable from "no override, whatever off/gross/net the event happens to default to"). */
export const getGameDblBogeyOverride = async (gameId: number): Promise<DblBogeyMode | null> => {
  const [rows]: any = await pool.query(
    `SELECT OptionValue FROM GameOptions WHERE GameID = ? AND OptionName = 'dblbogey_mode'`,
    [gameId]
  );
  if (rows.length === 0) return null;
  const v = rows[0].OptionValue;
  return v === 'off' || v === 'gross' || v === 'net' ? v : null;
};

/** Set (or, with `mode: null`, clear) this week's Double Bogey Max override. Clearing deletes the
 * row entirely, reverting back to following the event's own default. */
export const saveGameDblBogeyOverride = async (gameId: number, mode: DblBogeyMode | null): Promise<void> => {
  if (mode === null) {
    await pool.query(`DELETE FROM GameOptions WHERE GameID = ? AND OptionName = 'dblbogey_mode'`, [gameId]);
    return;
  }
  await pool.query(
    `INSERT INTO GameOptions (GameID, OptionName, OptionValue, LastUpdateUser) VALUES (?, 'dblbogey_mode', ?, 'app')
     ON DUPLICATE KEY UPDATE OptionValue = VALUES(OptionValue), LastUpdateDt = CURRENT_TIMESTAMP`,
    [gameId, mode]
  );
};
