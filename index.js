import { NativeEventEmitter, NativeModules } from "react-native";
import EventEmitter from "events";
const { RNStripeTerminal } = NativeModules;
const constants = RNStripeTerminal.getConstants();
const nativeEventEmitter = new NativeEventEmitter(RNStripeTerminal);

class StripeTerminal extends EventEmitter {
  _status = "READY";
  get status() {
    return this._status;
  }
  set status(value) {
    this._status = value;
    this.emit("statusChange", value);
  }
  initialize({ fetchConnectionToken }) {
    if (this.initialized) {
      // "StripeTerminal.initialize(...) has already been called. Skipping."
      return;
    }
    this.initialized = true;
    nativeEventEmitter.addListener("requestConnectionToken", () =>
      fetchConnectionToken()
        .then((token) => {
          if (!token) throw "";
          RNStripeTerminal.setConnectionToken(token, null);
        })
        .catch(() =>
          RNStripeTerminal.setConnectionToken(
            null,
            "Error in fetchConnectionToken."
          )
        )
    );
    RNStripeTerminal.initialize();
  }
  discoverReaders(discoveryMethod, simulated) {
    this.status = "DISCOVERING";
    RNStripeTerminal.discoverReaders(discoveryMethod, simulated);
  }
  abortDiscoverReaders() {
    this.status = "READY";
    RNStripeTerminal.abortDiscoverReaders();
  }
  addListener(...args) {
    return nativeEventEmitter.addListener(...args);
  }
  connectReader(serialNumber, locationId) {
    this.status = "CONNECTING";
    RNStripeTerminal.connectReader(serialNumber, locationId);
  }
}

const instance = new StripeTerminal();
Object.assign(instance, constants);
export default instance;
