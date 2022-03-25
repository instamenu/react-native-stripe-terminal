import { StripeTerminal } from './StripeTerminal';
import { useEffect, useState } from 'react';

export function useStripeTerminalConnection() {
  const [state, setState] = useState(StripeTerminal.connection);
  useEffect(() => {
    StripeTerminal.on('connectionChange', setState);
    return () => {
      StripeTerminal.off('connectionChange', setState);
    };
  }, []);
  return state;
}

export function useStripeTerminalPayment() {
  const [state, setState] = useState(StripeTerminal.payment);
  useEffect(() => {
    StripeTerminal.on('paymentChange', setState);
    return () => {
      StripeTerminal.off('paymentChange', setState);
    };
  }, []);
  return state;
}
