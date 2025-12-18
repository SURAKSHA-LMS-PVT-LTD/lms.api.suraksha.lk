import { Injectable, Logger } from '@nestjs/common';
import { CloudStorageService } from './cloud-storage.service';
import { DataSource } from 'typeorm';

@Injectable()
export class UploadCleanupService {
  private readonly logger = new Logger(UploadCleanupService.name);
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(
    private readonly cloudStorageService: CloudStorageService,
    private readonly dataSource: DataSource,
  ) {
    // Start automatic cleanup every hour
    this.startAutomaticCleanup();
  }

  /**
   * Start automatic cleanup every hour
   */
  private startAutomaticCleanup() {
    // Run cleanup every hour (3600000 ms)
    this.cleanupInterval = setInterval(
      () => this.cleanupUnverifiedUploads(),
      60 * 60 * 1000 // 1 hour
    );
    this.logger.log('🕐 Automatic upload cleanup scheduled (every 1 hour)');
  }

  /**
   * Stop automatic cleanup (for graceful shutdown)
   */
  onModuleDestroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.logger.log('⏹️ Automatic upload cleanup stopped');
    }
  }

  /**
   * 🧹 Cleanup unverified uploads
   * Deletes files that were uploaded via signed URL
   * but never referenced in the database (user creation failed or was abandoned)
   */
  async cleanupUnverifiedUploads() {
    this.logger.log('🧹 Starting cleanup of unverified uploads...');

    try {
      // Get all imageUrl and idUrl from database
      const userRepository = this.dataSource.getRepository('users');
      const referencedFiles = await userRepository
        .createQueryBuilder('user')
        .select(['user.imageUrl', 'user.idUrl'])
        .where('user.imageUrl IS NOT NULL OR user.idUrl IS NOT NULL')
        .getMany();

      const referencedPaths = new Set<string>();
      referencedFiles.forEach((user: any) => {
        if (user.imageUrl) referencedPaths.add(user.imageUrl);
        if (user.idUrl) referencedPaths.add(user.idUrl);
      });

      this.logger.log(`📊 Found ${referencedPaths.size} files referenced in database`);

      // Define folders to check
      const foldersToClean = [
        'profile-images',
        'student-images',
        'institute-images',
        'institute-user-images',
        'id-documents'
      ];

      let totalDeleted = 0;

      for (const folder of foldersToClean) {
        try {
          const filesInFolder = await this.cloudStorageService.listFiles(folder);
          
          for (const fileObj of filesInFolder) {
            const filePath = fileObj.name; // Extract file path from object
            
            // Check if file is referenced in database
            if (!referencedPaths.has(filePath)) {
              // Calculate file age from updated timestamp
              const fileAge = Date.now() - new Date(fileObj.updated).getTime();
              
              if (fileAge > 2 * 60 * 60 * 1000) { // 2 hours in milliseconds
                this.logger.log(`🗑️ Deleting unreferenced file (${Math.round(fileAge / 1000 / 60)} minutes old): ${filePath}`);
                await this.cloudStorageService.deleteFile(filePath);
                totalDeleted++;
              }
            }
          }
        } catch (error) {
          this.logger.error(`Error cleaning folder ${folder}: ${error.message}`);
        }
      }

      this.logger.log(`✅ Cleanup complete. Deleted ${totalDeleted} unreferenced files.`);
    } catch (error) {
      this.logger.error(`❌ Cleanup failed: ${error.message}`, error.stack);
    }
  }

  /**
   * Manual cleanup trigger (for testing or admin operations)
   */
  async triggerManualCleanup(): Promise<{ success: boolean; deletedCount: number }> {
    this.logger.log('🔧 Manual cleanup triggered');
    await this.cleanupUnverifiedUploads();
    return { success: true, deletedCount: 0 }; // TODO: Return actual count
  }
}
