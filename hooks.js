import StripeTerminal from "./index";
import { useEffect, useState } from "react";

export function useStripeTerminalConnection() {
  const [state, setState] = useState({ status: "NOT_CONNECTED", readers: [] });
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

      StripeTerminal.addListener("didRequestReaderDisplayMessage", (...a) => {
        console.log("didRequestReaderDisplayMessage", a);
      }),
      StripeTerminal.addListener("didRequestReaderInput", (...a) => {
        console.log("didRequestReaderInput", a);
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
    StripeTerminal.on("stateChange", setState);
    return () => {
      StripeTerminal.off("stateChange", setState);
      subscriptions.forEach((subscription) => subscription.remove());
    };
  }, []);
  return state;
}
