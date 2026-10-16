/**
 * The communication diagram module.
 *
 * A communication diagram is a set of lifelines joined by links, with numbered messages
 * travelling along the links. PlantUML has no communication-diagram type - the page is a
 * 404 and the navigation lists none - but the drawing is expressible with the object
 * diagram's vocabulary: objects for the lifelines, arrows for the links, and the sequence
 * number in the arrow's label.
 *
 * That last point is why this family is *not* refused. An earlier version of the family
 * table said neither notation spells the numbering or the link roles, so a parse would
 * invent an order. The numbering is spelled - `C --> O : 1: create` carries both the link
 * and the order - and the renderer writes it back the same way. What the notation cannot
 * say is the *nesting* that a number like `1.1` implies (which message is a nested call of
 * which), so the model keeps the number as the string the diagram wrote and makes no claim
 * about the tree it suggests.
 *
 * @module model-everything-uml-communication
 */
import { type UmlNotation, type UmlFamilyModule, type UmlFamilyParse, type UmlFamilyRender, type UmlFamilyFinding } from './uml-syntax.js';
/**
 * A message number as the diagram wrote it: `1`, `2`, `1.1`, `3a`.
 *
 * It is a string, not a number, and the module does not parse its structure. `1.1` reads as
 * a nested call in UML, but that is a claim about the design; the diagram only draws a
 * label, and inventing the call tree from a dotted string would be the sort of guess this
 * plugin refuses to make elsewhere.
 */
export type CommunicationSequence = string;
export interface CommunicationLifeline {
    id: string;
    label?: string;
    /** `:Name` in the drawing is a classifier, `Name` alone is an instance. */
    classifier?: string;
}
export interface CommunicationLink {
    from: string;
    to: string;
    label?: string;
}
export interface CommunicationMessage {
    sequence: CommunicationSequence;
    from: string;
    to: string;
    /** The message name and arguments, without the number. */
    label?: string;
}
/**
 * A communication diagram as a model.
 *
 * `links` is what the diagram draws between lifelines; a message travels along one. The two
 * are kept apart because a link with no message is a real thing to notice, and so is a
 * message with no link to carry it.
 */
export interface CommunicationModelV1 {
    schemaVersion: 1;
    lifelines: CommunicationLifeline[];
    links: CommunicationLink[];
    messages: CommunicationMessage[];
    /** Ids a message or link named that no declaration introduced. */
    undeclared?: string[];
    narrative?: {
        lifelines?: Record<string, string>;
    };
}
/**
 * Validate a candidate model and normalize it.
 *
 * A sequence number must be unique: two messages with the same number is not a style
 * question, it is a diagram whose order has two answers.
 */
export declare function validateCommunicationModel(input: unknown): CommunicationModelV1;
/**
 * Render a communication diagram as PlantUML.
 *
 * Objects for the lifelines, arrows for the links, and one arrow per message with its
 * number in the label. A message whose lifelines have no declared link is still drawn -
 * the notation allows it - and the review reports it rather than the renderer hiding it.
 *
 * @param input - candidate `CommunicationModelV1`.
 * @param notation - only `plantuml` draws this family.
 */
export declare function renderCommunication(input: unknown, notation: UmlNotation): UmlFamilyRender;
/**
 * Read a communication diagram back into a model.
 *
 * Hand-written text is read the same way the renderer writes it: `object` declarations are
 * the lifelines, `--` arrows are the links, and an arrow whose label starts with a number
 * and a colon is a message. A line that is neither is reported in `discardedConstructs`.
 */
export declare function parseCommunication(text: string, notation: UmlNotation): UmlFamilyParse<CommunicationModelV1>;
export type CommunicationFindingCode = 'UML063_COMMUNICATION_NO_LIFELINES' | 'UML064_COMMUNICATION_LIFELINE_UNLINKED' | 'UML065_COMMUNICATION_MESSAGE_WITHOUT_LINK' | 'UML066_COMMUNICATION_UNDECLARED_ENDPOINT' | 'UML067_COMMUNICATION_SEQUENCE_DUPLICATE' | 'UML068_COMMUNICATION_UNDOCUMENTED';
export declare const COMMUNICATION_FINDING_CODES: readonly CommunicationFindingCode[];
/** Sequence numbers as they sort: `2` before `10`, `1.1` before `1.2`. */
declare function sequenceOrder(left: string, right: string): number;
/**
 * What a reader would get wrong about a communication diagram.
 *
 * The checks are the ones the diagram exists to answer: is every lifeline reachable, does
 * every message travel a link that was drawn, does any number appear twice, and is each
 * participant named after something in the design. The order the numbers imply is *not*
 * checked against the drawing order - the numbers are the order, and the drawing order is
 * not a claim.
 */
export declare function reviewCommunicationModel(model: CommunicationModelV1, labels: Record<string, string>): UmlFamilyFinding[];
/** The communication family, as the engine's registry expects it. */
export declare const communicationModule: UmlFamilyModule<CommunicationModelV1>;
/** Sort two sequence numbers the way a reader reads them: `2` before `10`, `1.1` before `1.2`. */
export { sequenceOrder as communicationSequenceOrder };
