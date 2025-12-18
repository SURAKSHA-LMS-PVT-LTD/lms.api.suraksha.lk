import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SubjectEntity } from '../entities/subject.entity';
import { SubjectType } from '../enums/subject-type.enum';
import { BASKET_CATEGORIES, BasketCategoryConfig } from '../../../config/basket-categories.config';

export interface BasketCategory {
  displayName: string;
  description: string;
  examples: string[];
}

export interface BasketSubjectGroup {
  basketCategory: string;
  displayName: string;
  description: string;
  subjects: SubjectEntity[];
}

@Injectable()
export class BasketSubjectService {
  constructor(
    @InjectRepository(SubjectEntity)
    private readonly subjectRepository: Repository<SubjectEntity>,
  ) {}

  /**
   * Get all available basket categories from configuration
   */
  getBasketCategories(): Record<string, BasketCategoryConfig> {
    return BASKET_CATEGORIES;
  }

  /**
   * Get all subjects grouped by basket category
   */
  async getSubjectsGroupedByBasket(instituteId?: string): Promise<{
    mainSubjects: SubjectEntity[];
    basketGroups: BasketSubjectGroup[];
  }> {
    const whereClause: any = { isActive: true };
    if (instituteId) {
      // Add institute filter if needed based on your institute-subject relationship
    }

    // Get all subjects
    const allSubjects = await this.subjectRepository.find({
      where: whereClause,
      order: { subjectType: 'ASC', basketCategory: 'ASC', name: 'ASC' }
    });

    // Separate main subjects
    const mainSubjects = allSubjects.filter(s => s.subjectType === SubjectType.MAIN);

    // Group basket subjects by category
    const basketSubjects = allSubjects.filter(s => s.subjectType === SubjectType.BASKET);
    const basketGroups: BasketSubjectGroup[] = [];
    const basketCategories = this.getBasketCategories();

    // Group by basket category
    const groupedBaskets = basketSubjects.reduce((groups, subject) => {
      const category = subject.basketCategory || 'UNCATEGORIZED';
      if (!groups[category]) {
        groups[category] = [];
      }
      groups[category].push(subject);
      return groups;
    }, {} as Record<string, SubjectEntity[]>);

    // Create basket groups with metadata
    Object.entries(groupedBaskets).forEach(([category, subjects]) => {
      const categoryInfo = basketCategories[category] || {
        displayName: category,
        description: `${category} subjects`,
        examples: []
      };

      basketGroups.push({
        basketCategory: category,
        displayName: categoryInfo.displayName,
        description: categoryInfo.description,
        subjects: subjects
      });
    });

    return {
      mainSubjects,
      basketGroups
    };
  }

  /**
   * Get subjects for a specific basket category
   */
  async getSubjectsByBasketCategory(basketCategory: string): Promise<SubjectEntity[]> {
    return await this.subjectRepository.find({
      where: {
        basketCategory,
        subjectType: SubjectType.BASKET,
        isActive: true
      },
      order: { name: 'ASC' }
    });
  }

  /**
   * Get student's selected subjects grouped by basket
   * This works with existing enrollment system
   */
  async getStudentBasketSelections(studentEnrollments: any[]): Promise<{
    mainSubjects: SubjectEntity[];
    basketSelections: { basketCategory: string; selectedSubject: SubjectEntity; displayName: string }[];
  }> {
    if (!studentEnrollments.length) {
      return { mainSubjects: [], basketSelections: [] };
    }

    // Get subjects from enrollments
    const subjectIds = studentEnrollments.map(e => e.subjectId || e.subject?.id).filter(Boolean);
    const subjects = await this.subjectRepository.findByIds(subjectIds);

    // Separate main and basket subjects
    const mainSubjects = subjects.filter(s => s.subjectType === SubjectType.MAIN);
    const basketSubjects = subjects.filter(s => s.subjectType === SubjectType.BASKET);

    // Group basket selections
    const basketCategories = this.getBasketCategories();
    const basketSelections = basketSubjects.map(subject => ({
      basketCategory: subject.basketCategory || 'UNCATEGORIZED',
      selectedSubject: subject,
      displayName: basketCategories[subject.basketCategory]?.displayName || subject.basketCategory
    }));

    return {
      mainSubjects,
      basketSelections
    };
  }

  /**
   * Get all students who selected a specific basket subject
   * This can be used for attendance, exams, etc.
   */
  async getStudentsWithBasketSubject(subjectId: string): Promise<any[]> {
    // This would integrate with your existing institute class subject students
    // Return student IDs or student objects who are enrolled in this basket subject
    
    // Example implementation - you'll need to adapt this to your enrollment system:
    // const enrollments = await this.instituteClassSubjectStudentsRepository.find({
    //   where: { subjectId },
    //   relations: ['student']
    // });
    // return enrollments.map(e => e.student);
    
    return []; // Placeholder - implement based on your enrollment system
  }

  /**
   * Validate basket category exists in configuration
   */
  validateBasketCategory(basketCategory: string): boolean {
    const categories = this.getBasketCategories();
    return basketCategory in categories;
  }

  /**
   * Get basket category info
   */
  getBasketCategoryInfo(basketCategory: string): BasketCategory | null {
    const categories = this.getBasketCategories();
    return categories[basketCategory] || null;
  }
}
