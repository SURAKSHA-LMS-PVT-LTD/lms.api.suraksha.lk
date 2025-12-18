import { PipeTransform, Injectable, ArgumentMetadata, BadRequestException } from '@nestjs/common';
import { USER_CONSTANTS } from '../constants/user.constants';

@Injectable()
export class UserValidationPipe implements PipeTransform {
  transform(value: any, metadata: ArgumentMetadata) {
    if (metadata.type !== 'body') {
      return value;
    }

    // Validate NIC format (Sri Lankan NIC)
    if (value.nic && !this.isValidNIC(value.nic)) {
      throw new BadRequestException('Invalid NIC format');
    }

    // Validate phone number format
    if (value.phoneNumber && !this.isValidPhone(value.phoneNumber)) {
      throw new BadRequestException('Invalid phone number format');
    }

    return value;
  }

  private isValidNIC(nic: string): boolean {
    // Sri Lankan NIC validation patterns
    const oldNicPattern = /^[0-9]{9}[vVxX]$/;
    const newNicPattern = /^[0-9]{12}$/;
    return oldNicPattern.test(nic) || newNicPattern.test(nic);
  }

  private isValidPhone(phone: string): boolean {
    // Sri Lankan phone number validation
    const phonePattern = /^(\+94|0)?[0-9]{9}$/;
    return phonePattern.test(phone.replace(/\s/g, ''));
  }
}
