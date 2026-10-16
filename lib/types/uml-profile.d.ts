/**
 * The profile diagram module.
 *
 * A profile is a package that extends the metamodel: stereotypes, the metaclasses they
 * extend, and the profiles applied to a package. That is a shape of its own, so it has
 * its own model rather than being flattened into a class diagram.
 *
 * PlantUML draws one *approximately*: it has `metaclass` and `stereotype` elements and
 * `class X <<stereotype>>`, and the relation set of its class diagram, but no `profile`
 * keyword and no Profile/ProfileApplication element. The drawing is therefore one-way.
 * Reading the text back would have to guess which `--|>` is a stereotype extending a
 * metaclass and which is one stereotype specialising another — two different facts about
 * the profile, drawn identically — so the parse is refused by name instead of inventing
 * the one the reader cannot see. That refusal is the family table's `parseable: false`.
 *
 * @module model-everything-uml-profile
 */
import { type UmlNotation, type UmlFamilyModule, type UmlFamilyRender, type UmlFamilyFinding } from './uml-syntax.js';
/** The profile itself: the package the stereotypes are defined in. */
export interface ProfileSpec {
    id: string;
    label?: string;
}
export interface ProfileStereotype {
    id: string;
    /** Human-readable name, when the diagram gave one that differs from the id. */
    label?: string;
}
/** `ExtensionEnd` multiplicity, as the specification spells it: `0..1` or `1`. */
export type ProfileMultiplicity = '0..1' | '1';
/** A stereotype extending a metaclass: the `Extension` of the metamodel. */
export interface ProfileExtension {
    stereotype: string;
    metaclass: string;
    /** The composite end's multiplicity. Absent when the diagram did not say. */
    multiplicity?: ProfileMultiplicity;
    /** A role name on the extension end, when the profile gave one. */
    label?: string;
}
/** A profile made available to a package: `ProfileApplication`. */
export interface ProfileApplication {
    profile: string;
    /** The package the profile applies to. */
    applyTo: string;
}
/**
 * A profile diagram as a model.
 *
 * `applications` is carried even though this build's renderer leaves it to the
 * directives: PlantUML has no ProfileApplication element, and a profile whose
 * application is not written down is a profile nobody can tell is in use.
 */
export interface ProfileModelV1 {
    schemaVersion: 1;
    profile: ProfileSpec;
    stereotypes: ProfileStereotype[];
    metaclasses: ProfileStereotype[];
    extensions: ProfileExtension[];
    applications: ProfileApplication[];
    /** Stereotype-to-stereotype specialisation; a different fact from an extension. */
    generalizations: Array<{
        general: string;
        specific: string;
    }>;
    /** Ids a relation named that no declaration introduced; the review reports them. */
    undeclared?: string[];
    narrative?: {
        profile?: string;
        stereotypes?: Record<string, string>;
        metaclasses?: Record<string, string>;
    };
}
/**
 * Validate a candidate model and normalize it.
 *
 * The contract every family keeps: an undeclared key or a wrong type is a refusal with
 * `UML_INPUT`, never a silently dropped field.
 */
export declare function validateProfileModel(input: unknown): ProfileModelV1;
/**
 * Render a profile as PlantUML.
 *
 * The drawing is the approximation the family table declares: stereotypes and
 * metaclasses as the class diagram draws them, extensions and generalizations both as a
 * `--|>` because the notation has no second arrow for the first. Everything the drawing
 * cannot carry — which arrow is which, the extension multiplicity and role, the
 * applications — is written as a directive, so the text is a faithful record of the
 * model even though the picture is not.
 *
 * @param input - candidate `ProfileModelV1`.
 * @param notation - only `plantuml` draws a profile; mermaid has no view of this family.
 */
export declare function renderProfile(input: unknown, notation: UmlNotation): UmlFamilyRender;
export type ProfileFindingCode = 'UML050_PROFILE_NO_STEREOTYPES' | 'UML051_PROFILE_UNUSED_STEREOTYPE' | 'UML052_PROFILE_EXTENSION_MISSING' | 'UML053_PROFILE_GENERALIZATION_CYCLE' | 'UML054_PROFILE_UNDECLARED_REFERENCE' | 'UML055_PROFILE_APPLICATION_MISSING' | 'UML056_PROFILE_UNDOCUMENTED';
export declare const PROFILE_FINDING_CODES: readonly ProfileFindingCode[];
/**
 * What a reader would get wrong about a profile.
 *
 * The checks read the model alone. Whether a profile is *right* for the metamodel it
 * extends is a question about the specification being profiled, and this does not answer
 * it: the codes below are about the profile being internally complete and readable.
 */
export declare function reviewProfileModel(model: ProfileModelV1, labels: Record<string, string>): UmlFamilyFinding[];
/**
 * The profile family, as the engine's registry expects it.
 *
 * `parse` refuses with the family table's own words. It has to exist because the module
 * contract requires it, and it must refuse rather than return something: a parse would
 * have to decide which `--|>` is an extension and which is a generalization, and the
 * notation does not say.
 */
export declare const profileModule: UmlFamilyModule<ProfileModelV1>;
