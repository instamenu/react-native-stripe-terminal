import React, {useCallback, useEffect} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import StripeTerminal from 'react-native-stripe-terminal';
import {useStripeTerminalConnection} from 'react-native-stripe-terminal/hooks';

const locationId = 'tml_EhN5g36SNpnQLF';

export default function App() {
  const connection = useStripeTerminalConnection();
  useEffect(() => {
    StripeTerminal.initialize({
      fetchConnectionToken: () => {
        return fetch(
          'https://instamenu-api-staging.herokuapp.com/connection_tokens',
          {method: 'POST'},
        )
          .then(resp => resp.json())
          .then(json => json.secret);
      },
    });
  }, []);

  const discoverReaders = useCallback(() => {
    StripeTerminal.discoverReaders(
      StripeTerminal.DiscoveryMethodBluetoothScan,
      0,
    );
  }, []);

  const abortDiscoverReaders = useCallback(() => {
    StripeTerminal.abortDiscoverReaders();
  }, []);

  const connectReader = useCallback(() => {
    StripeTerminal.connectReader(
      connection.readers[0].serialNumber,
      locationId,
    );
  }, [connection.readers]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>RNStripeTerminal Example</Text>
      <View style={styles.buttons}>
        {connection.status === 'DISCOVERING' ? (
          <Pressable style={styles.button} onPress={abortDiscoverReaders}>
            <Text style={styles.buttonLabel}>Stop discovering readers</Text>
          </Pressable>
        ) : (
          <Pressable style={styles.button} onPress={discoverReaders}>
            <Text style={styles.buttonLabel}>Discover readers</Text>
          </Pressable>
        )}
        {connection.readers.length > 0 ? (
          <Pressable style={styles.button} onPress={connectReader}>
            <Text style={styles.buttonLabel}>Connect</Text>
          </Pressable>
        ) : null}
      </View>
      <Text>{JSON.stringify(connection, null, 2)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 32,
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
