import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthService } from './auth.service';
import { UserEntity } from '../modules/user/entities/user.entity';
import { UserType } from '../modules/user/enums/user-type.enum';
import { Country } from '../modules/user/enums/country.enum';

@Injectable()
export class DatabaseResetService {
  private readonly logger = new Logger(DatabaseResetService.name);
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    private readonly authService: AuthService,
  ) {}

  /**
   * Guard: Prevent dangerous operations in production
   */
  private ensureNotProduction(operation: string): void {
    const env = (process.env.NODE_ENV || '').toLowerCase().trim();
    if (env === 'production' || env === 'prod') {
      throw new Error(`BLOCKED: ${operation} is not allowed in production environment`);
    }
  }

  /**
   * Reset database and create default users with secure passwords
   * WARNING: Only for development/testing environments
   */
  async resetDatabaseWithDefaults(): Promise<void> {
    this.ensureNotProduction('Database reset');
    try {
      this.logger.log('🔄 Resetting database...');
      
      // Clear all users (development/testing only)
      await this.userRepository.clear();
      
      // Create default admin user
      await this.createDefaultAdmin();
      
      // Create default teacher
      await this.createDefaultTeacher();
      
      // Create default student
      await this.createDefaultStudent();
      
      // Create default parent
      await this.createDefaultParent();
      
      this.logger.log('✅ Database reset completed with default users');
      this.logger.log('📝 Default credentials:');
      this.logger.log('   Admin: admin@school.com / admin123');
      this.logger.log('   Teacher: teacher@school.com / teacher123');
      this.logger.log('   Student: student@school.com / student123');
      this.logger.log('   Parent: parent@school.com / parent123');
      
    } catch (error) {
      this.logger.error('❌ Database reset failed:', error);
      throw error;
    }
  }

  /**
   * Migrate all existing passwords to new format without resetting data
   * Processes in batches to avoid memory issues
   * WARNING: Only for development/testing environments
   */
  async migrateAllPasswords(defaultPassword?: string): Promise<number> {
    this.ensureNotProduction('Bulk password migration');
    const password = defaultPassword || process.env.DEFAULT_MIGRATION_PASSWORD;
    if (!password) {
      throw new Error('Password must be provided via parameter or DEFAULT_MIGRATION_PASSWORD env var');
    }
    try {
      this.logger.log('Migrating all user passwords...');
      let migratedCount = 0;
      const BATCH_SIZE = 100;
      let offset = 0;

      while (true) {
        const users = await this.userRepository.find({
          select: ['id', 'email', 'password'],
          take: BATCH_SIZE,
          skip: offset,
          order: { id: 'ASC' },
        });

        if (users.length === 0) break;

        for (const user of users) {
          if (user.email) {
            const needsMigration = await this.authService.isPasswordInOldFormat(user, password);

            if (needsMigration || !user.password) {
              const newHashedPassword = await this.authService.hashPassword(password);
              await this.userRepository.update(user.id, { password: newHashedPassword });
              migratedCount++;
            }
          }
        }

        offset += BATCH_SIZE;
        if (users.length < BATCH_SIZE) break;
      }
      
      this.logger.log(`Migration completed. ${migratedCount} passwords updated.`);
      return migratedCount;
      
    } catch (error) {
      this.logger.error('❌ Password migration failed:', error);
      return 0;
    }
  }

  /**
   * Create specific user with secure password
   */
  async createSecureUser(userData: {
    firstName: string;
    lastName?: string;
    email: string;
    password: string;
    userType: UserType;
    phone?: string;
  }): Promise<UserEntity> {
    try {
      // Check if user already exists
      const existingUser = await this.userRepository.findOne({ 
        where: { email: userData.email } 
      });
      
      if (existingUser) {
        throw new Error(`User with email ${userData.email} already exists`);
      }
      
      // Hash password securely
      const hashedPassword = await this.authService.hashPassword(userData.password);
      
      // Create user
      const user = this.userRepository.create({
        ...userData,
        password: hashedPassword,
        isActive: true,
        country: Country.SRI_LANKA,
      });
      
      return await this.userRepository.save(user);
      
    } catch (error) {
      this.logger.error('❌ User creation failed:', error);
      throw error;
    }
  }

  private async createDefaultAdmin(): Promise<UserEntity> {
    return this.createSecureUser({
      firstName: 'System',
      lastName: 'Administrator',
      email: 'admin@school.com',
      password: 'admin123',
      userType: UserType.SUPERADMIN,
      phone: '+94771234567',
    });
  }

  private async createDefaultTeacher(): Promise<UserEntity> {
    return this.createSecureUser({
      firstName: 'Default',
      lastName: 'Teacher',
      email: 'teacher@school.com',
      password: 'teacher123',
      userType: UserType.USER,
      phone: '+94771234568',
    });
  }

  private async createDefaultStudent(): Promise<UserEntity> {
    return this.createSecureUser({
      firstName: 'Default',
      lastName: 'Student',
      email: 'student@school.com',
      password: 'student123',
      userType: UserType.USER_WITHOUT_PARENT,
      phone: '+94771234569',
    });
  }

  private async createDefaultParent(): Promise<UserEntity> {
    return this.createSecureUser({
      firstName: 'Default',
      lastName: 'Parent',
      email: 'parent@school.com',
      password: 'parent123',
      userType: UserType.USER_WITHOUT_STUDENT,
      phone: '+94771234570',
    });
  }

  /**
   * Test password validation for a user
   */
  async testUserLogin(email: string, password: string): Promise<boolean> {
    try {
      const user = await this.authService.validateUser(email, password);
      return !!user;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get all users with their password status (for debugging)
   * WARNING: Only for development/testing environments
   */
  async getUsersPasswordStatus(): Promise<Array<{
    id: string;
    email: string;
    firstName: string;
    hasPassword: boolean;
    isSecureFormat: boolean;
    userType: UserType | undefined;
  }>> {
    this.ensureNotProduction('Password status dump');
    const BATCH_SIZE = 100;
    let offset = 0;
    const statusList: Array<{
      id: string;
      email: string;
      firstName: string;
      hasPassword: boolean;
      isSecureFormat: boolean;
      userType: UserType | undefined;
    }> = [];
    
    while (true) {
      const users = await this.userRepository.find({
        select: ['id', 'email', 'firstName', 'password', 'userType'],
        take: BATCH_SIZE,
        skip: offset,
        order: { id: 'ASC' },
      });

      if (users.length === 0) break;

      for (const user of users) {
        if (user.email) {
          const hasPassword = !!user.password;
          const isSecure = hasPassword ? 
            !(await this.authService.isPasswordInOldFormat(user, 'test123')) : false;
          
          statusList.push({
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            hasPassword,
            isSecureFormat: isSecure,
            userType: user.userType,
          });
        }
      }

      offset += BATCH_SIZE;
      if (users.length < BATCH_SIZE) break;
    }
    
    return statusList;
  }
}
