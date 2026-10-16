import { runDataVerification } from '../../lib/data-engine.js'

function assertNoUndefinedValues(value, path = 'root') {
  if (value === undefined) {
    throw new Error(`lossless JSON violation: undefined at ${path}`)
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoUndefinedValues(entry, `${path}[${index}]`))
    return
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) {
      assertNoUndefinedValues(entry, `${path}.${key}`)
    }
  }
}

const validModel = {
  schemaVersion: 1,
  entities: [
    {
      name: 'User',
      fields: [
        { name: 'id', type: 'uuid', required: true },
        { name: 'email', type: 'string', required: true, unique: true },
      ],
      primaryKey: ['id'],
    },
  ],
}

function expectFinding(report, checkId, code) {
  const check = report.checks.find((entry) => entry.id === checkId)
  if (check === undefined) throw new Error('missing check ' + checkId)
  if (!check.findings.some((finding) => finding.code === code)) {
    throw new Error('missing finding ' + checkId + '/' + code + ' in ' + JSON.stringify(check.findings))
  }
}

let failures = 0
function test(name, fn) {
  try {
    fn()
    console.log('PASS', name)
  } catch (error) {
    failures += 1
    console.log('FAIL', name, '-', error instanceof Error ? error.message : String(error))
  }
}

test('valid data model passes', () => {
  const report = runDataVerification(validModel)
  if (!report.ok) throw new Error('valid model should be ok')
  if (report.summary.errors !== 0) throw new Error('expected 0 errors, got ' + report.summary.errors)
  assertNoUndefinedValues(report)
})

test('DS/DA structural findings', () => {
  const model = {
    schemaVersion: 1,
    entities: [
      {
        name: 'User',
        fields: [
          { name: 'id', type: 'uuid', required: true, nullable: true },
          { name: 'age', type: 'integer', min: 10, max: 5 },
        ],
        primaryKey: ['id', 'missing'],
      },
    ],
  }
  const report = runDataVerification(model)
  if (!report.ok) throw new Error('model should validate')
  expectFinding(report, 'DS1', 'DS1_PRIMARY_KEY_MISSING')
  expectFinding(report, 'DS4', 'DS4_REQUIRED_NULLABLE')
  expectFinding(report, 'DS4', 'DS4_MIN_GT_MAX')
  expectFinding(report, 'DA1', 'DA1_NULL_ACCEPTED_ON_REQUIRED')
  expectFinding(report, 'DA3', 'DA3_NULLABLE_PRIMARY_KEY')
  assertNoUndefinedValues(report)
})

test('migration coverage requires mapping', () => {
  const before = {
    schemaVersion: 1,
    entities: [{ name: 'User', fields: [{ name: 'name', type: 'string', required: true }] }],
  }
  const after = {
    schemaVersion: 1,
    entities: [{ name: 'User', fields: [{ name: 'fullName', type: 'string', required: true }] }],
  }
  const report = runDataVerification(after, { beforeModel: before })
  expectFinding(report, 'DA5', 'DA5_FIELD_NOT_MIGRATED')
  expectFinding(report, 'DD1', 'DD1_FIELD_REMOVED')
  expectFinding(report, 'DD4', 'DD4_REQUIRED_FIELD_REMOVED')
  assertNoUndefinedValues(report)
})

test('field mapping satisfies migration coverage', () => {
  const before = {
    schemaVersion: 1,
    entities: [{ name: 'User', fields: [{ name: 'name', type: 'string', required: true }] }],
  }
  const after = {
    schemaVersion: 1,
    entities: [{ name: 'User', fields: [{ name: 'fullName', type: 'string', required: true }] }],
  }
  const report = runDataVerification(after, {
    beforeModel: before,
    fieldMapping: { 'User.name': 'User.fullName' },
  })
  const da5 = report.checks.find((check) => check.id === 'DA5')
  if (da5 === undefined || da5.findings.length !== 0) throw new Error('DA5 should pass with field mapping')
  const dd1 = report.checks.find((check) => check.id === 'DD1')
  if (dd1 === undefined || dd1.findings.length !== 0) throw new Error('DD1 should pass with field mapping')
  assertNoUndefinedValues(report)
})

test('copy consistency flags unmapped required target field', () => {
  const model = {
    schemaVersion: 1,
    entities: [
      { name: 'Source', fields: [{ name: 'a', type: 'string' }] },
      { name: 'Target', fields: [{ name: 'x', type: 'string', required: true }, { name: 'y', type: 'string', required: true }] },
    ],
  }
  const report = runDataVerification(model, {
    copyPairs: [{ id: 'c1', sourceEntity: 'Source', targetEntity: 'Target', mapping: { a: 'x' } }],
  })
  expectFinding(report, 'DA6', 'DA6_REQUIRED_TARGET_UNMAPPED')
  assertNoUndefinedValues(report)
})

test('rollback symmetry flags missing backup pair', () => {
  const model = {
    schemaVersion: 1,
    entities: [
      { name: 'Source', fields: [{ name: 'a', type: 'string' }] },
      { name: 'Target', fields: [{ name: 'x', type: 'string', required: true }] },
    ],
  }
  const report = runDataVerification(model, {
    copyPairs: [{ id: 'c1', sourceEntity: 'Source', targetEntity: 'Target', mapping: { a: 'x' } }],
  })
  expectFinding(report, 'DA7', 'DA7_NO_BACKUP_PAIR')
  assertNoUndefinedValues(report)
})

test('idempotent-copy requires copy pair', () => {
  const model = {
    schemaVersion: 1,
    entities: [
      { name: 'Source', fields: [{ name: 'a', type: 'string' }] },
      { name: 'Target', fields: [{ name: 'x', type: 'string', required: true }] },
    ],
    invariants: [
      { id: 'ic1', description: 'copy must be idempotent', kind: 'idempotent-copy', sourceEntity: 'Source', targetEntity: 'Target' },
    ],
  }
  const report = runDataVerification(model, { copyPairs: [] })
  expectFinding(report, 'DA8', 'DA8_COPY_PAIR_MISSING')
  assertNoUndefinedValues(report)
})

test('idempotent-migration with split transform warns', () => {
  const model = {
    schemaVersion: 1,
    entities: [
      { name: 'A', fields: [{ name: 'x', type: 'string' }] },
      { name: 'B', fields: [{ name: 'y', type: 'string' }] },
    ],
    invariants: [
      { id: 'im1', description: 'migration must be idempotent', kind: 'idempotent-migration', from: 'A.x', to: 'B.y' },
    ],
  }
  const report = runDataVerification(model, {
    migrationMappings: [{ from: 'A.x', to: 'B.y', transform: 'split' }],
  })
  expectFinding(report, 'DA8', 'DA8_NON_IDEMPOTENT_TRANSFORM')
  assertNoUndefinedValues(report)
})

test('data monotonic flags opposite copy direction', () => {
  const model = {
    schemaVersion: 1,
    entities: [
      { name: 'Source', fields: [{ name: 'v', type: 'integer', monotonic: 'dec' }] },
      { name: 'Target', fields: [{ name: 'version', type: 'integer', monotonic: 'inc' }] },
    ],
    invariants: [
      { id: 'mono1', description: 'version increases', kind: 'monotonic', entity: 'Target', field: 'version', direction: 'inc' },
    ],
  }
  const report = runDataVerification(model, {
    copyPairs: [{ id: 'c1', sourceEntity: 'Source', targetEntity: 'Target', mapping: { v: 'version' } }],
  })
  expectFinding(report, 'DA9', 'DA9_MONOTONIC_COPY_OPPOSITE')
  assertNoUndefinedValues(report)
})

test('data sequence checks step ids exist', () => {
  const model = {
    schemaVersion: 1,
    entities: [{ name: 'A', fields: [{ name: 'x', type: 'string' }] }],
    invariants: [
      { id: 'seq1', description: 'copy then migrate', kind: 'sequence', steps: ['c1', 'm1'] },
    ],
  }
  const report = runDataVerification(model, {
    copyPairs: [{ id: 'c1', sourceEntity: 'A', targetEntity: 'A', mapping: { x: 'x' } }],
    migrationMappings: [],
  })
  expectFinding(report, 'DA10', 'DA10_SEQUENCE_STEP_MISSING')
  assertNoUndefinedValues(report)
})

test('data leads-to validates enum values', () => {
  const model = {
    schemaVersion: 1,
    entities: [{ name: 'Job', fields: [{ name: 'status', type: 'enum', enum: ['pending', 'done'] }] }],
    invariants: [
      { id: 'lead1', description: 'pending leads to done', kind: 'leads-to', entity: 'Job', field: 'status', from: 'pending', to: 'done' },
      { id: 'lead2', description: 'bad value', kind: 'leads-to', entity: 'Job', field: 'status', from: 'nope', to: 'done' },
    ],
  }
  const report = runDataVerification(model)
  expectFinding(report, 'DA11', 'DA11_FROM_NOT_IN_ENUM')
  assertNoUndefinedValues(report)
})

test('data atomicity flags missing backup and non-atomic transform', () => {
  const model = {
    schemaVersion: 1,
    entities: [
      { name: 'Source', fields: [{ name: 'a', type: 'string' }] },
      { name: 'Target', fields: [{ name: 'x', type: 'string', required: true }] },
    ],
    invariants: [
      { id: 'atom1', description: 'copy atomically', kind: 'atomicity', steps: ['c1', 'm1'] },
    ],
  }
  const report = runDataVerification(model, {
    copyPairs: [{ id: 'c1', sourceEntity: 'Source', targetEntity: 'Target', mapping: { a: 'x' } }],
    migrationMappings: [{ id: 'm1', from: 'Source.a', to: 'Target.x', transform: 'split' }],
    backupPairs: [],
  })
  expectFinding(report, 'DA12', 'DA12_ATOMIC_COPY_NO_BACKUP')
  expectFinding(report, 'DA12', 'DA12_NON_ATOMIC_TRANSFORM')
  assertNoUndefinedValues(report)
})

test('report contract: schema, hashes and next steps are present and deterministic', () => {
  // `primaryKey` belongs on the entity, not on the field: the engine reads the entity-level array
  // and never looked at a field-level flag, so this fixture was carrying a key that did nothing
  // until the schema closed and refused it.
  const model = {
    schemaVersion: 1,
    entities: [{ name: 'user', fields: [{ name: 'id', type: 'uuid', required: true }], primaryKey: ['id'] }],
  }
  const report = runDataVerification(model)
  if (report.schema !== 'model-everything/datamodel/v1') throw new Error('schema: ' + report.schema)
  if (report.hashes.modelHash !== report.modelHash || report.modelHash.length !== 64) {
    throw new Error('hashes must carry the report modelHash: ' + JSON.stringify(report.hashes))
  }
  if (!Array.isArray(report.nextSteps) || report.nextSteps.length === 0) throw new Error('nextSteps must not be empty')
  const again = runDataVerification(model)
  if (JSON.stringify(again.nextSteps) !== JSON.stringify(report.nextSteps)) throw new Error('nextSteps must be deterministic')
  const rejected = runDataVerification({ schemaVersion: 2, entities: [] })
  if (rejected.ok !== false || rejected.schema !== 'model-everything/datamodel/v1') throw new Error('a rejected model keeps the contract')
  if (!rejected.nextSteps.some((step) => step.includes('DATA_MODEL Data Model Validation'))) {
    throw new Error('a rejected model must name the validation check: ' + JSON.stringify(rejected.nextSteps))
  }
  assertNoUndefinedValues(report)
  assertNoUndefinedValues(rejected)
})

// ------------------------------------------------- data engine: white box, in the small --

// Every check code the data engine can emit is driven here by one case that produces it,
// so a code with no reachable input shows up as a red test rather than as a claim in the
// source. `codes` collects every code in the report; a case asserts its own code is
// present and that no other *error* code came along (a warning may, when the same defect
// is also a completeness gap).
function codesOf(report) {
  return report.checks.flatMap((check) => check.findings.map((finding) => finding.code))
}

function caseFor(name, model, code, options) {
  test('data white box: ' + name + ' -> ' + code, () => {
    const report = runDataVerification(model, options)
    if (!report.ok) throw new Error('the model was rejected: ' + JSON.stringify(report.checks?.[0]?.findings ?? report.error))
    const codes = codesOf(report)
    if (!codes.includes(code)) throw new Error('missing ' + code + ' in ' + JSON.stringify(codes))
    // Every data-engine code is prefixed by the check that emits it, so the finding must be
    // carried by that check and not leak in from a sibling one.
    const owner = code.split('_')[0]
    const carrier = report.checks.find((check) => check.id === owner)
    if (carrier === undefined || !carrier.findings.some((finding) => finding.code === code)) {
      const elsewhere = report.checks.filter((check) => check.findings.some((finding) => finding.code === code)).map((check) => check.id)
      throw new Error(code + ' must be carried by check ' + owner + ', found in ' + JSON.stringify(elsewhere))
    }
    const errors = report.checks
      .flatMap((check) => check.findings.filter((finding) => finding.severity === 'error').map((finding) => finding.code))
      .filter((entry) => entry !== code)
    if (errors.length > 0) throw new Error(code + ' also produced errors ' + JSON.stringify(errors))
    assertNoUndefinedValues(report)
  })
}

const entity = (name, fields, extra = {}) => ({ name, fields, ...extra })
const field = (name, type, extra = {}) => ({ name, type, ...extra })

// DS1 — entity/field identity and key references.
//
// The two duplicate codes are shadowed: validateDataModel() rejects a duplicate entity name
// and a duplicate field name, and runDataVerification() returns that rejection before it
// builds a single check, so DS1_schemaWellFormed() — which lives in the same module and is
// not exported — can never see such a model. Through the public API these two codes are
// unreachable, and reaching them positively would need a src/ change (export the check, or
// drop the duplicate rules from the validator). These cases pin the shadowing instead of
// faking a trigger: if the validator ever stops rejecting a duplicate, each goes red and the
// code becomes reachable again.
function shadowedByValidation(code, name, model) {
  test('data white box: ' + name + ' is rejected before ' + code + ' can see it', () => {
    const report = runDataVerification(model)
    if (report.ok !== false) throw new Error(code + ' is reachable again: the model now passes validation')
    const codes = codesOf(report)
    if (codes.includes(code)) throw new Error(code + ' was emitted: replace this case with a positive one')
    if (JSON.stringify(codes) !== JSON.stringify(['DATA_MODEL_INVALID'])) {
      throw new Error('expected only DATA_MODEL_INVALID, got ' + JSON.stringify(codes))
    }
    if (report.summary.checksRun !== 0 || report.checks.length !== 1 || report.checks[0].id !== 'DATA_MODEL') {
      throw new Error('a rejected model must run no check: ' + JSON.stringify({ checksRun: report.summary.checksRun, ids: report.checks.map((check) => check.id) }))
    }
    assertNoUndefinedValues(report)
  })
}
shadowedByValidation('DS1_DUPLICATE_ENTITY', 'a duplicate entity name', { schemaVersion: 1, entities: [entity('U', [field('id', 'uuid')]), entity('U', [field('id', 'uuid')])] })
shadowedByValidation('DS1_DUPLICATE_FIELD', 'a duplicate field in one entity', { schemaVersion: 1, entities: [entity('U', [field('id', 'uuid'), field('id', 'uuid')])] })

// A whitespace-only type is the one shape that reaches DS1_EMPTY_TYPE: the validator only
// rejects a zero-length type string, while the check itself tests type.trim().length === 0.
caseFor('a field whose type is whitespace only', { schemaVersion: 1, entities: [entity('U', [field('id', ' ')])] }, 'DS1_EMPTY_TYPE')
caseFor('a unique key naming a field that does not exist', { schemaVersion: 1, entities: [entity('U', [field('id', 'uuid')], { uniqueKeys: [['nope']] })] }, 'DS1_UNIQUE_KEY_MISSING')
caseFor('an index naming a field that does not exist', { schemaVersion: 1, entities: [entity('U', [field('id', 'uuid')], { indexes: [['nope']] })] }, 'DS1_INDEX_MISSING')

// DS2 — required-field completeness. The unsourced warning asks "where does this value come
// from", which only a before model turns into a question: the after field must be required
// and must be neither a before field, nor a migration mapping's `from`, nor a copy pair's
// target. The before field stays present in the after model, or DA5/DD1 report its removal.
caseFor(
  'a required field added with no source in the before model',
  { schemaVersion: 1, entities: [entity('U', [field('id', 'uuid'), field('created_at', 'uuid', { required: true })])] },
  'DS2_REQUIRED_FIELD_UNSOURCED',
  { beforeModel: { schemaVersion: 1, entities: [entity('U', [field('id', 'uuid')])] } },
)

// DS2 — a required primary key that also allows null. No input reaches this code alone: DS2,
// DS4, DA1 and DA3 all fire on the same field.required && field.nullable pair on a primary
// key, so the case asserts that exact four-code set, and that DS2 itself carries one finding.
test('data white box: a required primary key that allows null -> DS2_NULLABLE_PRIMARY_KEY', () => {
  const model = { schemaVersion: 1, entities: [entity('U', [field('id', 'integer', { required: true, nullable: true })], { primaryKey: ['id'] })] }
  const report = runDataVerification(model)
  if (!report.ok) throw new Error('the model must validate: ' + JSON.stringify(codesOf(report)))
  const expected = ['DA1_NULL_ACCEPTED_ON_REQUIRED', 'DA3_NULLABLE_PRIMARY_KEY', 'DS2_NULLABLE_PRIMARY_KEY', 'DS4_REQUIRED_NULLABLE']
  const actual = [...new Set(codesOf(report))].sort()
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error('expected exactly ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual))
  }
  const ds2 = report.checks.find((check) => check.id === 'DS2')
  if (ds2 === undefined || ds2.findings.length !== 1 || ds2.findings[0].code !== 'DS2_NULLABLE_PRIMARY_KEY') {
    throw new Error('DS2 must carry exactly DS2_NULLABLE_PRIMARY_KEY: ' + JSON.stringify(ds2?.findings))
  }
  assertNoUndefinedValues(report)
})

// DS3 — relationships.
caseFor('a relationship whose fromEntity does not exist', { schemaVersion: 1, entities: [entity('U', [field('id', 'uuid')])], relationships: [{ fromEntity: 'Ghost', fromField: 'id', toEntity: 'U' }] }, 'DS3_FROM_ENTITY_MISSING')
caseFor('a relationship whose toEntity does not exist', { schemaVersion: 1, entities: [entity('U', [field('id', 'uuid')])], relationships: [{ fromEntity: 'U', fromField: 'id', toEntity: 'Ghost' }] }, 'DS3_TO_ENTITY_MISSING')
caseFor('a relationship whose fromField does not exist', { schemaVersion: 1, entities: [entity('U', [field('id', 'uuid')])], relationships: [{ fromEntity: 'U', fromField: 'nope', toEntity: 'U' }] }, 'DS3_FROM_FIELD_MISSING')
caseFor('a relationship whose toField does not exist', { schemaVersion: 1, entities: [entity('U', [field('id', 'uuid')])], relationships: [{ fromEntity: 'U', fromField: 'id', toEntity: 'U', toField: 'nope' }] }, 'DS3_TO_FIELD_MISSING')
caseFor('a relationship with an unknown onDelete', { schemaVersion: 1, entities: [entity('U', [field('id', 'uuid')])], relationships: [{ fromEntity: 'U', fromField: 'id', toEntity: 'U', onDelete: 'explode' }] }, 'DS3_INVALID_ON_DELETE')

// DS4 — type, nullability and length consistency.
caseFor('a unique field that is also nullable', { schemaVersion: 1, entities: [entity('U', [field('email', 'string', { unique: true, nullable: true })])] }, 'DS4_UNIQUE_NULLABLE')
caseFor('minLength greater than maxLength', { schemaVersion: 1, entities: [entity('U', [field('name', 'string', { minLength: 10, maxLength: 2 })])] }, 'DS4_MIN_LENGTH_GT_MAX_LENGTH')
caseFor('a required field whose default is null', { schemaVersion: 1, entities: [entity('U', [field('name', 'string', { required: true, default: null })])] }, 'DS4_REQUIRED_NULL_DEFAULT')

// DA1 — nulls the model accepts. The empty-string code needs minLength === 0 exactly: without
// minLength the field is merely unconstrained, which the check does not treat as empty.
caseFor('a required string that allows the empty string', { schemaVersion: 1, entities: [entity('U', [field('name', 'string', { required: true, minLength: 0 })])] }, 'DA1_EMPTY_STRING_ALLOWED')

// DA2 — defaults, enum values and boundary checks against the declared range.
caseFor('a default below the declared minimum', { schemaVersion: 1, entities: [entity('U', [field('n', 'integer', { min: 5, default: 1 })])] }, 'DA2_DEFAULT_BELOW_MIN')
caseFor('a default above the declared maximum', { schemaVersion: 1, entities: [entity('U', [field('n', 'integer', { max: 5, default: 9 })])] }, 'DA2_DEFAULT_ABOVE_MAX')
caseFor('an enum value below the declared minimum', { schemaVersion: 1, entities: [entity('U', [field('n', 'integer', { min: 5, enum: [1, 7] })])] }, 'DA2_ENUM_BELOW_MIN')
caseFor('an enum value above the declared maximum', { schemaVersion: 1, entities: [entity('U', [field('n', 'integer', { max: 5, enum: [1, 7] })])] }, 'DA2_ENUM_ABOVE_MAX')
caseFor('a boundary check on a field that does not exist', { schemaVersion: 1, entities: [entity('U', [field('n', 'integer', { min: 0, max: 10 })])], boundaryChecks: [{ entity: 'U', field: 'ghost', values: [1] }] }, 'DA2_BOUNDARY_FIELD_MISSING')
caseFor('a boundary value below the declared minimum', { schemaVersion: 1, entities: [entity('U', [field('n', 'integer', { min: 5, max: 10 })])], boundaryChecks: [{ entity: 'U', field: 'n', values: [1] }] }, 'DA2_BOUNDARY_BELOW_MIN')
caseFor('a boundary value above the declared maximum', { schemaVersion: 1, entities: [entity('U', [field('n', 'integer', { min: 5, max: 10 })])], boundaryChecks: [{ entity: 'U', field: 'n', values: [99] }] }, 'DA2_BOUNDARY_ABOVE_MAX')
caseFor('a boundary value outside the enum', { schemaVersion: 1, entities: [entity('U', [field('s', 'enum', { enum: ['a', 'b'] })])], boundaryChecks: [{ entity: 'U', field: 's', values: ['z'] }] }, 'DA2_BOUNDARY_NOT_IN_ENUM')

// DA3 — nullability of the keys.
caseFor('a nullable unique-key field', { schemaVersion: 1, entities: [entity('U', [field('email', 'string', { nullable: true })], { uniqueKeys: [['email']] })] }, 'DA3_NULLABLE_UNIQUE_KEY')

// DA4 — a relationship whose ends are typed differently.
caseFor(
  'a relationship whose from/to field types differ',
  { schemaVersion: 1, entities: [entity('A', [field('id', 'uuid')]), entity('B', [field('id', 'integer')])], relationships: [{ fromEntity: 'A', fromField: 'id', toEntity: 'B', toField: 'id' }] },
  'DA4_REF_TYPE_MISMATCH',
)

// DA5 — the before model itself is unusable. This is the one code whose report comes back
// with ok:false: runDataVerification() returns early and attaches the failure to its own
// BEFORE_DATA_MODEL check, so the assertion is written out in full instead of going through
// caseFor(). The after model is clean, and the report carries exactly two codes —
// DA5_BEFORE_MODEL_INVALID plus the runner's BEFORE_DATA_MODEL_INVALID for that extra check.
test('data white box: a before model that fails validation -> DA5_BEFORE_MODEL_INVALID', () => {
  const report = runDataVerification(
    { schemaVersion: 1, entities: [entity('U', [field('id', 'uuid')])] },
    { beforeModel: { schemaVersion: 9, entities: [] } },
  )
  if (report.ran !== true) throw new Error('the engine must report that it ran')
  if (report.ok !== false) throw new Error('an invalid before model cannot be ok: ' + report.verdict)
  const codes = [...new Set(codesOf(report))].sort()
  const expected = ['BEFORE_DATA_MODEL_INVALID', 'DA5_BEFORE_MODEL_INVALID']
  if (JSON.stringify(codes) !== JSON.stringify(expected)) {
    throw new Error('expected only the before-model codes ' + JSON.stringify(expected) + ', got ' + JSON.stringify(codes))
  }
  const da5 = report.checks.find((check) => check.id === 'DA5')
  if (da5 === undefined || da5.status !== 'fail' || da5.findings.length !== 1 || da5.findings[0].code !== 'DA5_BEFORE_MODEL_INVALID') {
    throw new Error('DA5 must carry exactly DA5_BEFORE_MODEL_INVALID: ' + JSON.stringify(da5?.findings))
  }
  assertNoUndefinedValues(report)
})

// DA6 — copy pairs. An unknown source entity makes every mapping entry an unknown source
// field too, and a required target field would add DA6_REQUIRED_TARGET_UNMAPPED, so the pair
// carries an empty mapping and a target with no required field: the code then stands alone.
// DA7's "no backup pair" warning rides along with every copy pair in this section.
caseFor(
  'a copy pair naming an unknown source entity',
  { schemaVersion: 1, entities: [entity('T', [field('x', 'string')])] },
  'DA6_SOURCE_ENTITY_MISSING',
  { copyPairs: [{ id: 'c1', sourceEntity: 'Ghost', targetEntity: 'T', mapping: {} }] },
)
caseFor(
  'a copy pair naming an unknown target entity',
  { schemaVersion: 1, entities: [entity('S', [field('a', 'string')])] },
  'DA6_TARGET_ENTITY_MISSING',
  { copyPairs: [{ id: 'c1', sourceEntity: 'S', targetEntity: 'Ghost', mapping: { a: 'x' } }] },
)
caseFor(
  'a copy pair mapping a source field that does not exist',
  { schemaVersion: 1, entities: [entity('S', [field('a', 'string')]), entity('T', [field('x', 'string')])] },
  'DA6_SOURCE_FIELD_MISSING',
  { copyPairs: [{ id: 'c1', sourceEntity: 'S', targetEntity: 'T', mapping: { nope: 'x' } }] },
)
caseFor(
  'a copy pair mapping a target field that does not exist',
  { schemaVersion: 1, entities: [entity('S', [field('a', 'string')]), entity('T', [field('x', 'string')])] },
  'DA6_TARGET_FIELD_MISSING',
  { copyPairs: [{ id: 'c1', sourceEntity: 'S', targetEntity: 'T', mapping: { a: 'nope' } }] },
)

// DA8 — idempotence of a migration mapping with no mapping to read.
caseFor(
  'an idempotent-migration invariant with no mapping for it',
  {
    schemaVersion: 1,
    entities: [entity('A', [field('x', 'string')]), entity('B', [field('y', 'string')])],
    invariants: [{ id: 'im1', description: 'idempotent', kind: 'idempotent-migration', from: 'A.x', to: 'B.y' }],
  },
  'DA8_MIGRATION_MAPPING_MISSING',
)

// DA9 — monotonic constraints.
caseFor(
  'a monotonic invariant naming a missing field',
  { schemaVersion: 1, entities: [entity('T', [field('v', 'integer')])], invariants: [{ id: 'm1', description: 'inc', kind: 'monotonic', entity: 'T', field: 'ghost', direction: 'inc' }] },
  'DA9_MONOTONIC_FIELD_MISSING',
)
caseFor(
  'a monotonic invariant on a type that may not order',
  { schemaVersion: 1, entities: [entity('T', [field('v', 'string')])], invariants: [{ id: 'm1', description: 'inc', kind: 'monotonic', entity: 'T', field: 'v', direction: 'inc' }] },
  'DA9_MONOTONIC_TYPE_UNSUPPORTED',
)
caseFor(
  'a monotonic invariant contradicting the field declaration',
  { schemaVersion: 1, entities: [entity('T', [field('v', 'integer', { monotonic: 'dec' })])], invariants: [{ id: 'm1', description: 'inc', kind: 'monotonic', entity: 'T', field: 'v', direction: 'inc' }] },
  'DA9_MONOTONIC_DIRECTION_MISMATCH',
)

// DA11 — leads-to values against the field's enum.
caseFor(
  'a leads-to target outside the enum',
  { schemaVersion: 1, entities: [entity('J', [field('s', 'enum', { enum: ['a', 'b'] })])], invariants: [{ id: 'l1', description: 'a leads to b', kind: 'leads-to', entity: 'J', field: 's', from: 'a', to: 'z' }] },
  'DA11_TO_NOT_IN_ENUM',
)
caseFor(
  'a leads-to invariant naming a missing field',
  { schemaVersion: 1, entities: [entity('J', [field('s', 'enum', { enum: ['a', 'b'] })])], invariants: [{ id: 'l1', description: 'a leads to b', kind: 'leads-to', entity: 'J', field: 'ghost', from: 'a', to: 'b' }] },
  'DA11_LEADS_TO_FIELD_MISSING',
)

// DA12 — an atomic step that names nothing.
caseFor(
  'an atomicity invariant naming a step that does not exist',
  { schemaVersion: 1, entities: [entity('A', [field('x', 'string')])], invariants: [{ id: 'at1', description: 'atomic', kind: 'atomicity', steps: ['ghost'] }] },
  'DA12_ATOMIC_STEP_MISSING',
)

// DD1/DD3/DD4 — field and entity history across a migration.
const beforeTwo = { schemaVersion: 1, entities: [entity('U', [field('a', 'string', { required: true }), field('b', 'string', { required: true })])] }
caseFor(
  'a required field that became optional',
  { schemaVersion: 1, entities: [entity('U', [field('a', 'string', { required: true }), field('b', 'string')])] },
  'DD1_REQUIRED_BECAME_OPTIONAL',
  { beforeModel: beforeTwo, fieldMapping: { 'U.b': 'U.b' } },
)
// A dropped entity drops its fields with it, so fieldMapping routes the field into a
// surviving entity: DA5/DD1 then see it as migrated and the delta reports the entity alone.
// A migration mapping would silence DA5/DD1 as well but leave DD3_REMOVED_FIELD in the report.
caseFor(
  'an entity removed and mapped away',
  { schemaVersion: 1, entities: [entity('U', [field('id', 'uuid')])] },
  'DD3_REMOVED_ENTITY',
  {
    beforeModel: { schemaVersion: 1, entities: [entity('U', [field('id', 'uuid')]), entity('Ghost', [field('id', 'uuid')])] },
    fieldMapping: { 'Ghost.id': 'U.id' },
  },
)
// A field dropped from a surviving entity. DD3 reads fieldMapping only, so a migration mapping
// covers the removal for DA5/DD1/DD4 without hiding it from the delta; the field is optional,
// or DD4_REQUIRED_FIELD_REMOVED would fire as well.
caseFor(
  'an optional field removed from the after model',
  { schemaVersion: 1, entities: [entity('U', [field('id', 'uuid')])] },
  'DD3_REMOVED_FIELD',
  {
    beforeModel: { schemaVersion: 1, entities: [entity('U', [field('id', 'uuid'), field('legacy', 'string')])] },
    migrationMappings: [{ from: 'U.legacy', to: 'U.id' }],
  },
)
caseFor(
  'an optional field that became required',
  { schemaVersion: 1, entities: [entity('U', [field('a', 'string', { required: true })])] },
  'DD4_OPTIONAL_BECAME_REQUIRED',
  { beforeModel: { schemaVersion: 1, entities: [entity('U', [field('a', 'string')])] } },
)
caseFor(
  'a nullable field that became non-nullable',
  { schemaVersion: 1, entities: [entity('U', [field('a', 'string', { nullable: false })])] },
  'DD4_NULLABLE_BECAME_NOT_NULL',
  { beforeModel: { schemaVersion: 1, entities: [entity('U', [field('a', 'string', { nullable: true })])] }, fieldMapping: { 'U.a': 'U.a' } },
)
caseFor(
  'a field whose type changed',
  { schemaVersion: 1, entities: [entity('U', [field('a', 'integer')])] },
  'DD4_TYPE_CHANGED',
  { beforeModel: { schemaVersion: 1, entities: [entity('U', [field('a', 'string')])] }, fieldMapping: { 'U.a': 'U.a' } },
)

// DD2 — a BEFORE invariant whose mapped target no longer exists.
caseFor(
  'a before invariant whose entity is gone',
  { schemaVersion: 1, entities: [entity('Kept', [field('x', 'string')])] },
  'DD2_INVARIANT_ENTITY_MISSING',
  {
    beforeModel: {
      schemaVersion: 1,
      entities: [entity('Kept', [field('x', 'string')])],
      invariants: [{ id: 'c1', description: 'counts match', kind: 'count-equal', sourceEntity: 'Kept', targetEntity: 'Gone' }],
    },
  },
)
// DD2 reads fieldMapping only, so a removed before field cannot both satisfy DA5/DD1 and stay
// invisible to DD2: a migration mapping covers the removal for DA5/DD1/DD4, while the before
// invariant still names a path the after model does not have. DD3_REMOVED_FIELD rides along
// as a warning, because the field really is gone.
caseFor(
  'a before invariant whose field is gone',
  { schemaVersion: 1, entities: [entity('Kept', [field('other', 'string')])] },
  'DD2_INVARIANT_FIELD_MISSING',
  {
    beforeModel: {
      schemaVersion: 1,
      entities: [entity('Kept', [field('x', 'string')])],
      invariants: [{ id: 'f1', description: 'requires x', kind: 'field-required', entity: 'Kept', field: 'x' }],
    },
    migrationMappings: [{ from: 'Kept.x', to: 'Kept.other' }],
  },
)

/**
 * The two shapes the robustness audit found in this engine, pinned so they cannot come back.
 *
 * Both are the class where a name that resolves to nothing buys an all-clear: a misspelled key
 * reads as an absent declaration, and an invariant about a field that does not exist produced no
 * finding at all.
 */
function runClosureTests() {
  // A misspelled key used to read as "no primary key declared", and DS1 then reported a pass for
  // a model it had not checked.
  test('data: an undeclared key is refused rather than ignored', () => {
    const misspelled = { schemaVersion: 1, entities: [entity('U', [field('id', 'uuid')], { primryKey: ['id'] })] }
    const report = runDataVerification(misspelled)
    if (report.ok !== false) throw new Error('a misspelled key must be refused, not read as an absent declaration')
    const message = report.checks[0].findings.map((finding) => finding.message).join(' | ')
    if (!message.includes('primryKey')) throw new Error('the refusal must name the key: ' + message)
    if (report.verdict !== 'fail') throw new Error('a refused model must fail: ' + report.verdict)

    // The same key spelled right is accepted, so the check is about the key and not about the
    // presence of a key like it.
    const correct = runDataVerification({ schemaVersion: 1, entities: [entity('U', [field('id', 'uuid')], { primaryKey: ['nope'] })] })
    if (correct.ok !== true) throw new Error('a correctly spelled key must be accepted')
    if (!codesOf(correct).includes('DS1_PRIMARY_KEY_MISSING')) throw new Error('and the check must then report what it finds')
  })

  test('data: an invariant naming a field that does not exist is reported', () => {
    const ghosts = [
      ['field-required', { kind: 'field-required', entity: 'J', field: 'ghost' }],
      ['no-orphan', { kind: 'no-orphan', entity: 'J', field: 'ghost' }],
      ['range', { kind: 'range', entity: 'J', field: 'ghost', min: 0 }],
      ['unique', { kind: 'unique', entity: 'J', fields: ['ghost'] }],
      ['referential-integrity', { kind: 'referential-integrity', entity: 'J', field: 'status', refEntity: 'J', refField: 'ghost' }],
      ['count-equal', { kind: 'count-equal', sourceEntity: 'Ghost', targetEntity: 'J' }],
      ['field-equal', { kind: 'field-equal', sourceEntity: 'J', sourceField: 'ghost', targetEntity: 'J', targetField: 'status' }],
    ]
    for (const [kind, body] of ghosts) {
      const model = {
        schemaVersion: 1,
        entities: [entity('J', [field('status', 'string')])],
        invariants: [{ id: 'i1', description: kind + ' over a field that does not exist', ...body }],
      }
      const report = runDataVerification(model)
      const codes = codesOf(report)
      const wanted = body.sourceEntity === 'Ghost' ? 'DS5_INVARIANT_ENTITY_MISSING' : 'DS5_INVARIANT_FIELD_MISSING'
      if (!codes.includes(wanted)) throw new Error(kind + ': expected ' + wanted + ', got ' + JSON.stringify(codes))
      const carrier = report.checks.find((check) => check.id === 'DS5')
      if (carrier === undefined || carrier.status !== 'fail') throw new Error(kind + ': DS5 must carry it and fail')
    }

    // The near miss: the same shapes naming what exists must produce nothing.
    const sound = runDataVerification({
      schemaVersion: 1,
      entities: [entity('J', [field('status', 'string')]), entity('K', [field('status', 'string')])],
      invariants: [
        { id: 'a', description: 'ok', kind: 'field-required', entity: 'J', field: 'status' },
        { id: 'b', description: 'ok', kind: 'range', entity: 'J', field: 'status', min: 0 },
        { id: 'c', description: 'ok', kind: 'unique', entity: 'J', fields: ['status'] },
        { id: 'd', description: 'ok', kind: 'referential-integrity', entity: 'J', field: 'status', refEntity: 'K', refField: 'status' },
        { id: 'e', description: 'ok', kind: 'count-equal', sourceEntity: 'J', targetEntity: 'K' },
        { id: 'f', description: 'ok', kind: 'field-equal', sourceEntity: 'J', sourceField: 'status', targetEntity: 'K', targetField: 'status' },
      ],
    })
    const leaked = codesOf(sound).filter((code) => code.startsWith('DS5_'))
    if (leaked.length > 0) throw new Error('a resolvable invariant must not be reported: ' + JSON.stringify(leaked))
  })

  console.log('PASS data-closure')
}

runClosureTests()

if (failures > 0) {
  console.log('data engine tests failed:', failures)
  process.exit(1)
}
console.log('all data engine tests passed')
