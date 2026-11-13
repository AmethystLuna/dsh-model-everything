/**
 * Correct the drawing in place, reporting each correction against the line that caused it.
 *
 * `refuse` takes the message rather than the pass returning a list: the report's order is the order the lines were read, and one of these
 * findings must not be pushed ahead of another.
 */
export function resolveBoundaries(builder, refuse) {
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
            refuse(where + '`' + name + '` is the name of more than one block; an edge cannot say which boundary it means');
            return;
        }
        if (fromBoundary !== undefined && toBoundary !== undefined) {
            refuse(where + '`' + boundaryLabel(fromBoundary) + '` and `' + boundaryLabel(toBoundary) + '` are boundaries, not elements; an edge between two boundaries is not one this renderer draws');
            return;
        }
        const boundary = fromBoundary ?? toBoundary;
        if (boundary !== undefined) {
            const group = groupById.get(boundary);
            if (group.parent !== undefined) {
                refuse(where + '`' + group.label + '` is a block inside `' + boundaryLabel(group.parent) + '`, not an element; an edge to a nested boundary would have to enter another boundary');
                return;
            }
            if (within(builder.edgeScopes[index], boundary)) {
                refuse(where + '`' + group.label + '` is the block this edge is written inside, not an element; an edge cannot leave a boundary and arrive at the same boundary');
                return;
            }
            if (!hasContents(boundary)) {
                explainedEmpty.add(boundary);
                refuse(where + '`' + group.label + '` is a block with nothing drawn inside it, so there is no rectangle to attach the edge to');
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
        refuse('line ' + String(line) + ': `' + group.label + '` is a boundary with nothing inside it, so there is no rectangle to draw');
    }
}
