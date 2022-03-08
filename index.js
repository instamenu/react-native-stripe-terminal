import { NativeEventEmitter, NativeModules } from "react-native";
import EventEmitter from "events";
const { RNStripeTerminal } = NativeModules;
const constants = RNStripeTerminal.getConstants();
const nativeEventEmitter = new NativeEventEmitter(RNStripeTerminal);

class StripeTerminal extends EventEmitter {
  _state = { status: "NOT_CONNECTED", readers: [] };
  get state() {
    return this._state;
  }
  set state(value) {
    this._state = typeof value === "function" ? value(this._state) : value;
    this.emit("stateChange", this._state);
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
    nativeEventEmitter.addListener("readersDiscovered", (readers) => {
      this.state = { ...this.state, readers };
    });
    nativeEventEmitter.addListener("readerDisconnectCompletion", () => {
      this.state = {
        ...this.state,
        status: "NOT_CONNECTED",
        reader: undefined,
      };
    });
    nativeEventEmitter.addListener("readerConnection", (reader) => {
      this.state = {
        ...this.state,
        status: "CONNECTED",
        reader,
        readers: [],
      };
    });
    nativeEventEmitter.addListener(
      "didReportReaderSoftwareUpdateProgress",
      (progress) => {
        this.state = {
          ...this.state,
          update: { ...this.state.update, progress },
        };
      }
    );
    nativeEventEmitter.addListener("didFinishInstallingUpdate", () => {
      this.state = { ...this.state, update: undefined };
    });
    nativeEventEmitter.addListener("didStartInstallingUpdate", (update) => {
      this.state = { ...this.state, update: { ...update, progress: 0 } };
    });
    RNStripeTerminal.initialize();
  }
  discoverReaders(discoveryMethod, simulated) {
    this.state = { ...this.state, status: "DISCOVERING" };
    RNStripeTerminal.discoverReaders(discoveryMethod, simulated);
  }
  abortDiscoverReaders() {
    this.state = { ...this.state, status: "ABORTING_DISCOVERY", readers: [] };
    RNStripeTerminal.abortDiscoverReaders().then(() => {
      this.state = { ...this.state, status: "NOT_CONNECTED", readers: [] };
    });
  }
  addListener(...args) {
    return nativeEventEmitter.addListener(...args);
  }
  connectReader(serialNumber, locationId) {
    this.state = { ...this.state, status: "CONNECTING" };
    RNStripeTerminal.connectReader(serialNumber, locationId);
  }
  disconnectReader() {
    // this.status = "CONNECTING";
    RNStripeTerminal.disconnectReader();
  }
}

const instance = new StripeTerminal();
Object.assign(instance, constants);
export default instance;
