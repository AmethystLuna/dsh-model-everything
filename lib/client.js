/**
 * The Client half: a lazy factory the page binds to this package's name.
 *
 * Everything that decides anything lives in `render/`; this file only turns shapes into React elements.
 * The loader hands the factory a `require` for baseline modules (React among them), so React is taken from
 * there and never bundled.
 *
 * This module is not a page script: it exports the factory, and `scripts/build-client.mjs` wraps the
 * compiled output in `window.__ModuleLoader__.load(...)`, which is the loader contract itself.
 */
import { paintWith } from './render/paint.js';
import { toSvg } from './render/svg.js';
import { viewModel } from './render/viewmodel.js';
/** Tool names this package answers. A key that never dispatches simply never renders. */
export const TOOL_NAMES = ['model_verify'];
/**
 * The view for one tool name.
 *
 * The drawing is emitted as markup, so React receives it through `dangerouslySetInnerHTML`. That is safe
 * only because the writer escapes every value that came from a report or a model, which the render suite
 * pins with an injection case.
 */
export function viewFor(React, overrides = {}) {
    return (props) => {
        const block = props.block ?? {};
        const diagram = viewModel({ phase: props.phase, toolName: props.toolName, args: block.args, result: block.result });
        const { canvas, colours } = paintWith(diagram, overrides);
        const written = toSvg(canvas, colours, diagram.kind === 'none' ? diagram.caption : diagram.title + ': ' + diagram.caption);
        return React.createElement('div', {
            style: { padding: '4px 0', overflowX: 'auto' },
            dangerouslySetInnerHTML: { __html: written.markup },
        });
    };
}
export default function factory(require) {
    // Captured under a plain name: a static `require('react')` would be rewritten by the bundler and then
    // resolve against a scope the factory body does not have. A call through this alias stays a call.
    const hostRequire = require;
    const React = hostRequire('react');
    return {
        inject: ['slots'],
        apply(ctx) {
            for (const name of TOOL_NAMES) {
                ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({ name: 'tool.call.toolview', key: name, id: 'dsh-model-everything' }, viewFor(React)));
            }
        },
    };
}
