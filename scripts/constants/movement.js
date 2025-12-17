/**
 * Movement constants for RU UI.
 *
 * System (WoD20) base jump values (per CombatHelper.CalculateMovement):
 * - Default: vjump=2, hjump=4
 * - Glabro:  vjump=3, hjump=4
 * - Crinos:  vjump=4, hjump=5
 * - Hispo:   vjump=5, hjump=6
 * - Lupus:   vjump=4, hjump=7
 *
 * RU module requirement:
 * - Divide vjump/hjump by 4
 * - Round to one decimal place
 */

export const JUMP_DEFAULT = { vjump: 0.5, hjump: 1.0 }; // 2/4, 4/4
export const JUMP_GLABRO  = { vjump: 0.8, hjump: 1.0 }; // 3/4=0.75 -> 0.8, 4/4=1.0
export const JUMP_CRINOS  = { vjump: 1.0, hjump: 1.3 }; // 4/4=1.0, 5/4=1.25 -> 1.3
export const JUMP_HISPO   = { vjump: 1.3, hjump: 1.5 }; // 5/4=1.25 -> 1.3, 6/4=1.5
export const JUMP_LUPUS   = { vjump: 1.0, hjump: 1.8 }; // 4/4=1.0, 7/4=1.75 -> 1.8
