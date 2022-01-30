import { DELETE_OP, TextOperation } from "./text-operation";

/**
 * Range has `anchor` and `head` properties, which are zero-based indices into
 * the document. The `anchor` is the side of the selection that stays fixed,
 * `head` is the side of the selection where the cursor is. When both are
 * equal, the range represents a cursor.
 */
export class Range {
  static fromJSON(obj: { anchor: number; head: number }) {
    return new Range(obj.anchor, obj.head);
  }

  constructor(public anchor: number, public head: number) {}

  equals(other: Range): boolean {
    return this.anchor === other.anchor && this.head === other.head;
  }

  isEmpty(): boolean {
    return this.anchor === this.head;
  }

  transform = function (other: TextOperation) {
    function transformIndex(index) {
      let newIndex = index;
      const ops = other.ops;
      for (let i = 0, l = other.ops.length; i < l; i++) {
        const op = ops[i];
        if (TextOperation.isRetain(op)) {
          index -= op;
        } else if (TextOperation.isInsert(op)) {
          newIndex += op.length;
        } else {
          // TODO: type check error
          newIndex -= Math.min(index, -op);
          index += op;
        }
        if (index < 0) {
          break;
        }
      }
      return newIndex;
    }

    const newAnchor = transformIndex(this.anchor);
    if (this.anchor === this.head) {
      return new Range(newAnchor, newAnchor);
    }
    return new Range(newAnchor, transformIndex(this.head));
  };
}

/**
 * A selection is basically an array of ranges. Every range represents a real
 * selection or a cursor in the document (when the start position equals the
 * end position of the range). The array must not be empty.
 */
export class Selection {
  constructor(private ranges: Range[]) {}

  /**
   * Convenience method for creating selections only containing a single cursor
   * and no real selection range.
   * @param position
   * @returns
   */
  public static createCursor(position: number) {
    return new Selection([new Range(position, position)]);
  }

  public static fromJSON(obj) {
    const objRanges = obj.ranges || obj;
    const ranges = [];
    for (let i = 0; i < objRanges.length; i++) {
      ranges[i] = Range.fromJSON(objRanges[i]);
    }
    return new Selection(ranges);
  }

  public equals(other: Selection): boolean {
    // if (this.position !== other.position) { return false; }
    if (this.ranges.length !== other.ranges.length) {
      return false;
    }

    const sortedRanges1 = sortRanges(this.ranges);
    const sortedRanges2 = sortRanges(other.ranges);
    for (let i = 0; i < sortedRanges1.length; i++) {
      if (!sortedRanges1[i].equals(sortedRanges2[i])) {
        return false;
      }
    }
    return true;
  }

  public somethingSelected() {
    return this.ranges.some((r) => !r.isEmpty());
  }

  /**
   * Return the more current selection information.
   * @param other 
   * @returns 
   */
  public compose(other: Selection) {
    return other;
  }

  /**
   * Update the selection with respect to an operation.
   * @param other 
   * @returns 
   */
  public transform(other: TextOperation) {
    const newRanges = [];
    for (let i = 0; i < this.ranges.length; i++) {
      newRanges[i] = this.ranges[i].transform(other);
    }
    return new Selection(newRanges);
  }
}

function sortRanges(ranges: Range[]): Range[] {
  return ranges.sort((a, b) => {
    if (a.anchor < b.anchor) return -1;
    if (a.anchor === b.anchor && a.head < b.head) return -1;
    return 1;
  })
}