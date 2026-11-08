/** Two pieces this far apart read as one line: closer than the eye separates them at a corner. */
export const NEAR_LINE = 5;
/** Every axis-aligned piece of one route. A diagonal leg contributes nothing: it is not a line to be read as another. */
export function piecesFrom(points) {
    const out = [];
    for (let index = 1; index < points.length; index += 1) {
        const one = points[index - 1];
        const two = points[index];
        if (Math.abs(one.y - two.y) < 0.5 && Math.abs(one.x - two.x) > 1) {
            out.push({ axis: 'y', at: one.y, lo: Math.min(one.x, two.x), hi: Math.max(one.x, two.x), slot: index - 1 });
        }
        else if (Math.abs(one.x - two.x) < 0.5 && Math.abs(one.y - two.y) > 1) {
            out.push({ axis: 'x', at: one.x, lo: Math.min(one.y, two.y), hi: Math.max(one.y, two.y), slot: index - 1 });
        }
    }
    return out;
}
/** How much of the line one pair of pieces shares. */
const shared = (mine, theirs) => {
    if (mine.axis !== theirs.axis)
        return 0;
    if (Math.abs(mine.at - theirs.at) >= NEAR_LINE)
        return 0;
    // A single point of contact is not a length: the minus one keeps touching corners out of the total.
    return Math.max(0, Math.min(mine.hi, theirs.hi) - Math.max(mine.lo, theirs.lo) - 1);
};
/** The length one route shares with every other, which is half of what those pairs contribute to the drawing. */
export function sharedWith(all, index) {
    let total = 0;
    const mine = all[index];
    for (let other = 0; other < all.length; other += 1) {
        if (other === index)
            continue;
        for (const piece of mine) {
            for (const theirs of all[other])
                total += shared(piece, theirs);
        }
    }
    return total;
}
/** The whole drawing's shared length: each pair once, from the lower index. */
export function sharedLength(all) {
    let total = 0;
    for (let left = 0; left < all.length; left += 1) {
        for (let right = left + 1; right < all.length; right += 1) {
            for (const mine of all[left]) {
                for (const theirs of all[right])
                    total += shared(mine, theirs);
            }
        }
    }
    return total;
}
/** The same total from the rows, which is what a caller keeps while it tries moves. */
export function totalFromRows(rows) {
    return rows.reduce((total, value) => total + value, 0) / 2;
}
