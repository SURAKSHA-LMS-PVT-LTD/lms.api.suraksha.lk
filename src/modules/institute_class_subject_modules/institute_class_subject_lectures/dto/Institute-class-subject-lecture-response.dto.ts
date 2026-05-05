import { ApiProperty } from "@nestjs/swagger";

export class InstituteClassSubjectLectureResponseDto {
  @ApiProperty({ description: 'Lecture ID' })
  id: string;

  @ApiProperty({ description: 'Institute ID' })
  instituteId: string;

  @ApiProperty({ description: 'Class ID' })
  classId?: string;

  @ApiProperty({ description: 'Subject ID' })
  subjectId: string;

  @ApiProperty({ description: 'Instructor ID' })
  instructorId: string;

  @ApiProperty({ description: 'Lecture title' })
  title: string;

  @ApiProperty({ description: 'Lecture description' })
  description?: string;

  @ApiProperty({ description: 'Lecture type' })
  lectureType: string;

  @ApiProperty({ description: 'Venue' })
  venue?: string;

  @ApiProperty({ description: 'Start time' })
  startTime: Date;

  @ApiProperty({ description: 'End time' })
  endTime: Date;

  @ApiProperty({ description: 'Lecture status' })
  status: string;

  @ApiProperty({ description: 'Meeting link' })
  meetingLink?: string;

  @ApiProperty({ description: 'Meeting ID' })
  meetingId?: string;

  @ApiProperty({ description: 'Recording URL' })
  recordingUrl?: string;

  @ApiProperty({ description: 'Is recorded' })
  isRecorded: boolean;

  @ApiProperty({ description: 'Maximum participants' })
  maxParticipants?: number;

  @ApiProperty({ description: 'Is active' })
  isActive: boolean;

  @ApiProperty({ description: 'Enable welcome message', required: false })
  welcomeMessageEnabled?: boolean;

  @ApiProperty({ description: 'Welcome message text', required: false })
  welcomeMessageText?: string;

  @ApiProperty({ description: 'Enable voice narration for welcome message', required: false })
  welcomeMessageVoiceEnabled?: boolean;

  @ApiProperty({ description: 'Creation timestamp' })
  createdAt: Date;

  @ApiProperty({ description: 'Last update timestamp' })
  updatedAt: Date;

  @ApiProperty({ description: 'Institute details', required: false })
  institute?: any;

  @ApiProperty({ description: 'Class details', required: false })
  class?: any;

  @ApiProperty({ description: 'Subject details', required: false })
  subject?: any;

  @ApiProperty({ description: 'Instructor details', required: false })
  instructor?: any;
}
