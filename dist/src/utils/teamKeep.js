"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IRISH_RUMBLE_FORMAT = exports.TEAMS_KEEP_FORMAT = void 0;
exports.targetForTeamSize = targetForTeamSize;
exports.computeValidKeepChoices = computeValidKeepChoices;
exports.irishRumbleKeepCountForHole = irishRumbleKeepCountForHole;
/** The one non-'custom' team format: "36/48" -- named for its two most common real sizes (3-man
 * targets 36, 4-man targets 48), but genuinely scales to whatever headcount actually shows up
 * for a given team, not a size fixed in advance. There's deliberately no admin-facing way to
 * force a specific team size for this format -- confirmed with Matt: whoever's actually playing
 * together is the team, however many that turns out to be. */
exports.TEAMS_KEEP_FORMAT = '36/48';
/** A team's target is always its own actual headcount times 12 -- the general rule behind both
 * "36" (3-man) and "48" (4-man): confirmed with Matt this generalizes cleanly rather than being
 * two unrelated fixed numbers. */
function targetForTeamSize(teamSize) {
    return teamSize * 12;
}
/**
 * Which keep-count choices (0..teamSize) are still valid for the hole about to be decided,
 * given how many scores the team has already kept on other holes and how many holes remain in
 * the round (including this one). Shared between the live picker (app/game.tsx, so invalid
 * choices are simply never offered) and the server-side save (teamGameService.ts, so a stale/
 * tampered request can't sneak an unreachable choice through) — one source of truth, matching
 * this app's existing pattern for computePlaceAmounts in payout.ts.
 *
 * A choice is valid only if the target is STILL reachable after it: too low and the team can't
 * catch up even by keeping the max on every remaining hole; too high and they can't undo it
 * later since a hole's keep count is locked in once chosen. On the very last remaining hole this
 * collapses to "exactly one choice is ever valid" — whatever lands precisely on target.
 */
function computeValidKeepChoices(teamSize, target, keptOnOtherHoles, holesRemainingIncludingThisOne) {
    const choices = [];
    const holesLeftAfterThis = holesRemainingIncludingThisOne - 1;
    for (let choice = 0; choice <= teamSize; choice++) {
        const afterThisHole = keptOnOtherHoles + choice;
        const minPossible = afterThisHole; // every remaining hole keeps 0
        const maxPossible = afterThisHole + holesLeftAfterThis * teamSize; // every remaining hole keeps the max
        if (target >= minPossible && target <= maxPossible) {
            choices.push(choice);
        }
    }
    // Defensive fallback: if the round doesn't actually have enough holes left for this target to
    // be reachable at all (e.g. someone runs a 36/48 format on a 9-hole-only round, where even
    // maxing every hole tops out at 27), don't strand the team with zero legal choices — offer
    // every choice unconstrained rather than hard-locking them out of finishing the round.
    return choices.length > 0 ? choices : Array.from({ length: teamSize + 1 }, (_, i) => i);
}
/** A fixed-foursome format with no live picker at all: unlike 36/48, the keep count is a
 * deterministic rule of the hole number itself, not a player choice or a headcount-scaled
 * target — keep the lowest 2 net scores on holes 1-6, the lowest 3 on holes 7-12, and all 4 on
 * holes 13-18. Assumes a real foursome (the "2/3/4" numbers are fixed, not teamSize x 12 like
 * 36/48) -- a short-handed group still gets padded up like 'custom' does, confirmed with Matt
 * 2026-07-24, since the fairness rationale for padding (a smaller team shouldn't be stuck
 * choosing from fewer scores than everyone else) applies here exactly as it does for 'custom'. */
exports.IRISH_RUMBLE_FORMAT = 'irish';
/** How many net scores to keep for a given hole under Irish Rumble -- holes 1-6 keep 2, 7-12
 * keep 3, 13-18 keep 4. Uses the physical hole number (Score.HoleID, 1-18) directly rather than
 * "Nth hole played," so a front-9-only or back-9-only round still applies the correct bucket for
 * whichever holes are actually played (e.g. a back-9-only round plays holes 10-18: keep 3 for
 * 10-12, keep 4 for 13-18) instead of needing special-casing for partial rounds. */
function irishRumbleKeepCountForHole(holeNum) {
    if (holeNum <= 6)
        return 2;
    if (holeNum <= 12)
        return 3;
    return 4;
}
