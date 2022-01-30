import { TextOperation } from "./text-operation";

function transformStack(stack: TextOperation[], operation: TextOperation) {
  const newStack = [];
  for (var i = stack.length - 1; i >= 0; i--) {
    var pair = TextOperation.transform(stack[i], operation);
    if (typeof pair[0].isNoop !== "function" || !pair[0].isNoop()) {
      newStack.push(pair[0]);
    }
    operation = pair[1];
  }
  return newStack.reverse();
}

enum UndoManagerState {
  NORMAL_STATE = "normal",
  UNDOING_STATE = "undoing",
  REDOING_STATE = "redoing",
}

export class UndoManager {
  private state = UndoManagerState.NORMAL_STATE;
  private dontCompose = false;
  private undoStack: TextOperation[] = [];
  private redoStack: TextOperation[] = [];

  constructor(private readonly maxItems: number) {}

  /**
   * Add an operation to the undo or redo stack, depending on the current state
   * of the UndoManager. The operation added must be the inverse of the last
   * edit. When `compose` is true, compose the operation with the last operation
   * unless the last operation was already pushed on the redo stack or was hidden
   * by a newer operation on the undo stack.
   * @param operation
   * @param compose
   */
  add(operation: TextOperation, compose: boolean = false) {
    if (this.state === UndoManagerState.UNDOING_STATE) {
      this.redoStack.push(operation);
      this.dontCompose = true;
    } else if (this.state === UndoManagerState.REDOING_STATE) {
      this.undoStack.push(operation);
      this.dontCompose = true;
    } else {
      const undoStack = this.undoStack;
      if (!this.dontCompose && compose && undoStack.length > 0) {
        undoStack.push(operation.compose(undoStack.pop()));
      } else {
        undoStack.push(operation);
        if (undoStack.length > this.maxItems) {
          undoStack.shift();
        }
      }
      this.dontCompose = false;
      this.redoStack = [];
    }
  }

  /**
   * Transform the undo and redo stacks against a operation by another client.
   * @param operation
   */
  transform(operation: TextOperation) {
    this.undoStack = transformStack(this.undoStack, operation);
    this.redoStack = transformStack(this.redoStack, operation);
  }

  /*
   * Perform an undo by calling a function with the latest operation on the undo
   * stack. The function is expected to call the `add` method with the inverse
   * of the operation, which pushes the inverse on the redo stack.
   */
  performUndo(fn: (op: TextOperation) => void) {
    this.state = UndoManagerState.UNDOING_STATE;
    if (this.undoStack.length === 0) {
      throw new Error("undo not possible");
    }
    fn(this.undoStack.pop());
    this.state = UndoManagerState.NORMAL_STATE;
  }

  /**
   * The inverse of `performUndo`.
   * @param fn
   */
  performRedo(fn: (op: TextOperation) => void) {
    this.state = UndoManagerState.REDOING_STATE;
    if (this.redoStack.length === 0) {
      throw new Error("redo not possible");
    }
    fn(this.redoStack.pop());
    this.state = UndoManagerState.NORMAL_STATE;
  }

  /**
   * Is the undo stack not empty?
   * @returns
   */
  canUndo(): boolean {
    return !!this.undoStack.length;
  }

  /**
   * Is the redo stack not empty?
   * @returns
   */
  canRedo(): boolean {
    return !!this.redoStack.length;
  }

  /**
   * Whether the UndoManager is currently performing an undo.
   * @returns
   */
  isUndoing(): boolean {
    return this.state === UndoManagerState.UNDOING_STATE;
  }

  /**
   * Whether the UndoManager is currently performing a redo.
   * @returns
   */
  isRedoing(): boolean {
    return this.state === UndoManagerState.REDOING_STATE;
  }
}
