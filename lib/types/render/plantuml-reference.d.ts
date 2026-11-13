/**
 * What an endpoint of a PlantUML line states: a name, the label it carries, and the shape it asks for.
 *
 * A reference is read from one token and needs no drawing - the name with its decorations removed. It lived in the parser because
 * that is where it was first needed, and a unit test cannot reach it there without building a diagram.
 */
import type { EdgeArrow, NodeShape } from './model.js';
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
export declare const ARROW: RegExp;
export interface ArrowParts {
    from: Reference;
    to: Reference;
    label: string;
    dashed: boolean;
    arrow: EdgeArrow;
}
export declare function readArrow(line: string): ArrowParts | string | undefined;
