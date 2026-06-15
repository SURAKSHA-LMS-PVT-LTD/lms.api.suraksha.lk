import { IsInt, IsString, IsOptional, Min, IsIn, IsUrl } from 'class-validator';

export class InitiateGatewayPaymentDto {
  /** Number of credits to purchase */
  @IsInt()
  @Min(1)
  credits: number;

  /** Provider to use — defaults to PAYHERE */
  @IsOptional()
  @IsString()
  provider?: string;

  /** 'web' = suraksha.lk secret, 'app' = lk.suraksha.lms secret. Defaults to 'web'. */
  @IsOptional()
  @IsIn(['web', 'app'])
  platform?: 'web' | 'app';

  /**
   * The origin the user is currently on (e.g. https://school.example.com).
   * Used to build return_url / cancel_url so PayHere redirects back to the
   * correct domain when institutes use a custom domain.
   * Falls back to APP_BASE_URL if not provided.
   */
  @IsOptional()
  @IsUrl({ require_tld: false })
  returnBaseUrl?: string;
}

export class InitiateUserPackageCheckoutDto {
  /** Package definition ID to purchase */
  @IsString()
  packageId: string;

  /** Number of units (months/periods) to purchase. Defaults to 1. */
  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;

  @IsOptional()
  @IsString()
  provider?: string;

  @IsOptional()
  @IsIn(['web', 'app'])
  platform?: 'web' | 'app';

  @IsOptional()
  @IsUrl({ require_tld: false })
  returnBaseUrl?: string;
}

export class GatewayCheckoutResponseDto {
  orderId: string;
  gatewayUrl: string;
  fields: Record<string, string>;
  provider: string;
}
