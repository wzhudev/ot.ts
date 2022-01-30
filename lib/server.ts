import { TextOperation } from "./text-operation";

export class Server {
  /**
   * Constructor. Takes the current document as a string and optionally the array
   * of all operations.
   * @param document
   * @param operations
   */
  constructor(
    public document: string = '',
    private readonly operations: TextOperation[] = []
  ) {}

  // Call this method whenever you receive an operation from a client.
  receiveOperation(revision: number, operation: TextOperation) {
    if (revision < 0 || this.operations.length < revision) {
      throw new Error("operation revision not in history");
    }

    // Find all operations that the client didn't know of when it sent the
    // operation ...
    const concurrentOperations = this.operations.slice(revision);

    // ... and transform the operation against all these operations ...
    const transform = TextOperation.transform;
    for (var i = 0; i < concurrentOperations.length; i++) {
      operation = transform(operation, concurrentOperations[i])[0];
    }

    // ... and apply that on the document.
    this.document = operation.apply(this.document);
    // Store operation in history.
    this.operations.push(operation);

    // It's the caller's responsibility to send the operation to all connected
    // clients and an acknowledgement to the creator.
    return operation;
  }
}
