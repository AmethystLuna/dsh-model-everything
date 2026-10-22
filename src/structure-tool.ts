import { defineTool } from '@deepseek-ai/dsh-tools'
import type { JsonValue } from './json-value.js'
import { REPORT_SCHEMAS } from './engine.js'
import { reviewStructure } from './structure.js'
import { scanDependencyGraph } from './scan.js'
import { reviewGranularity, type GranularityDiagram } from './granularity.js'
import { OptionShapeError, optionRefusal, requireArrayOption } from './option-shape.js'
import { renderReportText } from './report-view.js'
import { reportCard, reportResultView } from './presentation.js'

export const STRUCTURE_TOOL_NAME = 'uml_structure_verify'

/**
 * Model-visible DSH tool that audits a *structure* diagram — components, packages,
 * classes, deployment nodes and the dependency arrows between them — against an
 * optional dependency matrix. A structure diagram is not a state machine: this tool
 * reads the graph the diagram actually draws, instead of refusing it (which is what
 * `uml action=parse` does) or pretending the arrows are state transitions
 * (which is what a false `ok` used to hide).
 */
export const umlStructureTool = defineTool({
  name: STRUCTURE_TOOL_NAME,
  description:
    'Audit a structure diagram as a dependency graph. Takes PlantUML component, package, class or deployment text, or a Mermaid class diagram - or `repoPath`, a source tree, in which case it builds the graph from the import constructs the source itself uses and no drawing is needed. Reports UML020 isolated node, UML021 dangling reference, UML022 cycle (shortest path), UML023 disallowed edge and UML024 layer violation against a matrix, UML025 missing required edge, and UML026 when no node is declared. The matrix is {rules: [{id, source, allow?, deny?, require?}], layers: [{name, members}], default: "allow"|"deny"}. Ids and members accept globs (`*`, `?`). Deny beats allow, and layers run top-first, so downward edges pass and upward ones are UML024. With a matrix, every edge appears in `edgeVerdicts` with the rules it matched. Pass `diagrams` instead of `diagram` to check several levels at once: each child must refine its parent. It answers **what the graph is**: which edges exist, which node has no edge, which cycle, and whether an edge breaks a matrix you supplied. It does not judge whether the design meant to allow those edges - `model_design_review` does that against the rules the design declares for itself. When the question is whether an import exists from one layer to another, this answers it, from the code. Read `verdict`, not `ok`. For state or activity diagrams use `uml` and `model_verify`.',
  parameters: {
    diagram: {
      type: 'string',
      description: 'Structure-diagram source text: PlantUML component/package/class/deployment, or a Mermaid class diagram. Omit when `diagrams` is given.',
    },
    diagrams: {
      type: 'json',
      description: 'Multi-granularity mode: an array of {name, diagram, parent?} levels. Each diagram is checked on its own AND against its declared parent (UML028 unknown parent, UML029 refinement violation, UML030 parent cycle), with per-pair node/edge counts.',
    },
    notation: {
      type: 'string',
      enum: ['auto', 'plantuml', 'mermaid'],
      description: 'Diagram language. Default auto (detected from the text).',
    },
    repoPath: {
      type: 'string',
      description: 'Directory or single source file to scan instead of drawing the diagram yourself. Reads the import construct of C/C++, Python, TypeScript/JavaScript, Go, Rust, Java/Kotlin/Scala, C#, PHP, Ruby, Lua, Zig, Dart and Elixir, building a file graph for file languages and a package graph for package languages (Go, Java, C#). The graph is reviewed by the same checks; `diagram` and `diagrams` are then ignored.',
    },
    matrix: {
      type: 'json',
      description: 'Optional dependency matrix: {rules: [{id, source, allow?, deny?, require?}], layers: [{name, members}], default: "allow"|"deny"}. Every edge is judged against it and the matched rule ids are reported.',
    },
    reportView: {
      type: 'string',
      enum: ['digest', 'full'],
      description: 'digest (default) prints the readable body; full prints the structured report, which report_diff needs.',
    },
  },
  output: {
    schema: {
      type: 'json',
      description: 'Structure review report: graph (nodes/edges), the findings with their codes, per-edge matrix verdicts, summary and next steps.',
    },
    render(args, value) {
      return [{ type: 'text' as const, text: renderReportText(value, { full: args.reportView === 'full' }) }]
    },
    // The card a UI shows, separated from the text the model reads.
    presentationMeta(_args, value) {
      return reportCard(value, STRUCTURE_TOOL_NAME) as unknown as JsonValue
    },
  },
  presentResult: reportResultView(STRUCTURE_TOOL_NAME),
  timeoutMs: 10_000,
  isConcurrencySafe: () => true,
  async execute(args) {
    if (args.diagrams !== undefined) {
      try {
        // `diagrams` was read with `.map` behind no guard, and a level's `diagram` with `.split`, so a string
        // or a nameless level escaped as a raw TypeError. The level is the unit a caller writes by hand, so a
        // missing field has to be named with its position.
        requireArrayOption(args.diagrams, 'diagrams', 'STRUCTURE_OPTION_INVALID')
        for (const [index, level] of (args.diagrams as unknown[]).entries()) {
          if (level === null || typeof level !== 'object' || Array.isArray(level)) continue
          const entry = level as Record<string, unknown>
          if (typeof entry.diagram !== 'string') {
            throw new OptionShapeError('STRUCTURE_OPTION_INVALID', 'diagrams[' + String(index) + '].diagram is ' + (entry.diagram === undefined ? 'missing' : typeof entry.diagram) + ', not a string. Every level needs the diagram text it audits.')
          }
          if (typeof entry.name !== 'string' || entry.name === '') {
            throw new OptionShapeError('STRUCTURE_OPTION_INVALID', 'diagrams[' + String(index) + '].name is ' + (entry.name === undefined ? 'missing' : 'not a non-empty string') + '. The name is how a refinement violation says which level it means.')
          }
        }
        return reviewGranularity({
          diagrams: args.diagrams as unknown as GranularityDiagram[],
          notation: (args.notation ?? 'auto') as 'auto' | 'plantuml' | 'mermaid',
          ...(args.matrix === undefined ? {} : { matrix: args.matrix }),
        }) as unknown as JsonValue
      } catch (error) {
        return optionRefusal(error, 'STRUCTURE_OPTION_INVALID') as unknown as JsonValue
      }
    }
    if (args.repoPath !== undefined) {
      try {
        const scanned = scanDependencyGraph(args.repoPath)
        // A source module is a declared node that depends on others: not a container, and it has a
        // line only when it came from a drawing, so the field stays absent.
        const graph = {
          notation: 'plantuml' as const,
          nodes: scanned.nodes.map((id) => ({ id, label: id, kind: 'component' as const, container: false, declared: true })),
          edges: scanned.edges.map((edge) => ({ from: edge.from, to: edge.to, line: 0 })),
          warnings: [],
        }
        return reviewStructure({
          diagram: '',
          graph,
          scan: { files: scanned.filesRead, unresolved: scanned.unresolved.length, packages: scanned.packages.length, languages: scanned.languages.map((entry) => entry.language) },
          ...(args.matrix === undefined ? {} : { matrix: args.matrix }),
        }) as unknown as JsonValue
      } catch (error) {
        return optionRefusal(error, 'STRUCTURE_OPTION_INVALID') as unknown as JsonValue
      }
    }
    if (args.diagram === undefined) {
      return { ok: false, ran: false, verdict: 'fail', verdictReason: 'the tool did not run: pass `diagram` (one structure diagram) or `diagrams` (several levels with parents)', schema: REPORT_SCHEMAS.structure, errorCode: 'UML_INPUT', error: 'structure review needs `diagram` or `diagrams`' } as unknown as JsonValue
    }
    return reviewStructure({
      diagram: args.diagram,
      notation: (args.notation ?? 'auto') as 'auto' | 'plantuml' | 'mermaid',
      ...(args.matrix === undefined ? {} : { matrix: args.matrix }),
    }) as unknown as JsonValue
  },
})
