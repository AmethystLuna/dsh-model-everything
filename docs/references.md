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
