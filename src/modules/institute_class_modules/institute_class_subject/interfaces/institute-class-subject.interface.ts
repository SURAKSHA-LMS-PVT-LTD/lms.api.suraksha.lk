export interface IInstituteClassSubject {
  instituteId: string;
  classId: string;
  subjectId: string;
  teacherId?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IInstituteClassSubjectWithRelations extends IInstituteClassSubject {
  institute?: {
    id: string;
    name: string;
    code: string;
  };
  class?: {
    id: string;
    name: string;
    code: string;
  };
  subject?: {
    id: string;
    name: string;
    code: string;
  };
  teacher?: {
    id: string;
    firstName: string;
    lastName?: string;
    nameWithInitials?: string;
    email?: string;
    phone?: string;
    imageUrl?: string;
  };
}

export interface IInstituteClassSubjectStats {
  totalSubjects: number;
  activeSubjects: number;
  inactiveSubjects: number;
  subjectsWithTeachers: number;
  subjectsWithoutTeachers: number;
}

export interface IInstituteClassSubjectRepository {
  findByInstituteAndClass(instituteId: string, classId: string): Promise<IInstituteClassSubject[]>;
  findByTeacher(teacherId: string): Promise<IInstituteClassSubject[]>;
  findByInstituteAndTeacher(instituteId: string, teacherId: string): Promise<IInstituteClassSubject[]>;
  findByInstituteClassAndTeacher(instituteId: string, classId: string, teacherId: string): Promise<IInstituteClassSubject[]>;
  findByInstitute(instituteId: string): Promise<IInstituteClassSubject[]>;
  findByInstituteClassAndSubject(instituteId: string, classId: string, subjectId: string): Promise<IInstituteClassSubjectWithRelations | null>;
  existsByInstituteClassAndSubject(instituteId: string, classId: string, subjectId: string): Promise<boolean>;
  getStats(instituteId?: string): Promise<IInstituteClassSubjectStats>;
}
