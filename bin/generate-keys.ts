import webpush from 'web-push';

const vapidKeys = webpush.generateVAPIDKeys();

console.log('Paste these into your .env file:');
console.log('PUBLIC_VAPID_KEY=' + vapidKeys.publicKey);
console.log('PRIVATE_VAPID_KEY=' + vapidKeys.privateKey);
