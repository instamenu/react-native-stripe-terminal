import EventEmitter from 'events';
import { StripeTerminal, ConnectionStatus } from './StripeTerminal';

/*
wrapper to stably set the desired connection state
transitions from any previous state and retries on failure

state transitions: NOT_CONNECTED > DISCOVERING > { CONNECTING, UPDATING } > CONNECTED

*/

const wait = (ms) => new Promise((res) => setTimeout(res, ms));
const retry = async (fn, attempt = 0) => {
  try {
    return await fn();
  } catch (e) {
    if (attempt > 5) {
      throw e;
    }
    StripeTerminal.logLevel && console.log('failed. waiting to retry.');
    await wait(2 ** attempt * 500);
    return retry(fn, attempt + 1);
  }
};

class StableConnection extends EventEmitter {
  _desiredState = { status: ConnectionStatus.NOT_CONNECTED };
  constructor() {
    super();
    StripeTerminal.on('connectionChange', () => retry(this.process.bind(this)));
  }
  initialize(...args) {
    StripeTerminal.initialize(...args);
  }
  setDesiredState(state) {
    StripeTerminal.logLevel && console.log('setDesiredState', state);
    this._desiredState = state;
    retry(() => this.process());
  }
  isInDesiredState() {
    return Object.entries(this._desiredState).every(
      ([key, value]) => StripeTerminal.connection[key] === value
    );
  }
  async process() {
    if (this._processing) return;
    this._processing = true;
    try {
      if (this.isInDesiredState()) {
        StripeTerminal.logLevel &&
          console.log('reached desired state: ', this._desiredState);
        return;
      }
      StripeTerminal.logLevel &&
        console.log(
          `attempting to transition state from: ${StripeTerminal.connection.status} to: ${this._desiredState.status}`
        );
      if (
        this._previousConnectionState === StripeTerminal.connection &&
        this._previousDesiredState === this._desiredState
      ) {
        // we’re stuck: nothing has changed, and we must have reached the end of our retries.
        // wait for something to change to try again.
        StripeTerminal.logLevel &&
          console.log(
            'state hasn’t changed. listen for a change before trying again.'
          );
        return;
      }
      this._previousConnectionState = StripeTerminal.connection;
      this._previousDesiredState = this._desiredState;
      if (this._desiredState.status === ConnectionStatus.NOT_CONNECTED) {
        await StripeTerminal.disconnectReader();
      }
      if (this._desiredState.status === ConnectionStatus.DISCOVERING) {
        if (
          StripeTerminal.connection.status === ConnectionStatus.NOT_CONNECTED
        ) {
          if (
            StripeTerminal.connection.discoveryError ===
            'Could not execute discoverReaders because the SDK is busy with another command: discoverReaders.'
          ) {
            await StripeTerminal.abortDiscoverReaders();
          }
          if (
            StripeTerminal.connection.discoveryError ===
            'Already connected to a reader. Disconnect from the reader, or power it off before trying again.'
          ) {
            await StripeTerminal.disconnectReader();
          }
          await StripeTerminal.discoverReaders(
            this._desiredState.discoveryMethod,
            this._desiredState.simulated
          );
        } else {
          await StripeTerminal.disconnectReader();
        }
      }
      if (this._desiredState.status === ConnectionStatus.CONNECTED) {
        if (
          StripeTerminal.connection.connectionError ===
          'The reader has a critically low battery and cannot connect to the iOS device. Charge the reader before trying again.'
        ) {
          return;
        }
        if (
          StripeTerminal.connection.status === ConnectionStatus.NOT_INITIALIZED
        ) {
          await StripeTerminal._init;
        }
        if (
          StripeTerminal.connection.status === ConnectionStatus.NOT_CONNECTED
        ) {
          await StripeTerminal.discoverReaders(
            this._desiredState.discoveryMethod,
            this._desiredState.simulated
          );
        }
        if (StripeTerminal.connection.status === ConnectionStatus.DISCOVERING) {
          const findAndConnect = async (connection) => {
            const foundDesiredReader = connection.readers.find(
              (r) => r.serialNumber === this._desiredState.serialNumber
            );
            StripeTerminal.logLevel &&
              console.log(
                'ran find and connect, found: ',
                !!foundDesiredReader
              );
            if (foundDesiredReader) {
              await StripeTerminal.connectReader(
                this._desiredState.serialNumber,
                this._desiredState.location
              );
              return;
            }
          };
          await findAndConnect(StripeTerminal.connection);
        }
      }
    } catch (e) {
      throw e;
    } finally {
      this._processing = false;
    }
    return this.process();
  }
}

const instance = new StableConnection();
export { instance as StableConnection };
