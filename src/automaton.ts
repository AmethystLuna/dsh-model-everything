/**
 * Automata as a verification target: the claims a state machine cannot express.
 *
 * A state machine in `model_verify` answers "can this configuration be reached". An automaton answers a
 * different question: what language does this accept, and is that language contained in, or equal to,
 * another one. That is the shape of a protocol conformance claim - "every run the implementation allows
 * is a run the specification allows" - and it is not settled by reading either of the two machines.
 *
 * Scope, stated because it is what the report is allowed to claim:
 *
 * - finite words over an explicit alphabet; NFAs are determinised first;
 * - the empty language, universality, reachability, dead states, and the relation between two automata;
 * - not: liveness, fairness, timing, or infinite words. A Büchi or timed automaton is a different family.
 */
import { createHash } from 'node:crypto'

import { canonicalJson } from './engine.js'
import { OptionShapeError } from './option-shape.js'

export interface AutomatonTransition {
  from: string
  symbol: string
  to: string
}

export interface Automaton {
  states: string[]
  alphabet: string[]
  transitions: AutomatonTransition[]
  init: string
  accepting: string[]
}

export interface AutomatonFinding {
  code: string
  severity: 'error' | 'warning' | 'info'
  message: string
  detail?: string
}

/** One deterministic automaton, with an explicit sink so every word has exactly one run. */
interface Dfa {
  start: number
  accept: boolean[]
  /** delta[state][symbolIndex] = next state */
  delta: number[][]
  /** Which machine state each index came from, for readable witnesses and findings. */
  labels: string[][]
}

const SINK = '\u0000sink'

/** Validate the shape, so a refusal says which field is wrong rather than throwing later. */
export function validateAutomaton(input: unknown): { ok: true; automaton: Automaton } | { ok: false; errors: string[] } {
  const errors: string[] = []
  const value = input as Record<string, unknown> | null
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, errors: ['automaton must be an object with states, alphabet, transitions, init and accepting.'] }
  }
  const states = value.states
  if (!Array.isArray(states) || states.length === 0 || states.some((state) => typeof state !== 'string' || state === '')) {
    errors.push('states: must be a non-empty array of non-empty strings')
  }
  const alphabet = value.alphabet
  if (!Array.isArray(alphabet) || alphabet.length === 0 || alphabet.some((symbol) => typeof symbol !== 'string' || symbol === '')) {
    errors.push('alphabet: must be a non-empty array of non-empty strings')
  }
  const init = value.init
  if (typeof init !== 'string' || init === '') errors.push('init: must be a non-empty string')
  const accepting = value.accepting
  if (!Array.isArray(accepting) || accepting.some((state) => typeof state !== 'string')) {
    errors.push('accepting: must be an array of state ids')
  }
  const transitions = value.transitions
  if (!Array.isArray(transitions)) errors.push('transitions: must be an array of {from, symbol, to}')
  if (errors.length > 0) return { ok: false, errors }

  const known = new Set(states as string[])
  if (typeof init === 'string' && !known.has(init)) errors.push(`init: names "${init}", which is not a declared state`)
  for (const state of accepting as string[]) {
    if (!known.has(state)) errors.push(`accepting: names "${state}", which is not a declared state`)
  }
  const symbols = new Set(alphabet as string[])
  for (const [index, raw] of (transitions as unknown[]).entries()) {
    const transition = raw as Record<string, unknown> | null
    if (transition === null || typeof transition !== 'object') {
      errors.push(`transitions[${index}]: must be an object`)
      continue
    }
    if (typeof transition.from !== 'string' || !known.has(transition.from)) errors.push(`transitions[${index}].from: "${String(transition.from)}" is not a declared state`)
    if (typeof transition.to !== 'string' || !known.has(transition.to)) errors.push(`transitions[${index}].to: "${String(transition.to)}" is not a declared state`)
    if (typeof transition.symbol !== 'string' || !symbols.has(transition.symbol)) errors.push(`transitions[${index}].symbol: "${String(transition.symbol)}" is not in the alphabet`)
  }
  if (errors.length > 0) return { ok: false, errors }
  return {
    ok: true,
    automaton: {
      states: states as string[],
      alphabet: alphabet as string[],
      transitions: (transitions as AutomatonTransition[]).map((transition) => ({ from: transition.from, symbol: transition.symbol, to: transition.to })),
      init: init as string,
      accepting: accepting as string[],
    },
  }
}

/** Determinise by subset construction, adding one explicit sink so a word never stops early. */
function determinise(automaton: Automaton, symbols: string[]): Dfa {
  const index = new Map<string, number>()
  const subsets: string[][] = []
  const delta: number[][] = []
  const accept: boolean[] = []
  const accepting = new Set(automaton.accepting)
  const byFromAndSymbol = new Map<string, string[]>()
  for (const transition of automaton.transitions) {
    const key = transition.from + '\u0000' + transition.symbol
    byFromAndSymbol.set(key, [...(byFromAndSymbol.get(key) ?? []), transition.to])
  }

  const intern = (label: string[], acceptingHere: boolean): number => {
    const key = label.join('\u0000')
    const existing = index.get(key)
    if (existing !== undefined) return existing
    const id = subsets.length
    index.set(key, id)
    subsets.push(label)
    accept.push(acceptingHere)
    delta.push([])
    return id
  }

  const start = intern([automaton.init], accepting.has(automaton.init))
  // Each subset is expanded exactly once: a subset reached again - a self-loop, or a second path into
  // the same set - only needs its edge recorded, not another pass through its transitions.
  const pending = [start]
  const expanded = new Set<number>([start])
  while (pending.length > 0) {
    const current = pending.shift() as number
    for (const [symbolIndex, symbol] of symbols.entries()) {
      const next = new Set<string>()
      for (const state of subsets[current]) {
        for (const target of byFromAndSymbol.get(state + '\u0000' + symbol) ?? []) next.add(target)
      }
      const label = [...next].sort()
      const acceptingNext = label.some((state) => accepting.has(state))
      const id = intern(label.length === 0 ? [SINK] : label, acceptingNext)
      delta[current][symbolIndex] = id
      if (!expanded.has(id)) {
        expanded.add(id)
        pending.push(id)
      }
    }
  }
  return { start, accept, delta, labels: subsets.map((subset) => (subset[0] === SINK ? [] : subset)) }
}

/** The product search stopped at its cap, so the relation is undecided rather than true. */
const UNDECIDED = Symbol('undecided')

/**
 * Shortest word accepted by `a` but not by `b`, when one exists.
 *
 * The product has at most |a| x |b| states, which is fine for the machines this family is for and can
 * still explode on two large ones. The cap turns that into "undecided", because a search that stopped
 * is not a proof that the languages are equal.
 */
function difference(first: Dfa, second: Dfa, symbols: string[], limit = 10_000): string[] | undefined | typeof UNDECIDED {
  const seen = new Set<string>()
  const queue: { left: number; right: number; word: string[] }[] = [{ left: first.start, right: second.start, word: [] }]
  seen.add(first.start + ':' + second.start)
  let expanded = 0
  while (queue.length > 0) {
    if (++expanded > limit) return UNDECIDED
    const node = queue.shift() as { left: number; right: number; word: string[] }
    if (first.accept[node.left] && !second.accept[node.right]) return node.word
    for (const [symbolIndex, symbol] of symbols.entries()) {
      const left = first.delta[node.left][symbolIndex]
      const right = second.delta[node.right][symbolIndex]
      const key = left + ':' + right
      if (seen.has(key)) continue
      seen.add(key)
      queue.push({ left, right, word: [...node.word, symbol] })
    }
  }
  return undefined
}

/** Every state that can be reached from the start. */
function reachable(dfa: Dfa, symbols: string[]): boolean[] {
  const seen = new Array<boolean>(dfa.delta.length).fill(false)
  seen[dfa.start] = true
  const queue = [dfa.start]
  while (queue.length > 0) {
    const current = queue.shift() as number
    for (let symbolIndex = 0; symbolIndex < symbols.length; symbolIndex++) {
      const next = dfa.delta[current][symbolIndex]
      if (!seen[next]) {
        seen[next] = true
        queue.push(next)
      }
    }
  }
  return seen
}

/** Every state from which an accepting state can be reached. */
function productive(dfa: Dfa, symbols: string[]): boolean[] {
  const reverse = new Map<number, number[]>()
  for (let state = 0; state < dfa.delta.length; state++) {
    for (let symbolIndex = 0; symbolIndex < symbols.length; symbolIndex++) {
      const target = dfa.delta[state][symbolIndex]
      reverse.set(target, [...(reverse.get(target) ?? []), state])
    }
  }
  const seen = new Array<boolean>(dfa.delta.length).fill(false)
  const queue: number[] = []
  for (let state = 0; state < dfa.accept.length; state++) {
    if (dfa.accept[state]) {
      seen[state] = true
      queue.push(state)
    }
  }
  while (queue.length > 0) {
    const current = queue.shift() as number
    for (const previous of reverse.get(current) ?? []) {
      if (!seen[previous]) {
        seen[previous] = true
        queue.push(previous)
      }
    }
  }
  return seen
}

export type AutomatonRelation = 'equivalent' | 'subset' | 'superset'

export interface AutomatonReport {
  ok: boolean
  ran: boolean
  verdict: 'pass' | 'pass_with_findings' | 'fail'
  verdictReason: string
  schema: string
  automaton: { states: number; transitions: number; alphabet: number; deterministic: boolean }
  findings: AutomatonFinding[]
  /** Set when the relation fails: the shortest word that breaks it. */
  witness?: { word: string[]; reason: string }
  /** True when the product search stopped before deciding, so `pass` is not a proof of equality. */
  truncated?: boolean
  hashes: { automaton: string; other?: string }
  nextSteps: string[]
}

/** Determinism, as declared by the input rather than guessed: a repeated (from, symbol) pair. */
function isDeterministic(automaton: Automaton): boolean {
  const seen = new Set<string>()
  for (const transition of automaton.transitions) {
    const key = transition.from + '\u0000' + transition.symbol
    if (seen.has(key)) return false
    seen.add(key)
  }
  return true
}

export function verifyAutomaton(input: unknown, options: { other?: unknown; relation?: AutomatonRelation } = {}): AutomatonReport {
  const parsed = validateAutomaton(input)
  if (!parsed.ok) {
    throw new OptionShapeError('AUTOMATON_INVALID', 'the automaton is not well formed: ' + parsed.errors.join('; '))
  }
  const automaton = parsed.automaton
  const symbols = [...automaton.alphabet].sort()
  const findings: AutomatonFinding[] = []
  const dfa = determinise(automaton, symbols)
  const deterministic = isDeterministic(automaton)

  const reach = reachable(dfa, symbols)
  const canAccept = productive(dfa, symbols)
  if (!deterministic) {
    findings.push({ code: 'AUT003_NONDETERMINISTIC', severity: 'info', message: `the automaton is not deterministic: ${String(dfa.delta.length)} subset states after determinisation, ${String(automaton.states.length)} declared. The analysis used the deterministic form.` })
  }
  // A state no word can reach is dead weight, and a state from which no accepting state is reachable
  // accepts nothing: the first is a modelling smell, the second is usually a defect in the intended language.
  for (const [index, label] of dfa.labels.entries()) {
    if (label.length === 0) continue
    if (label.length === 1 && !reach[index]) {
      findings.push({ code: 'AUT001_UNREACHABLE_STATE', severity: 'warning', message: `state "${label[0]}" cannot be reached from init` })
    }
    if (!dfa.accept[index] && reach[index] && !canAccept[index]) {
      findings.push({ code: 'AUT002_TRAP_STATE', severity: 'warning', message: `state "${label[0]}" is reachable but can never reach an accepting state` })
    }
  }
  for (const state of automaton.states) {
    if (!dfa.labels.some((label) => label.includes(state))) {
      if (!findings.some((finding) => finding.code === 'AUT001_UNREACHABLE_STATE' && finding.message.includes(`"${state}"`))) {
        findings.push({ code: 'AUT001_UNREACHABLE_STATE', severity: 'warning', message: `state "${state}" cannot be reached from init` })
      }
    }
  }

  const acceptingReachable = reach.some((value, index) => value && dfa.accept[index])
  if (!acceptingReachable) {
    findings.push({ code: 'AUT004_EMPTY_LANGUAGE', severity: 'warning', message: 'the automaton accepts nothing: no accepting state is reachable from init' })
  }

  let witness: AutomatonReport['witness']
  let otherForHash: Automaton | undefined
  const relation = options.relation ?? 'equivalent'
  if (options.other !== undefined) {
    const otherParsed = validateAutomaton(options.other)
    if (!otherParsed.ok) {
      throw new OptionShapeError('AUTOMATON_INVALID', 'the second automaton is not well formed: ' + otherParsed.errors.join('; '))
    }
    const other = otherParsed.automaton
    otherForHash = other
    if (other.alphabet.length !== automaton.alphabet.length || !other.alphabet.every((symbol) => automaton.alphabet.includes(symbol))) {
      findings.push({ code: 'AUT005_ALPHABET_MISMATCH', severity: 'error', message: 'the two automata do not share an alphabet, so a language relation between them is not defined', detail: `first: ${automaton.alphabet.join(', ')}; second: ${other.alphabet.join(', ')}` })
    } else {
      const second = determinise(other, symbols)
      const missing = difference(dfa, second, symbols)
      const extra = difference(second, dfa, symbols)
      if (missing === UNDECIDED || extra === UNDECIDED) {
        findings.push({ code: 'AUT009_UNDECIDED', severity: 'warning', message: 'the product search stopped at its state cap before deciding the relation, so equality is neither proven nor refuted', detail: 'the product of two automata can be exponential; reduce one of them, or decide the relation with a tool that searches symbolically' })
      } else
      if (relation === 'equivalent') {
        if (missing !== undefined || extra !== undefined) {
          const word = missing ?? extra
          witness = { word: word ?? [], reason: missing !== undefined ? 'accepted by the first automaton, rejected by the second' : 'accepted by the second automaton, rejected by the first' }
          findings.push({ code: 'AUT006_NOT_EQUIVALENT', severity: 'error', message: 'the two automata accept different languages', detail: `shortest witness: ${word === undefined || word.length === 0 ? 'the empty word' : word.join(' ')}; ${witness.reason}` })
        }
      } else if (relation === 'subset') {
        if (missing !== undefined) {
          witness = { word: missing, reason: 'accepted by the first automaton, rejected by the second' }
          findings.push({ code: 'AUT007_NOT_SUBSET', severity: 'error', message: 'the first automaton accepts a word the second rejects', detail: `shortest witness: ${missing.length === 0 ? 'the empty word' : missing.join(' ')}` })
        }
      } else if (extra !== undefined) {
        witness = { word: extra, reason: 'accepted by the second automaton, rejected by the first' }
        findings.push({ code: 'AUT008_NOT_SUPERSET', severity: 'error', message: 'the second automaton accepts a word the first rejects', detail: `shortest witness: ${extra.length === 0 ? 'the empty word' : extra.join(' ')}` })
      }
    }
  }

  const errors = findings.filter((finding) => finding.severity === 'error').length
  const warnings = findings.filter((finding) => finding.severity === 'warning').length
  const verdict = errors > 0 ? 'fail' : warnings > 0 ? 'pass_with_findings' : 'pass'
  const reason = errors > 0
    ? `${String(errors)} error finding(s) (first: ${findings.find((finding) => finding.severity === 'error')?.code ?? 'unknown'})`
    : warnings > 0
      ? `no error findings; ${String(warnings)} warning finding(s)`
      : 'every check passed'

  const nextSteps: string[] = []
  if (findings.some((finding) => finding.code === 'AUT004_EMPTY_LANGUAGE')) nextSteps.push('An automaton that accepts nothing usually has a transition or an accepting set wrong; check that the accepting set is reachable from init.')
  if (witness !== undefined) nextSteps.push('The witness is the shortest word that separates the two languages; replay it through both automata to see which transition makes the difference.')
  if (!deterministic) nextSteps.push('The analysis determinised the input; if nondeterminism was accidental, the subset count is the tell.')
  nextSteps.push('This decides finite-word languages only. Liveness, fairness and timing are not in scope: those need a Büchi or timed model, which this family does not build.')

  return {
    ok: true,
    ran: true,
    verdict,
    verdictReason: reason,
    schema: 'model-everything/automaton/v1',
    automaton: { states: automaton.states.length, transitions: automaton.transitions.length, alphabet: automaton.alphabet.length, deterministic },
    findings,
    ...(witness === undefined ? {} : { witness }),
    ...(findings.some((finding) => finding.code === 'AUT009_UNDECIDED') ? { truncated: true } : {}),
    hashes: { automaton: hashAutomaton(automaton), ...(otherForHash === undefined ? {} : { other: hashAutomaton(otherForHash) }) },
    nextSteps,
  }
}

const createHashHex = (text: string): string => createHash('sha256').update(text).digest('hex')

function hashAutomaton(automaton: Automaton): string {
  return createHashHex(canonicalJson({ states: [...automaton.states].sort(), alphabet: [...automaton.alphabet].sort(), transitions: automaton.transitions.map((t) => `${t.from}\u0000${t.symbol}\u0000${t.to}`).sort(), init: automaton.init, accepting: [...automaton.accepting].sort() }))
}
