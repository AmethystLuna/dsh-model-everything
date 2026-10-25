# References

The published work behind the checks, and the work behind the checks that have none.

Every entry below was extracted from a `Provenance` section in this repository, and the file that
cites it is named with it, so a claim can be checked where it is made. The extraction is generated:
`docs/references/generate.mjs`. Nothing here is transcribed by hand, because a hand-copied
bibliography drifts from the text it belongs to.

## The distinction this list exists to make

A **published method** has a definition and a body of work behind it, so a finding computed from it
means what that work says it means. An **engineering convention** is this repository's own rule: it
catches something real, nothing outside defines it, and it may change without the literature moving.

Most of the shipped checks are conventions. That is not a weakness — a convention stated as one is
more honest than a convention dressed as a citation — but a reader deciding how much weight to put
on a finding has to know which one they are holding.

## Verification, model checking and concurrency

- Alur & Dill 1994
  <br>cited by skills/model-everything/references/logic-verification-guide.md
- Baier & Katoen, *Principles of Model Checking*, MIT Press (2008)
  <br>cited by skills/model-everything/references/logic-verification-guide.md
- Behrmann, David & Larsen, *A Tutorial on UPPAAL*, SFM 2004
  <br>cited by skills/model-everything/references/logic-verification-guide.md
- Clarke & Emerson, *Design and Synthesis of Synchronization Skeletons Using Branching-Time Temporal Logic*, LNCS 131 (1981)
  <br>cited by skills/model-everything/references/logic-verification-guide.md
- Clarke, Grumberg & Peled, *Model Checking*, MIT Press (1999)
  <br>cited by skills/model-everything/references/logic-verification-guide.md
- Garey & Johnson, *Computers and Intractability*
  <br>cited by skills/model-everything/references/logic-verification-guide.md
- Godefroid, *Partial-Order Methods for the Verification of Concurrent Systems*, LNCS 1032 (1996)
  <br>cited by skills/model-everything/references/logic-verification-guide.md
- Holzmann, *The SPIN Model Checker*, Addison-Wesley (2003)
  <br>cited by skills/model-everything/references/logic-verification-guide.md
- Kwiatkowska, Norman & Parker, *PRISM 4.0: Verification of Probabilistic Real-Time Systems*, CAV 2011
  <br>cited by skills/model-everything/references/logic-verification-guide.md
- Lamport, *Specifying Systems*, Addison-Wesley (2002)
  <br>cited by skills/model-everything/references/logic-verification-guide.md
- Myers, *The Art of Software Testing* (1979)
  <br>cited by skills/model-everything/references/logic-verification-guide.md

## Data models and constraints

- Codd, *A Relational Model of Data for Large Shared Data Banks*
  <br>cited by skills/model-everything-datamodel/references/data-model-guide.md
- Codd, *Extending the Database Relational Model to Capture More Meaning*, ACM TODS 1979
  <br>cited by skills/model-everything-datamodel/references/data-model-guide.md
- Date, *An Introduction to Database Systems*
  <br>cited by skills/model-everything-datamodel/references/data-model-guide.md

## Graph theory behind the structural reviews

- Garey & Johnson 1979
  <br>cited by .github/memory/design/design-review.md, skills/model-everything-structure/references/structure-review-guide.md
- Liskov & Wing, *A Behavioral Notion of Subtyping*, TOPLAS 1994
  <br>cited by .github/memory/design/design-review.md, skills/model-everything-design/SKILL.md
- Martin, *Agile Software Development*
  <br>cited by .github/memory/design/design-review.md
- Newman & Girvan 2004
  <br>cited by skills/model-everything-structure/references/structure-review-guide.md

## Architecture description, hierarchy and domains

- Abrial, *Modeling in Event-B* (2010)
  <br>cited by skills/model-everything/references/architecture-views.md
- Brown, *The C4 Model for Visualising Software Architecture* (2018)
  <br>cited by skills/model-everything/references/architecture-views.md
- Codd, *A Relational Model of Data for Large Shared Data Banks*, Communications of the ACM (1970)
  <br>cited by skills/model-everything/references/architecture-domains.md
- Dehghani, *Data Mesh* (2022)
  <br>cited by skills/model-everything/references/architecture-domains.md
- Helland, *Idempotence Is Not a Medical Condition*, ACM Queue (2012)
  <br>cited by skills/model-everything/references/architecture-domains.md
- Hennessy and Patterson, *Computer Architecture*
  <br>cited by skills/model-everything/references/architecture-domains.md
- Hoare, *Communicating Sequential Processes* (1985)
  <br>cited by skills/model-everything/references/architecture-views.md
- Hohpe and Woolf, *Enterprise Integration Patterns* (2003)
  <br>cited by skills/model-everything/references/architecture-domains.md
- Huyen, *Designing Machine Learning Systems* (2022)
  <br>cited by skills/model-everything/references/architecture-domains.md
- Kazman and Carriere, *Playing Detective: Reconstructing Software Architecture from Available Evidence* (1999)
  <br>cited by skills/model-everything/references/architecture-views.md
- Kimball and Ross, *The Data Warehouse Toolkit* (2013)
  <br>cited by skills/model-everything/references/architecture-domains.md
- Kleppmann, *Designing Data-Intensive Applications* (2017)
  <br>cited by skills/model-everything/references/architecture-domains.md
- Kopetz, *Real-Time Systems* (2011)
  <br>cited by skills/model-everything/references/architecture-domains.md
- Kruchten, *The 4+1 View Model of Architecture*, IEEE Software (1995)
  <br>cited by skills/model-everything/references/architecture-views.md
- Lamport, *Specifying Systems* (2002)
  <br>cited by skills/model-everything/references/architecture-domains.md
- Lamport, *The Part-Time Parliament* (1998)
  <br>cited by skills/model-everything/references/architecture-domains.md
- Lamport, *Time, Clocks, and the Ordering of Events in a Distributed System*, Communications of the ACM (1978)
  <br>cited by skills/model-everything/references/architecture-domains.md
- Leveson and Thomas, *STPA Handbook* (2018)
  <br>cited by skills/model-everything/references/architecture-domains.md
- Liu and Layland, *Scheduling Algorithms for Multiprogramming in a Hard-Real-Time Environment*, Journal of the ACM (1973)
  <br>cited by skills/model-everything/references/architecture-domains.md
- Martin, *Agile Software Development* (2002)
  <br>cited by skills/model-everything/references/architecture-views.md
- Milner, *Communication and Concurrency* (1989)
  <br>cited by skills/model-everything/references/architecture-views.md
- Murphy, Notkin and Sullivan, *Software Reflexion Models*, IEEE Transactions on Software Engineering (2001)
  <br>cited by skills/model-everything/references/architecture-views.md
- Nygard, *Documenting Architecture Decisions* (2011)
  <br>cited by skills/model-everything/references/architecture-views.md
- Nygard, *Release It!* (2007)
  <br>cited by skills/model-everything/references/architecture-domains.md
- Ongaro and Ousterhout, *In Search of an Understandable Consensus Algorithm* (2014)
  <br>cited by skills/model-everything/references/architecture-domains.md
- Perry and Wolf, *Foundations for the Study of Software Architecture* (1992)
  <br>cited by skills/model-everything/references/architecture-views.md
- Rozanski and Woods, *Software Systems Architecture* (2011)
  <br>cited by skills/model-everything/references/architecture-views.md
- Shostack, *Threat Modeling: Designing for Security* (2014)
  <br>cited by skills/model-everything/references/architecture-domains.md
- Simon, *The Architecture of Complexity* (1962)
  <br>cited by skills/model-everything/references/architecture-views.md
- Steward, *The Design Structure System* (1981)
  <br>cited by skills/model-everything/references/architecture-views.md
- Tagawa and Toda, *Methods for Visual Understanding of Hierarchical System Structures* (1981)
  <br>cited by skills/model-everything/references/architecture-views.md
- Tamassia and Tollis, *Graph Drawing*
  <br>cited by skills/model-everything/references/architecture-views.md
- Tyree and Akerman, *Architecture Decisions: Demystifying Architecture*, IEEE Software (2005)
  <br>cited by skills/model-everything/references/architecture-views.md

## External checkers this plugin translates into

These are not cited as method sources; they are tools the exporter writes input for, so a stronger
engine can decide what this one approximates. Naming them here keeps the export story in one place.

- UPPAAL — timed automata
- TLA+ / TLC — temporal logic of actions
- PRISM — probabilistic model checking
- SPIN / Promela — explicit-state model checking

## What has no published source

Checks this repository defines itself, listed so that the absence is visible rather than implied.
The full table, per check, is in each domain's reference file.

- paired-operation symmetry, resource-failure injection, declared-tick deadlines and budget
  checks in the verification engine, and the composition checks
- the data engine's invariant kinds beyond the relational ones Codd and Date define
- the design review's responsibility, interface-segregation and contract checks built on the
  published principles they measure
- the structural layer rules, which are a convention about declared partitions
