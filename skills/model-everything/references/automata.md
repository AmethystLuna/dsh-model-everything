# Automata as a verification target

What `model_automaton_verify` decides, why each decision is a theorem rather than a heuristic, and where
the boundary sits. Read it when a report has to be defended, or when a question lands on the edge:
liveness, infinite words, or a product that will not finish.

## Scope

Finite words over an explicit alphabet. A run starts at `init`, reads one symbol per transition, and is
accepted if it ends in `accepting`.

Not in scope, and the report says so:

- liveness, fairness, "eventually" properties on an infinite run;
- timing, clocks, deadlines;
- conformance by observation rather than by language;
- any abstraction. The tool reads a model, never program source.

## What each check decides, and on what authority

| Check | Decision | Authority |
|---|---|---|
| `AUT003` nondeterminism | whether some state has two transitions on one symbol | the definition of a deterministic automaton |
| `AUT001` unreachable | whether a state is reachable from `init` | reachability is decidable in linear space |
| `AUT002` trap | whether a reachable state can still reach acceptance | the same reachability, run backwards |
| `AUT004` empty language | whether any accepting state is reachable | emptiness of a finite automaton is decidable |
| `AUT005` alphabet mismatch | whether the two machines can be compared at all | a language relation needs one alphabet |
| `AUT006` equivalence | whether two machines accept the same words | decide `L(A) \ L(B)` and `L(B) \ L(A)` |
| `AUT007` subset | whether every word of the first is a word of the second | decide `L(A) \ L(B)` |
| `AUT008` superset | the same, with the sides exchanged | decide `L(B) \ L(A)` |
| `AUT009` undecided | the product search stopped at its cap | a stopped search proves nothing |

Equivalence and inclusion are decided by exploring the product of the two automata and asking whether an
accepting side pairs with a rejecting one. A breadth-first walk returns the **shortest** word that does,
so the witness is the smallest counterexample there is, not merely one that exists.

## The wall, stated plainly

These are decidable problems, not approximations: automaton equivalence is NL-complete, inclusion for
nondeterministic machines and LTL model checking are PSPACE-complete. The cost is what grows, not the
certainty. Two machines of `n` states each can produce `n × n` pairs, and a model with counters or
queues in it can be unbounded before anyone writes a single transition.

So a cap is honest and a larger cap is not a strategy. When the product stops, the report carries
`AUT009_UNDECIDED` and sets `truncated: true`: the verdict is "not known", never "equal". If the same
happens to a state machine in `model_verify`, the report names the escalation instead of suggesting a
bigger budget.

## Reading, by what each one settles

Foundations, for the constructions above:

- Hopcroft, Motwani, Ullman, *Introduction to Automata Theory, Languages, and Computation* — subset
  construction, product automata, the equivalence test.
- Sipser, *Introduction to the Theory of Computation* — closure properties and decidability, in the
  gentler telling.

Model checking, which is where liveness lives and this family stops:

- Baier and Katoen, *Principles of Model Checking* — LTL, CTL, Büchi automata, fairness. The boundary in
  the scope section above is this book's first half.
- Clarke, Grumberg, Peled, *Model Checking* — the classical account, including why explicit enumeration
  runs out.

The automata-theoretic framing this tool is a finite-word shadow of:

- Kurshan, *Computer-Aided Verification of Coordinating Processes* — systems as automata, properties as
  automata, language inclusion as the decision procedure.
- Vardi and Wolper, *An automata-theoretic approach to automatic program verification* — the same idea
  for LTL, with Büchi acceptance.

Conformance, for what "implementation matches specification" means when it is made precise:

- Tretmans, *Model Based Testing with Labelled Transition Systems* — `ioco` and the family of
  implementation relations; `subset` and `superset` are the language-level versions of that choice.
- Lynch and Vaandrager, *Forward and backward simulations* — refinement in two directions, which is
  exactly the difference between asking `subset` and asking `superset`.

## What a pass does not mean

A passing report says the stated words are accepted or rejected as claimed. It does not say the model is
the system: the alphabet is whatever the modeller wrote, and a property that needs a symbol nobody
declared cannot be seen. State the alphabet next to the claim, or the verdict is about a machine that
exists only in the report.

## Provenance

Which parts are borrowed, and which are this repository's own decisions. A check that came from a
textbook is cited so a reader can check the argument; a choice that is not in any book is marked as one.

| Part | Where it comes from |
|---|---|
| subset construction for determinisation | Hopcroft, Motwani and Ullman |
| deciding equivalence and inclusion on the product | Hopcroft, Motwani and Ullman; Kurshan for the framing |
| the shortest-witness search | breadth-first search on the product; the choice to return the shortest word is this repository's |
| the check codes and their grouping | this repository's convention, shared with the other families |
| `truncated` and the `_UNDECIDED` suffix | this repository's convention: a stopped search is not a pass |
| the cap on the product | this repository's decision, and a practical one, not a theoretical boundary |
| `subset` and `superset` as the two refinements | Tretmans; Lynch and Vaandrager |

The theory above decides the checks. Nothing in this family is a heuristic dressed as a decision: every
code either proves a property or says it could not.
