/**
 * Build a dependency graph from source files, so the structure review can answer a question about a
 * tree instead of about a diagram someone drew by hand.
 *
 * The review engine already judges a graph; what it never had was a way to get one from a repository.
 * Drawing it first is the expensive step, and it is the step a model does worst: 34 files and 86 edges
 * is more than a reader enumerates reliably, and getting the graph wrong is indistinguishable from
 * getting the code wrong.
 *
 * Scope is deliberate. TypeScript and JavaScript sources, relative specifiers only, one edge per
 * (from, to) pair. External packages are counted but not resolved, because a review of a tree is
 * about its own modules.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { extname, relative, resolve } from 'node:path'

import { OptionShapeError } from './option-shape.js'

export interface ScannedEdge {
  from: string
  to: string
}

export interface ScannedGraph {
  /** Module ids, posix-style and relative to the scanned root. */
  nodes: string[]
  edges: ScannedEdge[]
  /** Files read, and files skipped because they are not source. */
  filesRead: number
  /** Relative specifiers that pointed outside the root or at a file that does not exist. */
  unresolved: string[]
  /** Bare specifiers seen (a package name), counted once each. */
  packages: string[]
}

const SOURCE = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'])
const SKIP = new Set(['node_modules', '.git', 'dist', 'build', 'out', 'coverage', '.next', '.cache'])
const LIMITS = { files: 5000, bytes: 2_000_000 }

const stripComments = (text: string): string =>
  text.replaceAll(/\/\*[\s\S]*?\*\//g, ' ').replaceAll(/(^|[^:])\/\/[^\n]*/g, '$1 ')

/** Every specifier this file imports or re-exports. */
function specifiersOf(text: string): { relative: string[]; bare: string[] } {
  const source = stripComments(text)
  const relativeSpecifiers: string[] = []
  const bare: string[] = []
  const patterns = [
    /\bfrom\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\bimport\s*['"]([^'"]+)['"]/g,
  ]
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const specifier = match[1]
      if (specifier === undefined) continue
      if (specifier.startsWith('.')) relativeSpecifiers.push(specifier)
      else if (specifier.startsWith('node:')) continue
      else bare.push(specifier)
    }
  }
  return { relative: relativeSpecifiers, bare }
}

const dirOf = (id: string): string => (id.includes('/') ? id.slice(0, id.lastIndexOf('/')) : '')

/** Resolve a relative specifier to a module id inside the scan, trying the forms TypeScript emits. */
function resolveSpecifier(fromId: string, specifier: string, known: Set<string>): string | undefined {
  // Joined by hand rather than through `path.resolve`: on Windows that resolver roots at the drive, so
  // slicing the prefix off produced a path that matched nothing and left every edge unresolved.
  const stack: string[] = []
  for (const part of (dirOf(fromId) + '/' + specifier).split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') stack.pop()
    else stack.push(part)
  }
  const base = stack.join('/')
  const candidates = [base, base + '.ts', base + '.tsx', base + '.js', base + '.jsx', base + '.mjs', base + '.cjs']
  // A `.js` specifier is what TypeScript writes for a `.ts` source: try the sibling source first.
  if (base.endsWith('.js')) candidates.push(base.slice(0, -3) + '.ts', base.slice(0, -3) + '.tsx')
  if (base.endsWith('.mjs')) candidates.push(base.slice(0, -4) + '.mts')
  candidates.push(base.replace(/\/$/, '') + '/index.ts', base.replace(/\/$/, '') + '/index.js')
  return candidates.find((candidate) => known.has(candidate))
}

/** Read every source file under `root`, following no symlinks and skipping build directories. */
export function scanDependencyGraph(root: unknown): ScannedGraph {
  if (typeof root !== 'string' || root.trim() === '') {
    throw new OptionShapeError('STRUCTURE_OPTION_INVALID', 'repoPath must be a non-empty path to a directory or a single source file.')
  }
  const absolute = resolve(root)
  let stat
  try {
    stat = statSync(absolute)
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new OptionShapeError('STRUCTURE_OPTION_INVALID', `repoPath could not be read: ${reason}. The path resolves against the process working directory, which is the session workspace.`)
  }
  if (stat.isFile()) {
    const id = relative(resolve('/'), absolute).slice(1).replaceAll('\\', '/')
    return { nodes: [id], edges: [], filesRead: 1, unresolved: [], packages: [] }
  }
  if (!stat.isDirectory()) {
    throw new OptionShapeError('STRUCTURE_OPTION_INVALID', 'repoPath must be a directory or a source file.')
  }

  const ids: string[] = []
  const contents = new Map<string, string>()
  const walk = (directory: string): void => {
    if (ids.length >= LIMITS.files) return
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (ids.length >= LIMITS.files) return
      if (entry.isSymbolicLink()) continue
      const full = resolve(directory, entry.name)
      if (entry.isDirectory()) {
        if (SKIP.has(entry.name)) continue
        walk(full)
        continue
      }
      if (!entry.isFile() || !SOURCE.has(extname(entry.name))) continue
      const id = relative(absolute, full).replaceAll('\\', '/')
      let text
      try {
        const size = statSync(full).size
        if (size > LIMITS.bytes) continue
        text = readFileSync(full, 'utf8')
      } catch {
        continue
      }
      ids.push(id)
      contents.set(id, text)
    }
  }
  walk(absolute)
  ids.sort()

  const known = new Set(ids)
  const edges: ScannedEdge[] = []
  const seen = new Set<string>()
  const unresolved: string[] = []
  const packages = new Set<string>()
  for (const id of ids) {
    const { relative: specifiers, bare } = specifiersOf(contents.get(id) ?? '')
    for (const specifier of specifiers) {
      const target = resolveSpecifier(id, specifier, known)
      if (target === undefined) {
        unresolved.push(`${id} -> ${specifier}`)
        continue
      }
      const key = id + '\u0000' + target
      if (seen.has(key)) continue
      seen.add(key)
      edges.push({ from: id, to: target })
    }
    for (const specifier of bare) {
      const name = specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0]
      if (name !== undefined) packages.add(name)
    }
  }
  edges.sort((a, b) => (a.from === b.from ? a.to.localeCompare(b.to) : a.from.localeCompare(b.from)))
  unresolved.sort()
  return { nodes: ids, edges, filesRead: ids.length, unresolved, packages: [...packages].sort() }
}
