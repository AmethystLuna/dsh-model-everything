/**
 * The repaired path, or `undefined` when there is nothing to do or nothing that helps.
 *
 * `undefined` covers both refusals the caller treats the same way: the path does not cross, so no repair is attempted; or every
 * answer still crosses, so the drawing keeps the route it had and reports it.
 */
export function repairedRoute(path, withPorts, tools) {
    if (!tools.crosses(path))
        return undefined;
    for (const anchors of [withPorts, undefined]) {
        const again = tools.route(anchors);
        if (tools.crosses(again))
            continue;
        return again;
    }
    return undefined;
}
