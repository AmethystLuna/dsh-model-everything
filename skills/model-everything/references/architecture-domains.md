# Architecture by domain: what is decidable, and with what

The same engine is asked different questions in different domains. This file says, per domain, what the
architecture is made of, which claims decide something at design time, which of this plugin's families
decides them, and where the claim has to go instead.

Two rules apply everywhere:

- **The verdict is about the model.** A domain's real constraints — schedulability, timing closure,
  trained-model quality, certification — are outside the model unless they were modelled.
- **Route the rest.** Every domain below ends with what this plugin cannot decide, and where to send it.

## Layered systems, services and microservices

Made of: modules or services, their allowed dependencies, the direction of those dependencies, and the
contracts across the boundaries.

Decidable here:

- a dependency cycle, and the shortest one (UML022);
- an edge between two layers that the declared matrix forbids (UML023, UML024);
- a service nobody calls, or a required edge that is missing (UML020, UML025);
- an interface wider than its callers, a responsibility with no owner (`model_design_review`, DES-level).

Where it stops: a distributed transaction, a consistency guarantee, or a failure mode under partial
availability is not an edge. Those go to `model_compose_verify` when the protocol is modelled, and to a
saga or retry design review otherwise — the pattern language for that is Hohpe and Woolf's *Enterprise
Integration Patterns* and, for the failure side, Nygard's *Release It!*.

## Event-driven and streaming

Made of: producers, topics, consumers, delivery guarantees, the order in which things are observed.

Decidable here: event completeness (every event handled), deadlock and livelock in a modelled consumer
protocol, an ordering hazard when two machines interleave (`model_compose_verify`), duplicate delivery
when the model declares idempotency.

Where it stops: the guarantee a broker actually provides. Idempotency as a property to model rather than
assume is Helland's argument (*Idempotence Is Not a Medical Condition*); the clock and ordering
foundations are Lamport's *Time, Clocks, and the Ordering of Events*.

## Data and analytics

Made of: entities, keys, constraints, migrations, and the invariants the business relies on.

Decidable here: `model_datamodel_verify` — key and domain checks, referential integrity, migration
coverage, copy consistency, rollback symmetry, before/after preservation.

Where it stops: query performance, storage layout, and the modelling judgement itself. The relational
foundation is Codd (1970); dimensional design is Kimball and Ross; the distribution and consistency
vocabulary that a modern data architecture needs is Kleppmann's *Designing Data-Intensive Applications*;
organisational topology of data ownership is Dehghani's *Data Mesh*.

## Distributed consensus and protocols

Made of: roles, messages, timeouts, elections, and the states each node may be in.

Decidable here: whether a protocol state machine can reach a forbidden state, whether two machines
deadlock on a handshake, whether an automaton accepts the language it claims, and whether two automata
accept the same one (`model_automaton_verify`). Export for a second opinion goes to TLA+, SPIN, UPPAAL or
PRISM.

Where it stops: liveness under fairness, and performance. The practical argument that this is worth doing
at all is Newcombe et al., *How Amazon Web Services Uses Formal Methods*; the specification language is
Lamport's *Specifying Systems*; consensus algorithms to read are Paxos (Lamport) and Raft (Ongaro and
Ousterhout).

## Embedded and real-time

Made of: tasks, interrupts, shared state, modes, and the deadlines that decide whether the design works.

Decidable here: an interrupt handler and a task reaching the same state in an unsafe order
(`model_compose_verify` with the shared-location checks), a mode machine that can enter an impossible
combination (`model_verify`), a protocol FSM that drops a message the peer expects.

Where it stops, and this is the important part: **schedulability, worst-case execution time, jitter and
stack depth are not decided by a state machine.** They need rate-monotonic or response-time analysis
(Liu and Layland; Liu, *Real-Time Systems*), a timing-aware model (MARTE, timed automata), or measurement
on target. Architectural modelling standards for the domain are AUTOSAR and ARINC 653; certification
evidence is DO-178C for airborne software and ISO 26262 for automotive, and no report from this plugin is
evidence for either.

## Hardware, SoC and platform architecture

Made of: IP blocks, buses, address maps, interrupts, and the hierarchy of subsystems.

Decidable here: an interface protocol described as a state machine, the dependency structure between
blocks (acyclic, layered), and the handshake between a controller and a peripheral model.

Where it stops: timing closure, power, area, and the register-level correctness of an RTL implementation.
The description standards worth knowing are IEEE 1685 (IP-XACT) for component descriptions and AMBA AXI
for the bus protocol; the architectural framing is platform-based design and the computer-architecture
background is Hennessy and Patterson.

## Machine-learning systems

Made of: data sources, pipelines, features, training, serving, and the feedback loops between them.

Decidable here: the pipeline as a dependency graph (cycles, orphans, undeclared inputs), and the
data contract between stages as a data model.

Where it stops: whether the model is any good. That is data validation and evaluation, for which the
*ML Test Score* (Breck et al.) and *Hidden Technical Debt in Machine Learning Systems* (Sculley et al.)
are the vocabulary; Huyen's *Designing Machine Learning Systems* is the architecture-level treatment.

## Safety, security and compliance architecture

Made of: hazards, controls, trust boundaries, and the evidence each claim needs.

Decidable here: almost nothing directly, and saying so is the point. This plugin can check that a
control's state machine cannot be bypassed, or that a trust boundary is not crossed by an undeclared
dependency. It cannot certify anything.

Where it stops: hazard analysis (STPA — Leveson and Thomas), threat modelling (Shostack, *Threat
Modeling: Designing for Security*), and every certification regime.

## Provenance

| Part | Where it comes from |
|---|---|
| the per-domain split, and which family answers which question | this repository's own organisation of its tools |
| integration patterns and the failure-side vocabulary | Hohpe and Woolf, *Enterprise Integration Patterns* (2003); Nygard, *Release It!* (2007) |
| idempotency as a property to model | Helland, *Idempotence Is Not a Medical Condition*, ACM Queue (2012) |
| ordering in distributed systems | Lamport, *Time, Clocks, and the Ordering of Events in a Distributed System*, Communications of the ACM (1978) |
| the relational model | Codd, *A Relational Model of Data for Large Shared Data Banks*, Communications of the ACM (1970) |
| dimensional design and modern data architecture | Kimball and Ross, *The Data Warehouse Toolkit* (2013); Kleppmann, *Designing Data-Intensive Applications* (2017); Dehghani, *Data Mesh* (2022) |
| formal methods in industrial practice | Newcombe et al., *How Amazon Web Services Uses Formal Methods*, Communications of the ACM (2015); Lamport, *Specifying Systems* (2002) |
| consensus algorithms | Lamport, *The Part-Time Parliament* (1998); Ongaro and Ousterhout, *In Search of an Understandable Consensus Algorithm* (2014) |
| real-time analysis and the boundary of this plugin | Liu and Layland, *Scheduling Algorithms for Multiprogramming in a Hard-Real-Time Environment*, Journal of the ACM (1973); Liu, *Real-Time Systems* (2000); Kopetz, *Real-Time Systems* (2011) |
| embedded and safety standards named, not implemented | AUTOSAR; ARINC 653; DO-178C; ISO 26262; UML MARTE |
| hardware description and bus standards | IEEE 1685 (IP-XACT); AMBA AXI; Hennessy and Patterson, *Computer Architecture* |
| ML system architecture and its failure modes | Sculley et al., *Hidden Technical Debt in Machine Learning Systems* (2015); Breck et al., *The ML Test Score* (2017); Huyen, *Designing Machine Learning Systems* (2022) |
| hazard and threat analysis | Leveson and Thomas, *STPA Handbook* (2018); Shostack, *Threat Modeling: Designing for Security* (2014) |

Citations are given without volume and page numbers where those were not verified against the
publication. Every standard named here is named as a boundary — what the domain requires — not as
something this plugin implements.
