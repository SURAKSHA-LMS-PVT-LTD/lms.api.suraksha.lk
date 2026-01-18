import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from '../../../user/entities/user.entity';
import { now } from '../../../../common/utils/timezone.util';
import { UserRoleValidationService } from '../../../user/services/user-role-validation.service';
import { InstituteUserEntity } from '../entities/institue_user.entity';
import { InstituteUserType } from '../enums/institute-user-type.enum';
import { InstituteUserStatus } from '../enums/institute-user-status.enum';
import { UserType } from '../../../user/enums/user-type.enum';

export interface InstituteUserAssignmentDto {
  userId: string;
  instituteId: string;
  instituteUserType: InstituteUserType;
  status?: InstituteUserStatus;
}

@Injectable()
export class EnhancedInstituteUserAssignmentService {
  
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    
    @InjectRepository(InstituteUserEntity)
    private readonly instituteUserRepository: Repository<InstituteUserEntity>,
    
    private readonly roleValidationService: UserRoleValidationService,
  ) {}

  /**
   * Assigns a user to an institute with role validation
   * 
   * Validation logic:
   * - USER / USER_WITHOUT_PARENT can be assigned to ANY institute role
   * - USER_WITHOUT_STUDENT can be assigned to any role EXCEPT STUDENT
   * - Parent assignment is handled separately (father_id, mother_id, guardian_id in students table)
   */
  async assignUserToInstitute(assignmentDto: InstituteUserAssignmentDto): Promise<{
    success: boolean;
    instituteUser?: InstituteUserEntity;
    message: string;
  }> {
    
    const { userId, instituteId, instituteUserType, status = InstituteUserStatus.ACTIVE } = assignmentDto;
    
    // Get user details
    const user = await this.userRepository.findOne({ 
      where: { id: userId },
      select: ['id', 'userType', 'firstName', 'lastName']
    });
    
    if (!user) {
      throw new BadRequestException('User not found');
    }
    
    // Validate role assignment using validation service
    const validation = this.roleValidationService.validateInstituteRoleAssignment(
      user.userType,
      instituteUserType
    );
    
    if (!validation.isValid) {
      throw new BadRequestException(validation.reason);
    }
    
    // Check if user is already assigned to this institute
    const existingAssignment = await this.instituteUserRepository.findOne({
      where: { userId, instituteId }
    });
    
    if (existingAssignment) {
      // Update existing assignment
      existingAssignment.instituteUserType = instituteUserType;
      existingAssignment.status = status;
      
      const updated = await this.instituteUserRepository.save(existingAssignment);
      
      return {
        success: true,
        instituteUser: updated,
        message: `User role updated to ${instituteUserType} in institute ${instituteId}`
      };
    }
    
    // Create new assignment
    const timestamp = now();
    const newAssignment = this.instituteUserRepository.create({
      userId,
      instituteId,
      instituteUserType,
      status,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    
    const saved = await this.instituteUserRepository.save(newAssignment);
    
    return {
      success: true,
      instituteUser: saved,
      message: `User assigned as ${instituteUserType} to institute ${instituteId}`
    };
  }
  
  /**
   * Gets allowed institute roles for a user
   */
  async getAllowedInstituteRoles(userId: string): Promise<{
    userType: UserType;
    allowedRoles: InstituteUserType[];
    capabilities: string;
  }> {
    
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new BadRequestException('User not found');
    }
    
    const allowedRoles = this.roleValidationService.getAllowedInstituteRoles(user.userType);
    
    return {
      userType: user.userType,
      allowedRoles,
      capabilities: this.getCapabilitiesDescription(user.userType)
    };
  }
  
  /**
   * Validates parent assignment for a user
   */
  async validateParentAssignment(userId: string, studentId: string): Promise<{
    isValid: boolean;
    message: string;
  }> {
    
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new BadRequestException('User not found');
    }
    
    const validation = this.roleValidationService.validateParentAssignment(user.userType);
    
    if (!validation.isValid) {
      return {
        isValid: false,
        message: validation.reason || 'Parent assignment not allowed'
      };
    }
    
    return {
      isValid: true,
      message: `${user.userType} user can be assigned as parent`
    };
  }
  
  /**
   * Gets user assignments across all institutes
   */
  async getUserInstituteAssignments(userId: string): Promise<{
    user: UserEntity;
    assignments: InstituteUserEntity[];
    globalAccess: boolean;
  }> {
    
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new BadRequestException('User not found');
    }
    
    const assignments = await this.instituteUserRepository.find({
      where: { userId },
      relations: ['institute']
    });
    
    // Access control will be handled by decorators
    const hasGlobalAccess = false; // Decorators will determine access level
    
    return {
      user,
      assignments,
      globalAccess: hasGlobalAccess
    };
  }
  
  /**
   * Bulk assign users with validation
   */
  async bulkAssignUsers(assignments: InstituteUserAssignmentDto[]): Promise<{
    successful: number;
    failed: number;
    errors: string[];
  }> {
    
    let successful = 0;
    let failed = 0;
    const errors: string[] = [];
    
    for (const assignment of assignments) {
      try {
        await this.assignUserToInstitute(assignment);
        successful++;
      } catch (error) {
        failed++;
        errors.push(`User ${assignment.userId}: ${error.message}`);
      }
    }
    
    return { successful, failed, errors };
  }
  
  private getCapabilitiesDescription(userType: UserType): string {
    const capabilities = this.roleValidationService['USER_TYPE_CAPABILITIES'][userType];
    return capabilities?.description || 'Unknown capabilities';
  }
}
