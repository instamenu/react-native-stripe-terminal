import EventEmitter from 'events';
import { StripeTerminal } from './StripeTerminal';

/*
wrapper to stably set the desired connection state
transitions from any previous state and retries on failure

state transitions: NOT_CONNECTED > DISCOVERING > { CONNECTING, UPDATING } > CONNECTED

*/

const wait = (ms) => new Promise((res) => setTimeout(res, ms));
const retry = async (fn, depth = 0) => {
  try {
    return await fn();
  } catch (e) {
    if (depth > 5) {
      throw e;
    }
    console.log('failed. waiting to retry.');
    await wait(2 ** depth * 500);
    return retry(fn, depth + 1);
  }
};

class StableConnection extends EventEmitter {
  _desiredState = { status: 'NOT_CONNECTED' };
  constructor() {
    super();
    StripeTerminal.on('connectionChange', () => retry(this.process.bind(this)));
  }
  initialize(...args) {
    StripeTerminal.initialize(...args);
  }
  setDesiredState(state) {
    console.log('setDesiredState', state);
    this._desiredState = state;
    retry(() => this.process());
  }
  isInDesiredState() {
    return Object.entries(this._desiredState).every(
      ([key, value]) => StripeTerminal.connection[key] === value
    );
  }
  async process() {
    console.log('processsss');
    if (this._processing) return;
    this._processing = true;
    if (this.isInDesiredState()) {
      console.log('reached desired state: ', this._desiredState);
      this._processing = false;
      return;
    }
    console.log(
      `attempting to transition state from: ${StripeTerminal.connection.status} to: ${this._desiredState.status}`
    );
    if (
      this._previousConnectionState === StripeTerminal.connection &&
      this._previousDesiredState === this._desiredState
    ) {
      // we’re stuck: nothing has changed, and we must have reached the end of our retries.
      // wait for something to change to try again.
      console.log(
        'state hasn’t changed. listen for a change before trying again.'
      );
      this._processing = false;
      // StripeTerminal.once('connectionChange', () => retry(this.process.bind(this)));
      return;
    }
    this._previousConnectionState = StripeTerminal.connection;
    this._previousDesiredState = this._desiredState;
    if (this._desiredState.status === 'NOT_CONNECTED') {
      await StripeTerminal.disconnectReader();
    }
    if (this._desiredState.status === 'DISCOVERING') {
      if (StripeTerminal.connection.status === 'NOT_CONNECTED') {
        if (
          StripeTerminal.connection.discoveryError ===
          'Could not execute discoverReaders because the SDK is busy with another command: discoverReaders.'
        ) {
          await StripeTerminal.abortDiscoverReaders();
        }
        await StripeTerminal.discoverReaders(
          this._desiredState.discoveryMethod,
          this._desiredState.simulated
        );
      } else {
        await StripeTerminal.disconnectReader();
      }
    }
    if (this._desiredState.status === 'CONNECTED') {
      if (StripeTerminal.connection.status === 'NOT_INITIALIZED') {
        await StripeTerminal._init;
      }
      if (StripeTerminal.connection.status === 'NOT_CONNECTED') {
        await StripeTerminal.discoverReaders(
          this._desiredState.discoveryMethod,
          this._desiredState.simulated
        );
      }
      if (StripeTerminal.connection.status === 'DISCOVERING') {
        const findAndConnect = async (connection) => {
          const foundDesiredReader = connection.readers.find(
            (r) => r.serialNumber === this._desiredState.serialNumber
          );
          console.log('ran find and connect, found: ', !!foundDesiredReader);
          if (foundDesiredReader) {
            await StripeTerminal.connectReader(
              this._desiredState.serialNumber,
              this._desiredState.location
            );
            return true;
          }
        };
        await findAndConnect(StripeTerminal.connection);
      }
    }
    this._processing = false;
    return this.process();
  }
}

const instance = new StableConnection();
export { instance as StableConnection };
