import StripeTerminal from "./index";
import { useEffect, useState } from "react";

export function useStripeTerminalConnection() {
  const [state, setState] = useState({ readers: [] });
  useEffect(() => {
    const subscriptions = [
      StripeTerminal.addListener("abortDiscoverReadersCompletion", (...a) => {
        console.log("abortDiscoverReadersCompletion", a);
      }),
      StripeTerminal.addListener("didFinishInstallingUpdate", (...a) => {
        console.log("didFinishInstallingUpdate", a);
      }),
      StripeTerminal.addListener("didReportAvailableUpdate", (...a) => {
        console.log("didReportAvailableUpdate", a);
      }),
      StripeTerminal.addListener("didReportLowBatteryWarning", (...a) => {
        console.log("didReportLowBatteryWarning", a);
      }),
      StripeTerminal.addListener("didReportReaderEvent", (...a) => {
        console.log("didReportReaderEvent", a);
      }),
      StripeTerminal.addListener(
        "didReportReaderSoftwareUpdateProgress",
        (...a) => {
          console.log("didReportReaderSoftwareUpdateProgress", a);
        }
      ),
      StripeTerminal.addListener("didRequestReaderDisplayMessage", (...a) => {
        console.log("didRequestReaderDisplayMessage", a);
      }),
      StripeTerminal.addListener("didRequestReaderInput", (...a) => {
        console.log("didRequestReaderInput", a);
      }),
      StripeTerminal.addListener("didStartInstallingUpdate", (...a) => {
        console.log("didStartInstallingUpdate", a);
      }),
      StripeTerminal.addListener("readerConnection", (reader) => {
        setState((prev) => ({
          ...prev,
          reader,
        }));
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
      StripeTerminal.addListener("readersDiscovered", (readers) => {
        setState((prev) => ({ ...prev, readers }));
      }),
    ];
    StripeTerminal.on("statusChange", (status) => {
      setState((prev) => ({
        ...prev,
        status,
        readers: status === "DISCOVERING" ? prev.readers : [],
      }));
    });
    return () => subscriptions.forEach((subscription) => subscription.remove());
  }, []);
  return state;
}
