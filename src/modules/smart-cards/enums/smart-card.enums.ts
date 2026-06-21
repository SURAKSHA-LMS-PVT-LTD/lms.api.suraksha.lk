/**
 * Smart Card enums — pre-printed ID inventory managed by the system admin,
 * assigned down to institutes / classes / users.
 */

/** Physical encoding of the card's printed identifier. */
export enum SmartCardType {
  BARCODE = 'BARCODE',
  QR = 'QR',
  RFID = 'RFID',
  NFC = 'NFC',
}

/**
 * Card visibility scope.
 * - GLOBAL  → a "Suraksha smart card". When assigned to a user the value lands on `user.rfid`.
 * - INSTITUTE → an "institute smart card". When assigned the value lands on `institute_user.institute_card_id`.
 */
export enum SmartCardScope {
  GLOBAL = 'GLOBAL',
  INSTITUTE = 'INSTITUTE',
}

/**
 * Lifecycle of a card row in inventory.
 * AVAILABLE          → free, in the assignable pool
 * ASSIGNED_INSTITUTE → handed to an institute, not yet to a class/user
 * ASSIGNED_CLASS     → handed to a class within an institute, not yet to a user
 * ASSIGNED_USER      → currently held by a user (the active assignment)
 * INACTIVE           → retired / disabled, never re-assignable until re-activated
 */
export enum SmartCardStatus {
  AVAILABLE = 'AVAILABLE',
  ASSIGNED_INSTITUTE = 'ASSIGNED_INSTITUTE',
  ASSIGNED_CLASS = 'ASSIGNED_CLASS',
  ASSIGNED_USER = 'ASSIGNED_USER',
  INACTIVE = 'INACTIVE',
}

/** Feature catalog key gating the whole module. Off by default, system-admin enabled. */
export const SMART_CARDS_FEATURE_KEY = 'smart-cards';
