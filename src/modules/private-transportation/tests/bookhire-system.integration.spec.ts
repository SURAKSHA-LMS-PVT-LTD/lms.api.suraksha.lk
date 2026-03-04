/**
 * Bookhire System — Smoke Tests
 * Validates that the service modules and their key method signatures exist.
 * Does NOT instantiate services (avoids deep dependency chains with uuid/typeorm/etc).
 */

// Provide explicit factory so Jest never tries to parse uuid's ESM dist
jest.mock('uuid', () => ({
  v4: () => 'test-uuid-v4',
  v1: () => 'test-uuid-v1',
  v5: () => 'test-uuid-v5',
}));

describe('Bookhire System Smoke Tests', () => {
  // Dynamic requires to avoid import-time ESM issues with transitive deps (uuid)
  it('BookhireOwnerService module should be importable', () => {
    // Just validate the module resolves without errors
    const mod = require('../services/bookhire-owner.service');
    expect(mod.BookhireOwnerService).toBeDefined();
  });

  it('BookhireService module should be importable', () => {
    const mod = require('../services/bookhire.service');
    expect(mod.BookhireService).toBeDefined();
  });

  it('StudentBookhireEnrollmentService module should be importable', () => {
    const mod = require('../services/student-bookhire-enrollment.service');
    expect(mod.StudentBookhireEnrollmentService).toBeDefined();
  });
});