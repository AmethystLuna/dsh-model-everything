/**
 * Where the full-screen card sits, and what a click on it means.
 *
 * The card is an overlay inside a page that already has a title bar. A full-bleed `inset: 0` sat on top of the
 * window's own minimize/maximize/close controls and left no way out but the controls it was covering, so the
 * top edge starts below that bar. Two ways out are part of the behaviour, not an extra: Escape, and a click on
 * the margin around the card.
 */
export declare function fullScreenFrame(): Record<string, string>;
/**
 * The click handler for the overlay, or nothing when the card is not full screen.
 *
 * Only the overlay itself counts: the margin around the card is the reader saying "leave", while a click
 * inside the card is the reader using it.
 */
export declare function dismissOnBackdrop(full: boolean, onDismiss?: () => void): {
    onClick?: (event: {
        target?: unknown;
        currentTarget?: unknown;
    }) => void;
};
/** Whether a key ends full screen. Escape does; nothing else in this UI does. */
export declare function leavesFullScreen(key: string | undefined): boolean;
