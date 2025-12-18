import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository, DataSource } from 'typeorm';
import { UserEntity } from '../../modules/user/entities/user.entity';
import { UserType } from '../../modules/user/enums/user-type.enum';
import {
  InstituteUserEntity,
} from '../../modules/institute_mudules/institue_user/entities/institue_user.entity';
import { InstituteUserStatus } from '../../modules/institute_mudules/institue_user/enums/institute-user-status.enum';
import { InstituteUserType, INSTITUTE_USER_TYPE_CODES } from '../../modules/institute_mudules/institue_user/enums/institute-user-type.enum';
import { InstituteClassSubjectEntity } from '../../modules/institute_class_modules/institute_class_subject/entities/institute_class_subject.entity';
import { InstituteClassStudentEntity } from '../../modules/institute_class_modules/institute_class_student/entities/institute_class_student.entity';
import { StudentEntity } from '../../modules/student/entities/student.entity';
import { 
  GLOBAL_INSTITUTE_ACCESS_FLAG, 
  EnhancedInstituteAccessEntry, 
  EnhancedJwtPayload,
  ROLE_BITMASKS,
  USER_TYPE_COMPACT,
  CompactClassAccess
} from '../interfaces/enhanced-jwt-payload.interface';

interface InstituteAccessPattern {
  role: string;
  classes: Map<string, Set<number>>;
}

interface InstituteAccessAccumulator {
  patterns: Map<string, InstituteAccessPattern>; // key: role, value: access pattern
}

@Injectable()
export class EnhancedJwtService {
  private readonly logger = new Logger(EnhancedJwtService.name);

  constructor(
    @InjectRepository(InstituteUserEntity)
    private readonly instituteUserRepository: Repository<InstituteUserEntity>,
    @InjectRepository(InstituteClassSubjectEntity)
    private readonly instituteClassSubjectRepository: Repository<InstituteClassSubjectEntity>,
    @InjectRepository(InstituteClassStudentEntity)
    private readonly instituteClassStudentRepository: Repository<InstituteClassStudentEntity>,
    @InjectRepository(StudentEntity)
    private readonly studentRepository: Repository<StudentEntity>,
    private readonly dataSource: DataSource,
  ) {}

  async buildPayload(user: UserEntity): Promise<EnhancedJwtPayload> {
    const payloadBase: EnhancedJwtPayload = {
      s: String(user.id),
      u: this.toCompactUserType(user.userType),
      t: Math.floor(Date.now() / 1000),
    };

    if (this.hasGlobalInstituteAccess(user.userType)) {
      return { ...payloadBase, i: GLOBAL_INSTITUTE_ACCESS_FLAG };
    }

    const [instituteAccess, childrenIds] = await Promise.all([
      this.shouldIncludeInstituteAccess(user.userType)
        ? this.buildCompactInstituteAccess(user)
        : Promise.resolve<EnhancedInstituteAccessEntry[]>([]),
      this.shouldIncludeChildren(user.userType)
        ? this.findActiveChildrenIds(user.id)
        : Promise.resolve<string[]>([]),
    ]);

    if (instituteAccess.length > 0) {
      payloadBase.i = instituteAccess;
    }

    if (childrenIds.length > 0) {
      payloadBase.c = childrenIds;
    }

    return payloadBase;
  }

  private toCompactUserType(userType: UserType): number {
    switch (userType) {
      case UserType.SUPERADMIN:
        return USER_TYPE_COMPACT.SUPERADMIN;
      case UserType.ORGANIZATION_MANAGER:
        return USER_TYPE_COMPACT.ORGANIZATION_MANAGER;
      case UserType.USER:
        return USER_TYPE_COMPACT.USER;
      case UserType.USER_WITHOUT_PARENT:
        return USER_TYPE_COMPACT.USER_WITHOUT_PARENT;
      case UserType.USER_WITHOUT_STUDENT:
        return USER_TYPE_COMPACT.USER_WITHOUT_STUDENT;
      default:
        return USER_TYPE_COMPACT.USER;
    }
  }

  private hasGlobalInstituteAccess(userType: UserType): boolean {
    return (
      userType === UserType.SUPERADMIN ||
      userType === UserType.ORGANIZATION_MANAGER
    );
  }

  private shouldIncludeInstituteAccess(userType: UserType): boolean {
    if (this.hasGlobalInstituteAccess(userType)) {
      return false;
    }

    // ✅ FIX: Always include institute access for users who might have institute assignments
    // USER_WITHOUT_STUDENT can be teachers, institute admins, or attendance markers
    // Only global users (SUPERADMIN, ORG_MANAGER) should skip this
    return true;
  }

  private shouldIncludeChildren(userType: UserType): boolean {
    if (this.hasGlobalInstituteAccess(userType)) {
      return false;
    }

    return userType !== UserType.USER_WITHOUT_PARENT;
  }

  private async buildCompactInstituteAccess(user: UserEntity): Promise<EnhancedInstituteAccessEntry[]> {
    const accessMap = new Map<string, InstituteAccessAccumulator>();

    const ensureInstituteEntry = (instituteId: string): InstituteAccessAccumulator => {
      const key = String(instituteId);
      if (!accessMap.has(key)) {
        accessMap.set(key, {
          patterns: new Map<string, InstituteAccessPattern>()
        });
      }
      return accessMap.get(key)!;
    };

    const ensureRolePattern = (acc: InstituteAccessAccumulator, role: string): InstituteAccessPattern => {
      if (!acc.patterns.has(role)) {
        acc.patterns.set(role, {
          role: role,
          classes: new Map<string, Set<number>>()
        });
      }
      return acc.patterns.get(role)!;
    };

    const ensureClassEntry = (pattern: InstituteAccessPattern, classId: string): Set<number> => {
      const key = String(classId);
      if (!pattern.classes.has(key)) {
        pattern.classes.set(key, new Set<number>());
      }
      return pattern.classes.get(key)!;
    };

    // Collect all access data with separate patterns per role
    const [instituteAssignments, teacherAccess, studentClasses] = await Promise.all([
      // 1. Direct institute assignments (IA, AM roles)
      this.instituteUserRepository.find({
        where: {
          userId: String(user.id),
          status: InstituteUserStatus.ACTIVE,
        },
        select: ['instituteId', 'instituteUserType'],
      }),

      // 2. Teacher access (TE role) - check BOTH class teacher AND subject teacher
      this.getTeacherAccess(String(user.id)),

      // 3. Student classes (ST role + enrolled classes)
      this.instituteClassStudentRepository
        .createQueryBuilder('ics')
        .select([
          'ics.instituteId AS instituteId',
          'ics.classId AS classId',
        ])
        .where('ics.studentUserId = :userId', { userId: String(user.id) })
        .andWhere('ics.isActive = :isActive', { isActive: true })
        .getRawMany<{ instituteId: string; classId: string }>()
    ]);

    // Process direct institute assignments (IA, AM, TE, ST)
    for (const assignment of instituteAssignments) {
      const entry = ensureInstituteEntry(assignment.instituteId);
      const roleCode = INSTITUTE_USER_TYPE_CODES[assignment.instituteUserType as InstituteUserType] || assignment.instituteUserType;
      const normalizedRole = this.normalizeRoleCode(roleCode);
      
      // Include ALL roles from institute_user table
      // Students can be assigned via institute_user OR institute_class_students
      // Teachers can be assigned via institute_user OR as class/subject teachers
      if (['IA', 'AM', 'TE', 'ST'].includes(normalizedRole)) {
        ensureRolePattern(entry, normalizedRole);
      }
    }

    // Process teacher access (TE role with specific class/subject mapping)
    if (teacherAccess.length > 0) {
      const teacherAccessByInstitute = new Map<string, Map<string, Set<number>>>();
      
      for (const record of teacherAccess) {
        if (!teacherAccessByInstitute.has(record.instituteId)) {
          teacherAccessByInstitute.set(record.instituteId, new Map());
        }
        const classMap = teacherAccessByInstitute.get(record.instituteId)!;
        
        if (!classMap.has(record.classId)) {
          classMap.set(record.classId, new Set());
        }
        const subjectSet = classMap.get(record.classId)!;
        
        if (record.isClassTeacher) {
          // Class teacher gets access to ALL subjects in the class
          // We'll populate this later when we have all class subjects
        } else if (record.subjectId) {
          // Subject teacher gets access to specific subject
          subjectSet.add(Number(record.subjectId));
        }
      }

      // Get all subjects for classes where user is class teacher
      const classTeacherClasses = teacherAccess
        .filter(ta => ta.isClassTeacher)
        .map(ta => ta.classId);
      
      if (classTeacherClasses.length > 0) {
        const classTeacherSubjects = await this.instituteClassSubjectRepository
          .createQueryBuilder('ics')
          .select([
            'ics.instituteId AS instituteId',
            'ics.classId AS classId',
            'ics.subjectId AS subjectId',
          ])
          .where('ics.classId IN (:...classIds)', { classIds: classTeacherClasses })
          .andWhere('ics.isActive = :isActive', { isActive: true })
          .getRawMany<{ instituteId: string; classId: string; subjectId: string }>();

        // Add all subjects for class teachers
        for (const record of classTeacherSubjects) {
          const classMap = teacherAccessByInstitute.get(record.instituteId);
          if (classMap && classMap.has(record.classId)) {
            const subjectSet = classMap.get(record.classId)!;
            if (record.subjectId) {
              subjectSet.add(Number(record.subjectId));
            }
          }
        }
      }

      // Build teacher patterns
      for (const [instituteId, classMap] of teacherAccessByInstitute.entries()) {
        const entry = ensureInstituteEntry(instituteId);
        const pattern = ensureRolePattern(entry, 'TE');
        
        for (const [classId, subjectSet] of classMap.entries()) {
          pattern.classes.set(classId, subjectSet);
        }
      }
    }

    // Process student access (ST role with enrolled classes + available subjects)
    if (studentClasses.length > 0) {
      const studentClassIds = new Set<string>();
      const studentAccessByInstitute = new Map<string, Set<string>>();
      
      for (const record of studentClasses) {
        studentClassIds.add(String(record.classId));
        
        if (!studentAccessByInstitute.has(record.instituteId)) {
          studentAccessByInstitute.set(record.instituteId, new Set());
        }
        studentAccessByInstitute.get(record.instituteId)!.add(record.classId);
      }

      // Get all subjects for student classes
      const subjectRecords = studentClassIds.size > 0 ? await this.instituteClassSubjectRepository
        .createQueryBuilder('ics')
        .select([
          'ics.instituteId AS instituteId',
          'ics.classId AS classId',
          'ics.subjectId AS subjectId',
        ])
        .where('ics.classId IN (:...classIds)', { classIds: Array.from(studentClassIds) })
        .andWhere('ics.isActive = :isActive', { isActive: true })
        .getRawMany<{ instituteId: string; classId: string; subjectId: string }>() : [];

      // Build student access patterns
      for (const [instituteId, classSet] of studentAccessByInstitute.entries()) {
        const entry = ensureInstituteEntry(instituteId);
        const pattern = ensureRolePattern(entry, 'ST');
        
        for (const classId of classSet) {
          const classSubjects = ensureClassEntry(pattern, classId);
          
          // Add all subjects for this class
          const classSubjectRecords = subjectRecords.filter(r => 
            r.instituteId === instituteId && r.classId === classId
          );
          
          for (const subjectRecord of classSubjectRecords) {
            if (subjectRecord.subjectId) {
              classSubjects.add(Number(subjectRecord.subjectId));
            }
          }
        }
      }
    }

    // Build separate compact entries for each role pattern
    const accessEntries: EnhancedInstituteAccessEntry[] = [];

    for (const [instituteId, accumulator] of accessMap.entries()) {
      for (const [role, pattern] of accumulator.patterns.entries()) {
        const compactClasses: CompactClassAccess[] = [];
        
        for (const [classId, subjectIds] of pattern.classes.entries()) {
          if (subjectIds.size === 0) {
            // No subjects, just class access
            compactClasses.push([classId]);
          } else {
            // Convert subjects to bitmask for ultra-compact representation
            const maxSubject = Math.max(...Array.from(subjectIds));
            if (maxSubject <= 30) { // Reasonable bitmask limit
              let subjectBitmask = 0;
              for (const subjectId of subjectIds) {
                subjectBitmask |= (1 << (subjectId - 1)); // 1-based to 0-based
              }
              compactClasses.push([classId, subjectBitmask]);
            } else {
              // Fallback for large subject IDs - just class access
              compactClasses.push([classId]);
            }
          }
        }

        // Get role bitmask
        const roleBitmask = ROLE_BITMASKS[role as keyof typeof ROLE_BITMASKS] || 0;

        accessEntries.push({
          i: instituteId,
          r: roleBitmask,
          c: compactClasses.length > 0 ? compactClasses : undefined,
        });
      }
    }

    return accessEntries.sort((a, b) => {
      // Sort by institute first, then by role priority (IA > TE > ST > AM)
      const instCompare = a.i.localeCompare(b.i);
      if (instCompare !== 0) return instCompare;
      
      // Higher bitmask = higher priority
      return b.r - a.r;
    });
  }

  private async findActiveChildrenIds(userId: string): Promise<string[]> {
    const rows = await this.studentRepository
      .createQueryBuilder('student')
      .select('student.userId', 'studentUserId')
      .where('student.isActive = :isActive', { isActive: true })
      .andWhere(
        new Brackets(qb => {
          qb.where('student.fatherId = :userId', { userId: String(userId) })
            .orWhere('student.motherId = :userId', { userId: String(userId) })
            .orWhere('student.guardianId = :userId', { userId: String(userId) });
        }),
      )
      .getRawMany<{ studentUserId: string }>();

    const uniqueIds = new Set<string>();
    for (const row of rows) {
      if (row.studentUserId) {
        uniqueIds.add(String(row.studentUserId));
      }
    }

    return Array.from(uniqueIds.values()).sort();
  }

  /**
   * Get comprehensive teacher access from both class assignments and subject assignments
   * STEP 1: Get subject-level access from institute_class_subjects.teacher_id
   * STEP 2: Get class-level access from institute_classes.class_teacher_id
   */
  private async getTeacherAccess(userId: string): Promise<Array<{
    instituteId: string;
    classId: string;
    subjectId?: string;
    isClassTeacher: boolean;
  }>> {
    const results: Array<{
      instituteId: string;
      classId: string;
      subjectId?: string;
      isClassTeacher: boolean;
    }> = [];

    // 1. Get subject teacher access (from institute_class_subjects.teacher_id)
    // Teachers assigned to specific subjects
    const subjectTeacherAccess = await this.instituteClassSubjectRepository
      .createQueryBuilder('ics')
      .select([
        'ics.instituteId AS instituteId',
        'ics.classId AS classId',
        'ics.subjectId AS subjectId',
      ])
      .where('ics.teacherId = :userId', { userId })
      .andWhere('ics.isActive = :isActive', { isActive: true })
      .getRawMany<{ instituteId: string; classId: string; subjectId: string }>();

    for (const access of subjectTeacherAccess) {
      results.push({
        instituteId: access.instituteId,
        classId: access.classId,
        subjectId: access.subjectId,
        isClassTeacher: false
      });
    }

    // 2. Get class teacher access (from institute_classes.class_teacher_id)
    // Class teachers get access to ALL subjects in their classes
    try {
      const classTeacherAccess = await this.dataSource.query(`
        SELECT DISTINCT
          ic.institute_id AS instituteId,
          ic.id AS classId
        FROM institute_classes ic
        WHERE ic.class_teacher_id = ?
          AND ic.is_active = true
      `, [userId]);

      for (const access of classTeacherAccess) {
        results.push({
          instituteId: String(access.instituteId),
          classId: String(access.classId),
          isClassTeacher: true
        });
      }
    } catch (error) {
      // If class_teacher_id column doesn't exist, skip class teacher access
      this.logger.warn('Class teacher access query failed, skipping', error);
    }

    return results;
  }

  private normalizeRoleCode(code: string): string {
    const normalized = code?.toUpperCase();
    switch (normalized) {
      case 'T':
      case 'TE':
        return 'TE';
      case 'S':
      case 'ST':
        return 'ST';
      default:
        return normalized;
    }
  }
}
