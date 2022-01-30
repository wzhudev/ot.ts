import { TextOperation } from "./text-operation";

interface ClientState {
  applyClient(client: Client, operation: TextOperation): ClientState;
  applyServer(client: Client, operation: TextOperation): ClientState;
  serverAck(client: Client): ClientState;
  resend?(client: Client): void;

  // TODO: selection type
  transformSelection(selection: any): any;
}

/**
 * In the 'Synchronized' state, there is no pending operation that the client
 * has sent to the server.
 */
export class SynchronizedState implements ClientState {
  applyClient(client: Client, operation: TextOperation): ClientState {
    // When the user makes an edit, send the operation to the server and
    // switch to the 'AwaitingConfirm' state
    client.sendOperation(client.revision, operation);
    return new AwaitingConfirm(operation);
  }

  applyServer(client: Client, operation: TextOperation) {
    // When we receive a new operation from the server, the operation can be
    // simply applied to the current document
    client.applyOperation(operation);
    return this;
  }

  serverAck(_client: Client): never {
    throw new Error("There is no pending operation.");
  }

  transformSelection(x) {
    // Nothing to do because the latest server state and client state are the same.
    return x;
  }
}
const synchronized_ = new SynchronizedState();

/**
 * In the 'AwaitingConfirm' state, there's one operation the client has sent
 * to the server and is still waiting for an acknowledgement.
 */
export class AwaitingConfirm implements ClientState {
  constructor(
    /**
     * Save the pending operation
     */
    private readonly outstanding: TextOperation
  ) {}

  applyClient(client: Client, operation: TextOperation): ClientState {
    // When the user makes an edit, don't send the operation immediately,
    // instead switch to 'AwaitingWithBuffer' state
    return new AwaitingConfirmWithBuffer(this.outstanding, operation);
  }

  applyServer(client: Client, operation: TextOperation) {
    // This is another client's operation. Visualization:
    //
    //                   /\
    // this.outstanding /  \ operation
    //                 /    \
    //                 \    /
    //  pair[1]         \  / pair[0] (new outstanding)
    //  (can be applied  \/
    //  to the client's
    //  current document)
    const pair = TextOperation.transform(this.outstanding, operation);
    client.applyOperation(pair[1]);
    return new AwaitingConfirm(pair[0]);
  }

  serverAck(_client: Client) {
    // The client's operation has been acknowledged
    // => switch to synchronized state
    return synchronized_;
  }

  transformSelection(selection) {
    return selection.transform(this.outstanding);
  }

  resend(client: Client) {
    // The confirm didn't come because the client was disconnected.
    // Now that it has reconnected, we resend the outstanding operation.
    client.sendOperation(client.revision, this.outstanding);
  }
}

/**
 * In the 'AwaitingWithBuffer' state, the client is waiting for an operation
 * to be acknowledged by the server while buffering the edits the user makes
 */
export class AwaitingConfirmWithBuffer implements ClientState {
  constructor(
    private readonly outstanding: TextOperation,
    private readonly buffer: TextOperation
  ) {}

  applyClient(client: Client, operation: TextOperation): ClientState {
    // Compose the user's changes onto the buffer
    const newBuffer = this.buffer.compose(operation);
    return new AwaitingConfirmWithBuffer(this.outstanding, newBuffer);
  }

  applyServer(client: Client, operation: TextOperation): ClientState {
    // Operation comes from another client
    //
    //                       /\
    //     this.outstanding /  \ operation
    //                     /    \
    //                    /\    /
    //       this.buffer /  \* / pair1[0] (new outstanding)
    //                  /    \/
    //                  \    /
    //          pair2[1] \  / pair2[0] (new buffer)
    // the transformed    \/
    // operation -- can
    // be applied to the
    // client's current
    // document
    //
    // * pair1[1]
    const transform = operation.constructor.transform;
    const pair1 = transform(this.outstanding, operation);
    const pair2 = transform(this.buffer, pair1[1]);
    client.applyOperation(pair2[1]);
    return new AwaitingWithBuffer(pair1[0], pair2[0]);
  }

  serverAck(client: Client): ClientState {
    // The pending operation has been acknowledged
    // => send buffer
    client.sendOperation(client.revision, this.buffer);
    return new AwaitingConfirm(this.buffer);
  }

  transformSelection(selection: any) {
    return selection.transform(this.outstanding).transform(this.buffer);
  }

  resend(client: Client): void {
    // The confirm didn't come because the client was disconnected.
    // Now that it has reconnected, we resend the outstanding operation.
    client.sendOperation(client.revision, this.outstanding);
  }
}

export abstract class Client {
  private state: ClientState = synchronized_;

  constructor(
    /**
     * the next expected revision number
     */
    public revision: number
  ) {}

  public setState(state: ClientState) {
    this.state = state;
  }

  /**
   * Call this method when the user changes the document.
   * @param operation
   */
  public applyClient(operation: TextOperation) {
    this.setState(this.state.applyClient(this, operation));
  }

  /**
   *  Call this method with a new operation from the server
   */
  public applyServer(operation: TextOperation) {
    this.revision++;
    this.setState(this.state.applyServer(this, operation));
  }

  public serverAck() {
    this.revision++;
    this.setState(this.state.serverAck(this));
  }

  public serverReconnect() {
    this.state?.resend(this);
  }

  /**
   * Transforms a selection from the latest known server state to the current
   * client state. For example, if we get from the server the information that
   * another user's cursor is at position 3, but the server hasn't yet received
   * our newest operation, an insertion of 5 characters at the beginning of the
   * document, the correct position of the other user's cursor in our current
   * document is 8.
   * @param selection
   * @returns
   */
  public transformSelection(selection) {
    return this.state.transformSelection(selection);
  }

  abstract sendOperation(revision: number, operation: TextOperation): void;
  abstract applyOperation(operation: TextOperation): void;
}
