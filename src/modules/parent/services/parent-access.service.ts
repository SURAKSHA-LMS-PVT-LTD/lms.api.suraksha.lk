import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ParentEntity } from '../entities/parent.entity';
import { StudentEntity } from '../../student/entities/student.entity';
import { UserEntity } from '../../user/entities/user.entity';

export interface AccessibleStudent {
  student: StudentEntity;
  parentRelation: string;
}

@Injectable()
export class ParentAccessService {
  private readonly logger = new Logger(ParentAccessService.name);

  constructor(
    @InjectRepository(ParentEntity)
    private readonly parentRepository: Repository<ParentEntity>,
    @InjectRepository(StudentEntity)  
    private readonly studentRepository: Repository<StudentEntity>,
  ) {}

  /**
   * Get all students that a parent has access to
   */
  async getAccessibleStudents(parentUser: UserEntity): Promise<StudentEntity[]> {

    try {
      // Find the parent entity
      const parent = await this.parentRepository.findOne({
        where: { userId: parentUser.id },
        relations: [
          'user', 
          'childrenAsFather', 
          'childrenAsFather.user',
          'childrenAsMother', 
          'childrenAsMother.user',
          'childrenAsGuardian', 
          'childrenAsGuardian.user'
        ]
      });

      if (!parent) {
        this.logger.warn(`Parent not found for user: ${parentUser.id}`);
        return [];
      }

      // Combine all children from different relationships
      const allChildren = [
        ...(parent.childrenAsFather || []),
        ...(parent.childrenAsMother || []),
        ...(parent.childrenAsGuardian || [])
      ];

      // Remove duplicates (in case same student has multiple relationships)
      const uniqueChildren = allChildren.reduce((acc, student) => {
        if (!acc.find(s => s.userId === student.userId)) {
          acc.push(student);
        }
        return acc;
      }, [] as StudentEntity[]);
      
      return uniqueChildren;

    } catch (error) {
      this.logger.error(`Failed to get accessible students for parent ${parentUser.id}: ${error.message}`);
      return [];
    }
  }

  /**
   * Check if a parent has access to a specific student
   */
  async hasAccessToStudent(parentUser: UserEntity, studentId: string): Promise<AccessibleStudent | null> {

    try {
      // Find the parent entity with children relationships
      const parent = await this.parentRepository.findOne({
        where: { userId: parentUser.id },
        relations: [
          'user', 
          'childrenAsFather', 
          'childrenAsFather.user',
          'childrenAsMother', 
          'childrenAsMother.user',
          'childrenAsGuardian', 
          'childrenAsGuardian.user'
        ]
      });

      if (!parent) {
        this.logger.warn(`Parent not found for user: ${parentUser.id}`);
        return null;
      }

      // Check in each relationship type
      let student: StudentEntity | null = null;
      let relationType: string | null = null;

      // Check as father
      student = parent.childrenAsFather?.find(child => child.userId === studentId) || null;
      if (student) {
        relationType = 'father';
      }

      // Check as mother
      if (!student) {
        student = parent.childrenAsMother?.find(child => child.userId === studentId) || null;
        if (student) {
          relationType = 'mother';
        }
      }

      // Check as guardian
      if (!student) {
        student = parent.childrenAsGuardian?.find(child => child.userId === studentId) || null;
        if (student) {
          relationType = 'guardian';
        }
      }

      if (!student || !relationType) {
        this.logger.warn(`Parent ${parentUser.email} does not have access to student ${studentId}`);
        return null;
      }

      
      return {
        student,
        parentRelation: relationType
      };

    } catch (error) {
      this.logger.error(`Failed to check parent access to student: ${error.message}`);
      return null;
    }
  }
}
