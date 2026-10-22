/**
 * Which tool owns which question, in one table.
 *
 * Two consumers read this, and they used to read two different things: the result a model gets
 * (`nextSteps` naming a sibling) and the toolset map a human reads (hand-written prose). That is how the
 * map came to say "about ten thousand characters" while the descriptions measured twenty-nine: a fact
 * stated twice drifts, and nothing fails when it does.
 *
 * So the table states the routing once. `routeFor` hands it to the card a UI draws; the toolset map
 * generator reads the same table and refuses to write a map for a tool that is missing from it.
 *
 * What it is not: a decision. The tool a request should use is chosen by the model from the descriptions.
 * This table says what each tool owns and which neighbour takes the case just outside that line, so a
 * report can redirect without a reader having to remember the roster.
 */
export interface Route {
    /** What this tool decides, in the words its report already uses. */
    owns: string;
    /** The case just outside the line, and the tool that owns it. */
    notFor: {
        when: string;
        tool: string;
    };
}
export declare const ROUTES: Record<string, Route>;
/** The route for a tool, or undefined when the tool has none. */
export declare function routeFor(tool: string): Route | undefined;
/** Every tool a route names, for a caller that has to check the table against the registry. */
export declare function routedTools(): string[];
/** The tools named as the owner of an adjacent case. */
export declare function siblingTools(): string[];
