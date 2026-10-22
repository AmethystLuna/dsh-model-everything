export interface AutomatonTransition {
    from: string;
    symbol: string;
    to: string;
}
export interface Automaton {
    states: string[];
    alphabet: string[];
    transitions: AutomatonTransition[];
    init: string;
    accepting: string[];
}
export interface AutomatonFinding {
    code: string;
    severity: 'error' | 'warning' | 'info';
    message: string;
    detail?: string;
}
/** Validate the shape, so a refusal says which field is wrong rather than throwing later. */
export declare function validateAutomaton(input: unknown): {
    ok: true;
    automaton: Automaton;
} | {
    ok: false;
    errors: string[];
};
export type AutomatonRelation = 'equivalent' | 'subset' | 'superset';
export interface AutomatonReport {
    ok: boolean;
    ran: boolean;
    verdict: 'pass' | 'pass_with_findings' | 'fail';
    verdictReason: string;
    schema: string;
    automaton: {
        states: number;
        transitions: number;
        alphabet: number;
        deterministic: boolean;
    };
    findings: AutomatonFinding[];
    /** Set when the relation fails: the shortest word that breaks it. */
    witness?: {
        word: string[];
        reason: string;
    };
    hashes: {
        automaton: string;
        other?: string;
    };
    nextSteps: string[];
}
export declare function verifyAutomaton(input: unknown, options?: {
    other?: unknown;
    relation?: AutomatonRelation;
}): AutomatonReport;
