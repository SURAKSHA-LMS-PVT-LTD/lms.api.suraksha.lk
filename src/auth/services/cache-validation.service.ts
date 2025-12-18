import { Injectable, Inject, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from '../../modules/user/entities/user.entity';
import { InstituteUserEntity } from '../../modules/institute_mudules/institue_user/entities/institue_user.entity';
import { InstituteClassStudentEntity } from '../../modules/institute_class_modules/institute_class_student/entities/institute_class_student.entity';
import { InstituteClassSubjectEntity } from '../../modules/institute_class_modules/institute_class_subject/entities/institute_class_subject.entity';
import { UserType } from '../../modules/user/enums/user-type.enum';
import { InstituteUserType } from '../../modules/institute_mudules/institue_user/enums/institute-user-type.enum';

export interface UserAccessCache {
  userId: string;
  userType: string;
  institutes: {
    [instituteId: string]: {
      userType: string;
      classes: {
        [classId: string]: {
          subjects: string[]; // subject IDs
        };
      };
    };
  };
  lastUpdated: number;
}

@Injectable()
export class CacheValidationService {
  constructor(
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    @InjectRepository(InstituteUserEntity)
    private readonly instituteUserRepository: Repository<InstituteUserEntity>,
    @InjectRepository(InstituteClassStudentEntity)
    private readonly instituteClassStudentRepository: Repository<InstituteClassStudentEntity>,
    @InjectRepository(InstituteClassSubjectEntity)
    private readonly instituteClassSubjectRepository: Repository<InstituteClassSubjectEntity>,
  ) {}

  /**
   * Get user access data from cache or load from database
   */
  async getUserAccessData(userId: string): Promise<UserAccessCache | null> {
    const cacheKey = `user_access:${userId}`;
    
    try {
      // Try to get from cache first
      let accessData = await this.cacheManager.get<UserAccessCache>(cacheKey);
      
      if (!accessData) {
        // Load from database and cache it
        accessData = await this.loadUserAccessFromDatabase(userId);
        if (accessData) {
          await this.cacheManager.set(cacheKey, accessData, 3600); // Cache for 1 hour
        }
      }
      
      return accessData;
    } catch (error) {
      return null;
    }
  }

  /**
   * Validate global user type (SUPER_ADMIN, ORGANIZATION_MANAGER, etc.)
   */
  async validateGlobalUserType(userId: string, allowedTypes: UserType[]): Promise<boolean> {
    try {
      const accessData = await this.getUserAccessData(userId);
      if (!accessData) {
        throw new UnauthorizedException('User access data not found');
      }

      const userType = accessData.userType as UserType;
      const isAllowed = allowedTypes.includes(userType);
      
      if (!isAllowed) {
        throw new ForbiddenException(`Access denied. Required user types: ${allowedTypes.join(', ')}`);
      }

      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException || error instanceof ForbiddenException) {
        throw error;
      }
      throw new UnauthorizedException('Failed to validate user type');
    }
  }

  /**
   * Validate institute user type access
   */
  async validateInstituteUserType(
    userId: string, 
    instituteId: string, 
    allowedTypes: InstituteUserType[]
  ): Promise<boolean> {
    try {
      const accessData = await this.getUserAccessData(userId);
      if (!accessData) {
        throw new UnauthorizedException('User access data not found');
      }

      const instituteAccess = accessData.institutes[instituteId];
      if (!instituteAccess) {
        throw new ForbiddenException(`No access to institute: ${instituteId}`);
      }

      // Convert string to enum for comparison
      const userInstituteType = this.convertToInstituteUserType(instituteAccess.userType);
      const isAllowed = allowedTypes.includes(userInstituteType);
      
      if (!isAllowed) {
        throw new ForbiddenException(
          `Access denied. Required institute user types: ${allowedTypes.join(', ')}`
        );
      }

      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException || error instanceof ForbiddenException) {
        throw error;
      }
      throw new UnauthorizedException('Failed to validate institute user type');
    }
  }

  /**
   * Validate institute user class access
   */
  async validateInstituteUserClassAccess(
    userId: string,
    instituteId: string,
    classId: string,
    allowedTypes: InstituteUserType[]
  ): Promise<boolean> {
    try {
      // First validate institute access
      await this.validateInstituteUserType(userId, instituteId, allowedTypes);

      const accessData = await this.getUserAccessData(userId);
      const instituteAccess = accessData!.institutes[instituteId];
      
      // Check class access
      const classAccess = instituteAccess.classes[classId];
      if (!classAccess) {
        throw new ForbiddenException(`No access to class: ${classId} in institute: ${instituteId}`);
      }

      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException || error instanceof ForbiddenException) {
        throw error;
      }
      throw new UnauthorizedException('Failed to validate institute user class access');
    }
  }

  /**
   * Validate institute user class subject access
   */
  async validateInstituteUserClassSubjectAccess(
    userId: string,
    instituteId: string,
    classId: string,
    subjectId: string,
    allowedTypes: InstituteUserType[]
  ): Promise<boolean> {
    try {
      // First validate class access
      await this.validateInstituteUserClassAccess(userId, instituteId, classId, allowedTypes);

      const accessData = await this.getUserAccessData(userId);
      const instituteAccess = accessData!.institutes[instituteId];
      const classAccess = instituteAccess.classes[classId];
      
      // Check subject access
      const hasSubjectAccess = classAccess.subjects.includes(subjectId);
      if (!hasSubjectAccess) {
        throw new ForbiddenException(
          `No access to subject: ${subjectId} in class: ${classId}, institute: ${instituteId}`
        );
      }

      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException || error instanceof ForbiddenException) {
        throw error;
      }
      throw new UnauthorizedException('Failed to validate institute user class subject access');
    }
  }

  /**
   * Clear user cache (useful when user permissions change)
   */
  async clearUserCache(userId: string): Promise<void> {
    const cacheKey = `user_access:${userId}`;
    await this.cacheManager.del(cacheKey);
  }

  /**
   * Load user access data from database
   */
  private async loadUserAccessFromDatabase(userId: string): Promise<UserAccessCache | null> {
    try {
      // Get user basic info
      const user = await this.userRepository.findOne({ where: { id: userId } });
      if (!user) {
        return null;
      }

      // Get institute assignments
      const instituteAssignments = await this.instituteUserRepository.find({
        where: { userId },
        relations: ['institute']
      });

      const institutes: UserAccessCache['institutes'] = {};

      // Process each institute assignment
      for (const assignment of instituteAssignments) {
        const instituteId = assignment.instituteId;
        
        // Get class access based on user type
        const classes: any = {};
        
        if (assignment.instituteUserType === InstituteUserType.STUDENT) {
          // For students, get enrolled classes and subjects
          const studentEnrollments = await this.instituteClassStudentRepository.find({
            where: { studentUserId: userId, instituteId, isActive: true }
          });

          for (const enrollment of studentEnrollments) {
            const classId = enrollment.classId;
            
            // Get subjects for this class
            const subjects = await this.instituteClassSubjectRepository.find({
              where: { instituteId, classId }
            });

            classes[classId] = {
              subjects: subjects.map(s => s.subjectId)
            };
          }
        } else if (assignment.instituteUserType === InstituteUserType.TEACHER) {
          // For teachers, get teaching assignments
          const teachingAssignments = await this.instituteClassSubjectRepository.find({
            where: { teacherId: userId, instituteId }
          });

          const classSubjects: { [classId: string]: string[] } = {};
          
          for (const teaching of teachingAssignments) {
            const classId = teaching.classId;
            if (!classSubjects[classId]) {
              classSubjects[classId] = [];
            }
            classSubjects[classId].push(teaching.subjectId);
          }

          for (const [classId, subjects] of Object.entries(classSubjects)) {
            classes[classId] = { subjects };
          }
        } else {
          // For admins and other types, get all classes in institute
          const allClasses = await this.instituteClassSubjectRepository.find({
            where: { instituteId },
            select: ['classId', 'subjectId']
          });

          const classSubjects: { [classId: string]: string[] } = {};
          
          for (const classSubject of allClasses) {
            const classId = classSubject.classId;
            if (!classSubjects[classId]) {
              classSubjects[classId] = [];
            }
            classSubjects[classId].push(classSubject.subjectId);
          }

          for (const [classId, subjects] of Object.entries(classSubjects)) {
            classes[classId] = { subjects };
          }
        }

        institutes[instituteId] = {
          userType: assignment.instituteUserType,
          classes
        };
      }

      return {
        userId,
        userType: user.userType,
        institutes,
        lastUpdated: Date.now()
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Convert string to InstituteUserType enum
   */
  private convertToInstituteUserType(userType: string): InstituteUserType {
    return userType as InstituteUserType;
  }
}
