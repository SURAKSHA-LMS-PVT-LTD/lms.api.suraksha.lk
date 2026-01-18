import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { InstituteClassSubjectStudent } from '../../institute_class_subject_modules/institute_class_subject_students/entities/institute_class_subject_student.entity';
import { SubjectEntity, SubjectType } from '../entities/subject.entity';
import { UserEntity } from '../../user/entities/user.entity';
import { AssignStudentSubjectsDto, AssignBasketSubjectDto } from '../dto/assign-student-subjects.dto';
import { StudentSubjectAssignmentResponseDto, StudentSubjectsResponseDto } from '../dto/student-subject-response.dto';
import { SubjectResponseDto } from '../dto/subject-response.dto';
import { now } from '../../../common/utils/timezone.util';

@Injectable()
export class StudentSubjectService {
  constructor(
    @InjectRepository(InstituteClassSubjectStudent)
    private readonly assignmentRepository: Repository<InstituteClassSubjectStudent>,
    @InjectRepository(SubjectEntity)
    private readonly subjectRepository: Repository<SubjectEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
  ) {}

  async assignMainSubjects(dto: AssignStudentSubjectsDto): Promise<StudentSubjectAssignmentResponseDto[]> {
    // Verify student exists
    const student = await this.userRepository.findOne({ where: { id: dto.studentId } });
    if (!student) {
      throw new NotFoundException(`Student with ID ${dto.studentId} not found`);
    }

    // Get main subjects
    const subjects = await this.subjectRepository.find({
      where: { 
        id: In(dto.subjectIds),
        subjectType: SubjectType.MAIN, 
        isActive: true 
      }
    });

    if (subjects.length !== dto.subjectIds.length) {
      throw new BadRequestException('Some subjects not found or are not main subjects');
    }

    const assignments: InstituteClassSubjectStudent[] = [];

    for (const subject of subjects) {
      // Check if already assigned
      const existing = await this.assignmentRepository.findOne({
        where: {
          studentId: dto.studentId,
          subjectId: subject.id,
          instituteId: dto.instituteId,
          classId: dto.classId,
          isActive: true
        }
      });

      if (!existing) {
        const timestamp = now();
        const assignment = this.assignmentRepository.create({
          studentId: dto.studentId,
          instituteId: dto.instituteId,
          classId: dto.classId,
          subjectId: subject.id,
          isActive: true,
          createdAt: timestamp,
          updatedAt: timestamp,
        });
        assignments.push(assignment);
      }
    }

    const savedAssignments = await this.assignmentRepository.save(assignments);
    return savedAssignments.map(assignment => new StudentSubjectAssignmentResponseDto({
      ...assignment,
      subject: new SubjectResponseDto(subjects.find(s => s.id === assignment.subjectId)!)
    }));
  }

  async assignBasketSubject(dto: AssignBasketSubjectDto): Promise<StudentSubjectAssignmentResponseDto> {
    // Verify student exists
    const student = await this.userRepository.findOne({ where: { id: dto.studentId } });
    if (!student) {
      throw new NotFoundException(`Student with ID ${dto.studentId} not found`);
    }

    // Verify the selected subject is a basket subject
    const selectedSubject = await this.subjectRepository.findOne({
      where: { 
        id: dto.selectedSubjectId, 
        subjectType: SubjectType.BASKET,
        isActive: true 
      }
    });
    if (!selectedSubject || !selectedSubject.basketCategory) {
      throw new BadRequestException(`Subject ${dto.selectedSubjectId} is not a valid basket subject`);
    }

    // Check if student already has a selection for this basket category
    const existingAssignment = await this.assignmentRepository.findOne({
      where: {
        studentId: dto.studentId,
        instituteId: dto.instituteId,
        classId: dto.classId,
        isActive: true
      },
      relations: ['subject']
    });

    if (existingAssignment && existingAssignment.subject?.basketCategory === selectedSubject.basketCategory) {
      // Update existing assignment
      existingAssignment.subjectId = dto.selectedSubjectId;
      const updatedAssignment = await this.assignmentRepository.save(existingAssignment);
      
      return new StudentSubjectAssignmentResponseDto({
        ...updatedAssignment,
        subject: new SubjectResponseDto(selectedSubject)
      });
    } else {
      // Create new assignment
      const timestamp = now();
      const assignment = this.assignmentRepository.create({
        studentId: dto.studentId,
        instituteId: dto.instituteId,
        classId: dto.classId,
        subjectId: dto.selectedSubjectId,
        isActive: true,
        createdAt: timestamp,
        updatedAt: timestamp,
      });

      const savedAssignment = await this.assignmentRepository.save(assignment);
      
      return new StudentSubjectAssignmentResponseDto({
        ...savedAssignment,
        subject: new SubjectResponseDto(selectedSubject)
      });
    }
  }

  async getStudentSubjects(studentId: string, instituteId: string, classId: string): Promise<StudentSubjectsResponseDto> {
    // Get all assignments for the student
    const assignments = await this.assignmentRepository.find({
      where: {
        studentId,
        instituteId,
        classId,
        isActive: true
      },
      relations: ['subject', 'basketParent']
    });

    // Separate main and basket subjects based on the subject entity's type
    const mainAssignments = assignments.filter(a => a.subject?.subjectType === SubjectType.MAIN);
    const basketAssignments = assignments.filter(a => a.subject?.subjectType === SubjectType.BASKET);

    // Get main subjects
    const mainSubjects = mainAssignments.map(a => new SubjectResponseDto(a.subject));

    // Get basket subjects grouped by category
    const basketSubjects = [];
    const processedCategories = new Set<string>();

    for (const assignment of basketAssignments) {
      if (assignment.subject?.basketCategory && !processedCategories.has(assignment.subject.basketCategory)) {
        processedCategories.add(assignment.subject.basketCategory);

        // Get all available options for this basket category
        const availableOptions = await this.subjectRepository.find({
          where: {
            basketCategory: assignment.subject.basketCategory,
            subjectType: SubjectType.BASKET,
            isActive: true
          }
        });

        basketSubjects.push({
          basketCategory: assignment.subject.basketCategory,
          selectedOption: new SubjectResponseDto(assignment.subject),
          availableOptions: availableOptions.map(option => new SubjectResponseDto(option))
        });
      }
    }

    return new StudentSubjectsResponseDto({
      studentId,
      mainSubjects,
      basketSubjects,
      totalSubjects: mainSubjects.length + basketSubjects.length
    });
  }

  async getStudentsForBasketSubject(basketCategory: string, selectedSubjectId: string, instituteId: string, classId: string): Promise<string[]> {
    const assignments = await this.assignmentRepository.find({
      where: {
        subjectId: selectedSubjectId,
        instituteId,
        classId,
        isActive: true
      },
      relations: ['subject']
    });

    // Filter by basket category
    const filteredAssignments = assignments.filter(a => a.subject?.basketCategory === basketCategory);
    return filteredAssignments.map(a => a.studentId);
  }

  async removeStudentSubjectAssignment(studentId: string, subjectId: string, instituteId: string, classId: string): Promise<void> {
    const assignment = await this.assignmentRepository.findOne({
      where: {
        studentId,
        subjectId,
        instituteId,
        classId,
        isActive: true
      }
    });

    if (!assignment) {
      throw new NotFoundException('Subject assignment not found');
    }

    assignment.isActive = false;
    await this.assignmentRepository.save(assignment);
  }
}
