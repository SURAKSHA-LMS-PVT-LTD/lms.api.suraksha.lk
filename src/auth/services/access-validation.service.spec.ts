/**
 * AccessValidationService Unit Tests
 * Verifies that legacy methods properly throw ForbiddenException
 * and that token extraction works correctly
 */
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { AccessValidationService } from './access-validation.service';

describe('AccessValidationService', () => {
  let service: AccessValidationService;
  let jwtService: JwtService;

  const VALID_TOKEN_PAYLOAD = { s: 1, ut: 0, i: [1, 2] };
  const JWT_SECRET = 'test-secret-key-for-testing-only-32chars!!';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccessValidationService,
        {
          provide: JwtService,
          useValue: {
            verify: jest.fn().mockReturnValue(VALID_TOKEN_PAYLOAD),
            sign: jest.fn().mockReturnValue('valid.jwt.token'),
          },
        },
      ],
    }).compile();

    service = module.get<AccessValidationService>(AccessValidationService);
    jwtService = module.get<JwtService>(JwtService);
  });

  describe('getUserDataFromToken', () => {
    it('should extract user data from a valid token', async () => {
      const result = await service.getUserDataFromToken('Bearer valid.jwt.token');
      expect(result).toBeDefined();
      expect(result.userId).toBe(1);
    });

    it('should throw UnauthorizedException for invalid token', async () => {
      (jwtService.verify as jest.Mock).mockImplementation(() => {
        throw new Error('invalid token');
      });

      await expect(service.getUserDataFromToken('invalid')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should strip Bearer prefix before verification', async () => {
      await service.getUserDataFromToken('Bearer some.token.here');
      expect(jwtService.verify).toHaveBeenCalledWith('some.token.here');
    });
  });

  describe('Legacy methods must throw ForbiddenException', () => {
    it('hasInstituteAccessLegacy should throw ForbiddenException', async () => {
      await expect(
        service.hasInstituteAccessLegacy('token', 'inst-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('hasClassAccessLegacy should throw ForbiddenException', async () => {
      await expect(
        service.hasClassAccessLegacy('token', 'inst-1', 'class-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('hasSubjectAccessLegacy should throw ForbiddenException', async () => {
      await expect(
        service.hasSubjectAccessLegacy('token', 'inst-1', 'class-1', 'sub-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should include deprecation message in ForbiddenException', async () => {
      await expect(
        service.hasInstituteAccessLegacy('token', 'inst-1'),
      ).rejects.toThrow('Legacy access validation is deprecated');
    });
  });

  describe('Deprecated validation methods still check token', () => {
    it('validateInstituteAccess should verify the token', async () => {
      await service.validateInstituteAccess('Bearer valid', 'inst-1');
      expect(jwtService.verify).toHaveBeenCalled();
    });

    it('validateInstituteAccess should throw on invalid token', async () => {
      (jwtService.verify as jest.Mock).mockImplementation(() => {
        throw new Error('expired');
      });

      await expect(
        service.validateInstituteAccess('invalid', 'inst-1'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('validateSuperAdminAccess should verify the token', async () => {
      await service.validateSuperAdminAccess('Bearer valid');
      expect(jwtService.verify).toHaveBeenCalled();
    });
  });

  describe('isAdmin', () => {
    it('should return true for super admin tokens (ut=SA)', async () => {
      (jwtService.verify as jest.Mock).mockReturnValue({ s: 1, ut: 'SA' });
      const result = await service.isAdmin('Bearer valid');
      expect(result).toBe(true);
    });

    it('should return false for non-admin tokens', async () => {
      (jwtService.verify as jest.Mock).mockReturnValue({ s: 1, ut: 'U' });
      const result = await service.isAdmin('Bearer valid');
      expect(result).toBe(false);
    });

    it('should return false for invalid tokens instead of throwing', async () => {
      (jwtService.verify as jest.Mock).mockImplementation(() => {
        throw new Error('invalid');
      });
      const result = await service.isAdmin('invalid-token');
      expect(result).toBe(false);
    });
  });

  describe('getAccessibleInstitutes', () => {
    it('should return empty array (deprecated stub)', async () => {
      const result = await service.getAccessibleInstitutes('Bearer valid');
      expect(result).toEqual([]);
    });
  });
});
