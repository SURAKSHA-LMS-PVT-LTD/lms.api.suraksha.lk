import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository, SelectQueryBuilder } from 'typeorm';
import { InstituteClassEntity } from '../entities/institue_class.entity';
import { IInstituteClass, IInstituteClassRepository } from '../interfaces/institute-class.interface';
import { ClassFilterDto } from '../dto/class-filter.dto';
import { PaginatedResponseDto } from '@common/dto/paginated-response.dto';
import { now } from '../../../../common/utils/timezone.util';


@Injectable()
export class InstituteClassRepository implements IInstituteClassRepository {
  constructor(
    @InjectRepository(InstituteClassEntity)
    private readonly classRepository: Repository<InstituteClassEntity>,
  ) {}

  async create(instituteClass: Partial<IInstituteClass>): Promise<IInstituteClass> {
    const timestamp = now();
    const newClass = this.classRepository.create({
      ...instituteClass,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    return await this.classRepository.save(newClass);
  }

  async findAll(filters?: Partial<IInstituteClass>): Promise<IInstituteClass[]> {
    return await this.classRepository.find({
      where: filters,
      order: { grade: 'ASC', name: 'ASC' },
    });
  }

  async findAllPaginated(filterDto: ClassFilterDto): Promise<PaginatedResponseDto<IInstituteClass>> {
    const queryBuilder: SelectQueryBuilder<InstituteClassEntity> = this.classRepository
      .createQueryBuilder('class')
      .leftJoinAndSelect('class.classTeacher', 'teacher');

    // Apply filters
    if (filterDto.instituteId) {
      queryBuilder.andWhere('class.instituteId = :instituteId', { instituteId: filterDto.instituteId });
    }

    if (filterDto.academicYear) {
      queryBuilder.andWhere('class.academicYear = :academicYear', { academicYear: filterDto.academicYear });
    }

    if (filterDto.grade !== undefined && filterDto.grade !== null) {
      queryBuilder.andWhere('class.grade = :grade', { grade: filterDto.grade });
    }

    if (filterDto.specialty) {
      queryBuilder.andWhere('class.specialty = :specialty', { specialty: filterDto.specialty });
    }

    if (filterDto.classType) {
      queryBuilder.andWhere('class.classType = :classType', { classType: filterDto.classType });
    }

    if (filterDto.classTeacherId) {
      queryBuilder.andWhere('class.classTeacherId = :classTeacherId', { classTeacherId: filterDto.classTeacherId });
    }

    if (filterDto.isActive !== undefined && filterDto.isActive !== null) {
      queryBuilder.andWhere('class.isActive = :isActive', { isActive: filterDto.isActive });
    }

    if (filterDto.search) {
      queryBuilder.andWhere(
        '(class.name LIKE :search OR class.code LIKE :search)',
        { search: `%${filterDto.search}%` }
      );
    }

    // Add ordering
    queryBuilder.orderBy('class.grade', 'ASC')
                .addOrderBy('class.name', 'ASC');

    // Get total count for pagination
    const total = await queryBuilder.getCount();

    // Apply pagination
    const page = filterDto.page || 1;
    const limit = filterDto.limit || 10;
    queryBuilder.skip(filterDto.skip).take(limit);

    // Get results
    const data = await queryBuilder.getMany();

    return new PaginatedResponseDto(data, page, limit, total);
  }

  async findOne(id: string): Promise<IInstituteClass | null> {
    const classEntity = await this.classRepository.findOne({ 
      where: { id },
      relations: ['classTeacher']
    });
    if (!classEntity) {
      return null;
    }
    return classEntity;
  }

  async findOneByInstitute(id: string, instituteId: string): Promise<IInstituteClass | null> {
    const classEntity = await this.classRepository.findOne({ 
      where: { id, instituteId },
      relations: ['classTeacher']
    });
    if (!classEntity) {
      return null;
    }
    return classEntity;
  }

  async findByInstitute(instituteId: string): Promise<IInstituteClass[]> {
    return await this.classRepository.find({ 
      where: { instituteId },
      relations: ['classTeacher'],
      order: { grade: 'ASC', name: 'ASC' },
    });
  }

  async findByAcademicYear(instituteId: string, academicYear: string): Promise<IInstituteClass[]> {
    return await this.classRepository.find({ 
      where: { instituteId, academicYear },
      order: { grade: 'ASC', name: 'ASC' },
    });
  }

  async findByGrade(instituteId: string, grade: number): Promise<IInstituteClass[]> {
    return await this.classRepository.find({ 
      where: { instituteId, grade },
      order: { name: 'ASC' },
    });
  }

  async findBySpecialty(instituteId: string, specialty: string): Promise<IInstituteClass[]> {
    return await this.classRepository.find({ 
      where: { instituteId, specialty },
      order: { grade: 'ASC', name: 'ASC' },
    });
  }

  async findByTeacher(classTeacherId: string): Promise<IInstituteClass[]> {
    return await this.classRepository.find({ 
      where: { classTeacherId },
      order: { instituteId: 'ASC', grade: 'ASC', name: 'ASC' },
    });
  }

  async findByTeacherInInstitute(classTeacherId: string, instituteId: string): Promise<IInstituteClass[]> {
    return await this.classRepository.find({ 
      where: { classTeacherId, instituteId },
      order: { grade: 'ASC', name: 'ASC' },
    });
  }

  async findActive(instituteId: string): Promise<IInstituteClass[]> {
    return await this.classRepository.find({ 
      where: { instituteId, isActive: true },
      order: { grade: 'ASC', name: 'ASC' },
    });
  }

  async update(id: string, instituteClass: Partial<IInstituteClass>): Promise<IInstituteClass | null> {
    await this.classRepository.update(id, instituteClass);
    return await this.findOne(id);
  }

  async updateWithInstituteValidation(id: string, instituteId: string, instituteClass: Partial<IInstituteClass>): Promise<IInstituteClass | null> {
    // Validate that the class belongs to the institute before updating
    const existingClass = await this.findOneByInstitute(id, instituteId);
    if (!existingClass) {
      return null;
    }
    
    await this.classRepository.update({ id, instituteId }, instituteClass);
    return await this.findOneByInstitute(id, instituteId);
  }

  async remove(id: string): Promise<void> {
    await this.classRepository.delete(id);
  }

  async removeWithInstituteValidation(id: string, instituteId: string): Promise<boolean> {
    const result = await this.classRepository.delete({ id, instituteId });
    return result.affected > 0;
  }

  async activate(id: string): Promise<IInstituteClass | null> {
    await this.classRepository.update(id, { isActive: true });
    return await this.findOne(id);
  }

  async activateWithInstituteValidation(id: string, instituteId: string): Promise<IInstituteClass | null> {
    const result = await this.classRepository.update({ id, instituteId }, { isActive: true });
    if (result.affected === 0) {
      return null;
    }
    return await this.findOneByInstitute(id, instituteId);
  }

  async deactivate(id: string): Promise<IInstituteClass | null> {
    await this.classRepository.update(id, { isActive: false });
    return await this.findOne(id);
  }

  async deactivateWithInstituteValidation(id: string, instituteId: string): Promise<IInstituteClass | null> {
    const result = await this.classRepository.update({ id, instituteId }, { isActive: false });
    if (result.affected === 0) {
      return null;
    }
    return await this.findOneByInstitute(id, instituteId);
  }

  async isCodeUnique(code: string, excludeId?: string): Promise<boolean> {
    const queryOptions: any = { code };
    
    if (excludeId) {
      queryOptions.id = Not(excludeId);
    }
    
    const existingClass = await this.classRepository.findOne({ 
      where: queryOptions
    });
    
    return !existingClass;
  }

  async isCodeUniqueInInstitute(code: string, instituteId: string, excludeId?: string): Promise<boolean> {
    const queryOptions: any = { code, instituteId };
    
    if (excludeId) {
      queryOptions.id = Not(excludeId);
    }
    
    const existingClass = await this.classRepository.findOne({ 
      where: queryOptions
    });
    
    return !existingClass;
  }

  async findByEnrollmentCode(enrollmentCode: string): Promise<IInstituteClass | null> {
    if (!enrollmentCode) {
      return null;
    }
    
    return await this.classRepository.findOne({ 
      where: { enrollmentCode },
      relations: ['institute']
    });
  }

  async findByEnrollmentCodeInInstitute(enrollmentCode: string, instituteId: string): Promise<IInstituteClass | null> {
    if (!enrollmentCode) {
      return null;
    }
    
    return await this.classRepository.findOne({ 
      where: { enrollmentCode, instituteId },
      relations: ['institute']
    });
  }
}
