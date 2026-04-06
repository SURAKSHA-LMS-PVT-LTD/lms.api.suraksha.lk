export enum InstituteType {
  DHAMMA_SCHOOL = 'dhamma_school',
  SCHOOL = 'school',
  PRIMARY_SCHOOL = 'primary_school',
  SECONDARY_SCHOOL = 'secondary_school',
  TUITION_INSTITUTE = 'tuition_institute',
  ONLINE_ACADEMY = 'online_academy',
  PRE_SCHOOL = 'pre_school',
  OTHER = 'other',
}

export enum InstituteStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  SUSPENDED = 'suspended',
  UNDER_REVIEW = 'under_review',
  CLOSED = 'closed',
}

export enum InstituteTier {
  FREE = 'FREE',
  STARTER = 'STARTER',
  PROFESSIONAL = 'PROFESSIONAL',
  ENTERPRISE = 'ENTERPRISE',
  ISOLATED = 'ISOLATED',
}

export enum LoginBackgroundType {
  COLOR = 'COLOR',
  GRADIENT = 'GRADIENT',
  IMAGE = 'IMAGE',
  VIDEO = 'VIDEO',
}

export enum CustomDomainSslStatus {
  PENDING = 'PENDING',
  ACTIVE = 'ACTIVE',
  EXPIRED = 'EXPIRED',
  FAILED = 'FAILED',
}

export enum LoginMethod {
  SURAKSHA_WEB = 'SURAKSHA_WEB',
  SURAKSHA_APP = 'SURAKSHA_APP',
  SUBDOMAIN = 'SUBDOMAIN',
  CUSTOM_DOMAIN = 'CUSTOM_DOMAIN',
}

export enum BillingStatus {
  PENDING = 'PENDING',
  INVOICED = 'INVOICED',
  PAID = 'PAID',
  OVERDUE = 'OVERDUE',
}
