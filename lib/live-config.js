/**
 * Wrap a schema field so the host projects it as a switch.
 * @param field - the schema field, typically `z.boolean().default(...)`.
 * @returns the volatile field, or the field unchanged on a host without `.volatile()`.
 */
export function live(field) {
    const probe = field;
    return typeof probe.volatile === 'function' ? probe.volatile() : field;
}
/**
 * Read a switch as a boolean, whichever shape this host produced.
 * @param value - the resolved config value: a boolean, or an object with `get()`.
 * @returns the current setting.
 */
export function switchOf(value) {
    return typeof value === 'boolean' ? value : value.get();
}
