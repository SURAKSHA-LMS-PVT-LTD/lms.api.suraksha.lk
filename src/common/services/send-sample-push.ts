import { NestFactory } from '@nestjs/core';
import { FcmNotificationService, FcmNotificationPayload } from './fcm-notification.service';
import { AppModule } from '../../app.module';

async function sendSamplePush() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const fcmService = app.get(FcmNotificationService);

  const fcmToken = 'flqezDBaTRyv8n6lsyqlhj:APA91bHNOXouO2W9LImGK0fOuooiRS9eYW3JnloWGaLozsbM_SVVPuYQ6A8trjxQ71lIjFV-uk5EBg8j1hCeae6ZxtmWmhSLXztMazP8DxE1BBayd-B71Gc';

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
