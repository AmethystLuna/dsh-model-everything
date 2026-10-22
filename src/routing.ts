/**
 * Which tool owns which question, in one table.
 *
 * Two consumers read this, and they used to read two different things: the result a model gets
 * (`nextSteps` naming a sibling) and the toolset map a human reads (hand-written prose). That is how the
 * map came to say "about ten thousand characters" while the descriptions measured twenty-nine: a fact
 * stated twice drifts, and nothing fails when it does.
 *
 * So the table states the routing once. `routeFor` hands it to the card a UI draws; the toolset map
 * generator reads the same table and refuses to write a map for a tool that is missing from it.
 *
 * What it is not: a decision. The tool a request should use is chosen by the model from the descriptions.
 * This table says what each tool owns and which neighbour takes the case just outside that line, so a
 * report can redirect without a reader having to remember the roster.
 */

export interface Route {
  /** What this tool decides, in the words its report already uses. */
  owns: string
  /** The case just outside the line, and the tool that owns it. */
  notFor: { when: string; tool: string }
}

export const ROUTES: Record<string, Route> = {
  model_verify: {
    owns: 'one machine: reachable states, invariants, deadlock, and a before/after regression',
    notFor: { when: 'two or more machines must handshake or share a location', tool: 'model_compose_verify' },
  },
  model_compose_verify: {
    owns: 'several machines run together: rendezvous, shared locations, lost updates',
    notFor: { when: 'the question is about one machine on its own', tool: 'model_verify' },
  },
  model_automaton_verify: {
    owns: 'a finite-word language, and its relation to another automaton',
    notFor: { when: 'the question is reachability or deadlock inside one state machine', tool: 'model_verify' },
  },
  model_edit: {
    owns: 'one editing round on a model file, answered with the structural diff and the change in findings',
    notFor: { when: 'the edit is done and the model has to be decided again', tool: 'model_verify' },
  },
  model_datamodel_verify: {
    owns: 'entities, keys, migrations, and whether the data survived them',
    notFor: { when: 'the question is about behaviour over time rather than stored state', tool: 'model_verify' },
  },
  model_design_review: {
    owns: "a design's own declarations: layering, responsibility, substitutability, interface width",
    notFor: { when: 'the artifact is a dependency drawing to audit as a graph', tool: 'uml_structure_verify' },
  },
  model_interleaving_scan: {
    owns: 'mining a document or plan for concurrency claims, and routing each to the analysis that decides it',
    notFor: { when: 'the protocol itself has to be decided', tool: 'model_compose_verify' },
  },
  model_export: {
    owns: 'a model translated into UPPAAL, TLA+, PRISM or SPIN for a property this plugin does not decide',
    notFor: { when: 'the property can be decided here', tool: 'model_verify' },
  },
  report_diff: {
    owns: 'what changed between two reports of the same family',
    notFor: { when: 'the current report does not exist yet', tool: 'model_verify' },
  },
  uml_render: {
    owns: 'drawing a model in the notation that can carry its family',
    notFor: { when: 'the question is whether the modelling is sound', tool: 'uml_review' },
  },
  uml_parse: {
    owns: 'reading a diagram back into the model its family declares',
    notFor: { when: 'the question is whether the diagram says something sound', tool: 'uml_review' },
  },
  uml_review: {
    owns: 'auditing the modelling: reachability, ambiguity, round-trip fidelity, family-specific defects',
    notFor: { when: 'the claim is about behaviour rather than the drawing', tool: 'model_verify' },
  },
  uml_explain_labels: {
    owns: 'the label spellings a notation accepts and the directives that pin the rest',
    notFor: { when: 'a diagram has to be read rather than explained', tool: 'uml_parse' },
  },
  uml_structure_verify: {
    owns: 'a dependency graph as a graph - cycles, layers, dangling edges - from a drawing or a source tree',
    notFor: { when: 'the question is whether the design keeps its own principles', tool: 'model_design_review' },
  },
}

/** The route for a tool, or undefined when the tool has none. */
export function routeFor(tool: string): Route | undefined {
  return ROUTES[tool]
}

/** Every tool a route names, for a caller that has to check the table against the registry. */
export function routedTools(): string[] {
  return Object.keys(ROUTES)
}

/** The tools named as the owner of an adjacent case. */
export function siblingTools(): string[] {
  return [...new Set(Object.values(ROUTES).map((route) => route.notFor.tool))].sort()
}
