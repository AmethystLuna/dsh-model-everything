/**
 * The pieces a PlantUML line is made of: a reference to an element, and the patterns that say what a line is.
 *
 * None of them needs a drawing: a reference is a name with its decorations removed, and the patterns are the vocabulary a line is
 * matched against. They lived in the parser because that is where they were first needed, and a unit test cannot reach them there
 * without building a diagram.
 */
import type { NodeShape } from './model.js';
export declare const ARROW: RegExp;
export declare const QUOTED_ALIAS: RegExp;
export declare const BRACKET_ALIAS: RegExp;
export declare const PLAIN_ALIAS: RegExp;
export declare const BRACKET: RegExp;
export interface Reference {
    id: string;
    label?: string;
    shape?: NodeShape;
}
export declare function reference(token: string): Reference;
