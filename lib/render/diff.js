/**
 * Structural diff between two drawings.
 *
 * A text diff of two diagrams tells a reader that a line moved; it does not tell them that `Cache` left the
 * `Platform` package, or that `Core` gained a nested boundary. Those are the changes a design review is about,
 * and they are decided by comparing the containment tree, not the source.
 *
 * The diff judges movement, not merit: a group that moved, a member that changed owner, a boundary added or
 * removed. Whether the new arrangement is better is the reader's call, so the verdict only says whether anything
 * changed and whether the comparison could run at all.
 */
/** The group that directly holds a node, from the side's own declarations. */
function ownerOf(groups, nodeId) {
    return groups.find((group) => group.members.includes(nodeId))?.id;
}
function labels(groups) {
    return new Map(groups.map((group) => [group.id, group.label]));
}
function parents(groups) {
    return new Map(groups.map((group) => [group.id, group.parent]));
}
/** How a group is named in a finding: its label, falling back to its id when the other side has no label. */
function nameOf(labelsById, id) {
    return labelsById.get(id) ?? id;
}
/**
 * Compare the containment structure of two drawings.
 *
 * Renames are reported by id: a group that kept its id but changed its text is a rename, while a group whose id
 * is gone and another whose id is new are an unrelated removal and addition, because the ids are what a caller
 * tracks across versions.
 */
export function diffStructure(before, after) {
    const beforeGroups = before.groups ?? [];
    const afterGroups = after.groups ?? [];
    const changes = [];
    const beforeIds = new Set(beforeGroups.map((group) => group.id));
    const afterIds = new Set(afterGroups.map((group) => group.id));
    const beforeLabels = labels(beforeGroups);
    const afterLabels = labels(afterGroups);
    const beforeParents = parents(beforeGroups);
    const afterParents = parents(afterGroups);
    for (const group of afterGroups) {
        if (beforeIds.has(group.id))
            continue;
        changes.push({
            code: 'H1_GROUP_ADDED',
            severity: 'info',
            kind: 'added',
            subject: group.id,
            message: 'group "' + group.label + '" is new' + (group.parent === undefined ? '' : ' inside "' + nameOf(afterLabels, group.parent) + '"'),
        });
    }
    for (const group of beforeGroups) {
        if (afterIds.has(group.id))
            continue;
        changes.push({
            code: 'H2_GROUP_REMOVED',
            severity: 'info',
            kind: 'removed',
            subject: group.id,
            message: 'group "' + group.label + '" is gone',
        });
    }
    for (const group of afterGroups) {
        if (!beforeIds.has(group.id))
            continue;
        const wasCalled = nameOf(beforeLabels, group.id);
        if (wasCalled !== group.label) {
            changes.push({
                code: 'H3_GROUP_RENAMED',
                severity: 'info',
                kind: 'renamed',
                subject: group.id,
                message: 'group "' + wasCalled + '" is now called "' + group.label + '"',
            });
        }
        const was = beforeParents.get(group.id);
        const now = group.parent;
        if (was !== now) {
            const from = was === undefined ? 'the top level' : '"' + nameOf(afterLabels, was) + '"';
            const to = now === undefined ? 'the top level' : '"' + nameOf(afterLabels, now) + '"';
            changes.push({
                code: 'H4_GROUP_MOVED',
                severity: 'warning',
                kind: 'moved',
                subject: group.id,
                message: 'group "' + group.label + '" moved from ' + from + ' to ' + to,
            });
        }
    }
    const beforeNodes = new Set(before.nodes.map((node) => node.id));
    const afterNodes = new Set(after.nodes.map((node) => node.id));
    for (const node of after.nodes) {
        if (beforeNodes.has(node.id))
            continue;
        changes.push({ code: 'H5_NODE_ADDED', severity: 'info', kind: 'added', subject: node.id, message: 'node "' + node.id + '" is new' });
    }
    for (const node of before.nodes) {
        if (afterNodes.has(node.id))
            continue;
        changes.push({ code: 'H6_NODE_REMOVED', severity: 'info', kind: 'removed', subject: node.id, message: 'node "' + node.id + '" is gone' });
    }
    // Movement is only meaningful for a node that exists on both sides.
    for (const node of after.nodes) {
        if (!beforeNodes.has(node.id))
            continue;
        const was = ownerOf(beforeGroups, node.id);
        const now = ownerOf(afterGroups, node.id);
        if (was === now)
            continue;
        const from = was === undefined ? 'no group' : '"' + nameOf(beforeLabels, was) + '"';
        const to = now === undefined ? 'no group' : '"' + nameOf(afterLabels, now) + '"';
        changes.push({
            code: 'H7_NODE_REGROUPED',
            severity: 'warning',
            kind: 'regrouped',
            subject: node.id,
            message: 'node "' + node.id + '" moved from ' + from + ' to ' + to,
        });
    }
    const measured = {
        before: { nodes: before.nodes.length, groups: beforeGroups.length },
        after: { nodes: after.nodes.length, groups: afterGroups.length },
    };
    // Nothing to compare is not a pass: an empty report from an empty pair would read as "unchanged".
    if (before.nodes.length === 0 && after.nodes.length === 0) {
        return {
            verdict: 'fail',
            changes: [
                { code: 'D0_NO_NODES', severity: 'error', kind: 'removed', subject: '-', message: 'neither side holds a node, so there was nothing to compare' },
                ...changes,
            ],
            measured,
        };
    }
    return { verdict: changes.length === 0 ? 'pass' : 'pass_with_findings', changes, measured };
}
