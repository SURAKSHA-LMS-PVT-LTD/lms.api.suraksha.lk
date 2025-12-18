import { SubjectResponseDto } from './subject-response.dto';

export class PaginatedSubjectResponseDto {
  data: SubjectResponseDto[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;

  constructor(data: SubjectResponseDto[], page: number, limit: number, total: number) {
    this.data = data;
    this.page = page;
    this.limit = limit;
    this.total = total;
    this.totalPages = Math.ceil(total / limit);
  }
}
