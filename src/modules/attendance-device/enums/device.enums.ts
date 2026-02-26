// ─── Device Types ────────────────────────────────────────────────────────────
export enum DeviceType {
  TABLET = 'TABLET',
  PHONE = 'PHONE',
  RFID_READER = 'RFID_READER',
  BIOMETRIC = 'BIOMETRIC',
  KIOSK = 'KIOSK',
  NFC_TERMINAL = 'NFC_TERMINAL',
  QR_SCANNER = 'QR_SCANNER',
  OTHER = 'OTHER',
}

// ─── Device Status ──────────────────────────────────────────────────────────
export enum DeviceStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  MAINTENANCE = 'MAINTENANCE',
  BLOCKED = 'BLOCKED',
}

// ─── Allowed Status Mode (what statuses the device CAN mark) ────────────────
//  ANY      → device can mark ANY attendance status
//  BLOCKED  → device CANNOT mark attendance at all (disabled for marking)
//  ONLY     → device can ONLY mark specific statuses listed in allowedStatusList
export enum AllowedStatusMode {
  ANY = 'ANY',
  BLOCKED = 'BLOCKED',
  ONLY = 'ONLY',
}

// ─── Event Binding Status ───────────────────────────────────────────────────
export enum EventBindingStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

// ─── Device Audit Action ────────────────────────────────────────────────────
export enum DeviceAuditAction {
  CREATED = 'CREATED',
  ASSIGNED = 'ASSIGNED',
  UNASSIGNED = 'UNASSIGNED',
  ENABLED = 'ENABLED',
  DISABLED = 'DISABLED',
  CONFIG_CHANGED = 'CONFIG_CHANGED',
  EVENT_BOUND = 'EVENT_BOUND',
  EVENT_UNBOUND = 'EVENT_UNBOUND',
  SESSION_STARTED = 'SESSION_STARTED',
  SESSION_ENDED = 'SESSION_ENDED',
  BLOCKED = 'BLOCKED',
  UNBLOCKED = 'UNBLOCKED',
  INSTITUTE_CHANGED = 'INSTITUTE_CHANGED',
  DELETED = 'DELETED',
  STATUS_MODE_CHANGED = 'STATUS_MODE_CHANGED',
  RATE_LIMIT_CHANGED = 'RATE_LIMIT_CHANGED',
}
