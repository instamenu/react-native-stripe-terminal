import { NativeEventEmitter, NativeModules } from 'react-native';
import EventEmitter from 'events';
const { RNStripeTerminal } = NativeModules;
const constants = RNStripeTerminal.getConstants();
const nativeEventEmitter = new NativeEventEmitter(RNStripeTerminal);

console.log('stripe terminal: preamble');

const ConnectionStatus = {
  0: 'NOT_CONNECTED',
  1: 'CONNECTED',
  2: 'CONNECTING',
};

const PaymentStatus = {
  0: 'NOT_READY',
  1: 'READY',
  2: 'WAITING_FOR_INPUT',
  3: 'PROCESSING',
};

class StripeTerminal extends EventEmitter {
  _connection = { status: ConnectionStatus[0], readers: [] };
  _payment = {};
  get connection() {
    return this._connection;
  }
  set connection(value) {
    this._connection =
      typeof value === 'function' ? value(this._connection) : value;
    this.emit('connectionChange', this._connection);
  }
  get payment() {
    return this._payment;
  }
  set payment(value) {
    this._payment = typeof value === 'function' ? value(this._payment) : value;
    this.emit('paymentChange', this._payment);
  }
  async initialize({ fetchConnectionToken }) {
    if (this.initialized) {
      console.info(
        'StripeTerminal.initialize(...) has already been called. Skipping.'
      );
      return;
    }
    this.initialized = true;
    nativeEventEmitter.addListener('requestConnectionToken', () =>
      fetchConnectionToken()
        .then((token) => {
          if (!token) throw '';
          RNStripeTerminal.setConnectionToken(token, null);
        })
        .catch(() =>
          RNStripeTerminal.setConnectionToken(
            null,
            'Error in fetchConnectionToken.'
          )
        )
    );
    nativeEventEmitter.addListener('readersDiscovered', (readers) => {
      this.connection = { ...this.connection, readers };
    });
    nativeEventEmitter.addListener('readerDisconnectCompletion', () => {
      this.connection = {
        ...this.connection,
        status: ConnectionStatus[0],
        reader: undefined,
      };
    });
    nativeEventEmitter.addListener('readerConnection', (reader) => {
      this.connection = {
        ...this.connection,
        status: ConnectionStatus[1],
        reader,
        readers: [],
      };
    });
    nativeEventEmitter.addListener(
      'didReportReaderSoftwareUpdateProgress',
      (progress) => {
        this.connection = {
          ...this.connection,
          update: { ...this.connection.update, progress },
        };
      }
    );
    nativeEventEmitter.addListener('didFinishInstallingUpdate', () => {
      this.connection = { ...this.connection, update: undefined };
    });
    nativeEventEmitter.addListener('didStartInstallingUpdate', (update) => {
      this.connection = {
        ...this.connection,
        update: { ...update, progress: 0 },
      };
    });
    nativeEventEmitter.addListener(
      'didRequestReaderDisplayMessage',
      ({ text }) => {
        console.log('didRequestReaderDisplayMessage', text);
        this.payment = { ...this.payment, displayMessage: text };
      }
    );
    nativeEventEmitter.addListener('didRequestReaderInput', ({ text }) => {
      console.log('didRequestReaderInput', text);
      this.payment = { ...this.payment, inputRequest: text };
    });
    nativeEventEmitter.addListener('didChangePaymentStatus', (...args) => {
      console.log('didChangePaymentStatus', args);
      // this.payment = { ...this.payment, inputRequest: text };
    });
    const currentState = await RNStripeTerminal.initialize();
    // const currentState = await this.getCurrentState();
    this.connection = {
      ...this.connection,
      status: ConnectionStatus[currentState.status],
      reader: currentState.reader,
    };
    this.payment = {
      ...this.payment,
      status: PaymentStatus[currentState.paymentStatus],
    };
  }
  discoverReaders(discoveryMethod, simulated) {
    this.connection = { ...this.connection, status: 'DISCOVERING' };
    RNStripeTerminal.discoverReaders(discoveryMethod, simulated);
  }
  abortDiscoverReaders() {
    RNStripeTerminal.abortDiscoverReaders().then(() => {
      this.connection = {
        ...this.connection,
        status: ConnectionStatus[0],
        readers: [],
      };
    });
  }
  addListener(...args) {
    return nativeEventEmitter.addListener(...args);
  }
  connectReader(serialNumber, locationId) {
    this.connection = { ...this.connection, status: ConnectionStatus[2] };
    RNStripeTerminal.connectReader(serialNumber, locationId);
  }
  disconnectReader() {
    return RNStripeTerminal.disconnectReader();
  }
  async createPaymentIntent(parameters) {
    if (!parameters?.amount) {
      throw 'You must provide an amount to createPaymentIntent.';
    }
    if (!parameters?.currency) {
      console.warn(
        'No currency provided to createPaymentIntent. Defaulting to `usd`.'
      );
    }
    const paymentIntent = await RNStripeTerminal.createPaymentIntent({
      amount: parameters.amount,
      currency: parameters?.currency ?? 'usd',
    });
    this.payment = { paymentIntent };
    return paymentIntent;
  }

  async collectPaymentMethod({ paymentIntent }) {
    if (!paymentIntent) {
      throw 'You must provide a paymentIntent to collectPaymentMethod.';
    }
    this.payment = { ...this.payment, status: 'COLLECTING_PAYMENT_METHOD' };
    const paymentMethod = await RNStripeTerminal.collectPaymentMethod(
      paymentIntent
    ).catch((e) => {
      if (e.message === 'The command was canceled.') {
        // if the command was manually canceled, don’t consider it an error
        return;
      }
      throw e;
    });
    this.payment = { ...this.payment, paymentMethod, status: undefined };
    return paymentMethod;
  }

  async abortCollectPaymentMethod() {
    return RNStripeTerminal.abortCollectPaymentMethod().then(() => {
      this.payment = { ...this.payment, status: '' };
    });
  }

  async getCurrentState() {
    return RNStripeTerminal.getCurrentState();
  }

  async processPayment({ paymentIntent }) {
    if (!paymentIntent) {
      throw 'You must provide a paymentIntent to processPayment.';
    }
    this.payment = { ...this.payment, status: 'PROCESSING_PAYMENT' };
    const payment = await RNStripeTerminal.processPayment(paymentIntent).catch(
      (e) => {
        // if (e.message === "The command was canceled.") {
        //   // if the command was manually canceled, don’t consider it an error
        //   return;
        // }
        console.error(e);
        throw e;
      }
    );
    this.payment = { ...this.payment, payment, status: undefined };
    return payment;
  }
}

const instance = new StripeTerminal();
Object.assign(instance, constants);
export { instance as StripeTerminal };
