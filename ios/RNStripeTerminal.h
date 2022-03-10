// RNStripeTerminal.h

#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>
#import <StripeTerminal/StripeTerminal.h>

@interface NiceEventEmitter : RCTEventEmitter <RCTBridgeModule>

@end

@interface ConnectionTokenProvider : NSObject <SCPConnectionTokenProvider>
    @property NiceEventEmitter *eventDelegate;
@end

@interface RNStripeTerminal : NiceEventEmitter <RCTInvalidating, SCPDiscoveryDelegate, SCPBluetoothReaderDelegate, SCPTerminalDelegate>

@end

// @interface RNStripeTerminalFactory <RCTBridgeDelegate>

// @end