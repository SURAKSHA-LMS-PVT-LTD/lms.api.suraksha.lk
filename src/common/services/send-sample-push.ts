import { NestFactory } from '@nestjs/core';
import { FcmNotificationService, FcmNotificationPayload } from './fcm-notification.service';
import { AppModule } from '../../app.module';

async function sendSamplePush() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const fcmService = app.get(FcmNotificationService);

  const fcmToken = process.env.TEST_FCM_TOKEN;
  if (!fcmToken) {
    console.error('\u274c TEST_FCM_TOKEN environment variable is required. Set it before running this test script.');
    await app.close();
    return;
  }

  const notification: FcmNotificationPayload = {
    title: 'Sample Notification',
    body: 'This is a test push notification with image!',
    imageUrl: 'https://cdn.pixabay.com/photo/2014/02/27/16/10/flowers-276014_1280.jpg',
  };

  const result = await fcmService.sendToDevice(fcmToken, notification);
  console.log('Push notification result:', result);
  await app.close();
}

sendSamplePush();
