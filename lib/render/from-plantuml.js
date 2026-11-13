/**
 * PlantUML text to a diagram, for the subset this renderer can actually draw.
 *
 * PlantUML is a large language, and a renderer that accepted all of it would be a re-implementation of
 * PlantUML. This one accepts what an architecture document actually contains - boxes, groups and arrows -
 * and refuses the rest **by line**, because a component diagram that quietly loses a lifeline reads as
 * complete and is not.
 *
 * Supported:
 *
 * - `@startuml` / `@enduml` (optional) and `title ...`;
 * - elements: `component`, `node`, `rectangle`, `artifact` and `state` (a rectangle), `database` and
 *   `entity` (a cylinder), `usecase` (an ellipse), `[text]`, each with a `"text"` label and `as` alias;
 * - boundaries: `package`, `folder`, `node`, `component`, `rectangle` and `artifact` blocks, closed by `}`;
 * - arrows, either direction: association `-->`/`<--`, dependency `..>`/`<..`, generalisation `--|>`/`<|--`,
 *   realisation `..|>`/`<|..`, composition `*--`/`--*`, aggregation `o--`/`--o`, labelled after `:`;
 * - an edge end that names a declared block attaches to that block's rectangle, the way an external
 *   dependency on a package is drawn; a name that is not a declared block is an implicit element;
 * - `[*] --> X` for a start marker;
 * - `'` comments and `skinparam`/`!theme`/`hide`/`show`/`scale` directives;
 * - `left to right direction` is accepted and has no effect: this renderer has one layout, top to bottom, so a
 *   source that asks for landscape gets the same picture as one that does not.
 *
 * Refused, by line and by name: the element keywords this renderer has no symbol for (`actor`, `class`,
 * `cloud`, ...), the diagram kinds it does not draw (`sequence`), and an edge it cannot draw as written (a
 * line with no arrow end, a mark at both ends, a dotted diamond, an edge between two boundaries, or an edge
 * into a boundary that is nested or empty).
 */
import { emptyCaption, emptyCaptionOf, emptyDiagram } from './model.js';
import { collectBlocks } from './blocks.js';
import { bareName, decorationReason } from './names.js';
import { isTogetherOpener, readDirective } from './plantuml-directives.js';
import { readPageLine } from './plantuml-page.js';
import { readDeclaration } from './plantuml-declaration.js';
import { readBoundary } from './plantuml-boundary.js';
import { planArrow } from './plantuml-edge.js';
import { ARROW, BRACKET, BRACKET_ALIAS, DECLARED, PLAIN_ALIAS, QUOTED_ALIAS, SHAPES, boundaryOf, readArrow, togetherGroups, reference, } from './plantuml-reference.js';
/** The element keywords this renderer draws, and the symbol each one becomes. */
/** The keywords that open a boundary around what is written inside them. */
/** The boundary keywords a source draws solid: a composite state is one state, not a container of unrelated ones. */
/** Element keywords this renderer deliberately does not draw, with the reason it gives for each. */
const NOT_DRAWN = {
    actor: 'an actor is a stick figure, not one of the shapes this renderer draws',
    participant: 'a participant is a lifeline, not one of the shapes this renderer draws',
    cloud: 'a cloud outline is not one of the shapes this renderer draws',
    agent: 'an agent is not one of the shapes this renderer draws',
};
/** A sequence fragment or lifeline event: lines that only make sense in a diagram this renderer refuses. */
const FRAGMENT = new Set(['sequence', 'alt', 'opt', 'loop', 'par', 'group', 'ref', 'break', 'critical', 'activate', 'deactivate', 'destroy', 'create', 'newpage', 'autonumber']);
// One dash is an arrow in PlantUML (`A -> B`), the same as two; the mark and the label rules are unchanged.
const IGNORED = /^(skinparam|!theme|!define|!include|!pragma|hide|show|scale|left to right direction|top to bottom direction|together|allowmixing)\b/;
/** The ignored lines that ask for an arrangement: accepted, dropped, and reported. */
const LAYOUT_CONTROL = /^(top to bottom direction|!pragma\s+layout)\b/;
/**
 * Directives that hide something this renderer never draws.
 *
 * `hide empty members`, `hide stereotype`, `hide circle`: a class box here has no compartments and a component has no stereotype,
 * so there is nothing to hide. Saying "layout control" about them was the wrong reason - they change no arrangement.
 */
const HIDE_DIRECTIVE = /^(hide|show)\b/;
function ensure(builder, id, label, shape, implicit = false) {
    const existing = builder.nodes.get(id);
    if (existing === undefined) {
        builder.nodes.set(id, {
            id,
            role: 'normal',
            ...(label === undefined ? {} : { label }),
            ...(shape === undefined ? {} : { shape }),
        });
        if (implicit)
            builder.implicit.add(id);
        // Membership is decided where the node is first written: the innermost open boundary.
        const innermost = builder.open[builder.open.length - 1];
        if (innermost !== undefined && !innermost.members.includes(id))
            innermost.members.push(id);
        return;
    }
    // An explicit declaration settles what a name is: it stays a box even when a block has the same name.
    if (!implicit)
        builder.implicit.delete(id);
    if (label !== undefined && (existing.label === undefined || existing.label === ''))
        existing.label = label;
    // A bare reference may have been written first: the later declaration is what states the symbol.
    if (shape !== undefined && existing.shape === undefined)
        existing.shape = shape;
}
/**
 * A component reference: `[text]`, `X`, or a quoted name. Returns the id, the label and any shape it stated.
 *
 * A trailing stereotype (`<<service>>`) is not part of the name: kept, it becomes a second box called
 * `A <<service>>` beside the real `A`, which draws a component the source never named.
 */
function keywordOf(line) {
    return line.split(/[\s{]/)[0].toLowerCase();
}
/**
 * Read one arrow line.
 *
 * Returns the edge it states, `undefined` when the line is not an arrow at all, or the reason it is refused.
 * The arrow the source writes decides which end carries the mark: `A <|-- B` is B generalising to A, so the
 * edge runs from B to A with the triangle at A, and `A *-- B` puts its diamond at A, so A is the source.
 */
/**
 * The boxes a `together { }` block names, read from the text before the lines are parsed.
 *
 * Every declaration inside the block registers its box on its own; what the block adds is that they share a row. Reading
 * it as a pre-pass keeps the declaration paths - quoted alias, bracketed alias, plain alias, bare name - untouched, and
 * a block whose members are declared elsewhere still contributes the ids it names.
 */
export function fromPlantUml(source, title = 'plantuml') {
    const lines = source.split(/\r?\n/);
    const refused = [];
    const ignored = [];
    const heading = { value: 'down' };
    // Read before the lines are parsed: the block decides which bare names are boxes, and the loop needs that answer.
    const together = togetherGroups(lines);
    const builder = { nodes: new Map(), edges: [], edgeLines: [], edgeScopes: [], groups: [], open: [], implicit: new Set(), groupLines: new Map() };
    let startId;
    let sourceTitle;
    let seenAny = false;
    let groupCount = 0;
    // Three kinds of block carry text that is not diagram source, and all three were collected by hand before the lines were
    // parsed. They share the walking now; what differs is what a block means, which is each definition's business.
    const legend = [];
    const inLegend = new Set();
    const pageBlocks = { header: [], footer: [], sourceCaption: [] };
    const legendWalk = collectBlocks(lines, inLegend, {
        skipOpening: true,
        open: (line, index) => {
            if (!/^legend\b/.test(line))
                return undefined;
            const corner = /^legend\s+(left|right|top|bottom|center)/.exec(line);
            if (corner !== null && corner[1] !== 'bottom') {
                ignored.push('line ' + String(index + 1) + ': `' + line + '` asks for a corner: this renderer puts the legend under the drawing');
            }
            return { text: [] };
        },
        closes: (line) => /^end\s*legend\b/.test(line),
        text: (state, line) => { state.text.push(line); },
        close: (state) => { legend.push(...state.text); },
    });
    // The page text's block form. A one-line statement is the same block with one line in it, and the line form is read by the
    // parser, so this walk only handles the form that spans lines.
    const pageWalk = collectBlocks(lines, inLegend, {
        skipOpening: true,
        open: (line) => {
            const opener = /^(header|footer|caption)\s*$/.exec(line);
            if (opener === null)
                return undefined;
            const keyOf = { header: 'header', footer: 'footer', caption: 'sourceCaption' };
            const key = keyOf[opener[1]];
            return { key };
        },
        closes: (line, state) => new RegExp('^end\\s*' + (state.key === 'sourceCaption' ? 'caption' : state.key) + '\\b').test(line),
        text: (state, line) => { pageBlocks[state.key].push(line); },
        close: () => { },
    });
    // A placed note's block form: its lines are the note's words, and the opener is rewritten into the one-line form the
    // parser already knows, so the note is created by the same path.
    // `/' ... '/` is PlantUML's block comment: a body whose lines are not diagram source, and refusing them line by line made a
    // comment look like a defect.
    collectBlocks(lines, inLegend, {
        skipOpening: true,
        open: (line) => (/^\/'/.test(line) ? { closed: false } : undefined),
        closes: (line) => /'\s*\/$/.test(line),
        text: () => { },
        close: () => { },
    });
    const titleWalk = collectBlocks(lines, inLegend, {
        skipOpening: true,
        open: (line, index) => (line === 'title' ? { index, text: [] } : undefined),
        closes: (line) => /^end\s*title\b/.test(line),
        text: (state, line) => { state.text.push(line); },
        close: (state) => { sourceTitle = state.text.join('\n'); },
    });
    const noteWalk = collectBlocks(lines, inLegend, {
        open: (line, index) => {
            // A colon on the line means the note's text is on that line: the one-line form, which the parser reads. Only a line
            // with no text of its own opens a block - and a note with an alias can be opened the same way (`note as N`).
            const placed = /^note\s+(left|right|top|bottom)\s+of\s+([^:]+)$/.exec(line);
            if (placed !== null)
                return { index, kind: 'placed', side: placed[1], target: placed[2], text: [] };
            const named = /^note\s+as\s+([A-Za-z_][\w-]*)\s*$/.exec(line);
            if (named !== null)
                return { index, kind: 'named', side: '', target: named[1], text: [] };
            return undefined;
        },
        closes: (line) => /^end\s*note\b/.test(line),
        text: (state, line) => { state.text.push(line); },
        close: (state, lines, openedAt) => {
            const words = state.text.join(' ').replace(/"/g, '');
            lines[openedAt] =
                state.kind === 'placed'
                    ? 'note ' + state.side + ' of ' + state.target + ' : ' + words
                    : 'note "' + words + '" as ' + state.target;
        },
    });
    // A block whose closing line is missing swallows the rest of the source. Saying nothing there is the worst answer of all:
    // the drawing comes out nearly empty and looks deliberate.
    for (const walk of [legendWalk, pageWalk]) {
        if (walk === undefined)
            continue;
        refused.push('line ' + String(walk.openedAt + 1) + ': this block is never closed, so the lines after it were not read');
    }
    // A placed note that is never closed is one mistake, not two: the line names no text *and* the block has no end, and a
    // reader needs one sentence. The opener is skipped so the line parser does not add its own version of the same news.
    // A block title that is never closed is still a title: its lines are kept, and the walk reports the missing end.
    if (titleWalk !== undefined) {
        sourceTitle = titleWalk.state.text.join('\n');
    }
    if (noteWalk !== undefined) {
        inLegend.add(noteWalk.openedAt);
        refused.push('line ' + String(noteWalk.openedAt + 1) + ': `' + lines[noteWalk.openedAt].trim() +
            '` is never closed, and it names no text of its own');
    }
    lines.forEach((raw, index) => {
        const line = raw.replace(/'.*$/, '').trim();
        if (line === '')
            return;
        const where = 'line ' + String(index + 1) + ': ';
        // A bare name a `together` block lists is a box, the same as an arrow's endpoint.
        const named = together.implicit.get(index);
        if (named !== undefined) {
            ensure(builder, named, undefined, undefined, true);
            return;
        }
        if (inLegend.has(index))
            return;
        if (/^@(start|end)uml\b/.test(line))
            return;
        seenAny = true;
        // The page lines - a title, page text, a direction, a delivery size, a background, a skinparam - are decided in one module and
        // applied here. Each is one line in and one decision out, which is what lets a test ask them one at a time.
        const page = readPageLine(line, where);
        if (page !== undefined) {
            if (page.kind === 'title')
                sourceTitle = page.text;
            else if (page.kind === 'pageText')
                heading[page.field] = [page.text];
            else if (page.kind === 'direction')
                heading.value = 'right';
            else if (page.kind === 'scale')
                heading.scale = page.factor;
            else if (page.kind === 'background')
                heading.background = page.value;
            else if (page.channel === 'ignored')
                ignored.push(page.message);
            else
                refused.push(page.message);
            return;
        }
        // A directive is not diagram source: it is read and dropped with its reason, or refused. The rules live in one module so one
        // line can be put in and one answer taken out, without a diagram around it.
        if (isTogetherOpener(line))
            return;
        const directive = readDirective(line, where);
        if (directive !== undefined) {
            if (directive.channel === 'ignored')
                ignored.push(directive.message);
            else
                refused.push(directive.message);
            return;
        }
        // With every alternative matched above, the catch-all bucket that used to sit here was unreachable - and a bucket nobody reaches
        // is not a safety net, it is a place where a line would be dropped without a word. A line that gets this far is refused below.
        if (line === '[*] --> [*]')
            return;
        const startMarker = /^\[\*\]\s*-->\s*(.+)$/.exec(line);
        if (startMarker !== null) {
            const target = reference(startMarker[1]);
            // The state a marker enters is named, not declared here: a `state X { }` block named on this line is the boundary,
            // and a plain name becomes a box only if nothing else declares it.
            ensure(builder, target.id, target.label, target.shape, true);
            if (startId === undefined)
                startId = target.id;
            return;
        }
        // A direction on the edge is a constraint on the drawing: `-down->` is what a layered drawing does, `-up->` says
        // the far box goes on top, and `-right->` / `-left->` say the two share a row in that order.
        const directed = /^(.+?)\s*-(up|down|left|right)-+>?\s*(.+?)(?:\s*:\s*(.+))?$/.exec(line);
        if (directed !== null) {
            const from = reference(directed[1]);
            const to = reference(directed[3]);
            ensure(builder, from.id, from.label, from.shape, true);
            ensure(builder, to.id, to.label, to.shape, true);
            builder.edges.push({
                from: from.id,
                to: to.id,
                label: (directed[4] ?? '').trim(),
                hint: directed[2],
            });
            builder.edgeLines.push(index + 1);
            builder.edgeScopes.push(builder.open[builder.open.length - 1]?.id);
            return;
        }
        // `A -[hidden]-> B` names a place, not a connection: the edge ranks the two boxes and is never drawn.
        const invisible = /^(.+?)\s*-\s*\[\s*hidden\s*\]\s*-+>?\s*(.+?)(?:\s*:\s*(.+))?$/.exec(line);
        if (invisible !== null) {
            const from = reference(invisible[1]);
            const to = reference(invisible[2]);
            ensure(builder, from.id, from.label, from.shape, true);
            ensure(builder, to.id, to.label, to.shape, true);
            builder.edges.push({ from: from.id, to: to.id, label: (invisible[3] ?? '').trim(), invisible: true });
            builder.edgeLines.push(index + 1);
            builder.edgeScopes.push(builder.open[builder.open.length - 1]?.id);
            return;
        }
        // `note right of X : text` is a note *and* a position. The note is drawn; the position is honoured through the same
        // machinery every other placement uses - a hidden edge with a direction hint - so the note lands beside X without a
        // second layout rule. `note over X` is a position over the box, which no edge can express, and stays refused.
        const placed = /^note\s+(left|right|top|bottom)\s+of\s+(.+?)(?:\s*:\s*(.+))?$/.exec(line);
        if (placed !== null) {
            const target = reference(placed[2]);
            const text = (placed[3] ?? '').trim();
            if (text === '') {
                refused.push(where + '`' + line + '` names no text: a note beside a box needs its words on the same line');
                return;
            }
            const noteId = 'note-' + target.id;
            ensure(builder, target.id, target.label, target.shape, true);
            ensure(builder, noteId, text, 'note', true);
            const side = placed[1];
            // The hint is stated from the box's side: `-right->` puts the far box on the right, so the note is always the far
            // end and the box the near one, whichever side the source named.
            builder.edges.push({
                from: target.id,
                to: noteId,
                label: '',
                hint: side === 'top' ? 'up' : side === 'bottom' ? 'down' : side,
                invisible: true,
            });
            builder.edgeLines.push(index + 1);
            builder.edgeScopes.push(builder.open[builder.open.length - 1]?.id);
            return;
        }
        // `note right: text` attaches to whatever box came last, which is a reader's reading order, not a statement the source
        // makes: the drawing does not know which box is meant. The explicit form names it.
        if (/^note\s+(left|right|top|bottom)\s*:/.test(line)) {
            refused.push(where + '`' + line.split(':')[0] + '`: a note attached to the last box names no box; `note right of X : text` does');
            return;
        }
        if (/^note\s+over\b/.test(line)) {
            refused.push(where + '`' + line.split(/\s+/).slice(0, 3).join(' ') + '`: a note over a box is a position this renderer cannot draw');
            return;
        }
        // An arrow is read before any keyword dispatch. A component may be called `Group`, `Loop` or `Alt`, and
        // `Group o-- Member` is an edge, not the sequence fragment `group` - the keyword tables only apply to a
        // line that is not an edge.
        const arrow = readArrow(line);
        if (arrow !== undefined) {
            if (typeof arrow === 'string') {
                refused.push(where + arrow);
                return;
            }
            // What the arrow means is decided in one module: an endpoint, or the machine's exit. The writes below are the same for both.
            const effect = planArrow(arrow);
            ensure(builder, effect.from.id, effect.from.label, effect.from.shape, true);
            if (!effect.exit)
                ensure(builder, effect.to.id, effect.to.label, effect.to.shape, true);
            builder.edges.push({
                from: effect.from.id,
                to: effect.to.id,
                label: effect.label,
                // Only a true reaches the edge: spreading on `!== undefined` said "dashed" for a plain arrow too.
                ...(effect.dashed === true ? { dashed: true } : {}),
                ...(effect.arrow === undefined ? {} : { arrow: effect.arrow }),
            });
            builder.edgeLines.push(index + 1);
            builder.edgeScopes.push(builder.open[builder.open.length - 1]?.id);
            return;
        }
        const keyword = keywordOf(line);
        const notDrawn = NOT_DRAWN[keyword];
        if (notDrawn !== undefined) {
            refused.push(where + '`' + keyword + '`: ' + notDrawn);
            return;
        }
        if (FRAGMENT.has(keyword)) {
            refused.push(where + '`' + keyword + '`: a sequence statement is not part of a drawing this renderer makes');
            return;
        }
        // A boundary is opened or closed by one module that decides what the line states; the open stack is the parser's.
        const boundary = readBoundary(line, index, groupCount + 1, where);
        if (boundary !== undefined) {
            if (boundary.kind === 'close') {
                const closing = builder.open.pop();
                if (closing !== undefined) {
                    const container = builder.open[builder.open.length - 1];
                    if (container !== undefined)
                        closing.parent = container.id;
                    builder.groups.push(closing);
                }
                return;
            }
            if (boundary.kind === 'note') {
                if (boundary.channel === 'ignored')
                    ignored.push(boundary.message);
                else
                    refused.push(boundary.message);
                return;
            }
            groupCount += 1;
            for (const note of boundary.notes)
                ignored.push(note);
            builder.groupLines.set(boundary.id, boundary.line);
            builder.open.push({
                id: boundary.id,
                label: boundary.label,
                members: [],
                ...(boundary.solid ? { outline: 'solid' } : {}),
            });
            return;
        }
        // PlantUML allows several statements on one line separated by `;`. This renderer reads one per line, and folding them
        // together would draw one element whose name is the rest of the line - so it is refused, naming the form to write.
        if (/;[^;]*\S/.test(line) && !/^note\b/.test(line)) {
            refused.push(where + '`;` separates two statements on one line; write one statement per line');
            return;
        }
        // A declaration states its elements and what decorates them; the rules are in one module so each can be asked about one line.
        const declaration = readDeclaration(line, where);
        if (declaration !== undefined) {
            for (const note of declaration.notes) {
                if (note.channel === 'ignored')
                    ignored.push(note.message);
                else
                    refused.push(note.message);
            }
            for (const element of declaration.elements)
                ensure(builder, element.id, element.label, element.shape);
            return;
        }
        refused.push(where + '`' + line + '` is not something this renderer draws');
    });
    // A `together` block that names nothing, or one box, is said rather than swallowed - before the empty-drawing exit, which
    // would return without it.
    for (const line of together.empty) {
        ignored.push('line ' + String(line + 1) + ': this `together` block names no boxes, so it keeps nothing on one row');
    }
    for (const line of together.oneMember) {
        ignored.push('line ' + String(line + 1) + ': this `together` block names one box, and a row of one is not a row');
    }
    // A block's name can be written as an edge endpoint: `Web <|-- Mobile` points at the `package Web`
    // block. PlantUML allows it and so does UML; what it must not do is become a second box called `Web`.
    // An endpoint an arrow created is re-read as the boundary it names, and the edge attaches to that
    // boundary's rectangle. A name that is not a declared block stays an implicit element, which PlantUML
    // also allows.
    const boundaryNames = new Map();
    const disputedNames = new Set();
    for (const group of builder.groups) {
        for (const name of [group.id, group.label]) {
            const existing = boundaryNames.get(name);
            if (existing !== undefined && existing !== group.id)
                disputedNames.add(name);
            else
                boundaryNames.set(name, group.id);
        }
    }
    for (const name of disputedNames)
        boundaryNames.delete(name);
    // Only a node an arrow wrote can turn out to be a boundary. An explicitly declared element of the same
    // name stays a box: the source said what it is.
    const boundaryAt = new Map();
    const ambiguousAt = new Set();
    for (const id of builder.implicit) {
        if (disputedNames.has(id)) {
            ambiguousAt.add(id);
            builder.nodes.delete(id);
        }
        else {
            const groupId = boundaryNames.get(id);
            if (groupId === undefined)
                continue;
            boundaryAt.set(id, groupId);
            builder.nodes.delete(id);
        }
        for (const group of builder.groups) {
            const at = group.members.indexOf(id);
            if (at >= 0)
                group.members.splice(at, 1);
        }
    }
    const groupById = new Map(builder.groups.map((group) => [group.id, group]));
    const childrenOf = new Map();
    for (const group of builder.groups) {
        if (group.parent === undefined)
            continue;
        childrenOf.set(group.parent, [...(childrenOf.get(group.parent) ?? []), group.id]);
    }
    // An empty boundary is not drawn, so an edge cannot attach to it. Look through nested boundaries, which
    // are drawn only when something inside them is.
    const drawable = new Map();
    const hasContents = (id) => {
        const known = drawable.get(id);
        if (known !== undefined)
            return known;
        const group = groupById.get(id);
        let found = false;
        for (const member of group.members) {
            if (builder.nodes.has(member)) {
                found = true;
                break;
            }
        }
        if (!found) {
            for (const child of childrenOf.get(id) ?? []) {
                if (hasContents(child)) {
                    found = true;
                    break;
                }
            }
        }
        drawable.set(id, found);
        return found;
    };
    const boundaryLabel = (id) => groupById.get(id).label;
    const within = (scope, boundary) => {
        let cursor = scope;
        while (cursor !== undefined) {
            if (cursor === boundary)
                return true;
            cursor = groupById.get(cursor).parent;
        }
        return false;
    };
    const keptEdges = [];
    const explainedEmpty = new Set();
    builder.edges.forEach((edge, index) => {
        const where = 'line ' + String(builder.edgeLines[index]) + ': ';
        const fromBoundary = boundaryAt.get(edge.from);
        const toBoundary = boundaryAt.get(edge.to);
        if (ambiguousAt.has(edge.from) || ambiguousAt.has(edge.to)) {
            const name = ambiguousAt.has(edge.from) ? edge.from : edge.to;
            refused.push(where + '`' + name + '` is the name of more than one block; an edge cannot say which boundary it means');
            return;
        }
        if (fromBoundary !== undefined && toBoundary !== undefined) {
            refused.push(where + '`' + boundaryLabel(fromBoundary) + '` and `' + boundaryLabel(toBoundary) + '` are boundaries, not elements; an edge between two boundaries is not one this renderer draws');
            return;
        }
        const boundary = fromBoundary ?? toBoundary;
        if (boundary !== undefined) {
            const group = groupById.get(boundary);
            if (group.parent !== undefined) {
                refused.push(where + '`' + group.label + '` is a block inside `' + boundaryLabel(group.parent) + '`, not an element; an edge to a nested boundary would have to enter another boundary');
                return;
            }
            if (within(builder.edgeScopes[index], boundary)) {
                refused.push(where + '`' + group.label + '` is the block this edge is written inside, not an element; an edge cannot leave a boundary and arrive at the same boundary');
                return;
            }
            if (!hasContents(boundary)) {
                explainedEmpty.add(boundary);
                refused.push(where + '`' + group.label + '` is a block with nothing drawn inside it, so there is no rectangle to attach the edge to');
                return;
            }
        }
        keptEdges.push({
            ...edge,
            ...(fromBoundary === undefined ? {} : { from: fromBoundary }),
            ...(toBoundary === undefined ? {} : { to: toBoundary }),
        });
    });
    builder.edges = keptEdges;
    // A boundary with nothing drawable inside it has no rectangle to draw, and saying nothing would leave a reader with a
    // drawing that silently lost a line. It is refused by the line it was opened on, the same way a line it cannot draw is.
    for (const group of builder.groups) {
        // One defect, one line: an edge already refused against this boundary said the same thing.
        if (explainedEmpty.has(group.id))
            continue;
        const hasChild = builder.groups.some((child) => child.parent === group.id);
        if (group.members.length > 0 || hasChild)
            continue;
        const line = builder.groupLines.get(group.id);
        if (line === undefined)
            continue;
        refused.push('line ' + String(line) + ': `' + group.label + '` is a boundary with nothing inside it, so there is no rectangle to draw');
    }
    if (!seenAny && refused.length === 0) {
        refused.push('the source has no diagram in it: no line named an element, a boundary or a relationship');
    }
    if (!seenAny || builder.nodes.size === 0) {
        return { diagram: emptyDiagram(title, emptyCaptionOf(refused)), refused, ignored };
    }
    const diagram = {
        kind: startId === undefined ? 'graph' : 'machine',
        title: sourceTitle ?? title,
        ...(startId === undefined ? {} : { init: startId }),
        nodes: [...builder.nodes.values()],
        edges: builder.edges,
        ...(builder.groups.length === 0 ? {} : { groups: builder.groups }),
        caption: 'plantuml, ' + String(builder.nodes.size) + ' box' + (builder.nodes.size === 1 ? '' : 'es') + ', ' +
            String(builder.edges.length) + ' arrow' + (builder.edges.length === 1 ? '' : 's') +
            (refused.length === 0 ? '' : ', ' + String(refused.length) + ' line(s) refused'),
    };
    // A page-text block and a one-line statement say the same thing; the line form is the block with one line in it, and a
    // source that writes both gets both, in the order it wrote them.
    const pageTextOf = (key) => {
        const fromBlock = pageBlocks[key];
        const line = heading[key];
        const lines = [...(line === undefined ? [] : line), ...fromBlock];
        return lines.length === 0 ? undefined : lines;
    };
    // `together { A B }` is a row, not a boundary: the boxes are declared by their own lines and the block only joins
    // them, so it is attached to the drawing rather than drawn as a group.
    const sameRank = together.groups;
    const joined = { ...diagram, ...(sameRank.length === 0 ? {} : { sameRank }), ...(heading.value === 'right' ? { direction: heading.value } : {}), ...(legend.length === 0 ? {} : { legend }),
        ...(pageTextOf('header') === undefined ? {} : { header: pageTextOf('header') }),
        ...(pageTextOf('footer') === undefined ? {} : { footer: pageTextOf('footer') }),
        ...(pageTextOf('sourceCaption') === undefined ? {} : { sourceCaption: pageTextOf('sourceCaption') }),
        ...(heading.background === undefined ? {} : { background: heading.background }),
        ...(heading.scale === undefined ? {} : { scale: heading.scale }) };
    return { diagram: joined, refused, ignored };
}
