import { NativeEventEmitter, NativeModules } from 'react-native';
import EventEmitter from 'events';
const { RNStripeTerminal } = NativeModules;
const constants = RNStripeTerminal.getConstants();
const nativeEventEmitter = new NativeEventEmitter(RNStripeTerminal);

export const ConnectionStatus = {
  NOT_CONNECTED: 'NOT_CONNECTED',
  CONNECTED: 'CONNECTED',
  CONNECTING: 'CONNECTING',
  DISCOVERING: 'DISCOVERING',
  NOT_INITIALIZED: 'NOT_INITIALIZED',

  // https://stripe.dev/stripe-terminal-ios/docs/Enums/SCPConnectionStatus.html
  fromSCPConnectionStatus(value) {
    switch (value) {
      case 0:
        return ConnectionStatus.NOT_CONNECTED;
      case 1:
        return ConnectionStatus.CONNECTED;
      case 2:
        return ConnectionStatus.CONNECTING;
      default:
        throw `Invalid value: ${value}`;
    }
  },
};

export const PaymentStatus = {
  NOT_READY: 'NOT_READY',
  READY: 'READY',
  WAITING_FOR_INPUT: 'WAITING_FOR_INPUT',
  PROCESSING: 'PROCESSING',
  NOT_CONNECTED: 'NOT_CONNECTED',
  READY_TO_PROCESS: 'READY_TO_PROCESS',
  PAYMENT_SUCCESS: 'PAYMENT_SUCCESS',
  CREATING_PAYMENT_INTENT: 'CREATING_PAYMENT_INTENT',

  // https://stripe.dev/stripe-terminal-ios/docs/Enums/SCPPaymentStatus.html
  fromSCPPaymentStatus(value) {
    switch (value) {
      case 0:
        return PaymentStatus.NOT_READY;
      case 1:
        return PaymentStatus.READY;
      case 2:
        return PaymentStatus.WAITING_FOR_INPUT;
      case 3:
        return PaymentStatus.PROCESSING;
      default:
        throw `Invalid value: ${value}`;
    }
  },
};

class StripeTerminal extends EventEmitter {
  _connection = { status: ConnectionStatus.NOT_INITIALIZED, readers: [] };
  _payment = { status: ConnectionStatus.NOT_CONNECTED };
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
    const next = typeof value === 'function' ? value(this._connection) : value;
    console.log('updating connection state with: ', next);
    if (next.status !== this._connection.status) {
      this.payment = {
        ...this.payment,
        status:
          next.status === ConnectionStatus.CONNECTED
            ? PaymentStatus.READY
            : PaymentStatus.NOT_CONNECTED,
      };
    }
    this._connection = next;
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
    nativeEventEmitter.addListener(
      'didReportReaderEvent',
      ({ event, info }) => {
        this.connection = {
          ...this.connection,
          reader: { ...this.connection.reader, isCardInserted: !event },
        };
      }
    );
    nativeEventEmitter.addListener(
      'didReportBatteryLevel',
      ({ batteryLevel, isCharging }) => {
        this.connection = {
          ...this.connection,
          reader: { ...this.connection.reader, batteryLevel, isCharging },
        };
      }
    );
    nativeEventEmitter.addListener(
      'didReportUnexpectedReaderDisconnect',
      (readers) => {
        this.connection = {
          ...this.connection,
          status: ConnectionStatus.NOT_CONNECTED,
        };
      }
    );
    nativeEventEmitter.addListener('readersDiscovered', (readers) => {
      this.connection = { ...this.connection, readers };
    });
    nativeEventEmitter.addListener('readerDisconnectCompletion', () => {
      this.connection = {
        ...this.connection,
        status: ConnectionStatus.NOT_CONNECTED,
        reader: undefined,
      };
    });
    nativeEventEmitter.addListener('readerDiscoveryCompletion', (res) => {
      if (res.error) {
        console.log('readerDiscoveryCompletion', res);
        this.connection = {
          ...this.connection,
          status: ConnectionStatus.NOT_CONNECTED,
          discoveryError: res.error,
        };
      } else {
        console.log('readerDiscoveryCompletion', res);
      }
    });
    nativeEventEmitter.addListener('readerConnection', (reader) => {
      if (reader.error) {
        this.connection = {
          ...this.connection,
          connectionError: reader.error,
          status: ConnectionStatus.NOT_CONNECTED,
        };
      } else {
        this.connection = {
          ...this.connection,
          status: ConnectionStatus.CONNECTED,
          reader,
          serialNumber: reader.serialNumber,
          location: reader.locationId,
          readers: [],
        };
      }
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
      this._abort = this.abortInstallUpdate.bind(this);
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
      status: ConnectionStatus.fromSCPConnectionStatus(
        currentState.connectionStatus
      ),
      reader: currentState.reader,
    };
    this.payment = {
      ...this.payment,
      status: PaymentStatus.fromSCPPaymentStatus(currentState.paymentStatus),
    };
    this._resolveInit();
  }
  async discoverReaders(discoveryMethod, simulated) {
    await this._init;
    this._abort = this.abortDiscoverReaders.bind(this);
    this.connection = {
      ...this.connection,
      status: ConnectionStatus.DISCOVERING,
      discoveryMethod,
      simulated,
      discoveryError: undefined,
    };
    return RNStripeTerminal.discoverReaders(discoveryMethod, simulated);
  }
  async abortDiscoverReaders() {
    await RNStripeTerminal.abortDiscoverReaders();
    this.connection = {
      ...this.connection,
      status: ConnectionStatus.NOT_CONNECTED,
      discoveryError: undefined,
      readers: [],
    };
  }
  addListener(...args) {
    return nativeEventEmitter.addListener(...args);
  }
  connectReader(serialNumber, locationId) {
    this.connection = {
      ...this.connection,
      status: ConnectionStatus.CONNECTING,
    };
    return RNStripeTerminal.connectReader(serialNumber, locationId);
  }
  async disconnectReader() {
    await this.abortCurrentOperation();
    return RNStripeTerminal.disconnectReader().then(() => {
      this.connection = {
        ...this.connection,
        status: ConnectionStatus.NOT_CONNECTED,
        reader: null,
      };
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
    this.payment = {
      paymentIntent,
      status: PaymentStatus.CREATING_PAYMENT_INTENT,
    };
    const paymentIntent = await RNStripeTerminal.createPaymentIntent({
      amount: parameters.amount,
      currency: parameters?.currency ?? 'usd',
    });
    this.payment = { paymentIntent, status: PaymentStatus.READY };
    return paymentIntent;
  }

  async collectPaymentMethod({ paymentIntent }) {
    this._abort = this.abortCollectPaymentMethod.bind(this);
    if (!paymentIntent) {
      throw 'You must provide a paymentIntent to collectPaymentMethod.';
    }
    this.payment = { ...this.payment, status: PaymentStatus.WAITING_FOR_INPUT };
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
      status: PaymentStatus.READY_TO_PROCESS,
    };
    return paymentMethod;
  }

  async abortCollectPaymentMethod() {
    return RNStripeTerminal.abortCollectPaymentMethod().then(() => {
      this.payment = { ...this.payment, status: PaymentStatus.READY };
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
    this.payment = { ...this.payment, status: PaymentStatus.PROCESSING };
    return RNStripeTerminal.processPayment(paymentIntent)
      .then((pi) => {
        this.payment = {
          ...this.payment,
          payment: pi,
          status: PaymentStatus.PAYMENT_SUCCESS,
        };
        return pi;
      })
      .catch((e) => {
        this.payment = { ...this.payment, status: PaymentStatus.READY };
        throw e;
      });
  }
  async abortInstallUpdate() {
    return RNStripeTerminal.abortInstallUpdate().then(() => {
      this.connection = {
        ...this.connection,
        status: ConnectionStatus.NOT_CONNECTED,
        readers: [],
      };
    });
  }
  async clearConnectionError() {
    this.connection = {
      ...this.connection,
      status: ConnectionStatus.NOT_CONNECTED,
      connectionError: null,
    };
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
