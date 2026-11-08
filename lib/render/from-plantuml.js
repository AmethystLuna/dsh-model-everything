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
import { emptyCaption, emptyDiagram } from './model.js';
import { collectBlocks } from './blocks.js';
/** The element keywords this renderer draws, and the symbol each one becomes. */
const SHAPES = {
    component: 'rect',
    node: 'rect',
    rectangle: 'rect',
    artifact: 'rect',
    state: 'rect',
    database: 'cylinder',
    // PlantUML draws an entity as a cylinder in a component diagram; `entity` in an ER diagram is a different
    // symbol, and that diagram family is not one this renderer accepts.
    entity: 'cylinder',
    // A use case is an ellipse. The `circle` symbol is written as an ellipse whose radii follow the box, so it
    // reads as the familiar use-case oval; `stadium` is the pill a terminal state is drawn as.
    usecase: 'circle',
    // A note is a rectangle with a folded corner: the fold is what makes it a remark rather than an element.
    note: 'note',
    // A file and a card are the same folded outline on different corners, and a frame puts its name in a tab: the mark
    // is what tells them apart from a component, so each one is drawn rather than reduced to a rectangle.
    file: 'file',
    card: 'card',
    frame: 'frame',
    // The three containers whose mark is a line or a curve on the box itself.
    queue: 'queue',
    stack: 'stack',
    storage: 'storage',
    // Three rectangles whose role is a small mark in the corner.
    boundary: 'boundary',
    control: 'control',
    collections: 'collections',
    // These five are boxes with compartments in PlantUML. The name is the part a component-level view needs, so the
    // box is drawn and the compartments are refused line by line: the element is visible and the source is told what
    // was not carried.
    class: 'rect',
    object: 'rect',
    interface: 'rect',
    enum: 'rect',
    annotation: 'rect',
};
/** The keywords that open a boundary around what is written inside them. */
const BOUNDARY = new Set(['package', 'folder', 'node', 'component', 'rectangle', 'artifact', 'state']);
/** The boundary keywords a source draws solid: a composite state is one state, not a container of unrelated ones. */
const SOLID_BOUNDARY = new Set(['state']);
/** Element keywords this renderer deliberately does not draw, with the reason it gives for each. */
const NOT_DRAWN = {
    actor: 'an actor is a stick figure, not one of the shapes this renderer draws',
    participant: 'a participant is a lifeline, not one of the shapes this renderer draws',
    cloud: 'a cloud outline is not one of the shapes this renderer draws',
    agent: 'an agent is not one of the shapes this renderer draws',
};
/** A sequence fragment or lifeline event: lines that only make sense in a diagram this renderer refuses. */
const FRAGMENT = new Set(['sequence', 'alt', 'opt', 'loop', 'par', 'group', 'ref', 'break', 'critical', 'activate', 'deactivate', 'destroy', 'create', 'newpage', 'autonumber']);
const ARROW = /^(.+?)\s*(<\|?|[*o])?(-{2,}|\.{2,})(\|?>|[*o])?\s*(.+?)(?:\s*:\s*(.+))?$/;
const SHAPE_KEYWORDS = Object.keys(SHAPES);
const DECLARED = new RegExp('^(' + SHAPE_KEYWORDS.join('|') + ')\\s+(.+)$');
const QUOTED_ALIAS = /^["'](.+?)["']\s+as\s+([A-Za-z_][\w-]*)$/;
const BRACKET_ALIAS = /^\[(.+?)\]\s+as\s+([A-Za-z_][\w-]*)$/;
const PLAIN_ALIAS = /^([A-Za-z_][\w.-]*)\s+as\s+([A-Za-z_][\w-]*)$/;
const BRACKET = /^\[(.+?)\]$/;
const IGNORED = /^(skinparam|!theme|!define|!include|!pragma|hide|show|scale|left to right direction|top to bottom direction|together|allowmixing)\b/;
/** The ignored lines that ask for an arrangement: accepted, dropped, and reported. */
const LAYOUT_CONTROL = /^(top to bottom direction|skinparam|scale|hide|show|!pragma\s+layout)\b/;
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
function reference(token) {
    let text = token.trim();
    while (/\s*<<[^<>]*>>\s*$/.test(text))
        text = text.replace(/\s*<<[^<>]*>>\s*$/, '').trim();
    if (text === '')
        text = token.trim();
    const bracket = BRACKET.exec(text);
    if (bracket !== null) {
        const label = bracket[1].trim();
        return { id: label, label, shape: 'rect' };
    }
    const quoted = /^["'](.+?)["']$/.exec(text);
    if (quoted !== null)
        return { id: quoted[1], label: quoted[1] };
    return { id: text };
}
function keywordOf(line) {
    return line.split(/[\s{]/)[0].toLowerCase();
}
/** The id and label an opening boundary line states. An alias is the id, because edges will name it. */
function boundaryOf(declaration, keyword, ordinal) {
    const rest = declaration.slice(keyword.length).trim();
    const alias = QUOTED_ALIAS.exec(rest) ?? BRACKET_ALIAS.exec(rest) ?? PLAIN_ALIAS.exec(rest);
    if (alias !== null)
        return { id: alias[2], label: alias[1] };
    const label = rest.replace(/^["']|["']$/g, '');
    return { id: 'group-' + String(ordinal), label: label === '' ? keyword : label };
}
/**
 * Read one arrow line.
 *
 * Returns the edge it states, `undefined` when the line is not an arrow at all, or the reason it is refused.
 * The arrow the source writes decides which end carries the mark: `A <|-- B` is B generalising to A, so the
 * edge runs from B to A with the triangle at A, and `A *-- B` puts its diamond at A, so A is the source.
 */
function readArrow(line) {
    const match = ARROW.exec(line);
    if (match === null)
        return undefined;
    const left = reference(match[1]);
    const right = reference(match[5]);
    const leftMark = match[2];
    const rightMark = match[4];
    const dotted = match[3].startsWith('.');
    const label = (match[6] ?? '').trim();
    if (leftMark !== undefined && rightMark !== undefined) {
        return 'an edge marked at both ends is not one this renderer draws';
    }
    if (leftMark === '*' || leftMark === 'o' || rightMark === '*' || rightMark === 'o') {
        const atRight = rightMark === '*' || rightMark === 'o';
        const mark = atRight ? rightMark : leftMark;
        return {
            from: atRight ? right : left,
            to: atRight ? left : right,
            label,
            dashed: dotted,
            arrow: mark === '*' ? 'composition' : 'aggregation',
        };
    }
    if (leftMark !== undefined) {
        return {
            from: right,
            to: left,
            label,
            dashed: dotted,
            arrow: leftMark === '<|' ? (dotted ? 'realization' : 'generalization') : dotted ? 'dependency' : 'association',
        };
    }
    if (rightMark !== undefined) {
        return {
            from: left,
            to: right,
            label,
            dashed: dotted,
            arrow: rightMark === '|>' ? (dotted ? 'realization' : 'generalization') : dotted ? 'dependency' : 'association',
        };
    }
    // No mark at either end: the source states a connection and no direction.
    return { from: left, to: right, label, dashed: dotted, arrow: 'none' };
}
/**
 * The boxes a `together { }` block names, read from the text before the lines are parsed.
 *
 * Every declaration inside the block registers its box on its own; what the block adds is that they share a row. Reading
 * it as a pre-pass keeps the declaration paths - quoted alias, bracketed alias, plain alias, bare name - untouched, and
 * a block whose members are declared elsewhere still contributes the ids it names.
 */
function togetherGroups(lines) {
    const groups = [];
    let open;
    for (const raw of lines) {
        const line = raw.replace(/'.*$/, '').trim();
        if (line === '')
            continue;
        if (/^together\b/.test(line) && line.endsWith('{')) {
            open = [];
            continue;
        }
        if (open === undefined)
            continue;
        if (line === '}') {
            if (open.length > 1)
                groups.push(open);
            open = undefined;
            continue;
        }
        const declared = DECLARED.exec(line);
        if (declared === null)
            continue;
        const rest = declared[2].trim();
        const quoted = QUOTED_ALIAS.exec(rest);
        const bracketed = BRACKET_ALIAS.exec(rest);
        const plain = PLAIN_ALIAS.exec(rest);
        open.push(quoted !== null ? quoted[2] : bracketed !== null ? bracketed[2] : plain !== null ? plain[2] : reference(rest).id);
    }
    return groups;
}
export function fromPlantUml(source, title = 'plantuml') {
    const lines = source.split(/\r?\n/);
    const refused = [];
    const ignored = [];
    const heading = { value: 'down' };
    const builder = { nodes: new Map(), edges: [], edgeLines: [], edgeScopes: [], groups: [], open: [], implicit: new Set(), groupLines: new Map() };
    let startId;
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
    const noteWalk = collectBlocks(lines, inLegend, {
        open: (line, index) => {
            // A colon on the line means the note's text is on that line: the one-line form, which the parser reads. Only a line
            // with no text of its own opens a block.
            const opener = /^note\s+(left|right|top|bottom)\s+of\s+([^:]+)$/.exec(line);
            if (opener === null)
                return undefined;
            return { index, side: opener[1], target: opener[2], text: [] };
        },
        closes: (line) => /^end\s*note\b/.test(line),
        text: (state, line) => { state.text.push(line); },
        close: (state, lines, openedAt) => {
            lines[openedAt] = 'note ' + state.side + ' of ' + state.target + ' : ' + state.text.join(' ');
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
        if (inLegend.has(index))
            return;
        if (/^@(start|end)uml\b/.test(line))
            return;
        seenAny = true;
        if (/^title\b/.test(line))
            return;
        // Page text in the source's own words. A block form (`header` … `end header`) is a body this renderer would have to
        // paginate; the one-line form is what a document writes for a footer or a caption.
        const pageText = /^(header|footer|caption)\s+(.+)$/.exec(line);
        if (pageText !== null) {
            const value = pageText[2].replace(/^["']|["']$/g, '').trim();
            if (value === '') {
                refused.push(where + '`' + pageText[1] + '` names no text');
                return;
            }
            if (pageText[1] === 'header')
                heading.header = [value];
            else if (pageText[1] === 'footer')
                heading.footer = [value];
            else
                heading.sourceCaption = [value];
            return;
        }
        if (/^left to right direction\b/.test(line)) {
            heading.value = 'right';
            return;
        }
        if (IGNORED.test(line)) {
            if (LAYOUT_CONTROL.test(line)) {
                ignored.push(where + '`' + line + '` is a layout control: this renderer arranges the drawing itself, so the line has no effect');
            }
            return;
        }
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
            // `X --> [*]` leaves the machine. Read as an endpoint it would draw a box called `*`, so it is the exit
            // marker instead: the same self-loop the Mermaid adapter draws, labelled `end`. The start marker is the
            // case above.
            if (arrow.to.id === '*') {
                ensure(builder, arrow.from.id, arrow.from.label, arrow.from.shape, true);
                builder.edges.push({ from: arrow.from.id, to: arrow.from.id, label: arrow.label === '' ? 'end' : arrow.label, dashed: true });
                builder.edgeLines.push(index + 1);
                builder.edgeScopes.push(builder.open[builder.open.length - 1]?.id);
                return;
            }
            ensure(builder, arrow.from.id, arrow.from.label, arrow.from.shape, true);
            ensure(builder, arrow.to.id, arrow.to.label, arrow.to.shape, true);
            builder.edges.push({
                from: arrow.from.id,
                to: arrow.to.id,
                label: arrow.label,
                ...(arrow.dashed ? { dashed: true } : {}),
                arrow: arrow.arrow,
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
        if (line === '}') {
            const closing = builder.open.pop();
            if (closing !== undefined) {
                const container = builder.open[builder.open.length - 1];
                if (container !== undefined)
                    closing.parent = container.id;
                builder.groups.push(closing);
            }
            return;
        }
        if (line.endsWith('{')) {
            const declaration = line.slice(0, -1).trim();
            const opener = keywordOf(declaration);
            if (!BOUNDARY.has(opener)) {
                const reason = SHAPES[opener] === undefined
                    ? '`' + declaration + '` is not a boundary this renderer draws'
                    : 'a `' + opener + '` block is not a boundary this renderer draws';
                refused.push(where + reason);
                return;
            }
            groupCount += 1;
            const boundary = boundaryOf(declaration, opener, groupCount);
            builder.groupLines.set(boundary.id, index + 1);
            builder.open.push({
                id: boundary.id,
                label: boundary.label,
                members: [],
                ...(SOLID_BOUNDARY.has(opener) ? { outline: 'solid' } : {}),
            });
            return;
        }
        const declared = DECLARED.exec(line);
        if (declared !== null) {
            const shape = SHAPES[declared[1]];
            const rest = declared[2].trim();
            const quoted = QUOTED_ALIAS.exec(rest);
            if (quoted !== null) {
                ensure(builder, quoted[2], quoted[1], shape);
                return;
            }
            const bracketed = BRACKET_ALIAS.exec(rest);
            if (bracketed !== null) {
                ensure(builder, bracketed[2], bracketed[1], shape);
                return;
            }
            const plain = PLAIN_ALIAS.exec(rest);
            if (plain !== null) {
                ensure(builder, plain[2], plain[1], shape);
                return;
            }
            const written = reference(rest);
            ensure(builder, written.id, written.label, shape);
            return;
        }
        const single = BRACKET.exec(line);
        if (single !== null) {
            ensure(builder, single[1].trim(), single[1].trim(), 'rect');
            return;
        }
        refused.push(where + '`' + line + '` is not something this renderer draws');
    });
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
    if (!seenAny || builder.nodes.size === 0) {
        return { diagram: emptyDiagram(title, emptyCaption(refused.length)), refused, ignored };
    }
    const diagram = {
        kind: startId === undefined ? 'graph' : 'machine',
        title,
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
    const sameRank = togetherGroups(lines);
    const joined = { ...diagram, ...(sameRank.length === 0 ? {} : { sameRank }), ...(heading.value === 'right' ? { direction: heading.value } : {}), ...(legend.length === 0 ? {} : { legend }),
        ...(pageTextOf('header') === undefined ? {} : { header: pageTextOf('header') }),
        ...(pageTextOf('footer') === undefined ? {} : { footer: pageTextOf('footer') }),
        ...(pageTextOf('sourceCaption') === undefined ? {} : { sourceCaption: pageTextOf('sourceCaption') }) };
    return { diagram: joined, refused, ignored };
}
