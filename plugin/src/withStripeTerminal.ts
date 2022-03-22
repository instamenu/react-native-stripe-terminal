import { ConfigPlugin, createRunOncePlugin } from '@expo/config-plugins';
// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-unsafe-assignment
const pkg = require('../../package.json');

const BLUETOOTH_ALWAYS_PERMISSION =
  '$(PRODUCT_NAME) uses Bluetooth to connect to supported card readers';
const BLUETOOTH_PERIPHERAL_PERMISSION =
  'Bluetooth access is required in order to connect to supported bluetooth card readers';
const LOCATION_PERMISSION =
  'Location access is required in order to accept payments';

type Props = {
  bluetoothAlwaysPermissionText?: string;
  bluetoothPeripheralPermissionText?: string;
  locationPermissionText?: string;
};

const withStripeTerminal: ConfigPlugin<Props> = (config, props = {}) => {
  if (config.ios == null) config.ios = {};
  if (config.ios.infoPlist == null) config.ios.infoPlist = {};

  config.ios.infoPlist.NSBluetoothPeripheralUsageDescription =
    props.bluetoothPeripheralPermissionText ??
    (config.ios.infoPlist.NSBluetoothPeripheralUsageDescription as
      | string
      | undefined) ??
    BLUETOOTH_PERIPHERAL_PERMISSION;

  config.ios.infoPlist.NSBluetoothAlwaysUsageDescription =
    props.bluetoothAlwaysPermissionText ??
    (config.ios.infoPlist.NSBluetoothAlwaysUsageDescription as
      | string
      | undefined) ??
    BLUETOOTH_ALWAYS_PERMISSION;

  config.ios.infoPlist.NSLocationWhenInUseUsageDescription =
    props.locationPermissionText ??
    (config.ios.infoPlist.NSLocationWhenInUseUsageDescription as
      | string
      | undefined) ??
    LOCATION_PERMISSION;

  if (config.ios.infoPlist.UIBackgroundModes == null)
    config.ios.infoPlist.UIBackgroundModes = [];
  if (
    config.ios.infoPlist.UIBackgroundModes.indexOf('bluetooth-central') === -1
  )
    config.ios.infoPlist.UIBackgroundModes.push('bluetooth-central');

  return config;
};

export default createRunOncePlugin(withStripeTerminal, pkg.name, pkg.version);
