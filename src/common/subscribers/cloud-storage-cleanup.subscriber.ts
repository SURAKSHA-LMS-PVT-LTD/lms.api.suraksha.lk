import {
  DataSource,
  EntitySubscriberInterface,
  EventSubscriber,
  UpdateEvent,
  RemoveEvent,
} from 'typeorm';
import { CloudStorageService } from '../services/cloud-storage.service';
import { Injectable, Logger } from '@nestjs/common';

@EventSubscriber()
@Injectable()
export class CloudStorageCleanupSubscriber implements EntitySubscriberInterface {
  private readonly logger = new Logger(CloudStorageCleanupSubscriber.name);

  constructor(
    private dataSource: DataSource,
    private cloudStorageService: CloudStorageService,
  ) {
    // Register this subscriber with TypeORM globally
    dataSource.subscribers.push(this);
  }

  // Regex to detect fields that likely contain cloud storage URLs/paths
  private isStorageField(propertyName: string): boolean {
    const p = propertyName.toLowerCase();
    return p.includes('url') || p.includes('image') || p.includes('logo') || p.includes('thumbnail') || p.includes('path') || p.includes('file');
  }

  // Validate if a string is a managed GCS relative path
  private isGcsPath(value: any): boolean {
    if (typeof value !== 'string') return false;
    
    // Cloud Storage paths are typically relative (e.g. folder-name/uuid.jpg)
    // We don't want to attempt deleting external http URLs
    if (value.startsWith('http://') || value.startsWith('https://') || value.startsWith('/')) {
      return false;
    }

    const allowedFolders = [
      'profile-images', 'student-images', 'institute-images', 'institute-user-images',
      'subject-images', 'homework-files', 'correction-files',
      'institute-payment-receipts', 'subject-payment-receipts', 'enrollment-payment-receipts',
      'id-documents', 'bookhire-vehicle-images', 'bookhire-owner-images',
      'institute-branding', 'class-lesson-groups', 'organizations', 'lecture-thumbnails'
    ];

    return allowedFolders.some(folder => value.startsWith(`${folder}/`));
  }

  async afterUpdate(event: UpdateEvent<any>) {
    if (!event.entity || !event.databaseEntity) return;

    for (const column of event.metadata.columns) {
      if (this.isStorageField(column.propertyName)) {
        const newValue = event.entity[column.propertyName];
        const oldValue = event.databaseEntity[column.propertyName];

        // If the value changed, and the old value was a valid GCS path, delete it
        if (oldValue && newValue !== oldValue && this.isGcsPath(oldValue)) {
          this.logger.log(`Entity updated: Cleaning up orphaned GCS file -> ${oldValue}`);
          this.cloudStorageService.deleteFile(oldValue).catch(err => {
            this.logger.error(`Failed to cleanup orphaned GCS file ${oldValue}:`, err.message);
          });
        }
      }
    }
  }

  async afterRemove(event: RemoveEvent<any>) {
    if (!event.databaseEntity) return;

    for (const column of event.metadata.columns) {
      if (this.isStorageField(column.propertyName)) {
        const oldValue = event.databaseEntity[column.propertyName];

        // If the entity is deleted, and the value was a valid GCS path, delete it
        if (oldValue && this.isGcsPath(oldValue)) {
          this.logger.log(`Entity deleted: Cleaning up associated GCS file -> ${oldValue}`);
          this.cloudStorageService.deleteFile(oldValue).catch(err => {
            this.logger.error(`Failed to cleanup GCS file for deleted entity ${oldValue}:`, err.message);
          });
        }
      }
    }
  }
}
