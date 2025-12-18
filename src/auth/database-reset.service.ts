import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthService } from './auth.service';
import { UserEntity } from '../modules/user/entities/user.entity';
import { UserType } from '../modules/user/enums/user-type.enum';
import { Country } from '../modules/user/enums/country.enum';

@Injectable()
export class DatabaseResetService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    private readonly authService: AuthService,
  ) {}

  /**
   * Reset database and create default users with secure passwords
   */
  async resetDatabaseWithDefaults(): Promise<void> {
    try {
      console.log('🔄 Resetting database...');
      
      // Clear all users (be careful in production!)
      await this.userRepository.clear();
      
      // Create default admin user
      await this.createDefaultAdmin();
      
      // Create default teacher
      await this.createDefaultTeacher();
      
      // Create default student
      await this.createDefaultStudent();
      
      // Create default parent
      await this.createDefaultParent();
      
      console.log('✅ Database reset completed with default users');
      console.log('📝 Default credentials:');
      console.log('   Admin: admin@school.com / admin123');
      console.log('   Teacher: teacher@school.com / teacher123');
      console.log('   Student: student@school.com / student123');
      console.log('   Parent: parent@school.com / parent123');
      
    } catch (error) {
      console.error('❌ Database reset failed:', error);
      throw error;
    }
  }

  /**
   * Migrate all existing passwords to new format without resetting data
   */
  async migrateAllPasswords(defaultPassword: string = 'password123'): Promise<number> {
    try {
      console.log('🔄 Migrating all user passwords...');
      
      const users = await this.userRepository.find();
      let migratedCount = 0;
      
      for (const user of users) {
        if (user.email) {
          // Check if password needs migration
          const needsMigration = await this.authService.isPasswordInOldFormat(user, defaultPassword);
          
          if (needsMigration || !user.password) {
            // Update to new secure format
            const newHashedPassword = await this.authService.hashPassword(defaultPassword);
            await this.userRepository.update(user.id, { password: newHashedPassword });
            migratedCount++;
            console.log(`✅ Migrated password for: ${user.email}`);
          } else {
            console.log(`⏩ Skipped (already secure): ${user.email}`);
          }
        }
      }
      
      console.log(`✅ Migration completed. ${migratedCount} passwords updated.`);
      return migratedCount;
      
    } catch (error) {
      console.error('❌ Password migration failed:', error);
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
      console.error('❌ User creation failed:', error);
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
   */
  async getUsersPasswordStatus(): Promise<Array<{
    id: string;
    email: string;
    firstName: string;
    hasPassword: boolean;
    isSecureFormat: boolean;
    userType: UserType | undefined;
  }>> {
    const users = await this.userRepository.find();
    const statusList: Array<{
      id: string;
      email: string;
      firstName: string;
      hasPassword: boolean;
      isSecureFormat: boolean;
      userType: UserType | undefined;
    }> = [];
    
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
    
    return statusList;
  }
}
