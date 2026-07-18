"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatHdcp = formatHdcp;
exports.parseHdcp = parseHdcp;
exports.getStrokes = getStrokes;
/**
 * Formats a handicap for display using golf convention: plus handicappers (better than
 * scratch, stored as a negative number) show with a "+" prefix instead of a raw minus sign
 * (e.g. -2 displays as "+2", not "-2").
 */
function formatHdcp(hdcp) {
    if (hdcp === null || hdcp === undefined)
        return '';
    return hdcp < 0 ? `+${Math.abs(hdcp)}` : `${hdcp}`;
}
/**
 * Parses a typed handicap, honoring the golf convention that plus handicappers type their
 * handicap with a leading "+" (e.g. "+5") even though it's stored as a negative number (-5)
 * everywhere else in the app. A directly-typed "-5" parses the same way, for safety.
 */
function parseHdcp(raw) {
    const trimmed = String(raw ?? '').trim();
    if (trimmed === '')
        return 0;
    if (trimmed.startsWith('+')) {
        const magnitude = Number(trimmed.slice(1));
        return Number.isNaN(magnitude) ? 0 : -magnitude;
    }
    const n = Number(trimmed);
    return Number.isNaN(n) ? 0 : n;
}
/**
 * Number of handicap strokes a player receives on a hole (how much gross-to-net subtracts) —
 * negative for a plus handicapper giving a stroke back on that hole. Shared between app/game.tsx
 * (client-side, computed at save time) and skinsService.ts (server-side, recomputed live for the
 * Skins Summary) — a single source of truth so the two can never drift apart.
 */
function getStrokes(playerHdcp, holeHdcp) {
    let strokes = 0;
    if (playerHdcp >= holeHdcp)
        strokes++;
    else if (playerHdcp < 0 && holeHdcp >= 19 + playerHdcp)
        strokes--;
    if ((playerHdcp - 18) >= holeHdcp)
        strokes++;
    if ((playerHdcp - 36) >= holeHdcp)
        strokes++;
    return strokes;
}
