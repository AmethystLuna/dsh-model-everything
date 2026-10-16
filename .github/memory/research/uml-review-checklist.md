---
name: uml-review-checklist
description: 逐图族审阅清单：可机械检出的缺陷、判定依据（规范 WFR / 工具规则 / 风格建议）、UNCONFIRMED 项与检测方法
metadata:
  type: project
---

# UML 2.5.1 reviewer checklist — mechanically checkable defects

## Sources

- [SPEC] OMG UML 2.5.1 (formal/2017-12-05) - <https://www.omg.org/spec/UML/2.5.1/PDF> - every "Sx.y.z" below is a Constraints subsection of the spec.
- [EA] Sparx Enterprise Architect 17.1, Model Validation rules reference - <https://sparxsystems.com/resources/user-guides/17.1/model-domains/model-validation.pdf> (rule ids MVRxxnnnn).
- [MD] MagicDraw 2024x, "UML completeness constraints rules" index - <https://docs.nomagic.com/spaces/MD2024xR2/pages/189143254/UML+completeness+constraints+rules> ; individual rule pages cited by URL.
- [ML] mermaid-lint semantic rule table - <https://github.com/jasonworden/mermaid-lint> (packages/markdownlint/README.md) and <https://jasonworden.com/blog/introducing-mermaid-lint/>
- [SK] statekit Go linter (state machines) - <https://pkg.go.dev/github.com/felixgeelhaar/statekit@v1.0.0/lint>
- [AMB] Ambler, The Elements of UML 2.0 Style, cited + enumerated in Univ. Freiburg lecture 09 slides - <http://swt.informatik.uni-freiburg.de/teaching/WS2012-13/sdmauml/Resources/Slides/lecture-20121126-1-annot-fix.pdf>
- [VPC] Visual Paradigm, "Avoiding Beginner Mistakes in Class Diagram Design" - <https://skills.visual-paradigm.com/docs/uml-basics-diagrams-for-beginners/mastering-class-diagrams-beginner/uml-class-diagram-mistakes-avoid/>
- [ADP] Acyclic Dependencies Principle (design principle, NOT UML) - <https://en.wikipedia.org/wiki/Acyclic_dependencies_principle>

## Legend

- [WFR] = normative UML 2.5.1 well-formedness constraint (checked by the spec's own OCL).
- [TOOL] = a named rule shipped in a validator/linter (not necessarily a UML rule).
- [STYLE]/heuristic = book/lecture/architecture guideline.
- UNCONFIRMED = I found no source; do NOT emit as a UML defect without a project convention.

IMPORTANT: several commonly requested checks are NOT UML well-formedness rules. They are tool or style rules: missing association multiplicity; decision with <2 outgoing; merge with <2 incoming; missing return for a synchronous call; fragment without an operand guard; "no final node"; abstract class with no subclass; unprotected isolated nodes/use cases; unassigned artifact; node with no deployed artifact; package/component dependency cycle. Flagging them as WFR violations would be wrong.

---

## 1. Class diagram

Model: Class/Interface/DataType/Enumeration/AssociationClass nodes; Generalization, Association(+memberEnd Property), Dependency, InterfaceRealization, Nesting edges.

- Generalization cycle, incl. self-generalization - hierarchy must be directed and acyclic; a Classifier may not be both transitively general and transitively specific of itself. Detect: digraph over Generalization.general->generalization.specific; DFS cycle detection; a self-loop is self-generalization. [WFR] Classifier::no_cycles_in_generalization S9.9.4.8; [TOOL] EA MVR050005 "cannot generalize self".
- Specializing a final (isLeaf) classifier - parents must be non-final. Detect: Generalization.general.isFinalSpecialization == true. [WFR] Classifier::non_final_parents S9.9.4.8; [TOOL] EA MVR050003.
- Child with isRoot=true used as a specific - Detect: Generalization.specific.isRoot. [TOOL] EA MVR050004 (no matching spec constraint found).
- isLeaf && isAbstract both true - contradictory. Detect: element.isLeaf && element.isAbstract. [TOOL] EA MVR030003.
- Duplicate member names in one classifier/namespace - all members of a Namespace must be distinguishable. Detect: group ownedMember by (name) and by (name, parameter types) for Operations; duplicates. [WFR] Namespace::members_distinguishable S7.8.10.7; [TOOL] ML mermaid-class-duplicate-class, mermaid-no-duplicate-methods (notation analogue).
- Abstract behavioural feature with a method - [WFR] BehavioralFeature::abstract_no_method S9.9.2.8. Detect: isAbstract && !method.isEmpty().
- Association endpoint with no resolvable type ("dangling") - [WFR] Association::ends_must_be_typed S11.8.1.8 (memberEnd->forAll(type->notEmpty())). Detect: every Association.memberEnd.type must resolve to a Classifier present in the model; unresolved id => dangling. An unresolved NAME in diagram text is a parse error: [TOOL] ML mermaid-syntax.
- N-ary association whose ends are not owned by the association - [WFR] Association::association_ends S11.8.1.8 (memberEnd->size()>2 implies ownedEnd->includesAll(memberEnd)).
- Aggregation/composition on a non-binary association - [WFR] Association::binary_associations S11.8.1.8; [STYLE] [VPC] "confusing aggregation and composition" (also: wrong diamond).
- Composite-aggregation end with upper bound > 1 - [WFR] Property::multiplicity_of_composite S9.9.17.8.
- Property subsets a property of the same name; derived union not derived / not read-only - [WFR] Property::subsetted_property_names, derived_union_is_derived, derived_union_is_read_only S9.9.17.8.
- Association specializing an association with a different number of ends, or an end whose type is not a subtype of the corresponding general end - [WFR] Association::specialized_end_number, specialized_end_types S11.8.1.8.
- GeneralizationSet whose member Generalizations have different generals - [WFR] GeneralizationSet::generalization_same_classifier S9.9.8.6.
- Classifier that maps to a GeneralizationSet and is also its general/specific (powertype) - [WFR] Classifier::maps_to_generalization_set S9.9.4.8 and S9.9.8.6.
- AssociationClass defined between itself and something else; owned attributes overlapping owned ends - [WFR] AssociationClass::cannot_be_defined, disjoint_attributes_ends S11.8.2.4.
- More than one return parameter; bodyCondition on a non-query - [WFR] Operation::at_most_one_return, only_body_for_query S9.9.11.7.
- Interface feature with non-public visibility - [WFR] Interface::visibility S10.5.5.5.
- Multiplicity upper < lower, or negative lower - [WFR] MultiplicityElement::upper_ge_lower, lower_ge_0 S7.8.8.8.
- Specialization of an incompatible type (e.g. Actor specializing a Class) - [WFR] Classifier::specialize_type S9.9.4.8.
- Missing association multiplicity - NOT a WFR. [TOOL] MD "No Association Multiplicity" (189143291); [AMB] guideline 117 "Always Indicate the Multiplicity"; [VPC] checklist "Is multiplicity used where needed?".
- Isolated class (no relationship at all) - NOT a WFR (a standalone class is legal). Notation analogue [TOOL] ML mermaid-no-orphan-nodes ("node declared but never connected"); treat as a review heuristic.
- Abstract class with no subclass and no instantiation - UNCONFIRMED (no spec constraint, no tool rule found).
- Too many classes / >2-compartment classes / inconsistent naming - [STYLE] [VPC] "more than 10-15 classes -> split"; [AMB] guidelines 103 "Never Show Classes with Just Two Compartments", 96, 97.
- Element exists in the model but in no diagram - [TOOL] MD "Element not in diagram" (189143257).
- Nameless class/attribute/operation - [TOOL] MD Nameless Class (189143283), Nameless Attribute (189143281), Nameless Operation (189143285). UML only forces names on Actor/UseCase/ExtensionPoint.

## 2. Object diagram

Model: InstanceSpecification nodes; Slot(definingFeature,value); links (association instances); classifier refs.

- InstanceSpecification with no classifier - cannot tell what it instantiates. Detect: classifier empty. [TOOL] MD "No Classifier for Instance" (189143293).
- Slot whose definingFeature is not a StructuralFeature of one of the instance's classifiers (incl. inherited/memberEnd) - [WFR] InstanceSpecification::defining_feature S9.9.9.6. Detect: for each Slot, definingFeature must be a StructuralFeature of the instance's classifier closure.
- Two slots with the same definingFeature - [WFR] InstanceSpecification::structural_feature ("no more than one slot ... may have the same definingFeature") S9.9.9.6; [TOOL] MD "Multiple Slot Values" (189143274).
- Slot/tagged-value multiplicity greater than declared - [TOOL] MD "Slot multiplicity 2" (189143309), "Tags multiplicity 2" (189143312).
- Link with no Association whose ends are compatible with the classifiers at its two ends - Detect: look up an Association; check end types conform to the instance classifiers; none => dangling link. Partially [WFR] Association::ends_must_be_typed S11.8.1.8; the static-link rule itself is UNCONFIRMED (Link is not a 2.5 metaclass).
- Link endpoint referencing an id that does not exist - parse/resolution error, [TOOL] ML mermaid-syntax.
- Instance used in a deployment role must represent a Node (DeploymentTarget) or an Artifact (DeployedArtifact) - [WFR] InstanceSpecification::deployment_target, deployment_artifact S9.9.9.6.

## 3. Package

Model: Package nodes; PackageImport/ElementImport, Dependency, Generalization edges; nesting.

- PackageImport to itself - [WFR] Namespace::cannot_import_self S7.8.10.7.
- ElementImport of an element the Namespace already owns - [WFR] Namespace::cannot_import_ownedMembers S7.8.10.7.
- Import visibility not public/private - [WFR] ElementImport::visibility_public_or_private S7.8.7.7; PackageImport::public_or_private S7.8.11.6.
- Element owned by a package with visibility other than public/private - [WFR] Package::elements_public_or_private S12.4.5.8.
- Duplicate member names in a package - [WFR] Namespace::members_distinguishable S7.8.10.7.
- Import/dependency cycle between packages - NOT a UML WFR (cyclic imports are legal). [STYLE] ADP says the dependency graph must be acyclic; detect DFS over PackageImport/Dependency edges. In-tool this is uml_structure_verify UML022/UML020/UML024.
- Isolated package / empty package - heuristic, UNCONFIRMED as a WFR (ML no-orphan-nodes is the notation analogue).

## 4. Component

- Component nesting Classifiers, or a Component nested in a Class having packaged elements - [WFR] Component::no_nested_classifiers, no_packaged_elements S11.8.6.7.
- Port not owned by an EncapsulatedClassifier; Port.aggregation not composite; defaultValue on an Interface-typed Port - [WFR] Port::encapsulated_owner, port_aggregation, default_value S11.8.14.7.
- ConnectorEnd whose role is not an owned/inherited role (or a Port of such a role) of the classifier owning the Connector; whose partWithPort is a Port; partWithPort set although the end is a Port of the containing classifier; whose type does not conform to the typing Association - [WFR] Connector::roles, types S11.8.10.7; ConnectorEnd::role_and_part_with_port, self_part_with_port, part_with_port_empty S11.8.11.6.
- ConnectorEnd multiplicity more general than the corresponding Association end - [WFR] ConnectorEnd::multiplicity S11.8.11.6.
- Provided interface never realized / required interface never used / artifact unassigned to any component - no WFR found (Artifact, S19.5.1, has no Constraints subsection) => UNCONFIRMED; project convention only.
- Isolation and dependency cycles - as Package (ADP; in-tool UML020/UML022).

## 5. Composite structure

- Connector whose roles are not owned/inherited by the owning EncapsulatedClassifier - [WFR] Connector::roles S11.8.10.7.
- ConnectorEnd whose role is not a Port defined/inherited by the type of partWithPort - [WFR] ConnectorEnd::role_and_part_with_port S11.8.11.6.
- Port outside an EncapsulatedClassifier - [WFR] Port::encapsulated_owner S11.8.14.7.
- CollaborationUse that does not bind every collaborationRole; roleBinding client/supplier elements not in one Classifier/Collaboration; missing corresponding Connectors - [WFR] CollaborationUse::every_role, client_elements, connectors S11.8.5.5.
- Connector between parts whose types do not conform to the ends of the typing Association - [WFR] Connector::types S11.8.10.7.
- Unconnected port / delegation connector to nowhere - not a WFR; UNCONFIRMED (style).

## 6. Deployment

- Node internal structure containing parts that are not Nodes - [WFR] Node::internal_structure S19.5.10.6.
- CommunicationPath whose ends are not typed by DeploymentTargets - [WFR] CommunicationPath::association_ends S19.5.2.4.
- DeploymentSpecification whose DeploymentTarget is not an ExecutionEnvironment, or whose deployed elements are not Components - [WFR] DeploymentSpecification::deployment_target, deployed_elements S19.5.5.6.
- InstanceSpecification performing a deployment role without representing Node/Artifact - [WFR] S9.9.9.6.
- Property acting as a DeploymentTarget that is not a kind of Node and a part in the internal structure of an encompassing Node - [WFR] Property::deployment_target S9.9.17.8.
- Node with no deployed artifact / artifact assigned to no node - no WFR, no tool rule found => UNCONFIRMED.
- Isolated node / cycle of communication paths - heuristic (ML no-orphan analogue).

## 7. Profile

- Extension that is not binary, or whose non-owned end is not typed by a Class - [WFR] Extension::is_binary, non_owned_end S12.4.1.7.
- ExtensionEnd multiplicity not 0..1 or 1; aggregation not composite - [WFR] ExtensionEnd::multiplicity, aggregation S12.4.2.7.
- Stereotype generalizing/specializing something that is not a Stereotype - [WFR] Stereotype::generalize S12.4.9.6.
- Stereotype name clashing with a UML keyword - [WFR] Stereotype::name_not_clash (no OCL) S12.4.9.6.
- metaclassReference that is specialized/generalized inside the profile; metaclass/metamodel references drawn from different metamodels - [WFR] Profile::metaclass_reference_not_specialized, references_same_metamodel S12.4.7.5.
- Stereotype with no extension to any metaclass - [TOOL] MD "No Stereotype Metaclass" (189143301).
- Stereotype property that is an association end not owned by the stereotype - [WFR] Stereotype::associationEndOwnership S12.4.9.6.
- Profile applied but never defined / applied twice to the same package - UNCONFIRMED.

## Part 2 — behaviour and interaction diagrams

## 8. Use case

- Actor associated with anything other than a UseCase/Component/Class, or a non-binary association - [WFR] Actor::associations S18.2.1.4. This is the "association pointing at another actor" defect (Actor-Actor association).
- UseCase-to-UseCase association within the same subject - [WFR] UseCase::no_association_to_use_case S18.2.5.6.
- Non-binary association involving a UseCase - [WFR] UseCase::binary_associations S18.2.5.6.
- Include cycle (UseCase directly or indirectly including itself) - [WFR] UseCase::cannot_include_self S18.2.5.6. Detect: digraph over Include.addition edges from includingCase; cycle.
- Extend cycle - NOT a WFR: Extend's only constraint is extension_points (S18.2.2.5). Report as STYLE/UNCONFIRMED.
- Include/Extend whose endpoint is not a UseCase (e.g. an Actor) - typing violation, not OCL: Include.addition : UseCase [1..1], Include.includingCase : UseCase [1..1], Extend.extendedCase : UseCase [1..1], Extend.extension : UseCase [1..1] - S18.2.4.4/S18.2.4.5. Detect: resolve endpoint meta-type.
- Extend whose extensionLocation is an ExtensionPoint not owned by the extended UseCase - [WFR] Extend::extension_points S18.2.2.5.
- Nameless Actor / UseCase / ExtensionPoint - [WFR] must_have_name S18.2.1.4 / S18.2.5.6 / S18.2.3.5.
- Actor not associated with any use case - [TOOL] MD "Actor and Usecase" (ActorUsecase, severity info, constrained element Actor) - <https://docs.nomagic.com/spaces/MD2024xR2/pages/189143255/Actor+and+Usecase>
- Use case reachable from no actor - the mirror check is not in the tool rule set, and is not a WFR => UNCONFIRMED (style; notation analogue ML mermaid-no-orphan-nodes).
- Actor/UseCase generalization cycle or cross-kind generalization - Actor and UseCase are Classifiers: [WFR] Classifier::no_cycles_in_generalization, specialize_type S9.9.4.8.
- Duplicate actor/use-case names in one namespace - [WFR] Namespace::members_distinguishable S7.8.10.7.

## 9. Activity

- Node with no incoming ActivityEdge that is not an InitialNode (or a parameter node whose parameter is in/inout) - completeness rule. [TOOL] MD "No Activity Incoming Edge" (189143287). Not a WFR per se.
- Non-final node with no outgoing ActivityEdge - dead end. [TOOL] MD "No Activity Outgoing Edge" (189143289); compare [SK] dead-end (state machines).
- Decision with fewer than two outgoing edges - [TOOL] MD "Flows on decision" (DecisionOut): "checks if a Decision Node has more than one Outgoing Edge" - <https://docs.nomagic.com/spaces/MD2024xR2/pages/189143259/Flows+on+decision> . The WFR is weaker: DecisionNode::incoming_outgoing_edges requires "at least one outgoing" (S15.7.12.5). So >=2 is a completeness rule, not a WFR.
- Outgoing flow from a Decision with no guard - [TOOL] MD "Guard on decision" (DecisionGuar, constrained element ActivityEdge, severity warning): "checks if a Flow from a Decision Node has a Guard specified" - <https://docs.nomagic.com/spaces/MD2024xR2/pages/189143261/Guard+on+decision> . Not a WFR.
- Decision with more than two incoming edges; mixed ObjectFlow/ControlFlow on a Decision; decisionInputFlow that is not an incoming edge - [WFR] DecisionNode::incoming_outgoing_edges, edges, decision_input_flow_incoming S15.7.12.5.
- InitialNode with an incoming edge, or a non-ControlFlow outgoing edge - [WFR] InitialNode::no_incoming_edges, control_edges S15.7.18.4.
- FinalNode with an outgoing edge - [WFR] FinalNode::no_outgoing_edges S15.7.15.5.
- Fork with != 1 incoming, Join with != 1 outgoing - [WFR] ForkNode::one_incoming_edge S15.7.17.4; JoinNode::one_outgoing_edge S15.7.20.6. NOTE: "fork must have >=2 outgoing / join >=2 incoming" is NOT in the activity constraints (only in state-machine Pseudostate::fork_vertex/join_vertex, S14.5.6.7) => treat as STYLE for activity.
- Fork/Merge mixing ObjectFlows and ControlFlows; Join with an ObjectFlow incoming but a ControlFlow outgoing (or vice versa) - [WFR] ForkNode::edges S15.7.17.4, MergeNode::edges S15.7.21.4, JoinNode::incoming_object_flow S15.7.20.6.
- Merge with != 1 outgoing - [WFR] MergeNode::one_outgoing_edge S15.7.21.4. ("Merge with <2 incoming" is NOT a WFR => UNCONFIRMED.)
- ControlFlow with an ObjectNode at either end (unless isControlType) - [WFR] ControlFlow::object_nodes S15.7.9.4.
- ObjectFlow with an ExecutableNode at either end - [WFR] ObjectFlow::no_executable_nodes S15.7.22.6.
- ActivityEdge whose source/target are not contained in the same Activity - [WFR] ActivityEdge::source_and_target S15.7.2.8.
- ActivityParameterNode with both incoming and outgoing edges; wrong parameter direction for the flow direction; type != parameter type; parameter not owned by the containing Activity - [WFR] ActivityParameterNode::no_edges, no_incoming_edges, no_outgoing_edges, same_type, has_parameters S15.7.6.5.
- ActivityGroup member outside the group's Activity, or nested in its own subgroup/supergroup - [WFR] ActivityGroup::nodes_and_edges, not_contained S15.7.4.7.
- InterruptibleActivityRegion whose interrupting edge's source is outside the region, or whose target is inside it or outside the enclosing Activity - [WFR] S15.7.19.5.
- ExceptionHandler with edges crossing the handlerBody boundary, wrong OutputPin count/types, handlerBody not owned by the protectedNode's owner, exceptionInput type mismatch - [WFR] ExceptionHandler S15.7.13.5. Missing required child nodes are also reported generically: [TOOL] EA MVR020001 (example: "ExpansionRegion1 is missing its child input ExpansionNode"; "ExceptionHandler1 is missing its child input ObjectNode") - EA guide p.4.
- Incompatible ObjectNode types across an ObjectFlow - [WFR] ObjectFlow::compatible_types (no OCL) S15.7.22.6.
- No final node / unreachable node - no WFR. Unreachable is confirmed as a linter rule for state machines ([SK] unreachable); for activities treat as an analysis check (path from InitialNode) => UNCONFIRMED as a UML defect.

## 10. State machine

- Region with zero or more than one initial Vertex - [WFR] Region::initial_vertex S14.5.8.6.
- Initial vertex with more than one outgoing Transition, or a Trigger/Guard on its outgoing Transition - [WFR] Pseudostate::initial_vertex, outgoing_from_initial S14.5.6.7.
- FinalState with outgoing Transitions, Regions, entry/exit/do behavior, or a submachine reference - [WFR] FinalState S14.5.2.5.
- Join vertex with <2 incoming or !=1 outgoing; incoming join Transitions not originating in different Regions of an orthogonal State - [WFR] Pseudostate::join_vertex, transitions_incoming S14.5.6.7.
- Fork vertex with <2 outgoing or !=1 incoming; outgoing fork Transitions not targeting different Regions - [WFR] Pseudostate::fork_vertex, transitions_outgoing S14.5.6.7.
- Choice or junction vertex with no incoming or no outgoing Transition (in a complete state machine) - [WFR] Pseudostate::choice_vertex, junction_vertex S14.5.6.7.
- History vertex with more than one outgoing Transition; Region with more than one deep/shallow history vertex - [WFR] Pseudostate::history_vertices S14.5.6.7; Region::deep_history_vertex, shallow_history_vertex S14.5.8.6.
- Transition whose source/target are not in the same StateMachine - [WFR] Transition::transition_vertices S14.5.11.8.
- Outgoing Transition from a Pseudostate carrying a Trigger - [WFR] Transition::outgoing_pseudostates S14.5.11.8.
- Guard/Trigger on a fork or join segment; fork segment not targeting a State; join segment not originating from a State - [WFR] Transition::fork_segment_guards, join_segment_guards, fork_segment_state, join_segment_state S14.5.11.8.
- Internal Transition whose source != target or whose source is not a State; local Transition whose source is not a composite State/entry point - [WFR] Transition::state_is_internal, state_is_local, state_is_external S14.5.11.8.
- State with both a submachine and Regions; entry/exit Pseudostates on a non-composite State; connection-point references on a non-submachine State; connection point not defined in the referenced submachine - [WFR] State S14.5.9.8.
- ConnectionPointReference referencing a Pseudostate that is not entryPoint/exitPoint - [WFR] S14.5.1.6.
- Unreachable state (not reachable from the initial vertex) - [TOOL] [SK] rule "unreachable": "state is unreachable from initial state". Detect: BFS/DFS from the Region's initial Vertex over Transition edges; unvisited vertices. NOT a UML WFR.
- Dead-end state: non-final leaf state with no outgoing Transition - [TOOL] [SK] rule "dead-end" (the lint skips final states and compound states).
- Non-determinism: two Transitions from the same state on the same event with no distinguishing guards - [TOOL] [SK] rule "non-determinism".
- Unguarded self-transition on a state that has entry actions - [TOOL] [SK] rule "self-transition".
- Compound state with children but no initial state - [TOOL] [SK] rule "compound-initial".
- Registered action/guard never referenced - [TOOL] [SK] rules "unused-action", "unused-guard".
- ProtocolStateMachine with entry/exit/do behavior, history Pseudostates, non-ProtocolTransitions, or a BehavioralFeature context - [WFR] ProtocolStateMachine S14.5.4.5; ProtocolTransition::associated_actions, belongs_to_psm S14.5.5.6.
- StateMachine with an Interface context, or a method StateMachine that has connection points - [WFR] StateMachine::connection_points, classifier_context, method, context_classifier S14.5.10.7.

## 11. Sequence

- Message arguments do not match the Signature (Signal attributes; Operation in/inout for synchCall/asynchCall; out/inout/return for reply) - [WFR] Message::signature_is_signal, signature_is_operation_request, signature_is_operation_reply S17.12.18.7.
- Message with messageSort synchCall/asynchCall whose signature is not an Operation, or reply without an Operation signature - [WFR] Message::signature_refer_to S17.12.18.7.
- Message whose send and receive events are on the same Lifeline but the receive is not ordered after the send - [WFR] Message::sending_receiving_message_event S17.12.18.7.
- Message to a lifeline that is never declared - notation-level: [TOOL] [ML] mermaid-prefer-explicit-participants ("participant used before being declared"); an unresolved id is a parse error (mermaid-syntax). A Lifeline whose represents ConnectableElement is not in the enclosing classifier violates [WFR] Lifeline::same_classifier S17.12.17.5 - but represents is [0..1] (S17.12.17.5), so a lifeline with no represents is legal.
- Missing return for a synchronous call - NOT a WFR; MessageSort=reply has no cardinality rule. UNCONFIRMED (modelling convention only).
- Fragment (alt/opt) without an operand guard - NOT a WFR; InteractionOperand.guard is InteractionConstraint [0..1] and the only constraint is guard_contain_references (S17.12.14.5). UNCONFIRMED.
- opt/loop/break/assert/neg with more than one operand - [WFR] CombinedFragment::opt_loop_break_neg S17.12.3.7.
- consider/ignore operator on a non-ConsiderIgnoreFragment, or a ConsiderIgnoreFragment with another operator - [WFR] CombinedFragment::consider_and_ignore S17.12.3.7; ConsiderIgnoreFragment::consider_or_ignore, type S17.12.4.5.
- Activation (ExecutionSpecification) whose start and finish are on different Lifelines - [WFR] ExecutionSpecification::same_lifeline S17.12.8.6 (start and finish are each OccurrenceSpecification [1..1], S17.12.8.5).
- Activation without a matching deactivation - notation analogue [TOOL] [ML] mermaid-no-activate-without-deactivate; in UML this is the missing required finish endpoint of the ExecutionSpecification (S17.12.8.5). Confirmed by combining the two.
- OccurrenceSpecification placed below a DestructionOccurrenceSpecification on the same Lifeline - [WFR] DestructionOccurrenceSpecification::no_occurrence_specifications_below S17.12.6.4.
- InteractionUse whose actual Gates do not match the referred Interaction's formal Gates; that does not cover all Lifelines common with the referred Interaction; whose arguments do not correspond to the referred Interaction's parameters - [WFR] InteractionUse::gates_match, all_lifelines, arguments_correspond_to_parameters, arguments_are_constants, returnValue_type_recipient_correspondence S17.12.16.6.
- Gate with no matching formal Gate, or inside a CombinedFragment with no matching Gate outside it - [WFR] Gate::actual_gate_matched, inside_cf_matched, outside_cf_matched S17.12.9.5.
- Continuation that is not the first or last InteractionFragment of its operand - [WFR] Continuation::first_or_last_interaction_fragment S17.12.5.5.
- GeneralOrdering cycle (an OccurrenceSpecification ordered after itself via the transitive closure) - [WFR] GeneralOrdering::irreflexive_transitive_closure S17.12.10.5.
- Lifeline selector present for a non-multivalued Part, or not a LiteralString/LiteralInteger - [WFR] Lifeline::selector_specified, selector_int_or_string S17.12.17.5.
- Two Lifelines declared for the same participant; the same message drawn twice - [TOOL] [ML] mermaid-sequence-duplicate-participant, mermaid-no-duplicate-edges.
- Call message with no operation on the receiver - [TOOL] MD "No Operation for Call Message" (189143297); [TOOL] EA MVR0C0001 "Sequence Violation" ("validates operations being called by Messages ... will report a violation if the operation does not belong to the Lifeline").
- Unreferenced lifeline / lifeline created but never destroyed - NOT a WFR => UNCONFIRMED (notation analogue [ML] mermaid-no-orphan-nodes).
- Interaction nested inside another Interaction - [WFR] Interaction::not_contained S17.12.11.5.

## 12. Communication

- Message between two Lifelines whose represented Parts have no Connector/link - [WFR] Message::occurrence_specifications ("the connector must go between the Parts represented by the Lifelines of the two MessageEnds", no OCL) S17.12.18.7. This is the communication-diagram analogue of a message with no link.
- CommunicationPath whose ends are not typed by DeploymentTargets - [WFR] S19.5.2.4.
- Message signature/argument rules - same as Sequence ([WFR] S17.12.18.7).
- Missing sequence-number prefixes on messages - the number is notation, not a model property; no WFR => UNCONFIRMED as a model defect (report as notation lint only).
- Unreferenced lifeline / lifeline with no connector - UNCONFIRMED (notation analogue [ML] mermaid-no-orphan-nodes).
- Call message with no operation on the receiver - [TOOL] MD "No Operation for Call Message" (189143297).

## 13. Interaction overview

An IOD is an Activity whose nodes are InteractionUse (ref) or inline Interaction, joined by ControlFlow/initial/final nodes.

- InteractionUse referencing an Interaction that does not resolve - type/unresolved reference (InteractionUse::ref : Interaction [1..1], S17.12.16.6); unresolved id is a parse error ([ML] mermaid-syntax).
- Gates mismatch between the InteractionUse and the referred Interaction - [WFR] InteractionUse::gates_match S17.12.16.6; Gate matching rules S17.12.9.5.
- InteractionUse not covering every Lifeline common with the referred Interaction - [WFR] InteractionUse::all_lifelines S17.12.16.6.
- Inline Interaction contained inside another Interaction - [WFR] Interaction::not_contained S17.12.11.5.
- Lifeline that is shared between two InteractionUses but not common with the enclosing Interaction - [WFR] Lifeline::interaction_uses_share_lifeline S17.12.17.5.
- Control-flow defects (node with no incoming/outgoing edge, dangling InitialNode/FinalNode, DecisionNode cardinality) - the Activity WFRs and completeness rules of section 9 apply unchanged: [WFR] S15.7.18.4, S15.7.15.5, S15.7.12.5; [TOOL] MD "No Activity Incoming Edge"/"No Activity Outgoing Edge" (189143287/189143289).

## 14. Timing

- DurationConstraint with neither one nor two constrainedElements; firstEvent multiplicity mismatched to constrainedElement multiplicity - [WFR] DurationConstraint::lements (one or two constrainedElements), first_event_multiplicity S8.6.2.6.
- TimeConstraint with more or fewer than one constrainedElement - [WFR] TimeConstraint S8.6.18.6.
- Duration without an expr and without exactly one DurationObservation; TimeExpression without an expr and without exactly one TimeObservation - [WFR] Duration::no_expr_requires_observation S8.6.1.5; TimeExpression::no_expr_requires_observation S8.6.19.5.
- DurationObservation firstEvent multiplicity - [WFR] S8.6.4.6.
- InteractionConstraint minint/maxint used outside a loop operand; minint < 0; maxint <= 0; maxint < minint; dynamic variables not owned by the covered Lifeline - [WFR] InteractionConstraint S17.12.12.5.
- TimeEvent with a negative when value - [WFR] TimeEvent::when_non_negative S13.4.10.6.
- Lifeline/Message/StateInvariant rules from the Interaction family apply (S17.12.17.5, S17.12.18.7).
- Overlapping or non-disjoint state invariants on one lifeline; missing explicit time axis/scale - [STYLE] Visual Paradigm timing best practices - <https://skills.visual-paradigm.com/best-practices-uml-timing-diagrams-real-time-systems/> ; no WFR => UNCONFIRMED for the mechanical part.

## Cross-diagram (applies to every diagram type)

- Unparseable text / unknown element keyword - [TOOL] [ML] mermaid-syntax.
- Same id declared twice with conflicting labels - [TOOL] [ML] mermaid-duplicate-ids.
- Duplicate edge, self-loop edge, empty label - [TOOL] [ML] mermaid-no-duplicate-edges, no-self-loop, no-empty-labels.
- Relationship that is not legal between its source and target; element/relationship that is not a valid UML 2.5 element - [TOOL] EA MVR050002, MVR010001, MVR050001.
- Missing required child element; invalid child for the parent; Port as a direct Package member - [TOOL] EA MVR020001, MVR020003, MVR020002.
- Undefined or invalid element/relationship property; isLeaf+isAbstract; attribute/associationEnd mismatch - [TOOL] EA MVR030001/030002/030003, MVR060001/060002, MVR090001.
- Element not present in any diagram; invalid redefinition; mandatory/duplicate tagged values; metamodel reference; InformationFlow without conveyed information; parameter without type - [TOOL] MD 189143257, 189143316, 189143268, 189143276, 189143272, 189143265, 189143303.
- OCL constraint syntax violations - [TOOL] EA MVR040001/070001/0A0001.

## Practical ranking for an automated reviewer

Emit as hard errors only the [WFR] items (they are checkable from the parsed model with OCL-equivalent rules and are backed by the spec). Emit [TOOL] completeness rules as warnings with the tool that defines them named. Emit [STYLE] items only when a project convention opts in, and never as "UML violations".
