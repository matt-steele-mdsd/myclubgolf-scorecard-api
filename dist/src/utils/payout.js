"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.computePlaceAmounts = computePlaceAmounts;
exports.computeTiePayouts = computeTiePayouts;
/**
 * Dollar amount awarded to each paid place, honoring configured percentages of the pot —
 * falling back to an equal split across places when no percentage has been set for any of them.
 */
function computePlaceAmounts(pot, places, pctStrings) {
    // No fixed max here beyond a generous sanity rail -- the event-level Options screen still only
    // offers up to 4 places, but Week Results' per-game payout override can pay up to 10, so this
    // stays uncapped rather than hardcoding 4.
    const clampedPlaces = Math.max(0, Math.min(20, places));
    if (clampedPlaces === 0 || pot <= 0)
        return [];
    const pcts = pctStrings.slice(0, clampedPlaces).map((s) => {
        const n = Number(s);
        return Number.isFinite(n) && n > 0 ? n : 0;
    });
    const anyPctSet = pcts.some((p) => p > 0);
    const effectivePcts = anyPctSet ? pcts : pcts.map(() => 100 / clampedPlaces);
    return effectivePcts.map((p) => pot * (p / 100));
}
/**
 * Splits `placeAmounts` across ranked entries (ascending `value` = best), combining and evenly
 * splitting a place's money whenever multiple entries tie for it — e.g. two entries tied for
 * the single paid place split the whole pot between them; a two-way tie for 2nd (with 3 places
 * paid) combines the 2nd + 3rd place shares and splits that between the two.
 */
function computeTiePayouts(entries, placeAmounts) {
    const sorted = [...entries].sort((a, b) => a.value - b.value);
    const results = [];
    let i = 0;
    while (i < sorted.length) {
        let j = i;
        while (j + 1 < sorted.length && sorted[j + 1].value === sorted[i].value)
            j++;
        const groupSize = j - i + 1;
        const positionsInMoney = Math.max(0, Math.min(groupSize, placeAmounts.length - i));
        const combinedAmount = placeAmounts.slice(i, i + positionsInMoney).reduce((a, b) => a + b, 0);
        const perEntry = positionsInMoney > 0 ? combinedAmount / groupSize : 0;
        for (let k = i; k <= j; k++) {
            results.push({ key: sorted[k].key, value: sorted[k].value, rank: i + 1, amount: perEntry });
        }
        i = j + 1;
    }
    return results;
}
