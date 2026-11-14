/**
 * A live switch, when this host's schemastery supports one.
 *
 * The settings service projects ONLY fields under a `.volatile()` node, so a plain boolean cannot be flipped from the
 * Web Plugins page at all - it is not shown. The returned schema keeps the field's static type; a config interface
 * carries the union the host actually hands over, and every reader accepts both shapes, because a host that predates
 * `.volatile()` simply gets a plain switch.
 *
 * Both components ask this one function: the diagram row probed a `.live` name that schemastery does not have, fell back
 * to the plain boolean, and so shipped a switch that was never projected to the settings page. One definition is what
 * keeps the two rows the same shape.
 */
export interface LiveField {
  volatile?: () => unknown
}

/**
 * Wrap a schema field so the host projects it as a switch.
 * @param field - the schema field, typically `z.boolean().default(...)`.
 * @returns the volatile field, or the field unchanged on a host without `.volatile()`.
 */
export function live<T>(field: T): T {
  const probe = field as T & LiveField
  return typeof probe.volatile === 'function' ? (probe.volatile() as T) : field
}

/**
 * Read a switch as a boolean, whichever shape this host produced.
 * @param value - the resolved config value: a boolean, or an object with `get()`.
 * @returns the current setting.
 */
export function switchOf(value: boolean | { get: () => boolean } | unknown): boolean {
  return typeof value === 'boolean' ? value : (value as { get: () => boolean }).get()
}
