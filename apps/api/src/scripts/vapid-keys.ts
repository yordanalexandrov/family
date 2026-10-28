/**
 * Prints a new VAPID key pair for VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY (`pnpm --filter api vapid-keys`). A new pair
 * ends every existing subscription: the devices have to turn notifications on again.
 */
import webpush from 'web-push';

const { publicKey, privateKey } = webpush.generateVAPIDKeys();
process.stdout.write(
  `VAPID_PUBLIC_KEY=${publicKey}\nVAPID_PRIVATE_KEY=${privateKey}\n`,
);
