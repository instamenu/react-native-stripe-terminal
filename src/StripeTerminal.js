import { NativeEventEmitter, NativeModules } from 'react-native';
import EventEmitter from 'events';
import { logger } from 'react-native-logs';
const { RNStripeTerminal } = NativeModules;
const constants = RNStripeTerminal.getConstants();
const nativeEventEmitter = new NativeEventEmitter(RNStripeTerminal);

var log = logger.createLogger();

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
  _abort = () => {};
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
    if (value.status !== this._connection.status) {
      log.debug(
        `changed connection status to ${value.status} and payment status to ${
          value.status === 'CONNECTED' ? 'READY' : 'NOT_CONNECTED'
        }`
      );
      this.payment = {
        ...this.payment,
        status: value.status === 'CONNECTED' ? 'READY' : 'NOT_CONNECTED',
      };
    }
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
      log.info(
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

    nativeEventEmitter.addListener(
      'didReportUnexpectedReaderDisconnect',
      (readers) => {
        this.connection = { ...this.connection, status: 'NOT_CONNECTED' };
      }
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
    nativeEventEmitter.addListener('readerDiscoveryCompletion', (res) => {
      if (res.error) {
        log.log('readerDiscoveryCompletion', res);
        this.connection = {
          ...this.connection,
          status: ConnectionStatus[0],
          discoveryError: res.error,
        };
      } else {
        log.log('readerDiscoveryCompletion', res);
      }
    });
    nativeEventEmitter.addListener('readerConnection', (reader) => {
      this.connection = {
        ...this.connection,
        status: ConnectionStatus[1],
        reader,
        serialNumber: reader.serialNumber,
        location: reader.locationId,
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
      log.debug(
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
      this._abort = this.abortInstallUpdate.bind(this);
      this.connection = {
        ...this.connection,
        update: { ...update, progress: 0 },
      };
    });
    nativeEventEmitter.addListener(
      'didRequestReaderDisplayMessage',
      ({ text }) => {
        log.log('didRequestReaderDisplayMessage', text);
        this.payment = { ...this.payment, displayMessage: text };
      }
    );
    nativeEventEmitter.addListener('didRequestReaderInput', ({ text }) => {
      log.log('didRequestReaderInput', text);
      this.payment = { ...this.payment, inputRequest: text };
    });
    nativeEventEmitter.addListener('didChangePaymentStatus', (...args) => {
      log.log('didChangePaymentStatus', args);
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
  async discoverReaders(discoveryMethod, simulated) {
    await this._init;
    this._abort = this.abortDiscoverReaders.bind(this);
    this.connection = {
      ...this.connection,
      status: 'DISCOVERING',
      discoveryMethod,
      simulated,
      discoveryError: undefined,
    };
    log.log('CALLING DISCOVER');
    return RNStripeTerminal.discoverReaders(discoveryMethod, simulated);
  }
  async abortDiscoverReaders() {
    await RNStripeTerminal.abortDiscoverReaders();
    this.connection = {
      ...this.connection,
      status: ConnectionStatus[0],
      discoveryError: undefined,
      readers: [],
    };
  }
  addListener(...args) {
    return nativeEventEmitter.addListener(...args);
  }
  connectReader(serialNumber, locationId) {
    this.connection = { ...this.connection, status: ConnectionStatus[2] };
    return RNStripeTerminal.connectReader(serialNumber, locationId);
  }
  async disconnectReader() {
    await this.abortCurrentOperation();
    return RNStripeTerminal.disconnectReader().then(() => {
      this.connection = { ...this.connection, status: ConnectionStatus[0] };
    });
  }
  async createPaymentIntent(parameters) {
    if (!parameters?.amount) {
      throw 'You must provide an amount to createPaymentIntent.';
    }
    if (!parameters?.currency) {
      log.warn(
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
    this._abort = this.abortCollectPaymentMethod.bind(this);
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
  async abortCurrentOperation() {
    return this._abort();
  }
}

const instance = new StripeTerminal();
Object.assign(instance, constants);
export { instance as StripeTerminal };
