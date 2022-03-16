import React, {useCallback, useEffect} from 'react';
import {ScrollView, Pressable, StyleSheet, Text, View} from 'react-native';
import {
  StripeTerminal,
  useStripeTerminalConnection,
  useStripeTerminalPayment,
} from 'react-native-stripe-terminal';

const locationId = 'tml_***';
const connectionTokenUrl = 'https://***/connection_tokens';

export default function App() {
  const connection = useStripeTerminalConnection();
  const payment = useStripeTerminalPayment();
  useEffect(() => {
    StripeTerminal.initialize({
      fetchConnectionToken: () => {
        return fetch(
          connectionTokenUrl,
          {method: 'POST'},
        )
          .then(resp => resp.json())
          .then(json => json.secret);
      },
    }).then(currentState => {
      console.info(currentState);
    });
  }, []);

  const discoverReaders = useCallback(() => {
    StripeTerminal.discoverReaders(
      StripeTerminal.DiscoveryMethodBluetoothScan,
      0,
    );
  }, []);

  const discoverSimulators = useCallback(() => {
    StripeTerminal.discoverReaders(
      StripeTerminal.DiscoveryMethodBluetoothScan,
      1,
    );
  }, []);

  const abortDiscoverReaders = useCallback(() => {
    StripeTerminal.abortDiscoverReaders();
  }, []);

  const connectReader = useCallback(() => {
    console.log('connectreader js');
    StripeTerminal.connectReader(
      connection.readers[0].serialNumber,
      locationId,
    );
  }, [connection.readers]);

  const disconnectReader = useCallback(() => {
    StripeTerminal.disconnectReader();
  }, []);

  const createPaymentIntent = useCallback(() => {
    StripeTerminal.createPaymentIntent({amount: 1000, currency: 'usd'});
  }, []);

  const collectPaymentMethod = useCallback(() => {
    StripeTerminal.collectPaymentMethod({paymentIntent: payment.paymentIntent});
  }, [payment.paymentIntent]);

  const abortCollectPaymentMethod = useCallback(() => {
    StripeTerminal.abortCollectPaymentMethod();
  }, []);

  const processPayment = useCallback(() => {
    StripeTerminal.processPayment({paymentIntent: payment.paymentMethod});
  }, [payment.paymentMethod]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>RNStripeTerminal Example</Text>
      <View style={styles.buttons}>
        {connection.status === 'DISCOVERING' ? (
          <Pressable style={styles.button} onPress={abortDiscoverReaders}>
            <Text style={styles.buttonLabel}>Stop discovering readers</Text>
          </Pressable>
        ) : null}
        {connection.status === 'NOT_CONNECTED' ? (
          <View>
            <Pressable style={styles.button} onPress={discoverReaders}>
              <Text style={styles.buttonLabel}>Discover readers</Text>
            </Pressable>
            <Pressable style={styles.button} onPress={discoverSimulators}>
              <Text style={styles.buttonLabel}>Discover simulators</Text>
            </Pressable>
          </View>
        ) : null}
        {connection.readers.length > 0 &&
        connection.status === 'DISCOVERING' ? (
          <Pressable style={styles.button} onPress={connectReader}>
            <Text style={styles.buttonLabel}>Connect</Text>
          </Pressable>
        ) : null}
        {connection.reader ? (
          <Pressable style={styles.button} onPress={disconnectReader}>
            <Text style={styles.buttonLabel}>Disconnect</Text>
          </Pressable>
        ) : null}
        {connection.reader ? (
          <Pressable style={styles.button} onPress={createPaymentIntent}>
            <Text style={styles.buttonLabel}>Create payment intent</Text>
          </Pressable>
        ) : null}
        {payment.paymentIntent &&
        !payment.paymentMethod &&
        payment.status !== 'COLLECTING_PAYMENT_METHOD' ? (
          <Pressable style={styles.button} onPress={collectPaymentMethod}>
            <Text style={styles.buttonLabel}>Collect payment method</Text>
          </Pressable>
        ) : null}
        {payment.status === 'COLLECTING_PAYMENT_METHOD' ? (
          <Pressable style={styles.button} onPress={abortCollectPaymentMethod}>
            <Text style={styles.buttonLabel}>
              Cancel collecting payment method
            </Text>
          </Pressable>
        ) : null}
        {payment.paymentMethod && !payment.payment ? (
          <Pressable style={styles.button} onPress={processPayment}>
            <Text style={styles.buttonLabel}>Process payment</Text>
          </Pressable>
        ) : null}
      </View>
      <ScrollView>
        <Text style={styles.state}>{JSON.stringify(connection, null, 2)}</Text>
        <Text style={styles.state}>{JSON.stringify(payment, null, 2)}</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 32,
  },
  state: {
    fontSize: 7,
  },
  title: {
    fontSize: 20,
    marginBottom: 32,
  },
  button: {
    backgroundColor: 'blue',
    marginVertical: 8,
    maxWidth: 400,
    padding: 16,
  },
  buttonLabel: {
    color: '#FFFFFF',
    fontWeight: '500',
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  buttons: {
    marginBottom: 32,
  },
});
