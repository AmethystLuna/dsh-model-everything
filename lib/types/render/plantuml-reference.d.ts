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
/**
 * The id and label an opening boundary line states. An alias is the id, because edges will name it.
 *
 * A stereotype or a colour written after the name is a decoration on the boundary, not part of what it is called: left in,
 * both ended up in the label and the alias was lost, so the boundary could not be named by an edge or by its own members.
 */
export declare function boundaryOf(declaration: string, keyword: string, ordinal: number): {
    id: string;
    label: string;
    decorations: string[];
};
