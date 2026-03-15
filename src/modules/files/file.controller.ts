import { Controller, Get, Param, Res, NotFoundException, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { Response } from 'express';
import { FileProxyService } from '../../common/services/file-proxy.service';
import { AdvancedSecurityGuard } from '../../common/guards/advanced-security.guard';
import { FlexibleAccessGuard } from '../../auth/guards/flexible-access.guard';
import { RequireAnyOfRoles } from '../../auth/decorators/flexible-access.decorator';
import { UserType } from '../user/enums/user-type.enum';

@ApiTags('Files')
@Controller('files')
@UseGuards(AdvancedSecurityGuard)
export class FileController {
  private static readonly ALLOWED_FOLDERS = new Set([
    'profile-images', 'student-images', 'institute-images', 'institute-user-images',
    'subject-images', 'homework-files', 'correction-files', 'institute-payment-receipts',
    'subject-payment-receipts', 'id-documents', 'bookhire-vehicle-images', 'bookhire-owner-images',
    'sms-payment-receipts', 'advertisement-images'
  ]);

  constructor(private fileProxyService: FileProxyService) {}

  private validateFolder(folder: string): void {
    if (!FileController.ALLOWED_FOLDERS.has(folder)) {
      throw new NotFoundException('File not found');
    }
  }

  private validateFilename(filename: string): void {
    // Block path traversal attempts
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\') || filename.includes('\0')) {
      throw new NotFoundException('File not found');
    }
  }

  @Get(':folder/:filename')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    anyInstituteRole: true
  })
  @ApiOperation({ summary: 'Serve files through custom domain' })
  @ApiParam({ name: 'folder', description: 'File folder (e.g., profile-images, subject-images)' })
  @ApiParam({ name: 'filename', description: 'File name' })
  @ApiResponse({ status: 200, description: 'File served successfully' })
  @ApiResponse({ status: 404, description: 'File not found' })
  async serveFile(
    @Param('folder') folder: string,
    @Param('filename') filename: string,
    @Res() res: Response
  ): Promise<void> {
    this.validateFolder(folder);
    this.validateFilename(filename);
    const filePath = `${folder}/${filename}`;
    await this.fileProxyService.serveFile(filePath, res);
  }

  @Get(':folder/:subfolder/:filename')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    anyInstituteRole: true
  })
  @ApiOperation({ summary: 'Serve files from subfolders' })
  @ApiParam({ name: 'folder', description: 'Main folder' })
  @ApiParam({ name: 'subfolder', description: 'Subfolder' })
  @ApiParam({ name: 'filename', description: 'File name' })
  @ApiResponse({ status: 200, description: 'File served successfully' })
  @ApiResponse({ status: 404, description: 'File not found' })
  async serveFileFromSubfolder(
    @Param('folder') folder: string,
    @Param('subfolder') subfolder: string,
    @Param('filename') filename: string,
    @Res() res: Response
  ): Promise<void> {
    this.validateFolder(folder);
    this.validateFilename(subfolder);
    this.validateFilename(filename);
    const filePath = `${folder}/${subfolder}/${filename}`;
    await this.fileProxyService.serveFile(filePath, res);
  }

  @Get('payments/:instituteId/:month/:paymentId/:filename')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    anyInstituteRole: true
  })
  @ApiOperation({ summary: 'Serve payment receipt files' })
  @ApiParam({ name: 'instituteId', description: 'Institute ID' })
  @ApiParam({ name: 'month', description: 'Payment month (YYYY-MM)' })
  @ApiParam({ name: 'paymentId', description: 'Payment ID' })
  @ApiParam({ name: 'filename', description: 'Receipt filename' })
  @ApiResponse({ status: 200, description: 'Payment receipt served successfully' })
  @ApiResponse({ status: 404, description: 'Receipt not found' })
  async servePaymentReceipt(
    @Param('instituteId') instituteId: string,
    @Param('month') month: string,
    @Param('paymentId') paymentId: string,
    @Param('filename') filename: string,
    @Res() res: Response
  ): Promise<void> {
    const filePath = `payments/institute-${instituteId}/${month}/${paymentId}/${filename}`;
    await this.fileProxyService.serveFile(filePath, res);
  }

  @Get('info/:folder/:filename')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    anyInstituteRole: true
  })
  @ApiOperation({ summary: 'Get file information' })
  @ApiParam({ name: 'folder', description: 'File folder' })
  @ApiParam({ name: 'filename', description: 'File name' })
  @ApiResponse({ status: 200, description: 'File information retrieved successfully' })
  @ApiResponse({ status: 404, description: 'File not found' })
  async getFileInfo(
    @Param('folder') folder: string,
    @Param('filename') filename: string
  ): Promise<any> {
    const filePath = `${folder}/${filename}`;
    return this.fileProxyService.getFileInfo(filePath);
  }
}
