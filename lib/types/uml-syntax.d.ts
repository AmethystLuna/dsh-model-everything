/**
 * The notation syntax engine.
 *
 * One place knows what Mermaid and PlantUML can spell, which UML 2.5 diagram type a
 * piece of text is, and whether a requested (notation, family, action) cell exists at
 * all. Family modules know what to do with the elements this engine finds.
 *
 * Before this module, detection fell through: any PlantUML text that was not a
 * sequence diagram went to the state parser. A use case diagram drawn with
 * `:Actor: --> (UseCase)` came back as a state machine with no finding, which is
 * the false guarantee this plugin exists to prevent. Detection is now total. A text
 * either names a family this engine knows, or it is refused by name.
 *
 * What lives here:
 *   - the notation table: comment prefixes, headers, chrome and edge operators;
 *   - the family table: all fourteen UML 2.5 diagram types, their group, and what each
 *     notation can express for them;
 *   - the capability decision: (notation, family, action) -> supported | refusal,
 *     separate from whether this build implements the family (that is the registry's
 *     job, in `uml.ts`);
 *   - notation-agnostic lexical primitives: directives, line scanning, edge splitting,
 *     identifier and label rules.
 *
 * What deliberately does not live here: family semantics. A family module turns the
 * elements this engine finds into its own model, renders that model back, and reviews
 * it. `uml-usecase.ts` is the first such module. The machine families (state,
 * activity) and the trace family (sequence) predate the module contract and keep their
 * own path in `uml.ts`.
 *
 * @module model-everything-uml-syntax
 */
/**
 * A UML front-end refusal. `code` lets the tool report *why* it refused instead
 * of collapsing every refusal into a generic input error.
 */
export declare class UmlError extends Error {
    readonly code: string;
    constructor(message: string, code?: string);
}
export type UmlNotation = 'mermaid' | 'plantuml';
export declare const UML_NOTATIONS: readonly UmlNotation[];
export declare function isUmlNotation(value: unknown): value is UmlNotation;
/** Mermaid node ids that cannot stand alone; the renderer aliases around them. */
export declare const MERMAID_RESERVED_NODE_IDS: ReadonlySet<string>;
/** Ids a notation can spell without an alias. */
export declare const UML_PLAIN_ID: RegExp;
/** Characters that would break a generated label, whichever notation is used. */
export declare const UML_UNSAFE_LABEL: RegExp;
/** The comment prefix each notation uses for its dsh-model-everything: directives. */
export declare function commentPrefix(notation: UmlNotation): string;
export declare function escapeRegExp(text: string): string;
export type UmlFamilyId = 'state' | 'activity' | 'sequence' | 'use-case' | 'class' | 'object' | 'package' | 'component' | 'composite-structure' | 'deployment' | 'profile' | 'communication' | 'interaction-overview' | 'timing';
/**
 * How faithfully a notation expresses one UML diagram type.
 *
 * - `faithful`: the notation models this diagram type; a parse reconstructs it.
 * - `approximate`: the notation can draw something in this area, but reading it
 *   back would produce a model of a *different* diagram. Rendering is allowed with a
 *   warning; parsing is refused.
 * - `none`: the notation has no view of this diagram type at all.
 */
export type UmlFidelity = 'faithful' | 'approximate' | 'none';
export interface UmlNotationSupport {
    fidelity: UmlFidelity;
    /** Header keywords that declare the family outright (Mermaid: `classDiagram`). */
    headers?: readonly string[];
    /** Declaration keywords the family owns (PlantUML: `actor`, `usecase`). */
    declarations?: readonly string[];
    /** Why the fidelity is what it is, in the words the refusal uses. */
    note?: string;
}
export interface UmlFamilySpec {
    id: UmlFamilyId;
    /** English name of the UML 2.5 diagram type. */
    name: string;
    /** Chinese name, for the bilingual documentation. */
    nameZh: string;
    group: 'structure' | 'behaviour' | 'interaction';
    /**
     * True when a faithful parse of this family is a LogicModelV1 the verification
     * engine can run. False for every structure family and for the trace families.
     */
    machine: boolean;
    /**
     * False when a parse could not reconstruct the diagram even in a faithful notation.
     * A sequence diagram is a trace: it shows the paths that were walked, not the
     * branches that were not.
     */
    parseable: boolean;
    /**
     * Whether this build can read the family back out of a notation that only approximates
     * it. Absent means no.
     *
     * This is not derivable from the notation's fidelity. `fidelity` says how much of the
     * specification the drawing carries; this says whether what the model *does* carry
     * survives a round trip, which is a measurement, not a label. A composite structure is
     * drawn approximately and reads back exactly - nesting, port direction and both
     * connector ends are all spelled - while a profile is drawn approximately and cannot be
     * read back at all. Refusing the first because the second is impossible would leave a
     * working view switched off.
     */
    parseThroughApproximation?: boolean;
    /** Why a parse is refused, when `parseable` is false. */
    parseRefusal?: string;
    /** Code the parse refusal carries; defaults to `UML_NOT_A_STATE_DIAGRAM`. */
    parseRefusalCode?: string;
    mermaid?: UmlNotationSupport;
    plantuml?: UmlNotationSupport;
}
/**
 * The family table. Order matters twice: a Mermaid header is matched in this order,
 * and a PlantUML declaration keyword is too. The machine families come first because
 * their headers are the most specific.
 */
export declare const UML_FAMILIES: readonly UmlFamilySpec[];
export declare const UML_FAMILY_IDS: readonly UmlFamilyId[];
export declare function isUmlFamilyId(value: unknown): value is UmlFamilyId;
export declare function umlFamilySpec(id: UmlFamilyId): UmlFamilySpec;
/** What one notation can do with one family. `none` when the table says nothing. */
export declare function umlNotationSupport(notation: UmlNotation, family: UmlFamilyId): UmlNotationSupport;
/**
 * Mermaid headers that name something other than a UML diagram type. Recognizing them
 * matters: the text must not be reported as "cannot tell whether this is Mermaid or
 * PlantUML", and it must not be parsed as a state diagram, whose every line would be
 * ignored or misread. ER, gantt, mindmap and the C4 family are not UML 2.5 diagrams.
 */
export declare const FOREIGN_MERMAID_FAMILIES: readonly string[];
/** The non-UML Mermaid family this text declares, if any. */
export declare function foreignMermaidFamily(text: string): string | undefined;
/** Every Mermaid header this engine knows, for the "expected one of" message. */
export declare function mermaidHeaderList(): string;
export declare function detectUmlNotation(text: string): UmlNotation;
export interface UmlFamilyDetection {
    family: UmlFamilyId;
    /** The header or keyword that decided it, for the report. */
    evidence: string;
}
export declare function plantumlUseCaseSyntax(text: string): boolean;
export declare function plantumlTimingSyntax(text: string): boolean;
export declare function plantumlCompositeSyntax(text: string): boolean;
export declare function plantumlErSyntax(text: string): boolean;
export declare function plantumlCommunicationSyntax(text: string): boolean;
export interface UmlDetectOptions {
    /** The family a `dsh-model-everything:uml` directive declared, when the text carries one. */
    hint?: UmlFamilyId;
}
/**
 * Which UML diagram type this text is, in this notation.
 *
 * Total by construction: every branch either names a family or throws. A foreign
 * Mermaid family (ER, gantt, mindmap, C4, ...) is refused by name, so the caller can
 * report *what* the text is instead of blaming the notation.
 */
export declare function detectUmlFamily(text: string, notation: UmlNotation, options?: UmlDetectOptions): UmlFamilyDetection;
/** The four actions the UML front end offers. */
export type UmlIntentAction = 'render' | 'parse' | 'review' | 'labels';
export type UmlCapability = {
    ok: true;
    warning?: string;
} | {
    ok: false;
    errorCode: string;
    message: string;
};
export interface UmlCapabilityOptions {
    /**
     * Whether this call needs a parse. A review of a *model* in a family the notation can
     * only approximate does not, and refusing it for a reason that belongs to the diagram
     * would be refusing the part that works.
     */
    requireParse?: boolean;
}
/**
 * Whether this (notation, family, action) cell exists.
 *
 * This is the notation's answer, not this build's: a family the table says is faithful
 * is still refused when no module implements it, and that refusal belongs to the
 * registry (see `uml.ts`). Keeping the two apart is what lets the engine document
 * all fourteen diagram types while the implementation lands family by family.
 */
export declare function umlCapability(notation: UmlNotation, family: UmlFamilyId, action: UmlIntentAction, options?: UmlCapabilityOptions): UmlCapability;
/** `umlCapability`, as a throw. */
export declare function assertUmlCapability(notation: UmlNotation, family: UmlFamilyId, action: UmlIntentAction): UmlCapability;
export interface UmlFamilyParse<Model> {
    model: Model;
    /** Display labels found in the diagram, keyed by element id. */
    labels: Record<string, string>;
    warnings: string[];
    /** Declarations the parser could not represent, with the line that carried them. */
    discardedConstructs: Array<{
        construct: string;
        line: number;
        text: string;
    }>;
    discardedEdges: number;
}
export interface UmlFamilyRenderOptions {
    /** Cap on a trace length, for the families that render one. */
    maxSteps: number;
}
export interface UmlFamilyRender {
    primary: string;
    warnings: string[];
}
export interface UmlFamilyFinding {
    code: string;
    severity: 'error' | 'warning' | 'info';
    message: string;
    detail?: string;
    evidence?: Record<string, unknown>;
}
/**
 * What a family module must provide. The engine finds the elements; the module gives
 * them meaning, draws them back, and says what a reader would get wrong.
 */
export interface UmlFamilyModule<Model> {
    id: UmlFamilyId;
    /**
     * The notation this family is drawn in, when only one can draw it.
     *
     * Absent means "either, as the caller asks", which is true for most families. A family
     * whose table gives one notation `none` has exactly one answer, and saying it here is
     * what lets a review of a *model* render the family instead of reporting that the model
     * cannot be drawn at all.
     */
    notation?: UmlNotation;
    render(input: unknown, notation: UmlNotation, options: UmlFamilyRenderOptions): UmlFamilyRender;
    parse(text: string, notation: UmlNotation): UmlFamilyParse<Model>;
    /** Family findings for the review: what the diagram itself gets wrong. */
    review?(model: Model, labels: Record<string, string>, notation: UmlNotation): UmlFamilyFinding[];
}
/** Marker every generated diagram carries; renderers ignore it, the parser uses it. */
export declare const DIRECTIVE_NAMESPACE = "dsh-model-everything:";
/** The directive body of a comment line, or null when the line is not a directive. */
export declare function directiveBody(line: string, notation: UmlNotation): string | null;
/** One directive line, in the notation's own comment syntax. */
export declare function directiveLine(notation: UmlNotation, text: string): string;
export interface UmlDirectives {
    /** What the `uml v1` header declared, when it carried one. */
    declared: {
        notation?: string;
        family?: string;
        diagram?: string;
    };
    /** Every other directive, keyed by its first word, values in file order. */
    values: Map<string, string[]>;
    /** The lines that are not directives. */
    body: string[];
}
/**
 * Read the `dsh-model-everything:` directives out of a diagram.
 *
 * `diagram=` is the pre-family spelling and is still read: a file rendered by an
 * earlier version must parse the same way it did.
 */
export declare function readUmlDirectives(lines: readonly string[], notation: UmlNotation): UmlDirectives;
/** The family a rendered diagram declares, in either spelling. */
export declare function declaredFamily(directives: UmlDirectives): UmlFamilyId | undefined;
export interface UmlSourceLine {
    /** 1-based line number in the source text. */
    number: number;
    /** The line, trimmed. */
    text: string;
}
/**
 * The content lines of a diagram: blank lines, comments and notation chrome removed,
 * each with its source line number. Chrome is what a renderer needs and a reader does
 * not: `@startuml`, `@enduml`, `direction`, `classDef`, `skinparam`,
 * `scale`, `title`, `hide` and `autonumber`.
 */
export declare function umlSourceLines(text: string, notation: UmlNotation, skip?: RegExp): UmlSourceLine[];
export interface UmlEdgeSplit {
    from: string;
    operator: string;
    to: string;
    label?: string;
}
/**
 * Split one line into from / operator / to, with a trailing `: label` separated.
 *
 * The operator tables are the notation's, not the family's: a class diagram writes
 * `A <|-- B` and a use case diagram writes `A --> B` in the same notation, and both
 * come through here. Whether an operator *means* a dependency, an association or a
 * generalization is the family module's call.
 */
export declare function splitUmlEdge(line: string, notation: UmlNotation): UmlEdgeSplit | undefined;
