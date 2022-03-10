import { StripeTerminal } from "./StripeTerminal";
import { useEffect, useState } from "react";

export function useStripeTerminalConnection() {
  const [state, setState] = useState(StripeTerminal.connection);
  useEffect(() => {
    const subscriptions = [
      // StripeTerminal.addListener("abortDiscoverReadersCompletion", (...a) => {
      //   console.log("abortDiscoverReadersCompletion", a);
      // }),
      StripeTerminal.addListener("didFinishInstallingUpdate", (...a) => {
        console.log("didFinishInstallingUpdate", a);
      }),
      StripeTerminal.addListener("didReportAvailableUpdate", (...a) => {
        console.log("didReportAvailableUpdate", a);
      }),
      StripeTerminal.addListener("didReportBatteryLevel", (...a) => {
        console.log("didReportBatteryLevel", a);
      }),
      StripeTerminal.addListener("didReportLowBatteryWarning", (...a) => {
        console.log("didReportLowBatteryWarning", a);
      }),
      StripeTerminal.addListener("didReportReaderEvent", (...a) => {
        console.log("didReportReaderEvent", a);
      }),
      StripeTerminal.addListener("readersDiscovered", (...a) => {
        console.log("readersDiscovered", a);
      }),
      StripeTerminal.addListener("readerDiscoveryCompletion", (...a) => {
        console.log("readerDiscoveryCompletion", a);
      }),
      StripeTerminal.addListener("requestConnectionToken", (...a) => {
        console.log("requestConnectionToken", a);
      }),
    ];
    StripeTerminal.on("connectionChange", setState);
    return () => {
      StripeTerminal.off("connectionChange", setState);
      subscriptions.forEach((subscription) => subscription.remove());
    };
  }, []);
  return state;
}

export function useStripeTerminalPayment() {
  const [state, setState] = useState(StripeTerminal.payment);
  useEffect(() => {
    StripeTerminal.on("paymentChange", setState);
    return () => {
      StripeTerminal.off("paymentChange", setState);
    };
  }, []);
  return state;
}
