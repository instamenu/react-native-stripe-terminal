// RNStripeTerminal.m

#import "RNStripeTerminal.h"
#import <React/RCTLog.h>
#import <React/RCTConvert.h>

@interface NSArray (Map)

- (NSArray *)mapObjectsUsingBlock:(id (^)(id obj, NSUInteger idx))block;

@end

@implementation NSArray (Map)

- (NSArray *)mapObjectsUsingBlock:(id (^)(id obj, NSUInteger idx))block {
    NSMutableArray *result = [NSMutableArray arrayWithCapacity:[self count]];
    [self enumerateObjectsUsingBlock:^(id obj, NSUInteger idx, BOOL *stop) {
        [result addObject:block(obj, idx)];
    }];
    return result;
}

@end

@implementation NiceEventEmitter
{
  bool hasListeners;
}

// called when this module's first listener is added.
-(void)startObserving {
    hasListeners = YES;
}

// called when this module's last listener is removed, or on dealloc.
-(void)stopObserving {
    hasListeners = NO;
}

-(void)sendEventWithName:(NSString *)name body:(NSObject *)body {
  if (hasListeners) { // only send events if anyone is listening
    [super sendEventWithName:name body:body];
  }
}

- (NSArray<NSString *> *)supportedEvents {
    return @[];
}

@end

@implementation ConnectionTokenProvider

// todo: shouldnt be static
static SCPConnectionTokenCompletionBlock pendingConnectionTokenCompletionBlock = nil;

- (void)fetchConnectionToken:(SCPConnectionTokenCompletionBlock)completion {
    RCTLogInfo(@"NATIVE: fetchConnectionToken");
    pendingConnectionTokenCompletionBlock = completion;
    [[self eventDelegate] sendEventWithName:@"requestConnectionToken" body:@{}];
}

- (void)setConnectionToken:(NSString *)token error:(NSString *)errorMessage {
    RCTLogInfo(@"NATIVE: setConnectionToken");
    if (pendingConnectionTokenCompletionBlock) {
        if ([errorMessage length] != 0) {
            NSError* error = [NSError errorWithDomain:@"com.stripe-terminal.rn" code:1 userInfo:[NSDictionary dictionaryWithObject:errorMessage forKey:NSLocalizedDescriptionKey]];
            pendingConnectionTokenCompletionBlock(nil, error);
        } else {
            pendingConnectionTokenCompletionBlock(token, nil);
        }
        pendingConnectionTokenCompletionBlock = nil;
    }
}

@end

@implementation RNStripeTerminal

static dispatch_once_t onceToken = 0;
static ConnectionTokenProvider *connectionTokenProvider =  nil;
static SCPCancelable *pendingDiscoverReaders = nil;
// static SCPCancelable *pendingDiscoverReaders = nil;
static NSArray<SCPReader *> *readers;
static SCPReader *reader;
static SCPReaderSoftwareUpdate *readerSoftwareUpdate;
static SCPCancelable *pendingInstallUpdate;
static SCPCancelable *pendingCollectPaymentMethod;

RCT_EXPORT_MODULE()

// https://reactnative.dev/docs/native-modules-ios#exporting-constants
+ (BOOL)requiresMainQueueSetup
{
    return YES;
}

- (dispatch_queue_t)methodQueue
{
    return dispatch_get_main_queue();
}

- (NSDictionary *)constantsToExport
{
    return @{
        @"ConnectionStatusConnected": @(SCPConnectionStatusConnected),
        @"ConnectionStatusConnecting": @(SCPConnectionStatusConnecting),
        @"ConnectionStatusNotConnected": @(SCPConnectionStatusNotConnected),
        @"DeviceTypeChipper2X": @(SCPDeviceTypeChipper2X),
        @"DiscoveryMethodBluetoothProximity": @(SCPDiscoveryMethodBluetoothProximity),
        @"DiscoveryMethodBluetoothScan": @(SCPDiscoveryMethodBluetoothScan),
        @"PaymentIntentStatusCanceled": @(SCPPaymentIntentStatusCanceled),
        @"PaymentIntentStatusRequiresCapture": @(SCPPaymentIntentStatusRequiresCapture),
        @"PaymentIntentStatusRequiresConfirmation": @(SCPPaymentIntentStatusRequiresConfirmation),
        @"PaymentIntentStatusRequiresPaymentMethod": @(SCPPaymentIntentStatusRequiresPaymentMethod),
        @"PaymentIntentStatusSucceeded": @(SCPPaymentIntentStatusSucceeded),
        @"PaymentStatusNotReady": @(SCPPaymentStatusNotReady),
        @"PaymentStatusProcessing": @(SCPPaymentStatusProcessing),
        @"PaymentStatusReady": @(SCPPaymentStatusReady),
        @"PaymentStatusWaitingForInput": @(SCPPaymentStatusWaitingForInput),
        @"ReaderEventCardInserted": @(SCPReaderEventCardInserted),
        @"ReaderEventCardRemoved": @(SCPReaderEventCardRemoved),
    };
}

- (NSArray<NSString *> *)supportedEvents {
    return @[
        // @"abortCreatePaymentCompletion",
        // @"abortDiscoverReadersCompletion",
        // @"abortInstallUpdateCompletion"
        // @"connectedReader",
        @"connectionStatus",
        @"didChangeConnectionStatus",
        @"didChangePaymentStatus",
        // @"didDisconnectUnexpectedlyFromReader",
        @"didFinishInstallingUpdate",
        @"didReportAvailableUpdate",
        @"didReportBatteryLevel",
        @"didReportLowBatteryWarning",
        @"didReportReaderEvent",
        @"didReportReaderSoftwareUpdateProgress",
        @"didReportUnexpectedReaderDisconnect",
        @"didRequestReaderDisplayMessage",
        @"didRequestReaderInput",
        @"didStartInstallingUpdate",
        // @"lastReaderEvent",
        // @"log",
        // @"paymentCreation",
        // @"paymentIntentCancel",
        // @"paymentIntentCreation",
        // @"paymentIntentRetrieval",
        // @"paymentMethodCollection",
        // @"paymentProcess",
        // @"paymentStatus",
        @"readerConnection",
        @"readerDisconnectCompletion",
        @"readersDiscovered",
        @"readerDiscoveryCompletion",
        @"requestConnectionToken",
    ];
}

- (void)invalidate {
    [super invalidate];
    RCTLogInfo(@"INVALIDATE!");
    [self abortDiscoverReaders];
    [self abortInstallUpdate];
    [self disconnectReader];
}

- (id)init {
    RCTLogInfo(@"INIT!");
    if(self = [super init]){
        // empty
    }
    return self;
}

RCT_EXPORT_METHOD(setConnectionToken:(NSString *)token error:(NSString *)errorMessage) {
    [connectionTokenProvider setConnectionToken:token error:errorMessage];
}

// RCT_EXPORT_METHOD() {
RCT_EXPORT_METHOD(initialize:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
    // [self sendEventWithName:@"log" body:@"initializeTerminal on native side"];
    // static initialized = false;
    RCTLogInfo(@"INITIALIZE!");
    // if(initialized){
    //     return;
    // }

    dispatch_once(&onceToken, ^{
        RCTLogInfo(@"INSIDE RUN ONCE!");
        connectionTokenProvider = [[ConnectionTokenProvider alloc] init];
        [connectionTokenProvider setEventDelegate:self];
        [SCPTerminal setTokenProvider:connectionTokenProvider];
    });

    [connectionTokenProvider setEventDelegate:self];
    // [tokenProvider setEventEmitter:self];
    // initialized = true;
    
    //   if (hasListeners) { // Only send events if anyone is listening
    resolve([self getInternalState]);
    // fetchConnectionToken(@[@"12345678"]);
    // [self sendEventWithName:@"requestConnectionToken" body:@{@"name": "abcdefg"}];
//   }
}

// RCT_EXPORT_METHOD(fakeFunction)
// {
// [tokenProvider fakeFetchConnectionToken];
// }

// RCT_EXPORT_METHOD(sampleMethod:(NSString *)stringArgument numberParameter:(nonnull NSNumber *)numberArgument callback:(RCTResponseSenderBlock)callback)
// {
//     // TODO: Implement some actually useful functionality
//     callback(@[[NSString stringWithFormat: @"numberArgument: %@ stringArgument: %@", numberArgument, stringArgument]]);
// }

RCT_EXPORT_METHOD(discoverReaders:(NSInteger *)discoveryMethod simulated:(BOOL *)simulated) {
    RCTLogInfo(@"NATIVE: discoverReaders");
    if(!pendingDiscoverReaders){
        SCPDiscoveryConfiguration *config = [[SCPDiscoveryConfiguration alloc] initWithDiscoveryMethod:discoveryMethod simulated:simulated];
        pendingDiscoverReaders = [[SCPTerminal shared] discoverReaders:config delegate:self completion:^(NSError *error) {
            if (error) {
                [self sendEventWithName:@"readerDiscoveryCompletion" body:@{@"error": [error localizedDescription]}];
            } else {
                [self sendEventWithName:@"readerDiscoveryCompletion" body:@{}];
            }
            pendingDiscoverReaders = nil;
        }];
    }
}



- (void)abortDiscoverReaders {
    RCTLogInfo(@"NATIVE: abortDiscoverReaders");
    if (pendingDiscoverReaders && !pendingDiscoverReaders.completed) {
        [pendingDiscoverReaders cancel:^(NSError * _Nullable error) {
            if (error) {
            } else {
                pendingDiscoverReaders = nil;
            }
        }];
        return;
    }
}

RCT_EXPORT_METHOD(abortDiscoverReaders:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
    RCTLogInfo(@"NATIVE: abortDiscoverReaders");
    if (pendingDiscoverReaders && !pendingDiscoverReaders.completed) {
        // [self sendEventWithName:@"log" body:@"inside if statement in abortDiscoverReaders"];
        [pendingDiscoverReaders cancel:^(NSError * _Nullable error) {
            if (error) {
                reject(@"abortDiscoverReadersFailure", [error localizedDescription], error);
                // [self sendEventWithName:@"abortDiscoverReadersCompletion" body:@{@"error": [error localizedDescription]}];
            } else {
                resolve(@{});
                pendingDiscoverReaders = nil;
                // [self sendEventWithName:@"abortDiscoverReadersCompletion" body:@{}];
            }
        }];
        return;
    }
    resolve(@{});
    // [self sendEventWithName:@"abortDiscoverReadersCompletion" body:@{}];
}

// SCPDiscoveryDelegate protocol
- (void)terminal:(SCPTerminal *)terminal didUpdateDiscoveredReaders:(NSArray<SCPReader *>*)_readers {
    RCTLogInfo(@"NATIVE: terminal:didUpdateDiscoveredReaders");
    readers = _readers;

    NSMutableArray *data = [NSMutableArray arrayWithCapacity:[readers count]];
    [readers enumerateObjectsUsingBlock:^(SCPReader *reader, NSUInteger idx, BOOL *stop) {
        [data addObject:[self serializeReader:reader]];
    }];

    [self sendEventWithName:@"readersDiscovered" body:data];
}

- (NSDictionary *)serializeReader:(SCPReader *)reader {
    if(!reader) return [NSNull null];
    return @{
        // All Readers
        @"deviceType": @(reader.deviceType), // enum
        // @"location": reader.location ? reader.location : nil, // todo https://stripe.dev/stripe-terminal-ios/docs/Classes/SCPLocation.html
        @"locationId": reader.locationId ? reader.locationId : @"", // nullable string
        @"locationStatus": @(reader.locationStatus), // enum
        @"serialNumber": reader.serialNumber ? reader.serialNumber : @"",
        @"simulated": @(reader.simulated), // bool
        @"stripeId": reader.stripeId ? reader.stripeId : @"", // nullable string

        // Bluetooth Reader Properties
        @"availableUpdate": reader.availableUpdate ? [self serializeUpdate:reader.availableUpdate] : @{},
        @"batteryLevel": reader.batteryLevel ? reader.batteryLevel : @(0),
        @"batteryStatus": @(reader.batteryStatus),
        @"deviceSoftwareVersion": reader.deviceSoftwareVersion ? reader.deviceSoftwareVersion : @"",
        @"isCharging": reader.isCharging ? reader.isCharging : @(0),

        // Internet Reader Properties
        @"ipAddress": reader.ipAddress ? reader.ipAddress : @"",
        @"label": reader.label ? reader.label : @"",
        @"status": @(reader.status),
    };
}

- (NSDictionary *)serializeUpdate:(SCPReaderSoftwareUpdate *)update {
    NSDictionary *updateDict = @{};
    if(update){
        NSDateFormatter *formatter = [[NSDateFormatter alloc] init];
        [formatter setDateFormat:@"yyyy-MM-dd'T'HH:mm:ssZZZZ"];
        NSString *requiredAt = [formatter stringFromDate:update.requiredAt];

        updateDict = @{
            @"estimatedUpdateTime": [SCPReaderSoftwareUpdate stringFromUpdateTimeEstimate:update.estimatedUpdateTime],
            @"deviceSoftwareVersion": update.deviceSoftwareVersion ? update.deviceSoftwareVersion : @"",
            @"requiredAt": requiredAt,
        };
    }
    return updateDict;
}

RCT_EXPORT_METHOD(connectReader:(NSString *)serialNumber location:(NSString *)locationId ) {
    RCTLogInfo(@"NATIVE: connectReader");
    unsigned long readerIndex = [readers indexOfObjectPassingTest:^(SCPReader *reader, NSUInteger idx, BOOL *stop) {
        return [reader.serialNumber isEqualToString:serialNumber];
    }];

    SCPTerminal.shared.simulatorConfiguration.availableReaderUpdate = SCPSimulateReaderUpdateRandom;
    SCPBluetoothConnectionConfiguration *connectionConfig = [[SCPBluetoothConnectionConfiguration alloc] initWithLocationId:locationId];
    [SCPTerminal.shared connectBluetoothReader:readers[readerIndex] delegate: self connectionConfig: connectionConfig completion:^(SCPReader * _Nullable reader_, NSError * _Nullable error) {
        reader = reader_;
        if (error) {
            [self sendEventWithName:@"readerConnection" body:@{@"error": [error localizedDescription]}];
        } else {
            [self sendEventWithName:@"readerConnection" body:[self serializeReader:reader]];
        }
    }];
}

// SCPBluetoothReaderDelegate protocol
- (void)reader:(nonnull SCPReader *)reader didReportAvailableUpdate:(nonnull SCPReaderSoftwareUpdate *)update {
    RCTLogInfo(@"NATIVE: reader:didReportAvailableUpdate");
    readerSoftwareUpdate = update;
   [self sendEventWithName:@"didReportAvailableUpdate" body:[self serializeUpdate:update]];
}

// SCPBluetoothReaderDelegate protocol
- (void)reader:(nonnull SCPReader *)reader didStartInstallingUpdate:(nonnull SCPReaderSoftwareUpdate *)update cancelable:(nullable SCPCancelable *)cancelable {
    RCTLogInfo(@"NATIVE: reader:didStartInstallingUpdate");
    readerSoftwareUpdate = update;
    pendingInstallUpdate = cancelable;
    [self sendEventWithName:@"didStartInstallingUpdate" body:update ? [self serializeUpdate:update] : @{}];
}

// SCPBluetoothReaderDelegate protocol
- (void)reader:(nonnull SCPReader *)reader didReportReaderSoftwareUpdateProgress:(float)progress {
    RCTLogInfo(@"NATIVE: reader:didReportReaderSoftwareUpdateProgress");
   [self sendEventWithName:@"didReportReaderSoftwareUpdateProgress" body:@(progress)];
}

// SCPBluetoothReaderDelegate protocol
- (void)reader:(nonnull SCPReader *)reader didFinishInstallingUpdate:(nullable SCPReaderSoftwareUpdate *)update error:(nullable NSError *)error {
    RCTLogInfo(@"NATIVE: reader:didFinishInstallingUpdate");
    if (error) {
        [self sendEventWithName:@"didFinishInstallingUpdate" body:@{@"error": [error localizedDescription]}];
    } else {
        pendingInstallUpdate = nil;
        readerSoftwareUpdate = nil;
        [self sendEventWithName:@"didFinishInstallingUpdate" body:update ? [self serializeUpdate:update] : @{}];
    }
}
// SCPBluetoothReaderDelegate protocol
- (void)reader:(nonnull SCPReader *)reader didRequestReaderInput:(SCPReaderInputOptions)inputOptions {
    RCTLogInfo(@"NATIVE: reader:didRequestReaderInput");
    [self sendEventWithName:@"didRequestReaderInput" body: @{ @"text": [SCPTerminal stringFromReaderInputOptions:inputOptions] }];
}
// SCPBluetoothReaderDelegate protocol
- (void)reader:(nonnull SCPReader *)reader didRequestReaderDisplayMessage:(SCPReaderDisplayMessage)displayMessage {
    RCTLogInfo(@"NATIVE: reader:didRequestReaderDisplayMessage");
    [self sendEventWithName:@"didRequestReaderDisplayMessage" body: @{
        @"text": [SCPTerminal stringFromReaderDisplayMessage:displayMessage]
    }];
}
// SCPBluetoothReaderDelegate protocol
- (void)terminal:(SCPTerminal *)terminal didReportReaderEvent:(SCPReaderEvent)event info:(NSDictionary *)info {
    RCTLogInfo(@"NATIVE: terminal:didReportReaderEvent");
    [self sendEventWithName:@"didReportReaderEvent" body: @{
        @"event": @(event),
        @"info": info ? info : @{}
    }];
}

// SCPBluetoothReaderDelegate protocol
- (void)reader:(nonnull SCPReader *)reader didReportBatteryLevel:(float)batteryLevel status:(SCPBatteryStatus)status isCharging:(BOOL)isCharging {
    RCTLogInfo(@"NATIVE: reader:didReportBatteryLevel");
    [self sendEventWithName:@"didReportBatteryLevel" body: @{
        @"batteryLevel": @(batteryLevel),//[NSNumber numberWithFloat:batteryLevel],
        @"status": @(status),
        @"isCharging": @(isCharging),
    }];
}

// SCPBluetoothReaderDelegate protocol
- (void)terminal:(SCPTerminal *)terminal didReportLowBatteryWarning:(SCPTerminal *)terminal_ {
    RCTLogInfo(@"NATIVE: terminal:didReportLowBatteryWarning");
    [self sendEventWithName:@"didReportLowBatteryWarning" body:@{}];
}

RCT_EXPORT_METHOD(disconnectReader) {
    RCTLogInfo(@"NATIVE: disconnectReader");
    if (!SCPTerminal.shared.connectedReader) {
        // No reader connected => "success"
        [self sendEventWithName:@"readerDisconnectCompletion" body:@{}];
        return;
    }

    [SCPTerminal.shared disconnectReader:^(NSError * _Nullable error) {
        if (error) {
            [self sendEventWithName:@"readerDisconnectCompletion" body:@{@"error": [error localizedDescription]}];
        } else {
            [self sendEventWithName:@"readerDisconnectCompletion" body:@{}];
        }
    }];
}

RCT_EXPORT_METHOD(getCurrentState:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
    resolve([self getInternalState]);
}

- (NSDictionary *)getInternalState {
    SCPConnectionStatus connectionStatus = SCPTerminal.shared.connectionStatus;
    SCPReader *reader = SCPTerminal.shared.connectedReader;
    SCPPaymentStatus paymentStatus = SCPTerminal.shared.paymentStatus;
    return @{
        @"reader": [self serializeReader:reader],
        @"connectionStatus": @(connectionStatus),
        @"paymentStatus": @(paymentStatus),
    };
}

// SCPTerminalDelegate protocol
- (void)terminal:(SCPTerminal *)terminal didReportUnexpectedReaderDisconnect:(SCPReader *)reader {
    [self sendEventWithName:@"didReportUnexpectedReaderDisconnect" body:[self serializeReader:reader]];
}

// SCPTerminalDelegate protocol
- (void)terminal:(SCPTerminal *)terminal didChangeConnectionStatus:(SCPConnectionStatus)status {
    [self sendEventWithName:@"didChangeConnectionStatus" body: @{@"status": @(status)}];
}

// SCPTerminalDelegate protocol
- (void)terminal:(SCPTerminal *)terminal didChangePaymentStatus:(SCPPaymentStatus)status {
    [self sendEventWithName:@"didChangePaymentStatus" body:@{@"status": @(status) }];
}


- (void)abortInstallUpdate {
    if (pendingInstallUpdate && !pendingInstallUpdate.completed) {
        [pendingInstallUpdate cancel:^(NSError * _Nullable error) {
            if (error) {
                // [self sendEventWithName:@"abortInstallUpdateCompletion" body:@{@"error": }];
                // reject(@"abortInstallUpdateFailure", [error localizedDescription], nil);
            } else {
                pendingInstallUpdate = nil;
                // resolve(@{});
                // [self sendEventWithName:@"abortInstallUpdateCompletion" body:@{}];
            }
        }];
        return;
    }
    // resolve(@{});
}


RCT_EXPORT_METHOD(abortInstallUpdate:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
    if (pendingInstallUpdate && !pendingInstallUpdate.completed) {
        [pendingInstallUpdate cancel:^(NSError * _Nullable error) {
            if (error) {
                // [self sendEventWithName:@"abortInstallUpdateCompletion" body:@{@"error": }];
                reject(@"abortInstallUpdateFailure", [error localizedDescription], error);
            } else {
                pendingInstallUpdate = nil;
                resolve(@{});
                // [self sendEventWithName:@"abortInstallUpdateCompletion" body:@{}];
            }
        }];
        return;
    }
    resolve(@{});
    // [self sendEventWithName:@"abortInstallUpdateCompletion" body:@{}];
}







// payment actions
RCT_EXPORT_METHOD(createPaymentIntent:(NSDictionary *)parameters resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
    RCTLogInfo(@"NATIVE: createPaymentIntent");
    NSUInteger amount = [RCTConvert NSUInteger:parameters[@"amount"]];
    NSString *currency = [RCTConvert NSString:parameters[@"currency"]];
    SCPPaymentIntentParameters *params = [[SCPPaymentIntentParameters alloc] initWithAmount:amount currency:currency];
    [[SCPTerminal shared] createPaymentIntent:params completion:^(SCPPaymentIntent *result, NSError *error) {
        if (error) {
            reject(@"createPaymentIntentFailure", [error localizedDescription], error);
        } else {
            // resolve([self serializePaymentIntent:result]);
            resolve([result originalJSON]);
        }
    }];
}


// + (nullable instancetype)decodedObjectFromJSON:(nullable NSDictionary *)json;
// (NSDictionary)

RCT_EXPORT_METHOD(collectPaymentMethod:(NSDictionary *)paymentIntent resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
    RCTLogInfo(@"NATIVE: collectPaymentMethod");
    SCPPaymentIntent *intent = [SCPPaymentIntent decodedObjectFromJSON:paymentIntent];
    pendingCollectPaymentMethod = [[SCPTerminal shared] collectPaymentMethod:intent completion:^(SCPPaymentIntent *result, NSError *error) {
        if (error) {
            // NSLog(@"collectPaymentMethod failed: %@", collectError);
            reject(@"collectPaymentMethodFailure", [error localizedDescription], error);
        }
        else {
            NSLog(@"collectPaymentMethod succeeded. PI status: %lu", [result status]);
            resolve([result originalJSON]);
            // ... Process the payment
        }
    }];
}

RCT_EXPORT_METHOD(abortCollectPaymentMethod:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
    RCTLogInfo(@"NATIVE: abortCollectPaymentMethod");
    if (pendingCollectPaymentMethod && !pendingCollectPaymentMethod.completed) {
        [pendingCollectPaymentMethod cancel:^(NSError * _Nullable error) {
            if (error) {
                // [self sendEventWithName:@"abortInstallUpdateCompletion" body:@{@"error": }];
                reject(@"abortCollectPaymentMethodFailure", [error localizedDescription], error);
            } else {
                pendingCollectPaymentMethod = nil;
                resolve(@{});
                // [self sendEventWithName:@"abortInstallUpdateCompletion" body:@{}];
            }
        }];
        return;
    }
    resolve(@{});
    // [self sendEventWithName:@"abortInstallUpdateCompletion" body:@{}];
}


RCT_EXPORT_METHOD(processPayment:(NSDictionary *)paymentIntent resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
    // createResult is SCPPaymentIntent*
    [[SCPTerminal shared] processPayment:[SCPPaymentIntent decodedObjectFromJSON:paymentIntent] completion:^(SCPPaymentIntent *result, SCPProcessPaymentError *error) {
                        if (error) {
                            NSLog(@"processPayment failed: %@", error);
                            reject(@"processPaymentFailure", [error localizedDescription], error);
                        }
                        else {
                            NSLog(@"processPayment succeeded");
                            resolve([result originalJSON]);
                            // Notify your backend to capture the PaymentIntent
                            // [[APPAPIClient shared] capturePaymentIntent:processResult.stripeId completion:^(NSError *captureError) {
                            //     if (captureError) {
                            //         NSLog(@"capture failed: %@", captureError);
                            //     }
                            //     else {
                            //         NSLog(@"capture succeeded");
                            //     }
                            // }];
                        }
                    }];
}



- (NSDictionary *)serializePaymentIntent:(SCPPaymentIntent *)intent {
    // NSDateFormatter *formatter = [[NSDateFormatter alloc] init];
    // [formatter setDateFormat:@"yyyy-MM-dd'T'HH:mm:ssZZZZ"];
    // NSString *createdDate = [formatter stringFromDate:intent.created];

    return @{
             @"stripeId": intent.stripeId,
             @"created": intent.created,
             @"status": @"requires_payment_method",//@(intent.status),
             @"amount": @(intent.amount),
             @"currency": intent.currency,
            //  @"metadata": intent.metadata
            // @"charges": [intent.charges mapObjectsUsingBlock:^(id obj, NSUInteger idx) {
            //     return [self serializeCharge:obj];
            // }],
             };
}

// - (NSDictionary *)serializeCharge:(SCPCharge *)charge {
//     return @{
//              @"amount": @(charge.amount),
//              @"currency": charge.currency,
//              @"status": @(charge.status),
//              @"paymentMethodDetails": [self serializePaymentMethodDetails:charge.paymentMethodDetails],
//             //  @"stripeDescription": charge.stripeDescription,
//             //  @"metadata": charge.metadata,
//             @"stripeId": charge.stripeId
//     };
// }

// - (NSDictionary *)serializePaymentMethodDetails:(SCPPaymentMethodDetails *)paymentMethodDetails {
//     return @{
//             //  @"type": @(charge.amount),
//             //  @"cardPresent": charge.currency,
//             //  @"interacPresent": @(charge.status),
//     };
// }

@end




// @implementation RNStripeTerminalFactory
//     id<RCTBridgeDelegate> moduleInitialiser = [[classThatImplementsRCTBridgeDelegate alloc] init];

// RCTBridge *bridge = [[RCTBridge alloc] initWithDelegate:moduleInitialiser launchOptions:nil];

// RCTRootView *rootView = [[RCTRootView alloc]
//                         initWithBridge:bridge
//                             moduleName:kModuleName
//                      initialProperties:nil];
// @end
