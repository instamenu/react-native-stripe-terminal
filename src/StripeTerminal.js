import { NativeEventEmitter, NativeModules } from 'react-native';
import EventEmitter from 'events';
const { RNStripeTerminal } = NativeModules;
const constants = RNStripeTerminal.getConstants();
const nativeEventEmitter = new NativeEventEmitter(RNStripeTerminal);

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
  _connection = { status: 'NOT_INITIALIZED', readers: [] };
  _payment = { status: 'NOT_CONNECTED' };
  get connection() {
    return this._connection;
  }
  set connection(value) {
    this._connection =
      typeof value === 'function' ? value(this._connection) : value;
    if (value.status !== this._connection.status) {
      this.payment = {
        ...this.payment,
        status: value.status === 'CONNECTED' ? 'READY' : 'NOT_CONNECTED',
      };
    }
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
    });
    const currentState = await RNStripeTerminal.initialize();
    this.connection = {
      ...this.connection,
      status: ConnectionStatus[currentState.connectionStatus],
      reader: currentState.reader,
    };
    this.payment = {
      ...this.payment,
      status: PaymentStatus[currentState.paymentStatus],
    };
  }
  discoverReaders(discoveryMethod, simulated) {
    this.connection = { ...this.connection, status: 'DISCOVERING' };
    return RNStripeTerminal.discoverReaders(discoveryMethod, simulated);
  }
  abortDiscoverReaders() {
    return RNStripeTerminal.abortDiscoverReaders().then(() => {
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
    return RNStripeTerminal.connectReader(serialNumber, locationId);
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
    this.payment = { paymentIntent, status: 'CREATING_PAYMENT_INTENT' };
    const paymentIntent = await RNStripeTerminal.createPaymentIntent({
      amount: parameters.amount,
      currency: parameters?.currency ?? 'usd',
    });
    this.payment = { paymentIntent, status: 'READY' };
    return paymentIntent;
  }

  async collectPaymentMethod({ paymentIntent }) {
    if (!paymentIntent) {
      throw 'You must provide a paymentIntent to collectPaymentMethod.';
    }
    this.payment = { ...this.payment, status: 'WAITING_FOR_INPUT' };
    const paymentMethod = await RNStripeTerminal.collectPaymentMethod(
      paymentIntent
    ).catch((e) => {
      if (e.message === 'The command was canceled.') {
        // if the command was manually canceled, don’t consider it an error
        return;
      }
      throw e;
    });
    this.payment = {
      ...this.payment,
      paymentMethod,
      status: 'READY_TO_PROCESS',
    };
    return paymentMethod;
  }

  async abortCollectPaymentMethod() {
    return RNStripeTerminal.abortCollectPaymentMethod().then(() => {
      this.payment = { ...this.payment, status: 'READY' };
    });
  }

  async getCurrentState() {
    return RNStripeTerminal.getCurrentState();
  }

  async retrievePaymentIntent(clientSecret) {
    return RNStripeTerminal.retrievePaymentIntent(clientSecret);
  }

  async processPayment({ paymentIntent }) {
    if (!paymentIntent) {
      throw 'You must provide a paymentIntent to processPayment.';
    }
    this.payment = { ...this.payment, status: 'PROCESSING_PAYMENT' };
    return RNStripeTerminal.processPayment(paymentIntent).then((pi) => {
      this.payment = {
        ...this.payment,
        payment: pi,
        status: 'PAYMENT_SUCCESS',
      };
      return pi;
    });
  }
}

const instance = new StripeTerminal();
Object.assign(instance, constants);
export { instance as StripeTerminal };
