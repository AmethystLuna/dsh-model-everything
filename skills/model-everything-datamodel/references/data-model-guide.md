# Data Model Manual Verification Mode

Use this when `model_datamodel_verify` is not registered in this deployment. It lays out the DS/DA/DD checks as a structured checklist.

## 1. Extract the DataModelV1 table

For every entity, list fields, types, nullability, required, unique, primary key, and relationships.

```text
Entity   | Field      | Type    | Required | Unique | Nullable | Notes
---------|------------|---------|----------|--------|----------|-------
User     | id         | uuid    | yes      | yes    | no       | PK
User     | email      | string  | yes      | yes    | no       |
Order    | userId     | uuid    | yes      | no     | no       | FK -> User.id
```

## 2. Structural checklist (DS1-DS4)

- [ ] Entity names are unique.
- [ ] Field names are unique within each entity.
- [ ] Primary key and unique key fields exist.
- [ ] Required fields are not nullable.
- [ ] Relationship targets exist.
- [ ] `onDelete` values are valid.
- [ ] `min <= max`, `minLength <= maxLength`.

## 3. Adversarial checklist (DA1-DA7)

- [ ] Null cannot be injected into required fields.
- [ ] Empty strings are rejected for required string fields.
- [ ] Boundary values outside min/max are rejected.
- [ ] Unique/primary key fields are not nullable.
- [ ] Referenced fields have compatible types.
- [ ] Every removed/renamed field has a migration mapping.
- [ ] Every required target field in a copy pair is mapped.
- [ ] Every copy pair has a matching backup/restore pair.
- [ ] Every `idempotent-copy` invariant has a matching copy pair.
- [ ] Every `idempotent-migration` invariant has a matching migration mapping; split/merge/drop are reviewed as non-idempotent.
- [ ] Monotonic fields only move in the declared direction.
- [ ] Sequence steps reference existing copy/migration ids.
- [ ] Leads-to from/to values exist in enum/status fields.
- [ ] Atomic steps exist, avoid non-atomic transforms, and have backup/restore coverage where applicable.

## 4. Before/after checklist (DD1-DD4)

- [ ] Every BEFORE required field still exists in AFTER or has a migration mapping.
- [ ] BEFORE data invariants still hold in AFTER.
- [ ] Added/removed entities, fields, relationships are listed.
- [ ] No new breaking changes: removed required field, optional→required, nullable→non-null, type narrowing, added unique constraint.

## 5. Where each class of check comes from

The distinction matters for how much weight a finding carries. A **published method** has a
definition and a body of work behind it, so its result means what that work says it means. A
**house convention** is this plugin's own rule: the concern is standard, the decision procedure
is ours, and nothing outside this repository defines it.

| Checks | Method | Provenance |
|---|---|---|
| DS1, DS2 | Key and name uniqueness: a relation's attributes are named, and a candidate key identifies a tuple | Published. Codd, *A Relational Model of Data for Large Shared Data Banks*, CACM 13(6), 1970 |
| DS3, DA1, DA2 | Domain and null constraints: a required attribute admits no null, and a declared domain excludes values outside it | Published. Codd (1970); Date, *An Introduction to Database Systems* - the constraint taxonomy (`NOT NULL`, `CHECK`, domain) is standard SQL practice |
| DS4, DA4 | SQL's three-valued logic: a column that is part of a unique or primary key cannot be null, because two nulls are not equal and the uniqueness claim becomes undecidable | Published. The SQL standard's treatment of null in `UNIQUE` and `PRIMARY KEY`; the practical rule is standard schema-review doctrine |
| DA3, DA5 | Referential integrity and type compatibility of a foreign key with the attribute it references | Published. Codd, *Extending the Database Relational Model to Capture More Meaning*, ACM TODS 1979 (the referential-integrity rule); every SQL implementation states it |
| DA6, DA7, DA10-DA13 | Migration completeness and idempotence: every removed or renamed field has a mapping, and applying a copy twice changes nothing | **Convention**, in the shape this plugin states it. The concerns are standard schema-migration practice (Fowler's evolutionary database design; the expand/contract pattern); the specific requirement - a mapping per removed field, an invariant per `idempotent-copy` - is defined here |
| DD1-DD4 | Behaviour preservation across a schema change, decided by re-running the structural and invariant checks on AFTER | **Convention.** There is no canonical formulation for "this migration preserves the invariants". The nearest published ideas are regression test selection and metamorphic testing, but the DD semantics are this repository's |
| `boundaryChecks`, `migrationMappings`, `backupPairs` | Fields the model declares so the checks above have something to hold it to | **Convention.** The schema is this plugin's; nothing else reads it |

Two consequences worth stating plainly. A model that declares no `migrationMappings` has no
migration completeness to check - that is a `skip`, not a pass. And "the migration preserves
every invariant" is a claim about the models, not about the database: this plugin compares
BEFORE and AFTER as declared, and cannot see data that neither model mentions.

## 6. Output

Append a summary to the plan file:

```markdown
## Data Model Verification

- **Depth**: LIGHTWEIGHT / STANDARD / ESCALATED
- **Checks**: [list DS/DA/DD checks performed]
- **Findings**: [list]
- **Confirmed**: yes / UNCONFIRMED
```
