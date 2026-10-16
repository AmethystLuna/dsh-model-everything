// Design fixtures shared by the contract suite and its preview.
//
// A separate module rather than two copies: the snapshot freezes what the suite computes, and
// a preview that built its own copy of the input could drift from it without anything failing.

/**
 * A design that keeps every declaration it makes: the layers run one step at a time, every
 * node is placed, the required edge exists, the one edge across boundaries is allowed by a
 * rule, the subtype only refuses an event its supertype never had, and each responsibility
 * owns its own dependency.
 */
export const declaredDesign = {
  schemaVersion: 1,
  artifact: 'orders service, layered',
  architecture: {
    nodes: ['ui', 'service', 'repo', 'db', 'audit'],
    edges: [['ui', 'service'], ['service', 'repo'], ['repo', 'db'], ['service', 'audit']],
  },
  declare: {
    layers: [
      { name: 'ui', members: ['ui'] },
      { name: 'service', members: ['service'] },
      { name: 'data', members: ['repo', 'db', 'audit'] },
    ],
    boundaries: [
      { name: 'presentation', members: ['ui'] },
      { name: 'domain', members: ['service', 'repo', 'db', 'audit'] },
    ],
    allowedEdges: [{ id: 'ui-to-domain', source: 'presentation', allow: ['domain'] }],
    requiredEdges: [{ id: 'ui-calls-service', from: 'ui', to: 'service' }],
  },
  types: [
    { name: 'Reader', stereotype: 'interface', operations: [{ name: 'find' }] },
    { name: 'Writer', stereotype: 'interface', operations: [{ name: 'save' }] },
    { name: 'ReportJob', stereotype: 'class', uses: [{ type: 'Reader', operations: ['find'] }] },
    { name: 'IngestJob', stereotype: 'class', uses: [{ type: 'Writer', operations: ['save'] }] },
    {
      name: 'Account',
      stereotype: 'class',
      operations: [{ name: 'withdraw', parameters: ['Money'], returns: 'Money' }],
      transitions: [{ event: 'withdraw' }, { event: 'deposit' }],
    },
    { name: 'Savings', stereotype: 'class', extends: 'Account', forbids: [{ event: 'closeEarly' }] },
    {
      name: 'OrderService',
      stereotype: 'class',
      responsibilities: [
        { name: 'pricing', uses: ['PriceList'] },
        { name: 'persistence', uses: ['OrderStore'] },
      ],
      dependsOn: ['PriceList', 'OrderStore'],
    },
  ],
}

/**
 * The same shape with several declarations broken at once: a mutual dependency between the
 * service and the repository, a layer skipped by the ui edge, a boundary crossed with no rule,
 * a required edge that is absent, an interface operation no caller uses, a subtype refusing an
 * event its supertype handles, and a dependency no responsibility owns.
 */
export const defectiveDesign = {
  schemaVersion: 1,
  artifact: 'orders service, declarations broken',
  architecture: {
    nodes: ['ui', 'service', 'repo'],
    edges: [['ui', 'repo'], ['repo', 'service'], ['service', 'repo']],
  },
  declare: {
    layers: [
      { name: 'ui', members: ['ui'] },
      { name: 'service', members: ['service'] },
      { name: 'data', members: ['repo'] },
    ],
    boundaries: [
      { name: 'presentation', members: ['ui'] },
      { name: 'domain', members: ['service', 'repo'] },
    ],
    requiredEdges: [{ id: 'ui-calls-service', from: 'ui', to: 'service' }],
  },
  types: [
    { name: 'Reader', stereotype: 'interface', operations: [{ name: 'find' }, { name: 'vacuum' }] },
    { name: 'ReportJob', stereotype: 'class', uses: [{ type: 'Reader', operations: ['find'] }] },
    {
      name: 'Account',
      stereotype: 'class',
      operations: [{ name: 'withdraw', parameters: ['Money'], returns: 'Money' }],
      transitions: [{ event: 'withdraw' }],
    },
    { name: 'FixedDeposit', stereotype: 'class', extends: 'Account', forbids: [{ event: 'withdraw' }] },
    {
      name: 'OrderService',
      stereotype: 'class',
      responsibilities: [{ name: 'pricing', uses: ['PriceList'] }],
      dependsOn: ['PriceList', 'AuditLog'],
    },
  ],
}

/** A graph with no declaration at all: shape only, every contract check skipped. */
export const bareDesign = {
  schemaVersion: 1,
  architecture: { nodes: ['a', 'b'], edges: [['a', 'b']] },
}

/** A model the closed schema refuses. */
export const refusedDesign = {
  schemaVersion: 1,
  architecture: { nodes: ['a'], edges: [], wibble: 1 },
}
