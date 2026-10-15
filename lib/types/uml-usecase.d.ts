/**
 * The use case diagram module.
 *
 * A use case diagram is not a machine: it says who uses the system and which services
 * the system offers, not in what order anything happens. So it has its own model
 * (actors, use cases, a subject, and the relations between them), its own renderer,
 * and its own review. Handing this text to the state parser was the bug this module
 * exists to fix: `:User: --> (Login)` used to come back as a state machine with no
 * finding at all.
 *
 * PlantUML is the only notation that draws one. Mermaid has no use case diagram, and
 * the engine's capability table says so with a reason instead of rendering something
 * else under the name.
 *
 * @module model-everything-uml-usecase
 */
import { type UmlNotation, type UmlFamilyModule, type UmlFamilyParse, type UmlFamilyRender, type UmlFamilyFinding } from './uml-syntax.js';
export interface UseCaseElement {
    id: string;
    /** Human-readable name, when the diagram gave one that differs from the id. */
    label?: string;
}
export type UseCaseRelationKind = 'association' | 'include' | 'extend' | 'generalization';
export interface UseCaseRelation {
    /** The element the relation starts at. For a generalization this is the more specific one. */
    from: string;
    to: string;
    kind: UseCaseRelationKind;
}
/**
 * A use case diagram as a model.
 *
 * The narrative is optional and holds the same information a reader needs: what each
 * actor and each use case means in the words of the system being described.
 */
export interface UseCaseModelV1 {
    schemaVersion: 1;
    /** The system under discussion, when the diagram draws its boundary. */
    subject?: string;
    actors: UseCaseElement[];
    useCases: UseCaseElement[];
    relations: UseCaseRelation[];
    /** Ids a relation named that no declaration introduced; the review reports them. */
    undeclared?: string[];
    narrative?: {
        subject?: string;
        actors?: Record<string, string>;
        useCases?: Record<string, string>;
    };
}
export declare function validateUseCaseModel(input: unknown): UseCaseModelV1;
export declare function renderUseCase(input: unknown, notation: UmlNotation): UmlFamilyRender;
export declare function parseUseCase(text: string, notation: UmlNotation): UmlFamilyParse<UseCaseModelV1>;
export type UseCaseFindingCode = 'UML030_USE_CASE_NO_ACTORS' | 'UML031_USE_CASE_NO_USE_CASES' | 'UML032_ISOLATED_ACTOR' | 'UML033_USE_CASE_WITHOUT_ACTOR' | 'UML034_DANGLING_RELATION_ENDPOINT' | 'UML035_INCLUDE_EXTEND_CYCLE' | 'UML036_ACTOR_TO_ACTOR_ASSOCIATION' | 'UML037_ACTOR_INCLUDE_EXTEND' | 'UML038_SELF_RELATION' | 'UML039_USE_CASE_UNDOCUMENTED';
export declare const USE_CASE_FINDING_CODES: readonly UseCaseFindingCode[];
export declare function reviewUseCaseModel(model: UseCaseModelV1, labels: Record<string, string>): UmlFamilyFinding[];
/** The use case family, as the engine's registry expects it. */
export declare const useCaseModule: UmlFamilyModule<UseCaseModelV1>;
