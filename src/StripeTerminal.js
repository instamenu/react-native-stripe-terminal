import { NativeEventEmitter, NativeModules } from 'react-native';
import EventEmitter from 'events';
const { RNStripeTerminal } = NativeModules;
const constants = RNStripeTerminal.getConstants();
const nativeEventEmitter = new NativeEventEmitter(RNStripeTerminal);

export const DeviceTypes = {
  0: 'BBPOS Chipper 2X BT',
  1: 'Verifone P400',
  2: 'BBPOS WisePad 3',
  3: 'Stripe Reader M2',
  4: 'BBPOS WisePOS E',
};

export const ConnectionStatus = {
  NOT_CONNECTED: 'NOT_CONNECTED',
  CONNECTED: 'CONNECTED',
  CONNECTING: 'CONNECTING',
  DISCOVERING: 'DISCOVERING',
  NOT_INITIALIZED: 'NOT_INITIALIZED',
  UPDATING: 'UPDATING',
  ERROR: 'ERROR',

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

const stringifyReaderEnums = (reader) =>
  reader
    ? {
        ...reader,
        // isCharging is false if the battery is at 100% whether the reader is plugged in or not
        isCharging: !!reader.isCharging,
        deviceType: DeviceTypes[reader.deviceType],
      }
    : reader;

class Queue {
  queue = [];
  add(fn) {
    const p = new Promise((resolve, reject) => {
      this.queue.push({ fn, resolve, reject });
      if (this.queue.length === 1) this.process();
    });
    return p;
  }
  process() {
    if (this.queue.length === 0) return;
    this.queue[0]
      .fn()
      .then(this.queue[0].resolve)
      .catch(this.queue[0].reject)
      .finally(() => {
        this.queue.shift();
        this.process();
      });
  }
}

class StripeTerminal extends EventEmitter {
  _connection = { status: ConnectionStatus.NOT_INITIALIZED, readers: [] };
  _payment = { status: ConnectionStatus.NOT_CONNECTED };
  _abort = () => {};
  _logLevel = 0;
  _queue = new Queue();

  get logLevel() {
    return this._logLevel;
  }
  set logLevel(value) {
    this._logLevel = value;
  }
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
    this.logLevel && console.log('updating connection state with: ', next);
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
    // `didReportReaderEvent` doesn’t seem to fire for the M2, so use the log event instead for now
    /*
    nativeEventEmitter.addListener(
      'didReportReaderEvent',
      ({ event, info }) => {
        this.connection = {
          ...this.connection,
          reader: { ...this.connection.reader, isCardInserted: !event },
        };
      }
    );
    */
    nativeEventEmitter.addListener(
      'didReportBatteryLevel',
      ({ batteryLevel, isCharging }) => {
        this.connection = {
          ...this.connection,
          reader: {
            ...this.connection.reader,
            batteryLevel,
            isCharging: !!isCharging,
          },
        };
      }
    );
    nativeEventEmitter.addListener(
      'didReportUnexpectedReaderDisconnect',
      () => {
        this.connection = {
          ...this.connection,
          status: ConnectionStatus.NOT_CONNECTED,
        };
      }
    );
    nativeEventEmitter.addListener('readersDiscovered', (readers) => {
      this.connection = {
        ...this.connection,
        readers: readers.map(stringifyReaderEnums),
      };
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
        this.logLevel && console.log('readerDiscoveryCompletion', res);
        this.connection = {
          ...this.connection,
          status: ConnectionStatus.NOT_CONNECTED,
          discoveryError: res.error,
        };
      } else {
        this.logLevel && console.log('readerDiscoveryCompletion', res);
      }
    });
    nativeEventEmitter.addListener('readerConnection', (reader) => {
      if (reader.error) {
        this.connection = {
          ...this.connection,
          connectionError: reader.error,
          status: ConnectionStatus.ERROR,
        };
      } else {
        this.connection = {
          ...this.connection,
          status: ConnectionStatus.CONNECTED,
          reader: stringifyReaderEnums(reader),
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
      const parsed = Object.fromEntries(
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
      );
      if (
        parsed.bb_check_card_result === 'BBDeviceCheckCardResult_InsertedCard'
      ) {
        this.connection = {
          ...this.connection,
          reader: { ...this.connection.reader, isCardInserted: true },
        };
      }
      if (parsed.bb_check_card_result === 'BBDeviceCheckCardResult_NoCard') {
        this.connection = {
          ...this.connection,
          reader: { ...this.connection.reader, isCardInserted: false },
        };
      }
      this.logLevel && console.log('StripeTerminal', parsed);
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
        this.logLevel && console.log('didRequestReaderDisplayMessage', text);
        this.payment = { ...this.payment, displayMessage: text };
      }
    );
    nativeEventEmitter.addListener('didRequestReaderInput', ({ text }) => {
      this.logLevel && console.log('didRequestReaderInput', text);
      this.payment = { ...this.payment, inputRequest: text };
    });
    nativeEventEmitter.addListener('didChangePaymentStatus', (...args) => {
      this.logLevel && console.log('didChangePaymentStatus', args);
    });
    const currentState = await RNStripeTerminal.initialize();
    this.connection = {
      ...this.connection,
      status: ConnectionStatus.fromSCPConnectionStatus(
        currentState.connectionStatus
      ),
      reader: stringifyReaderEnums(currentState.reader),
    };
    this.payment = {
      ...this.payment,
      status: PaymentStatus.fromSCPPaymentStatus(currentState.paymentStatus),
    };
    this._resolveInit();
  }
  async discoverReaders(discoveryMethod, simulated) {
    return this._queue.add(async () => {
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
    });
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
    return this._queue.add(async () => {
      this.connection = {
        ...this.connection,
        connectionError: null,
        status: ConnectionStatus.CONNECTING,
        reader: this.connection.readers.find(
          (r) => r.serialNumber === serialNumber
        ),
      };
      return RNStripeTerminal.connectReader(serialNumber, locationId);
    });
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
    return this._queue.add(async () => {
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
    });
  }

  async collectPaymentMethod({ paymentIntent }) {
    if (!paymentIntent) {
      throw 'You must provide a paymentIntent to collectPaymentMethod.';
    }
    return this._queue.add(async () => {
      this._abort = this.abortCollectPaymentMethod.bind(this);
      this.payment = {
        ...this.payment,
        status: PaymentStatus.WAITING_FOR_INPUT,
      };
      const paymentMethod = await RNStripeTerminal.collectPaymentMethod(
        paymentIntent
      ).catch(async (e) => {
        if (
          e.message ===
          'Could not execute collectPaymentMethod because the SDK is busy with another command: collectPaymentMethod.'
        ) {
          await this.abortCollectPaymentMethod();
          return this.collectPaymentMethod({ paymentIntent });
        } else if (e.message === 'The command was canceled.') {
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
    });
  }

  abortingCollectPaymentMethod = false;
  async abortCollectPaymentMethod() {
    this.abortingCollectPaymentMethod =
      RNStripeTerminal.abortCollectPaymentMethod()
        .then(() => {
          this.payment = { ...this.payment, status: PaymentStatus.READY };
        })
        .finally(() => {
          this.abortingCollectPaymentMethod = null;
        });
    return this.abortingCollectPaymentMethod;
  }

  async getCurrentState() {
    return this._queue.add(async () => RNStripeTerminal.getCurrentState());
  }

  async retrievePaymentIntent(clientSecret) {
    const fn = async () =>
      RNStripeTerminal.retrievePaymentIntent(clientSecret).catch(async (e) => {
        if (
          e.message ===
          'Could not execute retrievePaymentIntent because the SDK is busy with another command: collectPaymentMethod.'
        ) {
          await this.abortCollectPaymentMethod();
          return this.retrievePaymentIntent(clientSecret);
        } else {
          throw e;
        }
      });
    return this._queue.add(fn);
  }

  async processPayment({ paymentIntent }) {
    if (!paymentIntent) {
      throw 'You must provide a paymentIntent to processPayment.';
    }
    const fn = async () => {
      this.payment = { ...this.payment, status: PaymentStatus.PROCESSING };
      return RNStripeTerminal.processPayment(paymentIntent)
        .then((pi) => {
          this.payment = {
            ...this.payment,
            payment: pi,
            status: PaymentStatus.READY,
          };
          return pi;
        })
        .catch((e) => {
          this.payment = { ...this.payment, status: PaymentStatus.READY };
          throw e;
        });
    };
    return this._queue.add(fn);
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
    return this._queue.add(async () => RNStripeTerminal.setSimulatedCard(type));
  }
  async abortCurrentOperation() {
    return this._abort();
  }
}

const instance = new StripeTerminal();
Object.assign(instance, constants);
export { instance as StripeTerminal };
