/**
 * The structure families: class, object, package, component and deployment diagrams.
 *
 * A structure diagram is not a machine and not a use case list: it is a graph of
 * nodes and the edges between them. The five families differ in vocabulary, not in
 * shape, so they share one module factory and one model.
 *
 * Parsing is not reimplemented here. `structure.ts` already reads this text as a
 * dependency graph, and it is the single source for that reading: this module calls
 * it, then gives the result the family's name. Reviewing does the same - the graph is
 * rendered back and handed to `reviewStructure`, so a structure diagram reviewed
 * through the UML front end and one reviewed through `uml_structure_verify`
 * report the same defects with the same codes.
 *
 * @module model-everything-uml-structure
 */
import { type UmlNotation, type UmlFamilyModule, type UmlFamilyParse, type UmlFamilyRender, type UmlFamilyFinding } from './uml-syntax.js';
export type StructureFamilyId = 'class' | 'object' | 'package' | 'component' | 'deployment';
export interface StructureModelNode {
    id: string;
    /** The declaration the node came from: class, interface, component, node, ... */
    kind: string;
    label?: string;
    /** The container this node was declared inside, when the diagram drew one. */
    parent?: string;
}
export interface StructureModelEdge {
    from: string;
    to: string;
    label?: string;
}
/** A structure diagram as a model: the nodes it declares and the edges it draws. */
export interface StructureModelV1 {
    schemaVersion: 1;
    family: StructureFamilyId;
    nodes: StructureModelNode[];
    edges: StructureModelEdge[];
}
export declare function validateStructureModel(input: unknown, family: StructureFamilyId): StructureModelV1;
export declare function parseStructureFamily(text: string, notation: UmlNotation, family: StructureFamilyId): UmlFamilyParse<StructureModelV1>;
export declare function renderStructureFamily(input: unknown, notation: UmlNotation, family: StructureFamilyId): UmlFamilyRender;
/**
 * The review is the structure tool's, reached through a render.
 *
 * A structure diagram's defects are properties of its graph, and `reviewStructure`
 * already checks them (isolated node, dangling endpoint, cycle, and the matrix rules
 * when one is declared). Re-deriving them here would be a second implementation of
 * the same checks, and the two would drift. So the model is rendered back and handed
 * over, which also proves the round trip on the way.
 */
export declare function reviewStructureFamily(model: StructureModelV1, labels: Record<string, string>, notation: UmlNotation): UmlFamilyFinding[];
/** One module per structure family: they differ in vocabulary, not in shape. */
export declare function structureFamilyModule(family: StructureFamilyId): UmlFamilyModule<StructureModelV1>;
