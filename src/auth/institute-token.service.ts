import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InstituteUserEntity } from '../modules/institute_mudules/institue_user/entities/institue_user.entity';
import { InstituteClassStudentEntity } from '../modules/institute_class_modules/institute_class_student/entities/institute_class_student.entity';
import { UserEntity } from '../modules/user/entities/user.entity';
import { UserType } from '../modules/user/enums/user-type.enum';
import { InstituteUserType } from '../modules/institute_mudules/institue_user/enums/institute-user-type.enum';
import { InstituteUserStatus } from '../modules/institute_mudules/institue_user/enums/institute-user-status.enum';
import { ForbiddenException, NotFoundException } from '@nestjs/common';

export interface InstituteTokenPayload {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  instituteId: string;
  userType: UserType;
  classIds: string[]; // Only class IDs - no permissions array
  iat?: number;
  exp?: number;
}

@Injectable()
export class InstituteTokenService {
  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
    @InjectRepository(InstituteUserEntity)
    private readonly instituteUserRepository: Repository<InstituteUserEntity>,
    @InjectRepository(InstituteClassStudentEntity)
    private readonly classStudentRepository: Repository<InstituteClassStudentEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
  ) {}

  /**
   * Generate institute-specific token after institute selection
   */
  async generateInstituteToken(userId: string, instituteId: string): Promise<string> {
    // Verify user has access to this institute
    const instituteUser = await this.instituteUserRepository.findOne({
      where: { 
        userId, 
        instituteId,
        status: InstituteUserStatus.ACTIVE 
      },
      relations: ['institute', 'user']
    });

    if (!instituteUser) {
      throw new ForbiddenException('Access denied to this institute');
    }

    // Get user details from the user table
    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: ['userType', 'email', 'firstName', 'lastName']
    });

    if (!user || !user.userType) {
      throw new NotFoundException('User not found or user type not set');
    }

    // Get user's classes in this institute (for students/teachers)
    const classIds = await this.getUserClassIds(userId, instituteId, instituteUser.instituteUserType);

    const payload: InstituteTokenPayload = {
      userId,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      instituteId,
      userType: user.userType,
      classIds
    };

    // Generate token with shorter expiry for security
    return this.jwtService.sign(payload, {
      expiresIn: (this.configService.get<string>('INSTITUTE_TOKEN_EXPIRES_IN') || '8h') as any
    });
  }

  /**
   * Validate institute token and extract payload
   */
  async validateInstituteToken(token: string): Promise<InstituteTokenPayload> {
    try {
      const payload = this.jwtService.verify(token) as InstituteTokenPayload;
      
      // Additional validation - check if user still has access
      const instituteUser = await this.instituteUserRepository.findOne({
        where: { 
          userId: payload.userId, 
          instituteId: payload.instituteId,
          status: InstituteUserStatus.ACTIVE 
        }
      });

      if (!instituteUser) {
        throw new ForbiddenException('Institute access has been revoked');
      }

      return payload;
    } catch (error) {
      throw new ForbiddenException('Invalid institute token');
    }
  }

  /**
   * Get user's class IDs in specific institute
   */
  private async getUserClassIds(userId: string, instituteId: string, userType: InstituteUserType): Promise<string[]> {
    if (userType === InstituteUserType.STUDENT) {
      // Get classes where student is enrolled
      const enrollments = await this.classStudentRepository.find({
        where: { 
          studentUserId: userId, 
          instituteId,
          isActive: true 
        }
      });
      return enrollments.map(e => e.classId);
    }

    if (userType === InstituteUserType.TEACHER) {
      // TODO: Get classes where user is teacher
      // This requires a teacher-class relationship table
      return []; // For now, return empty - implement based on your teacher-class relationship
    }

    if (userType === InstituteUserType.INSTITUTE_ADMIN) {
      // Admin has access to all classes in institute
      // TODO: Get all class IDs in institute
      return []; // For now, return empty - admin can access all anyway
    }

    return [];
  }

  /**
   * Refresh institute token
   */
  async refreshInstituteToken(currentToken: string): Promise<string> {
    const payload = await this.validateInstituteToken(currentToken);
    return this.generateInstituteToken(payload.userId, payload.instituteId);
  }

  /**
   * Check if user has access to specific institute
   */
  hasInstituteAccess(token: InstituteTokenPayload, instituteId: string): boolean {
    return token.instituteId === instituteId;
  }

  /**
   * Check if user has access to specific class
   */
  hasClassAccess(token: InstituteTokenPayload, classId: string): boolean {
    return token.classIds.includes(classId);
  }

  /**
   * Check if user has access to both institute and class
   */
  hasInstituteAndClassAccess(token: InstituteTokenPayload, instituteId: string, classId: string): boolean {
    return this.hasInstituteAccess(token, instituteId) && this.hasClassAccess(token, classId);
  }

  /**
   * Check if user can access their own data
   */
  canAccessOwnData(token: InstituteTokenPayload, userId: string): boolean {
    return token.userId === userId;
  }
}
