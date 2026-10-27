/**
 * Wrapping: turning one endless column into a page.
 *
 * A chain of twelve boxes has twelve layers, and layering alone draws it as a single column taller than anything a
 * reader can take in - a strip, not a drawing. Graphviz and ELK both answer this with a wrapping pass: cut the layer
 * sequence into bands and stand the bands side by side, so reading order becomes "down the page, then the next
 * column", the way text wraps.
 *
 * The cut is chosen, not guessed: each candidate number of bands is scored by how close the packed page gets to the
 * aspect ratio a page and a landscape screen share, and the best one wins. A drawing that is already close to that
 * shape is left alone - wrapping exists for the strip, not for every tall drawing.
 *
 * Pure: layer sizes in, band ranges and offsets out. The caller applies them.
 */
export interface BandRange {
    /** The first and last layer the band holds, inclusive. */
    first: number;
    last: number;
    /** How far right the band stands, relative to the first one. */
    offsetX: number;
}
export interface BandPlan {
    bands: BandRange[];
    width: number;
    height: number;
}
export declare function planBands(layerWidth: number[], layerHeight: number[], gap: number, aspect?: number): BandPlan;
