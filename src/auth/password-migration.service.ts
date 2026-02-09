import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthService } from '../auth/auth.service';
import { UserEntity } from '../modules/user/entities/user.entity';

@Injectable()
export class PasswordMigrationService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    private readonly authService: AuthService,
  ) {}

  /**
   * Guard: Prevent dangerous operations in production
   */
  private ensureNotProduction(operation: string): void {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(`BLOCKED: ${operation} is not allowed in production environment`);
    }
  }

  /**
   * This method helps migrate users who may have passwords hashed with old method
   * Call this method if you need to update existing passwords
   */
  async migrateUserPassword(userId: string, plainPassword: string): Promise<boolean> {
    try {
      const user = await this.userRepository.findOne({ where: { id: userId } });
      if (!user) {
        return false;
      }

      // Hash password with new method
      const newHashedPassword = await this.authService.hashPassword(plainPassword);
      
      // Update user password
      await this.userRepository.update(userId, { password: newHashedPassword });
      
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Bulk migrate all users with a default password
   * WARNING: Only use this in development or with proper user consent
   */
  async bulkMigrateWithDefaultPassword(defaultPassword?: string): Promise<number> {
    this.ensureNotProduction('Bulk password migration');
    const password = defaultPassword || process.env.DEFAULT_MIGRATION_PASSWORD;
    if (!password) {
      throw new Error('Password must be provided via parameter or DEFAULT_MIGRATION_PASSWORD env var');
    }
    try {
      const BATCH_SIZE = 100;
      let offset = 0;
      let migratedCount = 0;

      // Hash once — same password for all users
      const newHashedPassword = await this.authService.hashPassword(password);

      while (true) {
        const users = await this.userRepository.find({
          select: ['id'],
          take: BATCH_SIZE,
          skip: offset,
          order: { id: 'ASC' },
        });

        if (users.length === 0) break;

        const ids = users.map(u => u.id);
        await this.userRepository
          .createQueryBuilder()
          .update(UserEntity)
          .set({ password: newHashedPassword })
          .whereInIds(ids)
          .execute();

        migratedCount += users.length;
        offset += BATCH_SIZE;
        if (users.length < BATCH_SIZE) break;
      }

      return migratedCount;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Test if a user's password is valid with the current hashing method
   */
  async testUserPassword(email: string, plainPassword: string): Promise<boolean> {
    try {
      const user = await this.userRepository.findOne({ 
        where: { email },
        select: ['id', 'email', 'password'] // Explicitly select password (bypasses select: false)
      });
      if (!user || !user.password) {
        return false;
      }

      return await this.authService.rehashPasswordIfNeeded(user, plainPassword);
    } catch (error) {
      return false;
    }
  }

  /**
   * Create a new user with properly hashed password
   */
  async createUserWithHashedPassword(userData: Partial<UserEntity>, plainPassword: string): Promise<UserEntity> {
    const hashedPassword = await this.authService.hashPassword(plainPassword);
    
    const user = this.userRepository.create({
      ...userData,
      password: hashedPassword,
    });

    return await this.userRepository.save(user);
  }
}
