"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.truncateMoney = truncateMoney;
exports.truncateMoneyValue = truncateMoneyValue;
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
/** Same truncation as `truncateMoney`, returning a number instead of a display string -- used
 * where the truncated value needs to be stored or summed (e.g. `PlayerPayouts.Amount`), not just
 * rendered. Truncating only at render time isn't enough: summing several un-truncated splits and
 * truncating the total can come out higher than summing the already-truncated individual amounts
 * (each one loses a fraction of a cent to truncation; those losses don't show up unless truncation
 * happens before the sum). Confirmed real 2026-08-05: a payout total showed 3 cents more than was
 * actually collected because of this exact gap. */
function truncateMoneyValue(value) {
    return Number(truncateMoney(value));
}
