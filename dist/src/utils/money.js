"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.truncateMoney = truncateMoney;
/**
 * Formats a dollar amount by truncating to 2 decimal places instead of rounding — used for
 * skins payouts, where rounding up (e.g. 46.665 -> "46.67") would pay out more than the pot
 * actually collected, leaving whoever's paying out short. Truncating (46.665 -> "46.66")
 * never overpays.
 *
 * Rounds to 6 decimal places first to cancel out floating-point representation noise (e.g.
 * 46.665 stored internally as 46.664999999999999) before truncating, so genuine values don't
 * get under-truncated by a stray cent due to floating-point error.
 */
function truncateMoney(value) {
    const cents = Math.floor(Number((value * 100).toFixed(6)));
    return (cents / 100).toFixed(2);
}
