import { Injectable, NotFoundException, ConflictException, ForbiddenException, Logger } from '@nestjs/common';
import { SubjectEntity } from './entities/subject.entity';
import { SubjectRepository } from './repositories/subject.repository';
import { CreateSubjectDto } from './dto/create-subject.dto';
import { UpdateSubjectDto } from './dto/update-subject.dto';
import { QuerySubjectDto } from './dto/query-subject.dto';
import { SubjectResponseDto } from './dto/subject-response.dto';
import { PaginatedSubjectResponseDto } from './dto/paginated-subject-response.dto';
import { ISubjectStats, ISubjectCategoryStats } from './interfaces/subject.interface';
import { CloudStorageService } from '../../common/services/cloud-storage.service';
import { JwtPayload } from '../../common/interfaces/jwt-request.interface';
import { UserType } from '../user/enums/user-type.enum';
import { ROLE_BITMASKS } from '../../auth/interfaces/enhanced-jwt-payload.interface';
import { now } from '../../common/utils/timezone.util';

@Injectable()
export class SubjectService {
  private readonly logger = new Logger(SubjectService.name);
  constructor(
    private readonly subjectRepository: SubjectRepository,
    private readonly cloudStorageService: CloudStorageService,
  ) {}

  async create(createSubjectDto: CreateSubjectDto): Promise<SubjectResponseDto> {
    try {
      // Check for duplicate subject code
      const existingSubject = await this.subjectRepository.findByCode(createSubjectDto.code.toUpperCase());
      if (existingSubject) {
        throw new ConflictException('A subject with this code already exists.');
      }

      const subjectData = {
        ...createSubjectDto,
        code: createSubjectDto.code.toUpperCase(),
      };

      const savedSubject = await this.subjectRepository.create(subjectData);

      return this.mapToResponseDto(savedSubject);
    } catch (error) {
      // Handle duplicate entry error from MySQL
      if (error.code === 'ER_DUP_ENTRY') {
        throw new ConflictException('A subject with this code already exists.');
      }
      throw error;
    }
  }

  async createWithImage(
    createSubjectDto: CreateSubjectDto, 
    imageFile?: string
  ): Promise<SubjectResponseDto> {
    try {
      // Check for duplicate subject code
      const existingSubject = await this.subjectRepository.findByCode(createSubjectDto.code.toUpperCase());
      if (existingSubject) {
        throw new ConflictException('A subject with this code already exists.');
      }

      let subjectData = {
        ...createSubjectDto,
        code: createSubjectDto.code.toUpperCase(),
      };

      // Create subject with image URL already included (from signed URL upload)
      // Note: imageFile parameter is deprecated - use imgUrl field in DTO instead
      const savedSubject = await this.subjectRepository.create(subjectData);

      return this.mapToResponseDto(savedSubject);
    } catch (error) {
      // Handle duplicate entry error from MySQL
      if (error.code === 'ER_DUP_ENTRY') {
        throw new ConflictException('A subject with this code already exists.');
      }
      throw error;
    }
  }

  async findAll(query: QuerySubjectDto): Promise<PaginatedSubjectResponseDto> {
    
    const [subjects, total] = await this.subjectRepository.findWithPagination(query);

    const subjectResponseDtos = subjects.map(subject => this.mapToResponseDto(subject));

    const pageNumber = query.page ?? 1;
    const limitNumber = query.limit === -1 || query.limit === 0 ? total : (query.limit ?? 50);

    const result = new PaginatedSubjectResponseDto(subjectResponseDtos, pageNumber, limitNumber, total);
    
    return result;
  }

  async findOne(id: string): Promise<SubjectResponseDto> {
    const subject = await this.subjectRepository.findById(id);

    if (!subject) {
      throw new NotFoundException(`Subject with ID ${id} not found`);
    }

    return this.mapToResponseDto(subject);
  }

  async findByCode(code: string): Promise<SubjectResponseDto> {
    const subject = await this.subjectRepository.findByCode(code.toUpperCase());

    if (!subject) {
      throw new NotFoundException(`Subject with code ${code} not found`);
    }

    return this.mapToResponseDto(subject);
  }

  async findByCodeAndInstitute(code: string, instituteId: string): Promise<SubjectResponseDto> {
    const subject = await this.subjectRepository.findByCodeAndInstitute(code.toUpperCase(), instituteId);

    if (!subject) {
      throw new NotFoundException(`Subject with code ${code} not found in this institute`);
    }

    return this.mapToResponseDto(subject);
  }

  async findOneByInstitute(id: string, instituteId: string): Promise<SubjectResponseDto> {
    const subject = await this.subjectRepository.findByIdAndInstitute(id, instituteId);

    if (!subject) {
      throw new NotFoundException(`Subject with ID ${id} not found in this institute`);
    }

    return this.mapToResponseDto(subject);
  }

  async update(id: string, updateSubjectDto: UpdateSubjectDto, user?: JwtPayload): Promise<SubjectResponseDto> {
    const subject = await this.subjectRepository.findById(id);

    if (!subject) {
      throw new NotFoundException(`Subject with ID ${id} not found`);
    }

    // Validate institute access for non-SUPERADMIN users
    if (user) {
      this.validateInstituteAccess(subject, user, 'update');
    }

    // Check for duplicate code if code is being updated
    if (updateSubjectDto.code && updateSubjectDto.code.toUpperCase() !== subject.code) {
      const existingSubject = await this.subjectRepository.findByCode(updateSubjectDto.code.toUpperCase());
      if (existingSubject) {
        throw new ConflictException('A subject with this code already exists.');
      }
    }

    try {
      const updateData = {
        ...updateSubjectDto,
        ...(updateSubjectDto.code && { code: updateSubjectDto.code.toUpperCase() }),
      };

      await this.subjectRepository.update(id, updateData);
      return await this.findOne(id);
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') {
        throw new ConflictException('A subject with this code already exists.');
      }
      throw error;
    }
  }

  async updateWithImage(
    id: string, 
    updateSubjectDto: UpdateSubjectDto, 
    imageFile?: string,
    user?: JwtPayload
  ): Promise<SubjectResponseDto> {
    const subject = await this.subjectRepository.findById(id);

    if (!subject) {
      throw new NotFoundException(`Subject with ID ${id} not found`);
    }

    // Validate institute access for non-SUPERADMIN users
    if (user) {
      this.validateInstituteAccess(subject, user, 'update');
    }

    // Check for duplicate code if code is being updated
    if (updateSubjectDto.code && updateSubjectDto.code.toUpperCase() !== subject.code) {
      const existingSubject = await this.subjectRepository.findByCode(updateSubjectDto.code.toUpperCase());
      if (existingSubject) {
        throw new ConflictException('A subject with this code already exists.');
      }
    }

    try {
      let updateData = {
        ...updateSubjectDto,
        ...(updateSubjectDto.code && { code: updateSubjectDto.code.toUpperCase() }),
      };

      // Note: imageFile parameter is deprecated - use imgUrl field in DTO instead
      // Image should be uploaded via /upload/verify-and-publish endpoint first

      await this.subjectRepository.update(id, updateData);
      return await this.findOne(id);
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') {
        throw new ConflictException('A subject with this code already exists.');
      }
      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    const subject = await this.subjectRepository.findById(id);

    if (!subject) {
      throw new NotFoundException(`Subject with ID ${id} not found`);
    }

    await this.subjectRepository.remove(subject);
  }

  async updateSubjectImage(id: string, imageUrl: string): Promise<SubjectResponseDto> {
    const subject = await this.subjectRepository.findById(id);
    if (!subject) {
      throw new NotFoundException('Subject not found.');
    }

    const updateData = { imgUrl: imageUrl };
    await this.subjectRepository.update(id, updateData);
    
    // Fetch the updated subject
    const updatedSubject = await this.subjectRepository.findById(id);
    return this.mapToResponseDto(updatedSubject);
  }

  async softDelete(id: string, user?: JwtPayload): Promise<SubjectResponseDto> {
    const subject = await this.subjectRepository.findById(id);

    if (!subject) {
      throw new NotFoundException(`Subject with ID ${id} not found`);
    }

    // Validate institute access for non-SUPERADMIN users
    if (user) {
      this.validateInstituteAccess(subject, user, 'deactivate');
    }

    await this.subjectRepository.update(id, { isActive: false });

    // Return updated data directly — avoids a second fetch that could fail
    subject.isActive = false;
    return this.mapToResponseDto(subject);
  }

  async activate(id: string, user?: JwtPayload): Promise<SubjectResponseDto> {
    // findById finds the subject regardless of isActive status
    const subject = await this.subjectRepository.findById(id);

    if (!subject) {
      throw new NotFoundException(`Subject with ID ${id} not found`);
    }

    // Validate institute access for non-SUPERADMIN users
    if (user) {
      this.validateInstituteAccess(subject, user, 'activate');
    }

    await this.subjectRepository.update(id, { isActive: true });

    // Return updated data directly — avoids a second fetch that could fail
    subject.isActive = true;
    return this.mapToResponseDto(subject);
  }

  async getSubjectStats(instituteId: string): Promise<ISubjectStats> {
    const total = await this.subjectRepository.countByInstitute(instituteId);
    const active = await this.subjectRepository.countActiveByInstitute(instituteId);
    const inactive = total - active;

    return { total, active, inactive };
  }

  async getSubjectsByCategory(instituteId: string): Promise<ISubjectCategoryStats[]> {
    return this.subjectRepository.getSubjectsByCategoryAndInstitute(instituteId);
  }

  /**
   * Validate that user has access to the institute that owns the subject
   * @throws ForbiddenException if user doesn't have access
   * @throws NotFoundException if subject has no instituteId
   */
  private validateInstituteAccess(subject: SubjectEntity, user: JwtPayload, operation: string): void {
    // Validate subject has instituteId
    if (!subject.instituteId) {
      throw new NotFoundException(
        `Subject ${subject.id} does not belong to any institute. Cannot validate access.`
      );
    }

    // SUPERADMIN has access to all institutes
    if (user.userType === UserType.SUPERADMIN || user.u === 0) {
      this.logger.debug(`SUPERADMIN user ${user.s} accessing subject ${subject.id} for ${operation}`);
      return;
    }

    // Validate user has instituteId array
    if (!user.i || !Array.isArray(user.i) || user.i.length === 0) {
      this.logger.warn(`User ${user.s} has no institute access. User type: ${user.u}`);
      throw new ForbiddenException(
        `You do not have access to any institute. Cannot ${operation} subjects.`
      );
    }

    // Check if user has institute admin access to this specific institute
    // Role bitmask for Institute Admin (IA) = 8 per ROLE_BITMASKS
    const hasAccessToInstitute = user.i.some(
      // String() coercion guards against number vs string mismatch in JWT values
      entry => String(entry.i) === String(subject.instituteId) && (entry.r & ROLE_BITMASKS.IA) !== 0
    );

    if (!hasAccessToInstitute) {
      this.logger.warn(`User ${user.s} denied access to subject ${subject.id} (institute: ${subject.instituteId})`);
      throw new ForbiddenException(
        `You do not have permission to ${operation} subjects in institute ${subject.instituteId}. This subject belongs to a different institute or you don't have Institute Admin role.`
      );
    }

    this.logger.debug(`User ${user.s} granted access to subject ${subject.id} (institute: ${subject.instituteId}) for ${operation}`);
  }

  private mapToResponseDto(subject: SubjectEntity): SubjectResponseDto {
    return new SubjectResponseDto({
      id: subject.id,
      code: subject.code,
      name: subject.name,
      description: subject.description,
      category: subject.category,
      creditHours: subject.creditHours,
      isActive: subject.isActive,
      subjectType: subject.subjectType,
      basketCategory: subject.basketCategory,
      instituteId: subject.instituteId,
      // ✅ Transform relative path to full URL
      imgUrl: subject.imgUrl ? this.cloudStorageService.getFullUrl(subject.imgUrl) : subject.imgUrl,
      createdAt: subject.createdAt,
      updatedAt: subject.updatedAt,
    });
  }
}
