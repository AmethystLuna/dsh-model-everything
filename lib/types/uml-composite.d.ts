/**
 * The composite structure diagram module.
 *
 * A composite structure diagram is a structured classifier seen from the inside: the parts
 * it is made of, the ports on its boundary, and the connectors between them. That reads
 * back out of the text, which is what separates this family from the profile.
 *
 * PlantUML has no composite-structure page, so the view is an approximation built from the
 * deployment diagram's vocabulary: a nested element for the classifier, the nestable
 * elements for its parts, `port`/`portin`/`portout` for the boundary, and the arrows for
 * connectors. Nesting is spelled, port direction is spelled, and both connector ends are
 * spelled - so the model survives the round trip. What the notation cannot say (a part's
 * type, a port's required interface, a connector's name) stays out of the model rather
 * than being invented on the way back.
 *
 * @module model-everything-uml-composite
 */
import { type UmlNotation, type UmlFamilyModule, type UmlFamilyParse, type UmlFamilyRender, type UmlFamilyFinding } from './uml-syntax.js';
/** One end of a connector: the classifier itself, one of its ports, or one of its parts. */
export type CompositeEndpoint = string;
/** The structured classifier being opened up. */
export interface CompositeSpec {
    id: string;
    label?: string;
    /** The keyword it is drawn with; `component` is the deployment diagram's default. */
    kind: string;
}
export interface CompositePart {
    id: string;
    label?: string;
}
export type CompositePortDirection = 'in' | 'out' | 'inout';
export interface CompositePort {
    id: string;
    /** `in` is `portin`, `out` is `portout`, `inout` is the bare `port`. */
    direction: CompositePortDirection;
}
export interface CompositeConnector {
    from: CompositeEndpoint;
    to: CompositeEndpoint;
    label?: string;
}
/**
 * A composite structure diagram as a model.
 *
 * `self` is the classifier. Ports and parts belong to it, and a connector endpoint names
 * one of the three - the classifier itself, a port, or a part. The model has no nesting:
 * a part of a part is a second diagram, which is how a reader keeps each view readable.
 */
export interface CompositeModelV1 {
    schemaVersion: 1;
    self: CompositeSpec;
    parts: CompositePart[];
    ports: CompositePort[];
    connectors: CompositeConnector[];
    /** Ids a connector named that no declaration introduced; the review reports them. */
    undeclared?: string[];
    narrative?: {
        self?: string;
        parts?: Record<string, string>;
        ports?: Record<string, string>;
    };
}
/**
 * Validate a candidate model and normalize it.
 *
 * A port id and a part id may not collide: a connector endpoint is a bare name, so two
 * declarations sharing one would make the drawing say two things at once.
 */
export declare function validateCompositeModel(input: unknown): CompositeModelV1;
/**
 * Render a composite structure diagram as PlantUML.
 *
 * The classifier is drawn as a nested element, its parts inside it, its ports on its
 * boundary, and the connectors after the block. The `self` directive carries the
 * classifier's own id, because a nested element's closing brace is the only thing that
 * says where its inside ends.
 *
 * @param input - candidate `CompositeModelV1`.
 * @param notation - only `plantuml` draws this family; mermaid has no ports or connectors.
 */
export declare function renderComposite(input: unknown, notation: UmlNotation): UmlFamilyRender;
/**
 * Read a composite structure diagram back into a model.
 *
 * Faithful to this module's renderer and tolerant of hand-written text: the classifier is
 * the outermost block (named by the `compositeSelf` directive when the renderer wrote it),
 * `port`/`portin`/`portout` lines are its ports, nestable declarations inside the block are
 * its parts, and every arrow between two names is a connector. A construct the notation
 * carries but this model does not - a nested block inside a part, a stereotype, a note - is
 * reported in `discardedConstructs`, never dropped in silence.
 */
export declare function parseComposite(text: string, notation: UmlNotation): UmlFamilyParse<CompositeModelV1>;
export type CompositeFindingCode = 'UML057_COMPOSITE_NO_PARTS' | 'UML058_COMPOSITE_PORT_UNCONNECTED' | 'UML059_COMPOSITE_CONNECTOR_ENDPOINT_MISSING' | 'UML060_COMPOSITE_DUPLICATE_PART' | 'UML061_COMPOSITE_PORT_COLLISION' | 'UML062_COMPOSITE_UNDOCUMENTED';
export declare const COMPOSITE_FINDING_CODES: readonly CompositeFindingCode[];
/**
 * What a reader would get wrong about a composite structure.
 *
 * The questions are the ones the diagram exists to answer: is anything inside, does every
 * port lead somewhere, does every connector join two things that exist, and is each part
 * and port named after something in the system rather than after its drawing position.
 * Whether the decomposition is *right* is a question about the design, and this does not
 * answer it.
 */
export declare function reviewCompositeModel(model: CompositeModelV1, labels: Record<string, string>): UmlFamilyFinding[];
/** The composite structure family, as the engine's registry expects it. */
export declare const compositeModule: UmlFamilyModule<CompositeModelV1>;
