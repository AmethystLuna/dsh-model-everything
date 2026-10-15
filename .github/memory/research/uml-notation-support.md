---
name: uml-notation-support
description: 记号覆盖调研：14 类 UML 2.5.1 图在 Mermaid 与 PlantUML 里各自能表达什么（faithful/approx/none），带公开来源与每类最小语法样例
metadata:
  type: project
---

# Textual UML notation support for UML 2.5.1 (Mermaid vs PlantUML)

**Question answered:** for each UML 2.5.1 diagram type, can **Mermaid** and/or **PlantUML** express it *faithfully*?

## Method, sources, confidence

Primary sources used:

- **OMG UML 2.5.1** (formal/2017-12-05): landing page <https://www.omg.org/spec/UML/2.5.1/>, normative PDF <https://www.omg.org/spec/UML/2.5.1/PDF>. The diagram taxonomy is **Annex A: Diagrams (normative)**, pp. 683-685, notably Figure A.5 "The taxonomy of structure and behavior diagrams", and the list "Activity Diagram - Activities / Class Diagram - Structured Classifiers / ..." on p. 685. Metaclass names below were extracted by clause from that PDF (Clauses 7-19).
- **Mermaid official docs**: <https://mermaid.js.org/> (diagram list in the docs sidebar of <https://mermaid.js.org/intro/>), individual syntax pages, and the docs' own markdown sources in the official repository (<https://github.com/mermaid-js/mermaid>, `packages/mermaid/src/docs/syntax/*.md`). Current docs version: 12.2.0.
- **PlantUML official docs**: <https://plantuml.com/en/...> pages and the same documentation's machine-readable source at <http://alphadoc.plantuml.com/raw/markdown/en/...>. The PlantUML documentation's diagram list (site navigation) is: Sequence, Use Case, Class, Activity, Component, State, Object, Deployment, Timing, plus non-UML types (Regex, Network, Wireframe, Archimate, Gantt, MindMap, WBS, EBNF, JSON, YAML).

Judgement scale used below:

- **faithful** - the tool has constructs expressing the principal UML notation of that diagram without systematic distortion.
- **approx** - a dedicated or borrowed construct covers a substantial subset, or covers the type with a different vocabulary.
- **none** - no documented construct; a rendering would be free-form and outside the tool's notation.

Three spec-level facts frame everything:

1. UML 2.5.1 splits diagrams into **structure diagrams** and **behavior diagrams**; behavior diagrams include the **interaction diagrams** (Sequence, Communication, Interaction Overview, Timing) - Annex A, Figure A.5.
2. UML 2.5.1 defines no *Diagram* metaclass: a diagram is notation over a model. "Metamodel elements this diagram can express" therefore means the model elements for which UML defines notation in that diagram, taken from the defining clause.
3. Annex A fixes the diagram frame names: `activity class component deployment interaction package state machine use case`, with abbreviations `act cmp dep sd pkg stm uc` (Annex A, p. 684). Sequence, Communication, Interaction Overview and Timing all use the `interaction`/`sd` frame.

---

## 1. Class diagram - 类图 - structure

- **Spec anchor:** Annex A "Class Diagram - Structured Classifiers"; Clause 9 Classification, Clause 10 Simple Classifiers, Clause 11 Structured Classifiers.
- **Expressed metamodel elements (Clause 9/10/11):** Class, Association, AssociationClass, Generalization, GeneralizationSet, Property, Operation, Parameter, BehavioralFeature, StructuralFeature, Feature, RedefinableElement, Substitution, ClassifierTemplateParameter, RedefinableTemplateSignature; DataType, PrimitiveType, Enumeration, EnumerationLiteral, Interface, InterfaceRealization, Signal, Reception, BehavioredClassifier; Component, StructuredClassifier, EncapsulatedClassifier, Port, Connector, ConnectorEnd, Collaboration, CollaborationUse, ConnectableElement; Dependency, Realization (Clause 7); Package (Clause 12).
- **Mermaid - `classDiagram`: approx.** Documented: class declaration, members with visibility (`+` `-` `#` `~`), attribute/return types, abstract `*` and static `$` classifiers, generic types, the relationship set `<|--`, `*--`, `o--`, `-->`, `..>`, `..|>`, `--`, `..`, relation labels, two-way relations, lollipop interfaces, namespaces (nested namespaces v11.15.0+), cardinality/multiplicity on relations, `<<annotation>>` markers (`<<Interface>>`, `<<Abstract>>`, `<<Enumeration>>`), notes, direction, classDef styling (see <https://mermaid.js.org/syntax/classDiagram.html>). Not covered: association classes, qualifiers, n-ary associations, template-binding notation, real stereotype/profile semantics.

~~~mermaid
classDiagram
    class Animal { +int age +isMammal() }
    class Duck
    Animal <|-- Duck
    Animal "1" o-- "0..*" Duck : owns
~~~

- **PlantUML - class diagram: faithful.** Declarative elements include `class`, `abstract`, `interface`, `enum`, `annotation`, `metaclass`, `stereotype`, plus visibility, generics, notes, packages and stereotypes. Relations: Extension `<|--`, Implementation `<|..`, Composition `*--`, Aggregation `o--`, Dependency `-->`/`..>` (docs: <https://plantuml.com/en/class-diagram>, source: <http://alphadoc.plantuml.com/raw/markdown/en/class-diagram>).

~~~
@startuml
class Animal { +int age +isMammal() : bool }
abstract class Duck
Animal <|-- Duck
Animal "1" o-- "0..*" Duck : owns
@enduml
~~~

---

## 2. Object diagram - 对象图 - structure

- **Spec anchor:** Annex A "Object Diagram - Classification"; Clause 9 Classification.
- **Expressed metamodel elements:** InstanceSpecification, Slot, InstanceValue (Clause 9), Classifier, Association (links between instances).
- **Mermaid - no native support.** No object-diagram page exists in the Mermaid docs sidebar/type list (<https://mermaid.js.org/intro/>); `classDiagram` has no documented instance/slot notation. Marked **none**.
- **PlantUML - object diagram: faithful.** Documented `object` keyword with attribute/value bodies and class-diagram relation symbols for links (<https://plantuml.com/en/object-diagram>, source: <http://alphadoc.plantuml.com/raw/markdown/en/object-diagram>).

~~~
@startuml
object alice { name = "Alice" }
object bob { name = "Bob" }
alice --> bob : friend
@enduml
~~~

---

## 3. Package diagram - 包图 - structure

- **Spec anchor:** Annex A "Package Diagram - Packages"; Clause 12 Packages (element import/package import are Clause 7).
- **Expressed metamodel elements:** Package, PackageMerge, PackageImport, ElementImport, PackageableElement (Clause 12/7); Profile, ProfileApplication, Stereotype, Extension, Image (Clause 12); Model; Dependency, Generalization (Clause 7/9).
- **Mermaid - approx.** `classDiagram` has `namespace` (and nested namespaces, v11.15.0+) and `flowchart` has `subgraph`; both express grouping/nesting, but Mermaid documents no package symbol and no import/merge relationships. Cited: <https://mermaid.js.org/syntax/classDiagram.html> ("Define Namespace"), <https://mermaid.js.org/syntax/flowchart.html>.

~~~mermaid
classDiagram
    namespace Orders { class Order }
    namespace Billing { class Invoice }
    Billing ..> Orders : import
~~~

  (The `..>` here is a plain class relationship, not a UML PackageImport.)
- **PlantUML - faithful.** `package "Name" { ... }` with nesting and `packageStyle` is documented on the class-diagram page; dependencies between packages use the class relation symbols. Import/merge are drawn as labelled dependencies rather than first-class elements - a small gap (**approximation of PackageImport/PackageMerge semantics**). <https://plantuml.com/en/class-diagram>

~~~
@startuml
package "Ordering" { class Order }
package "Billing" { class Invoice }
Billing ..> Ordering : <<import>>
@enduml
~~~

---

## 4. Component diagram - 组件图（构件图） - structure

- **Spec anchor:** Annex A "Component Diagram - Structured Classifiers"; Clause 11 Structured Classifiers.
- **Expressed metamodel elements (Clause 11):** Component, ComponentRealization, Interface, Port, Connector, ConnectorEnd, StructuredClassifier, EncapsulatedClassifier, Class, Property, ConnectableElement, Collaboration, CollaborationUse, Association, AssociationClass.
- **Mermaid - approx.** No UML component diagram. The nearest documented types are C4 `C4Component` (<https://mermaid.js.org/syntax/c4.html>) and `architecture-beta` (<https://mermaid.js.org/syntax/architecture.html>), which use C4/architecture vocabularies, not UML Component/Interface/Port semantics.

~~~mermaid
C4Component
    Component(web, "Web App")
    Component(db, "Database")
    Rel(web, db, "reads")
~~~

- **PlantUML - faithful.** `component [Name]`, `component X as Y`, interfaces via `()` or the `interface` keyword, provided/required ("lollipop/socket") connections, grouping with `package/node/folder/frame/cloud/database`, and ports (`port`, `portin`, `portout`). <https://plantuml.com/en/component-diagram>, source <http://alphadoc.plantuml.com/raw/markdown/en/component-diagram> (section "## Port [port, portIn, portOut]").

~~~
@startuml
component [Web Server]
() "REST API" as API
[Web Server] -- API
component [Database]
[Web Server] --> [Database]
@enduml
~~~

---

## 5. Composite structure diagram - 复合结构图（组合结构图） - structure

- **Spec anchor:** Annex A "Composite Structure Diagram - Structured Classifiers"; Clause 11.
- **Expressed metamodel elements:** StructuredClassifier, EncapsulatedClassifier, Class, Property (parts), Port, Connector, ConnectorEnd, ConnectableElement, Collaboration, CollaborationUse, Interface, Association (Clause 11).
- **Mermaid - no native support.** No composite-structure page in the type list; nothing documents parts, ports or connectors. **none.**
- **PlantUML - approx.** PlantUML documents **no** composite-structure diagram page. Ports (`port`, `portin`, `portout`) are documented *inside components and nodes* (component/deployment pages), and nested components/nodes give "parts"; connectors are drawn as ordinary links. The PlantUML author's answer to "Composite Structure Diagrams?" (QA-547, <https://forum.plantuml.net/547/composite-structure-diagrams>) shows nested component/port syntax and states "All this is undocumented, but we are working on this...". No documented Connector/ConnectorEnd or collaboration-role notation => **approx**.

~~~
@startuml
component C {
  port p1
  portin p2
  portout p3
  component c1
}
c --> p1
p1 --> c1
@enduml
~~~

---

## 6. Deployment diagram - 部署图 - structure

- **Spec anchor:** Annex A "Deployment diagram - Deployments"; Clause 19 Deployments.
- **Expressed metamodel elements (Clause 19):** Deployment, DeploymentTarget, Node, Device, ExecutionEnvironment, Artifact, DeployedArtifact, DeploymentSpecification, CommunicationPath, Manifestation; InstanceSpecification (Clause 9).
- **Mermaid - approx.** `C4Deployment` is a **C4** deployment diagram (<https://mermaid.js.org/syntax/c4.html>); `architecture-beta` shows services/resources in cloud/CI-CD terms (<https://mermaid.js.org/syntax/architecture.html>). Neither is UML Node/Artifact/Deployment notation.

~~~mermaid
architecture-beta
    group prod(cloud)[Production]
    service app(server)[App] in prod
    service db(database)[DB] in prod
    app:R -- L:db
~~~

- **PlantUML - faithful.** Documented "Deployment Diagram" with `node`, `artifact`, `database`, `cloud`, `folder`, `frame`, `component`, links, and the same port keywords. <https://plantuml.com/en/deployment-diagram>, source <http://alphadoc.plantuml.com/raw/markdown/en/deployment-diagram>.

~~~
@startuml
node Server
artifact app.jar
database DB
Server -- app.jar
Server --> DB : JDBC
@enduml
~~~

---

## 7. Profile diagram - 概要图（Profile 图） - structure

- **Spec anchor:** Annex A "Profile Diagram - Packages"; Clause 12 Packages.
- **Expressed metamodel elements (Clause 12):** Profile, Stereotype, Extension, ExtensionEnd, ProfileApplication, Image, Package, Model; Class, Property, Association, Generalization (Clause 9).
- **Mermaid - no native support.** No profile page; class `<<annotation>>` markers are display labels only - no metaclass/extension/profile constructs. **none.**
- **PlantUML - approx.** PlantUML's class diagram declares `metaclass` and `stereotype` elements and `class X <<stereotype>>`, with extension/generalization arrows (added in GH-1159; see "Declarative element" and "Relations between classes" in <http://alphadoc.plantuml.com/raw/markdown/en/class-diagram>). There is **no `profile` keyword and no Profile/ProfileApplication element** (the string "profile" does not occur in that page), so a profile diagram is only approximated.

~~~
@startuml
metaclass Component
class "EJB" <<stereotype>>
"EJB" --|> Component
@enduml
~~~

---

## 8. Use case diagram - 用例图 - behavior

- **Spec anchor:** Annex A "Use Case Diagram - Use Cases"; Clause 18 Use Cases.
- **Expressed metamodel elements (Clause 18):** Actor, UseCase, Include, Extend, ExtensionPoint; Association (Clause 11), Generalization (Clause 9); the subject (system boundary) is a Classifier/Package.
- **Mermaid - `usecase-beta` (v12.0.0+): approx (near-faithful).** Documented: actors (stick / hollow / awesome / icon variants), use cases, `systemBoundary ... end`, associations, `..> : include`, `..> : extend`, `--|>` generalization, notes, classes/styles, direction. Missing: ExtensionPoint notation. <https://mermaid.js.org/syntax/usecase.html>

~~~mermaid
usecase-beta
actor Customer
systemBoundary "Shop"
  Checkout
end
Customer --> Checkout
~~~

- **PlantUML - faithful.** Actors as `:Actor:` or `actor A`; use cases as `(UseCase)` or `usecase X as Y` (and business use cases `(X)/`, `usecase/`); system boundary as a `rectangle`; associations `--`/`-->`; `.> : include` and `.> : extends`; generalization `<|--`. <https://plantuml.com/en/use-case-diagram>, source <http://alphadoc.plantuml.com/raw/markdown/en/use-case-diagram>.

~~~
@startuml
actor Customer
rectangle Shop {
  (Checkout)
}
Customer -- (Checkout)
(Checkout) .> (Payment) : include
@enduml
~~~

---

## 9. Activity diagram - 活动图 - behavior

- **Spec anchor:** Annex A "Activity Diagram - Activities"; Clause 15 Activities, Clause 16 Actions.
- **Expressed metamodel elements (Clause 15/16):** Activity, ActivityNode, Action, ActivityEdge, ControlFlow, ObjectFlow, ObjectNode, Pin (InputPin/OutputPin/ValuePin/ActionInputPin), InitialNode, ActivityFinalNode, FlowFinalNode, DecisionNode, MergeNode, ForkNode, JoinNode, ActivityPartition, InterruptibleActivityRegion, ActivityGroup, StructuredActivityNode, ExpansionRegion, ExpansionNode, ExceptionHandler, CentralBufferNode, DataStoreNode, ActivityParameterNode, Variable.
- **Mermaid - approx.** `flowchart` (alias `graph`) and the newer `swimlanes` diagram (v11.16.0+) express actions, decisions, loops and parallel branches, but they are generic flowchart constructs: no object flow/pins, no activity-final vs flow-final distinction, no interruptible regions or expansion regions. <https://mermaid.js.org/syntax/flowchart.html>, <https://mermaid.js.org/syntax/swimlanes.html>

~~~mermaid
flowchart TD
    Start([Start]) --> Fetch[Fetch data]
    Fetch --> Check{Valid?}
    Check -- Yes --> Save[Save]
    Check -- No --> Fail([Error])
~~~

- **PlantUML - faithful.** `start`/`stop`/`end`, `:action;`, `if/else`, `repeat`/`while`, `fork`/`fork again`/`end fork`/`end merge`, `partition`, `group`, swimlanes (`|Lane|`), `split`, notes, `detach`, `kill`. <https://plantuml.com/en/activity-diagram-beta>, source <http://alphadoc.plantuml.com/raw/markdown/en/activity-diagram-beta>.

~~~
@startuml
start
:Fetch data;
if (Valid?) then (yes)
  :Save;
else (no)
  :Report error;
endif
stop
@enduml
~~~

---

## 10. State machine diagram - 状态机图 - behavior

- **Spec anchor:** Annex A "State Machine Diagram - State Machines"; Clause 14 State Machines.
- **Expressed metamodel elements (Clause 14):** StateMachine, Region, State, Vertex, Transition, Pseudostate (initial, choice, junction, fork, join, entryPoint, exitPoint, terminate, shallow/deep history), FinalState, ConnectionPointReference, ProtocolStateMachine, ProtocolTransition, ProtocolConformance; Behavior (entry/exit/do), Trigger, TimeEvent/ChangeEvent (Clause 13), Constraint (Clause 7).
- **Mermaid - `stateDiagram-v2` (older renderer: `stateDiagram`): approx.** States, transitions with labels, `[*]` start/end, composite states with nested braces, `<<choice>>`, `<<fork>>`/`<<join>>`, concurrency via `--`, notes, direction, classDef styling. Missing: entry/exit/do behaviors, entry/exit points, history pseudostates, named regions, terminate, protocol state machines. <https://mermaid.js.org/syntax/stateDiagram.html>

~~~mermaid
stateDiagram-v2
    [*] --> Idle
    Idle --> Running : start
    Running --> Idle : stop
    Running --> [*]
~~~

- **PlantUML - faithful.** `state`, `[*]`, transitions `A --> B : event`, composite/nested states, concurrent regions with `--`, `<<choice>>`, `<<fork>>`, `<<join>>`, `<<entryPoint>>`, `<<exitPoint>>`, `<<history>>`/`<<history*>>`, `<<end>>`, `<<sdlreceive>>`, notes. <https://plantuml.com/en/state-diagram>, source <http://alphadoc.plantuml.com/raw/markdown/en/state-diagram>.

~~~
@startuml
[*] --> Idle
Idle --> Running : start
Running --> Idle : stop
state Running {
  [*] --> Step
}
@enduml
~~~

---

## 11. Sequence diagram - 顺序图（时序图） - interaction (behavior)

- **Spec anchor:** Annex A "Sequence Diagram - Interactions"; Clause 17 Interactions; spec Tables 17.1/17.2 list the graphic nodes/paths included in sequence diagrams.
- **Expressed metamodel elements (Clause 17):** Interaction, Lifeline, Message, MessageEnd, MessageOccurrenceSpecification, OccurrenceSpecification, ExecutionSpecification, ActionExecutionSpecification, BehaviorExecutionSpecification, ExecutionOccurrenceSpecification, DestructionOccurrenceSpecification, CombinedFragment, InteractionOperand, InteractionConstraint, ConsiderIgnoreFragment, InteractionUse, Gate, GeneralOrdering, StateInvariant, Continuation, PartDecomposition.
- **Mermaid - `sequenceDiagram`: approx.** Documented: participants and actors, arrows `->>` `-->>` `-)` `<->`, activations (`activate`/`deactivate`, `+`/`-`), `loop`, `alt`/`else`, `opt`, `par`/`and`, `critical`/`option`, `break`, `rect`, `box` grouping, notes, `autonumber`. Missing: `ref`/InteractionUse, gates, state invariants, general ordering, duration/time constraints. <https://mermaid.js.org/syntax/sequenceDiagram.html>

~~~mermaid
sequenceDiagram
    participant C as Client
    participant S as Server
    C->>S: request
    activate S
    S-->>C: response
    deactivate S
~~~

- **PlantUML - faithful.** `participant`/`actor`, message arrows, `activate`/`deactivate`/`destroy`, combined fragments `alt/else`, `opt`, `loop`, `par`, `break`, `critical`, `group`, and `ref over ... : ...` / `ref over X ... end ref` for InteractionUse, plus delays, dividers and autonumbering. <https://plantuml.com/en/sequence-diagram>, source <http://alphadoc.plantuml.com/raw/markdown/en/sequence-diagram>.

~~~
@startuml
participant Client
participant Server
Client -> Server : request
activate Server
Server --> Client : response
deactivate Server
@enduml
~~~

---

## 12. Communication diagram - 通信图（协作图） - interaction (behavior)

- **Spec anchor:** Annex A "Communication Diagram - Interactions"; Clause 17; spec Tables 17.3/17.4 "Graphic Nodes/Paths Included in Communication Diagrams".
- **Expressed metamodel elements:** Interaction, Lifeline, Message, MessageEnd, OccurrenceSpecification, GeneralOrdering (Clause 17); the connectors are Association/Connector instances linking lifelines.
- **Mermaid - no native support.** No communication-diagram page exists in Mermaid's type list; nothing documents lifelines-plus-link-and-sequence-number notation. **none.**
- **PlantUML - approx (manual, undocumented as a type).** <https://plantuml.com/en/communication-diagram> returns **404**, and the PlantUML navigation lists no Communication page. The closest documented constructs are the object diagram (objects + links) and the sequence diagram; sequence numbers have to be written as message labels. This is a hand-built approximation, not a PlantUML diagram type. **approx.**

~~~
@startuml
object ":Customer:" as C
object ":Order:" as O
C --> O : 1: create
O --> O : 2: validate
@enduml
~~~

---

## 13. Interaction overview diagram - 交互概览图 - interaction (behavior)

- **Spec anchor:** Annex A "Interaction Overview Diagram - Interactions"; Clause 17, borrowing activity nodes; spec Table 17.5 "Graphic nodes included in Interaction Overview Diagrams in addition to those borrowed from Activity Diagrams".
- **Expressed metamodel elements:** Interaction, InteractionUse, CombinedFragment, InteractionOperand, Lifeline, Message (Clause 17); InitialNode, DecisionNode, MergeNode, ForkNode, JoinNode, FinalNode and ControlFlow borrowed from Clause 15 Activities.
- **Mermaid - no native support.** Nothing in the Mermaid type list covers frames-with-interaction-references or combined fragments on a control-flow frame. **none.**
- **PlantUML - approx (manual, no dedicated type).** PlantUML documents no interaction-overview page (navigation lists Sequence, Use Case, Class, Activity, Component, State, Object, Deployment, Timing only). The activity diagram provides the control-flow frame (`group`, `partition`, `fork`, `if`), and the sequence diagram provides `ref over`; combining them (activity nodes labelled as references to sequence diagrams) is a manual approximation, not a UML `ref` on an IO frame. **approx.**

~~~
@startuml
start
group sd Login
  :ref Login sequence;
end group
if (ok?) then (yes)
  :ref Dashboard;
else (no)
  stop
endif
@enduml
~~~

---

## 14. Timing diagram - 定时图（时间图） - interaction (behavior)

- **Spec anchor:** Annex A "Timing Diagram - Interactions"; Clause 17; spec Table 17.6 "Graphic nodes and paths included in timing diagrams"; time/duration constraints are Clause 8 (TimeConstraint, DurationConstraint, TimeObservation, DurationObservation).
- **Expressed metamodel elements:** Interaction, Lifeline, Message, OccurrenceSpecification, StateInvariant (Clause 17); TimeConstraint, DurationConstraint, TimeObservation, DurationObservation (Clause 8).
- **Mermaid - no native support.** No timing-diagram page in Mermaid's type list (the only time-oriented diagram, Gantt, is not UML). **none.**
- **PlantUML - faithful.** Documented lifeline signal kinds `robust`, `concise`, `binary`, `clock` (with `period`/`pulse`/`offset`), `analog`, `rectangle`; state changes with `@0` time points and the `is` verb; messages (`WU -> WB : URL`); anchor points and constraints (`@200 <-> @+150 : {150 ms}`); relative time, scale, hidden state, date/time axis, highlight, notes. <https://plantuml.com/en/timing-diagram>, source <http://alphadoc.plantuml.com/raw/markdown/en/timing-diagram>.

~~~
@startuml
robust "Browser" as WB
concise "User" as WU
@0
WU is Idle
@100
WU -> WB : URL
WU is Waiting
@enduml
~~~

---

## Summary table

| UML 2.5.1 diagram | Kind | Mermaid | PlantUML |
|---|---|---|---|
| Class - 类图 | structure | **approx** (classDiagram; no association class/qualifier/template binding) | **faithful** (class; full relation set) |
| Object - 对象图 | structure | **none** | **faithful** (object; links) |
| Package - 包图 | structure | **approx** (classDiagram namespace / flowchart subgraph; no import/merge) | **faithful** (package, nested; import/merge as labelled deps) |
| Component - 组件图 | structure | **approx** (C4Component, architecture-beta - not UML) | **faithful** (component, (); ports) |
| Composite structure - 复合结构图 | structure | **none** | **approx** (component/node + port/portin/portout, nested parts; no dedicated type) |
| Deployment - 部署图 | structure | **approx** (C4Deployment, architecture-beta - not UML) | **faithful** (node, artifact; ports) |
| Profile - 概要图 | structure | **none** | **approx** (metaclass, stereotype, class X <<stereotype>>; no profile keyword) |
| Use case - 用例图 | behavior | **approx** (usecase-beta, v12.0.0+; no ExtensionPoint) | **faithful** (:Actor:, (UseCase), usecase, actor, boundary) |
| Activity - 活动图 | behavior | **approx** (flowchart, swimlanes; no pins/object flow) | **faithful** (start, :action;, if, fork, partition) |
| State machine - 状态机图 | behavior | **approx** (stateDiagram-v2; no entry/exit/do, history) | **faithful** (state, <<choice>>, <<fork>>, <<history>>) |
| Sequence - 顺序图 | interaction | **approx** (sequenceDiagram; no ref/gates/constraints) | **faithful** (participant, alt, ref over) |
| Communication - 通信图 | interaction | **none** | **approx** (manual object/sequence; no type) |
| Interaction overview - 交互概览图 | interaction | **none** | **approx** (manual activity + ref; no type) |
| Timing - 定时图 | interaction | **none** | **faithful** (robust/concise/binary/clock, @, constraints) |

## Notes, caveats and UNCONFIRMED items

- **Mermaid "none" verdicts** rest on the absence of any such page in the official diagram-type list/sidebar (<https://mermaid.js.org/intro/>) and on empty results of targeted searches of the Mermaid docs. Absence of a documented construct is strong but negative evidence: treat "no native support" as *"not documented by Mermaid"*, not as proof that no user has ever hacked it with a flowchart.
- **Mermaid's erDiagram, zenuml, gitGraph, gantt, etc. do not map to any UML 2.5.1 diagram** (UML 2.5.1 has no entity-relationship diagram); ER is a data-modelling notation, not one of the 14.
- **UNCONFIRMED:** whether Mermaid will keep the `-beta` suffix for use case (`usecase-beta`) and block (`block`) diagrams; the Mermaid docs explicitly mark C4 as experimental and swimlanes as new with an evolving syntax. Version tags quoted (usecase 12.0.0+, swimlanes 11.16.0+, architecture 11.1.0+, nested namespaces 11.15.0+) are from the docs pages.
- **UNCONFIRMED / model judgement, not a doc quote:** the "approx" verdicts for PlantUML **composite structure**, **profile**, **communication** and **interaction overview** are this report's analysis. PlantUML publishes no page for those four types; the constructs cited do exist but are not labelled by PlantUML as those diagram types. The only PlantUML-author statement found is the 2013 forum reply on composite structure ("All this is undocumented, but we are working on this...", <https://forum.plantuml.net/547/composite-structure-diagrams>).
- **Discrepancy noted:** the PlantUML **Port** section (`port`, `portin`, `portout`) is present in the official documentation source at <http://alphadoc.plantuml.com/raw/markdown/en/component-diagram> and <http://alphadoc.plantuml.com/raw/markdown/en/deployment-diagram>, but the text fetched from the rendered <https://plantuml.com/en/component-diagram> page did not contain the word "port". Cite the documentation source for port syntax, and re-check the rendered page if this matters.
- The OMG specification is published as a PDF (<https://www.omg.org/spec/UML/2.5.1/PDF>); the clause, figure and page references above are to that document.
- **UML Distilled (Fowler)** and **Applying UML and Patterns (Larman)** were *not* used as sources here because they are not fetchable in this session; the report relies on the OMG spec plus both tools' official documentation. Where a book would disagree (e.g. Distilled predates UML 2.5), the spec is authoritative.
