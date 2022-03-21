import { NativeEventEmitter, NativeModules } from 'react-native';
import EventEmitter from 'events';
const { RNStripeTerminal } = NativeModules;
const constants = RNStripeTerminal.getConstants();
const nativeEventEmitter = new NativeEventEmitter(RNStripeTerminal);

const eventTypes = [
  'connectionStatus',
  'didChangeConnectionStatus',
  'didChangePaymentStatus',
  'didDisconnectUnexpectedlyFromReader',
  'didFinishInstallingUpdate',
  'didReportAvailableUpdate',
  'didReportBatteryLevel',
  'didReportLowBatteryWarning',
  'didReportReaderEvent',
  'didReportReaderSoftwareUpdateProgress',
  'didReportUnexpectedReaderDisconnect',
  'didRequestReaderDisplayMessage',
  'didRequestReaderInput',
  'didStartInstallingUpdate',
  'lastReaderEvent',
  'log',
  'paymentCreation',
  'paymentIntentCancel',
  'paymentIntentCreation',
  'paymentIntentRetrieval',
  'paymentMethodCollection',
  'paymentProcess',
  'paymentStatus',
  'readerConnection',
  'readerDisconnectCompletion',
  'readersDiscovered',
  'readerDiscoveryCompletion',
  'requestConnectionToken',
];

// eventTypes.forEach(type=>nativeEventEmitter.removeAllListeners(type));

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
  constructor() {
    super();
    this._init = new Promise((resolve) => {
      this._resolveInit = resolve;
    });
  }
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
    nativeEventEmitter.addListener('readerDiscoveryCompletion', (...a) => {
      console.log('readerDiscoveryCompletion', a);
      // this.connection = {
      // ...this.connection,
      // status: ConnectionStatus[0],
      // reader: undefined,
      // };
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
    nativeEventEmitter.addListener('log', (message) => {
      console.log(
        'StripeTerminal',
        Object.fromEntries(
          message
            .split(' ')
            .slice(1)
            .map((pair) => pair.split('='))
            .filter(
              ([key, value]) =>
                ![
                  'app_id',
                  'sdk_version',
                  'last_request_id',
                  'scope',
                  'time',
                ].includes(key)
            )
        )
      );
    });
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
    this._resolveInit();
  }
  async discoverReaders(discoveryMethod, simulate) {
    await this._init;
    console.log('really really discovering');
    if (this.connection.status !== 'NOT_CONNECTED') return;
    this.connection = { ...this.connection, status: 'DISCOVERING', simulate };
    return RNStripeTerminal.discoverReaders(discoveryMethod, simulate);
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
  async disconnectReader() {
    return RNStripeTerminal.disconnectReader().then(() => {
      this.connection = { ...this.connection, status: ConnectionStatus[0] };
    });
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
    return RNStripeTerminal.processPayment(paymentIntent)
      .then((pi) => {
        this.payment = {
          ...this.payment,
          payment: pi,
          status: 'PAYMENT_SUCCESS',
        };
        return pi;
      })
      .catch((e) => {
        this.payment = { ...this.payment, status: 'READY' };
        throw e;
      });
  }
  async abortInstallUpdate() {
    return RNStripeTerminal.abortInstallUpdate().then(() => {
      this.connection = { status: 'NOT_CONNECTED', readers: [] };
    });
  }
  setSimulatedCard(type) {
    return RNStripeTerminal.setSimulatedCard(type);
  }
}

const instance = new StripeTerminal();
Object.assign(instance, constants);
export { instance as StripeTerminal };
