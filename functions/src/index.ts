import { setGlobalOptions } from 'firebase-functions/v2';

// europe-west1 for latency from Israel, and a low instance ceiling because every
// invocation here can turn into a billed upstream tracking call.
setGlobalOptions({ region: 'europe-west1', maxInstances: 10 });

export { trackPackage } from './trackPackage';
export { refreshPackages } from './refreshPackages';
export { sendTestPush } from './sendTestPush';
