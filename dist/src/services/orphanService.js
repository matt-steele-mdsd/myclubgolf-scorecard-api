"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOrphanedRows = getOrphanedRows;
exports.deleteOrphanedRows = deleteOrphanedRows;
const config_1 = __importDefault(require("../db/config"));
/**
 * Every foreign-key-shaped relationship in phoneAI's own schema (confirmed via direct DB
 * introspection when building Delete Event — see the `delete_event_feature` memory for how this
 * list was derived) that isn't enforced by a real database FK constraint. A bug, a manual SQL
 * fix, or data left over from before a cascading-delete feature existed can leave dangling rows
 * behind with no way to notice except checking for them directly.
 *
 * Deliberately excludes 'Team' -- dropped from production 2026-07-13 (see ARCHITECTURE.md),
 * superseded by TeamGame/TeamGamePlayer; querying a dropped table here 500'd this whole scan.
 */
const ORPHAN_CHECKS = [
    // GameID -> Game
    { table: 'Score', column: 'GameID', parentTable: 'Game', parentColumn: 'GameID' },
    { table: 'OptOut', column: 'GameID', parentTable: 'Game', parentColumn: 'GameID' },
    { table: 'Hdcp', column: 'GameID', parentTable: 'Game', parentColumn: 'GameID' },
    { table: 'Skins', column: 'GameID', parentTable: 'Game', parentColumn: 'GameID' },
    { table: 'PlayingGroup', column: 'GameID', parentTable: 'Game', parentColumn: 'GameID' },
    { table: 'TeamGame', column: 'GameID', parentTable: 'Game', parentColumn: 'GameID' },
    { table: 'PostedGHIN', column: 'GameID', parentTable: 'Game', parentColumn: 'GameID' },
    { table: 'GSkins', column: 'GameID', parentTable: 'Game', parentColumn: 'GameID' },
    { table: 'GrossSkinsResult', column: 'GameID', parentTable: 'Game', parentColumn: 'GameID' },
    // TeamGameID -> TeamGame
    { table: 'TeamGamePlayer', column: 'TeamGameID', parentTable: 'TeamGame', parentColumn: 'TeamGameID' },
    // GroupID/EventID -> Events
    { table: 'Game', column: 'GroupID', parentTable: 'Events', parentColumn: 'EventID' },
    { table: 'EventPlayers', column: 'EventID', parentTable: 'Events', parentColumn: 'EventID' },
    { table: 'EventOptions', column: 'EventID', parentTable: 'Events', parentColumn: 'EventID' },
    { table: 'EventCalendar', column: 'EventID', parentTable: 'Events', parentColumn: 'EventID' },
    { table: 'TeeTimes', column: 'GroupID', parentTable: 'Events', parentColumn: 'EventID' },
    { table: 'PaidTracker', column: 'GroupID', parentTable: 'Events', parentColumn: 'EventID' },
    { table: 'GSkinsPaid', column: 'GroupID', parentTable: 'Events', parentColumn: 'EventID' },
    { table: 'PlayerStatus', column: 'GroupID', parentTable: 'Events', parentColumn: 'EventID' },
    { table: 'CleanupIgnored', column: 'EventID', parentTable: 'Events', parentColumn: 'EventID' },
    { table: 'UpsCupWinner', column: 'EventID', parentTable: 'Events', parentColumn: 'EventID' },
    { table: 'UpsCupPaid', column: 'EventID', parentTable: 'Events', parentColumn: 'EventID' },
    { table: 'InGrossBirdie', column: 'EventID', parentTable: 'Events', parentColumn: 'EventID' },
    { table: 'InNetBirdie', column: 'EventID', parentTable: 'Events', parentColumn: 'EventID' },
    { table: 'InUPSCup', column: 'EventID', parentTable: 'Events', parentColumn: 'EventID' },
    // PlayerID -> Player
    { table: 'Score', column: 'PlayerID', parentTable: 'Player', parentColumn: 'PlayerID' },
    { table: 'OptOut', column: 'PlayerID', parentTable: 'Player', parentColumn: 'PlayerID' },
    { table: 'Hdcp', column: 'PlayerID', parentTable: 'Player', parentColumn: 'PlayerID' },
    { table: 'Skins', column: 'PlayerID', parentTable: 'Player', parentColumn: 'PlayerID' },
    { table: 'PlayingGroup', column: 'PlayerID', parentTable: 'Player', parentColumn: 'PlayerID' },
    { table: 'TeamGamePlayer', column: 'PlayerID', parentTable: 'Player', parentColumn: 'PlayerID' },
    { table: 'PostedGHIN', column: 'PlayerID', parentTable: 'Player', parentColumn: 'PlayerID' },
    { table: 'EventPlayers', column: 'PlayerID', parentTable: 'Player', parentColumn: 'PlayerID' },
    { table: 'PlayerStatus', column: 'PlayerID', parentTable: 'Player', parentColumn: 'PlayerID' },
    { table: 'PaidTracker', column: 'PlayerID', parentTable: 'Player', parentColumn: 'PlayerID' },
    { table: 'GSkinsPaid', column: 'PlayerID', parentTable: 'Player', parentColumn: 'PlayerID' },
    { table: 'GSkins', column: 'PlayerID', parentTable: 'Player', parentColumn: 'PlayerID' },
    { table: 'GrossSkinsResult', column: 'PlayerID', parentTable: 'Player', parentColumn: 'PlayerID' },
    { table: 'UpsCupWinner', column: 'PlayerID', parentTable: 'Player', parentColumn: 'PlayerID' },
    { table: 'UpsCupPaid', column: 'PlayerID', parentTable: 'Player', parentColumn: 'PlayerID' },
    { table: 'InGrossBirdie', column: 'PlayerID', parentTable: 'Player', parentColumn: 'PlayerID' },
    { table: 'InNetBirdie', column: 'PlayerID', parentTable: 'Player', parentColumn: 'PlayerID' },
    { table: 'InUPSCup', column: 'PlayerID', parentTable: 'Player', parentColumn: 'PlayerID' },
];
/**
 * Scan every known FK-shaped relationship in phoneAI's schema for dangling rows — a row whose
 * GameID/EventID/PlayerID/TeamGameID points at a parent that no longer exists. None of these
 * relationships are enforced by real database FK constraints, so this can only be found by
 * checking, not by a constraint violation. One candidate per relationship (not per row) — a
 * relationship with a nonzero count is one selectable cleanup action covering however many rows
 * it affects.
 */
async function getOrphanedRows() {
    const results = [];
    for (const check of ORPHAN_CHECKS) {
        const [[row]] = await config_1.default.query(`SELECT COUNT(*) AS cnt FROM ${check.table} t
       LEFT JOIN ${check.parentTable} p ON p.${check.parentColumn} = t.${check.column}
       WHERE t.${check.column} IS NOT NULL AND p.${check.parentColumn} IS NULL`);
        const count = row.cnt;
        if (count > 0) {
            results.push({
                key: `${check.table}.${check.column}`,
                description: `${check.table}.${check.column} → ${check.parentTable}`,
                reason: `${count} row${count === 1 ? '' : 's'} ${count === 1 ? 'references' : 'reference'} a ${check.column} that no longer exists in ${check.parentTable}.`,
            });
        }
    }
    return results;
}
/** Delete every dangling row for the selected relationships — same join/condition as the count above. */
async function deleteOrphanedRows(keys) {
    for (const key of keys) {
        const check = ORPHAN_CHECKS.find((c) => `${c.table}.${c.column}` === key);
        if (!check)
            continue;
        await config_1.default.query(`DELETE t FROM ${check.table} t
       LEFT JOIN ${check.parentTable} p ON p.${check.parentColumn} = t.${check.column}
       WHERE t.${check.column} IS NOT NULL AND p.${check.parentColumn} IS NULL`);
    }
}
