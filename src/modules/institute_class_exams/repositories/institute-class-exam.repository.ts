import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindManyOptions, FindOneOptions } from 'typeorm';
import { InstituteClassExamEntity } from '../entities/institute-class-exam.entity';
import { CreateExamDto } from '../dto/create-exam.dto';
import { UpdateExamDto } from '../dto/update-exam.dto';
import { ExamStatus, ExamType } from '../enums/exam.enum';

@Injectable()
export class InstituteClassExamRepository {
  constructor(
    @InjectRepository(InstituteClassExamEntity)
    private readonly examRepository: Repository<InstituteClassExamEntity>,
  ) {}

  async create(createExamDto: CreateExamDto): Promise<InstituteClassExamEntity> {
    const exam = this.examRepository.create({
      ...createExamDto,
      status: ExamStatus.DRAFT,
      startDate: new Date(createExamDto.startDate),
      endDate: new Date(createExamDto.endDate),
      isResultsPublished: false,
    });
    return this.examRepository.save(exam);
  }

  async findAll(options?: FindManyOptions<InstituteClassExamEntity>): Promise<InstituteClassExamEntity[]> {
    return this.examRepository.find(options);
  }

  async findOne(id: string, options?: FindOneOptions<InstituteClassExamEntity>): Promise<InstituteClassExamEntity | null> {
    return this.examRepository.findOne({ where: { id }, ...options });
  }

  async findByInstituteId(instituteId: string): Promise<InstituteClassExamEntity[]> {
    return this.examRepository.find({
      where: { instituteId },
      order: { createdAt: 'DESC' },
    });
  }

  async findByClassId(classId: string): Promise<InstituteClassExamEntity[]> {
    return this.examRepository.find({
      where: { classId },
      order: { createdAt: 'DESC' },
    });
  }

  async findByStatus(status: ExamStatus): Promise<InstituteClassExamEntity[]> {
    return this.examRepository.find({
      where: { status },
      order: { createdAt: 'DESC' },
    });
  }

  async findByExamType(examType: ExamType): Promise<InstituteClassExamEntity[]> {
    return this.examRepository.find({
      where: { examType },
      order: { createdAt: 'DESC' },
    });
  }

  async findActiveExams(): Promise<InstituteClassExamEntity[]> {
    const now = new Date();
    return this.examRepository.find({
      where: [
        { status: ExamStatus.PUBLISHED },
        { status: ExamStatus.IN_PROGRESS },
      ],
      order: { startDate: 'ASC' },
    });
  }

  async findUpcomingExams(instituteId?: string): Promise<InstituteClassExamEntity[]> {
    const now = new Date();
    const query = this.examRepository.createQueryBuilder('exam')
      .where('exam.startDate > :now', { now })
      .andWhere('exam.status IN (:...statuses)', { 
        statuses: [ExamStatus.PUBLISHED, ExamStatus.DRAFT] 
      });

    if (instituteId) {
      query.andWhere('exam.instituteId = :instituteId', { instituteId });
    }

    return query.orderBy('exam.startDate', 'ASC').getMany();
  }

  async update(id: string, updateExamDto: UpdateExamDto): Promise<InstituteClassExamEntity | null> {
    const updateData: any = { ...updateExamDto };
    
    // Convert date strings to Date objects if present
    if (updateExamDto.startDate) {
      updateData.startDate = new Date(updateExamDto.startDate);
    }
    if (updateExamDto.endDate) {
      updateData.endDate = new Date(updateExamDto.endDate);
    }

    await this.examRepository.update(id, updateData);
    return this.findOne(id);
  }

  async updateStatus(id: string, status: ExamStatus): Promise<InstituteClassExamEntity | null> {
    await this.examRepository.update(id, { status });
    return this.findOne(id);
  }

  async updateSheetMetadata(id: string, sheetStructure: any): Promise<InstituteClassExamEntity | null> {
    // Note: Google Sheets integration has been removed
    // This method is kept for backward compatibility but does nothing
    return this.findOne(id);
  }

  async publishResults(id: string): Promise<InstituteClassExamEntity | null> {
    await this.examRepository.update(id, { 
      isResultsPublished: true,
      status: ExamStatus.RESULTS_PUBLISHED,
      resultsPublishedDate: new Date(),
    });
    return this.findOne(id);
  }

  async delete(id: string): Promise<void> {
    await this.examRepository.delete(id);
  }

  async softDelete(id: string): Promise<InstituteClassExamEntity | null> {
    await this.examRepository.softDelete(id);
    return this.findOne(id);
  }

  async count(options?: FindManyOptions<InstituteClassExamEntity>): Promise<number> {
    return this.examRepository.count(options);
  }

  async findPaginated(
    page: number = 1, 
    limit: number = 10, 
    filters?: Partial<InstituteClassExamEntity>
  ): Promise<{ data: InstituteClassExamEntity[]; total: number; page: number; limit: number }> {
    const skip = (page - 1) * limit;
    
    const queryBuilder = this.examRepository.createQueryBuilder('exam');
    
    if (filters) {
      Object.keys(filters).forEach(key => {
        if (filters[key] !== undefined) {
          queryBuilder.andWhere(`exam.${key} = :${key}`, { [key]: filters[key] });
        }
      });
    }

    const [data, total] = await queryBuilder
      .skip(skip)
      .take(limit)
      .orderBy('exam.createdAt', 'DESC')
      .getManyAndCount();

    return {
      data,
      total,
      page,
      limit,
    };
  }
}
