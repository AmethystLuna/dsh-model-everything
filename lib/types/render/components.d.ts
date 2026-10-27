/**
 * The two decompositions a drawing needs before it can be packed.
 *
 * **Weakly connected components.** Two subgraphs with no edge between them are two drawings that happen to share a
 * page. Laying them out together makes them share one set of layers, so the wider one sets every column width and
 * the narrower one is squeezed beside it; moving one moves the other. Split first, lay each out on its own, then pack
 * the rectangles.
 *
 * **Packing.** A pile of rectangles has to become a page. The target is the aspect ratio a page and a screen share -
 * 1.6 - and a shelf packer is enough to get there: sort by height, fill a shelf until the next rectangle would make
 * the drawing wider than the page it is aiming at, then start the next shelf. No overlap, and a deterministic order,
 * so the same rectangles always pack the same way.
 *
 * Pure, and asserted on the rectangles themselves.
 */
export interface SizedRectangle {
    width: number;
    height: number;
}
export interface PackedRectangle {
    x: number;
    y: number;
    width: number;
    height: number;
}
/**
 * The nodes of each weakly connected component, in the order the nodes were written.
 *
 * An isolated node is a component of its own: it is not noise, it is a drawing with nothing joining it, and the
 * packer is what decides where it goes.
 */
export declare function weakComponents(nodes: ReadonlyArray<{
    id: string;
}>, edges: ReadonlyArray<{
    from: string;
    to: string;
}>): string[][];
export interface PackOptions {
    /** The empty strip kept between two rectangles, on both axes. */
    gap?: number;
    /** The page the packer aims at; the drawing comes out as close to it as the rectangles allow. */
    aspect?: number;
}
/**
 * Pack rectangles into a page of roughly `aspect`, using shelves.
 *
 * The shelf width is derived from the total area and the target aspect: that is the width at which a perfect grid
 * would have the wanted shape, so a shelf that fills it lands near the target. Rectangles are taken tallest first,
 * which is what keeps a shelf from being mostly empty air above a short rectangle.
 */
export declare function packRectangles(rectangles: ReadonlyArray<SizedRectangle>, options?: PackOptions): {
    placements: PackedRectangle[];
    width: number;
    height: number;
};
/** The aspect ratio of a box, as a number a reader can compare against the page's. */
export declare function aspectOf(width: number, height: number): number;
