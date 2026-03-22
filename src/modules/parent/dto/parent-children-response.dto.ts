import { ApiProperty } from '@nestjs/swagger';

export class ChildInfoDto {
  @ApiProperty({ 
    description: 'Child user ID', 
    example: '40' 
  })
  id: string;

  @ApiProperty({ 
    description: 'Child full name', 
    example: 'Sanula Perera' 
  })
  name: string;

  @ApiProperty({ 
    description: 'Name with initials (e.g. S. Perera)', 
    example: 'S. Perera',
    required: false
  })
  nameWithInitials?: string;

  @ApiProperty({ 
    description: 'Masked child phone number (only last 3 digits visible for security)', 
    example: '+94****567' 
  })
  phoneNumber: string;

  @ApiProperty({ 
    description: 'Child email address', 
    example: 'sanula.perera@example.com' 
  })
  email: string;

  @ApiProperty({ 
    description: 'Full image URL with cloud storage base URL', 
    example: 'https://storage.googleapis.com/bucket-name/suraksha.lk/user-profile/student-123.jpg',
    nullable: true
  })
  imageUrl: string | null;

  @ApiProperty({ 
    description: 'Relationship to parent', 
    example: 'father',
    enum: ['father', 'mother', 'guardian']
  })
  relationship: string;

  constructor(partial: Partial<ChildInfoDto>) {
    Object.assign(this, partial);
  }
}

export class ParentChildrenResponseDto {
  @ApiProperty({ 
    description: 'Parent user ID', 
    example: '57' 
  })
  parentId: string;

  @ApiProperty({ 
    description: 'Parent full name', 
    example: 'John Smith' 
  })
  parentName: string;

  @ApiProperty({ 
    description: 'List of children with essential information', 
    type: [ChildInfoDto] 
  })
  children: ChildInfoDto[];

  constructor(partial: Partial<ParentChildrenResponseDto>) {
    Object.assign(this, partial);
    if (partial.children) {
      this.children = partial.children.map(child => new ChildInfoDto(child));
    }
  }
}
