import webpush from 'web-push';
const vapidKeys = webpush.generateVAPIDKeys();
console.log('Copia estas variables en .env:');
console.log('');
console.log(`NEXT_PUBLIC_VAPID_PUBLIC_KEY=${vapidKeys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${vapidKeys.privateKey}`);
console.log('VAPID_SUBJECT=mailto:admin@lumodigitalsolutions.com');
