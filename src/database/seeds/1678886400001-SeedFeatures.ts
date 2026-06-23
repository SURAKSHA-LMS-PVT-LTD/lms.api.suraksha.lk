import { MigrationInterface, QueryRunner } from 'typeorm';

interface FeatureRow {
  key: string;
  label: string;
  description: string;
  scope: 'INSTITUTE' | 'CLASS' | 'SUBJECT';
  category: 'ATTENDANCE' | 'ACADEMICS' | 'PAYMENTS' | 'COMMUNICATION' | 'BRANDING' | 'TRANSPORT' | 'SERVICES';
  pricing: 'FREE' | 'PAID';
  billing_cycle: 'MONTHLY' | 'YEARLY' | 'BOTH' | 'TIER';
  is_core: boolean;
  dependencies: string[];
  ui_targets: string[];
  is_active: boolean;
}

const FEATURES: FeatureRow[] = [
  // ── Institute scope — Academics ───────────────────────────────────────────
  { key: 'classes',                       label: 'All Classes',              description: 'Manage all classes in the institute',                 scope: 'INSTITUTE', category: 'ACADEMICS',      pricing: 'FREE',  billing_cycle: 'MONTHLY', is_core: true,  dependencies: [],                        ui_targets: ['sidebar', 'dashboard'], is_active: true },
  { key: 'institute-subjects',            label: 'All Subjects',             description: 'Manage all subjects across the institute',            scope: 'INSTITUTE', category: 'ACADEMICS',      pricing: 'FREE',  billing_cycle: 'MONTHLY', is_core: true,  dependencies: ['classes'],               ui_targets: ['sidebar', 'dashboard'], is_active: true },
  { key: 'institute-lectures',            label: 'Lectures',                 description: 'Browse and manage institute lectures',                scope: 'INSTITUTE', category: 'ACADEMICS',      pricing: 'FREE',  billing_cycle: 'MONTHLY', is_core: false, dependencies: ['institute-subjects'],    ui_targets: ['sidebar', 'dashboard'], is_active: true },
  { key: 'structured-lectures',          label: 'Structured Lectures',      description: 'Structured lecture management with lesson plans',     scope: 'INSTITUTE', category: 'ACADEMICS',      pricing: 'PAID',  billing_cycle: 'MONTHLY', is_core: false, dependencies: ['institute-subjects'],    ui_targets: ['sidebar', 'dashboard'], is_active: true },
  { key: 'institute-organizations',      label: 'Organizations',            description: 'Manage institute organizations and clubs',            scope: 'INSTITUTE', category: 'ACADEMICS',      pricing: 'PAID',  billing_cycle: 'MONTHLY', is_core: false, dependencies: [],                        ui_targets: ['sidebar'],              is_active: true },

  // ── Institute scope — Community ───────────────────────────────────────────
  { key: 'houses',                        label: 'Houses',                   description: 'Institute house/team management',                     scope: 'INSTITUTE', category: 'ACADEMICS',      pricing: 'PAID',  billing_cycle: 'MONTHLY', is_core: false, dependencies: [],                        ui_targets: ['sidebar'],              is_active: true },

  // ── Institute scope — Manage Users ───────────────────────────────────────
  { key: 'institute-users',              label: 'All Users',                description: 'View and manage all institute members',               scope: 'INSTITUTE', category: 'SERVICES',       pricing: 'FREE',  billing_cycle: 'MONTHLY', is_core: true,  dependencies: [],                        ui_targets: ['sidebar', 'dashboard'], is_active: true },
  { key: 'parents',                       label: 'Parents',                  description: 'Manage parent accounts linked to students',           scope: 'INSTITUTE', category: 'SERVICES',       pricing: 'FREE',  billing_cycle: 'MONTHLY', is_core: false, dependencies: ['institute-users'],       ui_targets: ['sidebar'],              is_active: true },
  { key: 'verify-image',                 label: 'Verify Photos',            description: 'Approve or reject user profile photos',              scope: 'INSTITUTE', category: 'SERVICES',       pricing: 'FREE',  billing_cycle: 'MONTHLY', is_core: false, dependencies: ['institute-users'],       ui_targets: ['sidebar', 'dashboard'], is_active: true },

  // ── Institute scope — Attendance ─────────────────────────────────────────
  { key: 'select-attendance-mark-type',  label: 'Mark Attendance',          description: 'Choose QR, Barcode, or RFID attendance marking',      scope: 'INSTITUTE', category: 'ATTENDANCE',     pricing: 'FREE',  billing_cycle: 'MONTHLY', is_core: true,  dependencies: [],                        ui_targets: ['sidebar', 'dashboard'], is_active: true },
  { key: 'qr-attendance',               label: 'QR Attendance',            description: 'Mark attendance via QR code or barcode scan',         scope: 'INSTITUTE', category: 'ATTENDANCE',     pricing: 'FREE',  billing_cycle: 'MONTHLY', is_core: false, dependencies: ['select-attendance-mark-type'], ui_targets: ['sidebar'], is_active: true },
  { key: 'rfid-attendance',             label: 'RFID Attendance',          description: 'Mark attendance via RFID card reader',                scope: 'INSTITUTE', category: 'ATTENDANCE',     pricing: 'PAID',  billing_cycle: 'MONTHLY', is_core: false, dependencies: ['select-attendance-mark-type'], ui_targets: ['sidebar'], is_active: true },
  { key: 'daily-attendance',            label: 'Institute Attendance',     description: 'View and manage daily attendance records',            scope: 'INSTITUTE', category: 'ATTENDANCE',     pricing: 'FREE',  billing_cycle: 'MONTHLY', is_core: true,  dependencies: [],                        ui_targets: ['sidebar', 'dashboard'], is_active: true },
  { key: 'admin-attendance',            label: 'Advanced Attendance',      description: 'Institute-wide attendance overview and analytics',    scope: 'INSTITUTE', category: 'ATTENDANCE',     pricing: 'FREE',  billing_cycle: 'MONTHLY', is_core: false, dependencies: ['daily-attendance'],      ui_targets: ['sidebar', 'dashboard'], is_active: true },
  { key: 'lecture-live-attendance',     label: 'Lecture Live Attendance',  description: 'Real-time attendance for live lectures',              scope: 'INSTITUTE', category: 'ATTENDANCE',     pricing: 'FREE',  billing_cycle: 'MONTHLY', is_core: true,  dependencies: [],                        ui_targets: ['sidebar'],              is_active: true },
  { key: 'lecture-recording-attendance',label: 'Recording Attendance',     description: 'Track attendance for recorded lecture views',         scope: 'INSTITUTE', category: 'ATTENDANCE',     pricing: 'FREE',  billing_cycle: 'MONTHLY', is_core: true,  dependencies: [],                        ui_targets: ['sidebar'],              is_active: true },
  { key: 'calendar-view',               label: 'Calendar',                 description: 'View attendance and events in calendar format',       scope: 'INSTITUTE', category: 'ATTENDANCE',     pricing: 'FREE',  billing_cycle: 'MONTHLY', is_core: false, dependencies: [],                        ui_targets: ['sidebar', 'dashboard'], is_active: true },
  { key: 'calendar-management',         label: 'Manage Calendar',          description: 'Create and manage academic calendar events',          scope: 'INSTITUTE', category: 'ATTENDANCE',     pricing: 'FREE',  billing_cycle: 'MONTHLY', is_core: false, dependencies: ['calendar-view'],         ui_targets: ['sidebar'],              is_active: true },

  // ── Institute scope — Communication ──────────────────────────────────────
  { key: 'sms',                           label: 'Send SMS',                 description: 'Send SMS messages to institute members',              scope: 'INSTITUTE', category: 'COMMUNICATION',  pricing: 'PAID',  billing_cycle: 'TIER',    is_core: false, dependencies: [],                        ui_targets: ['sidebar', 'dashboard'], is_active: true },
  { key: 'sms-history',                  label: 'SMS History',              description: 'View history of sent SMS messages',                  scope: 'INSTITUTE', category: 'COMMUNICATION',  pricing: 'PAID',  billing_cycle: 'TIER',    is_core: false, dependencies: ['sms'],                   ui_targets: ['sidebar'],              is_active: true },
  { key: 'institute-notifications',      label: 'Notifications',            description: 'Send push notifications to institute members',        scope: 'INSTITUTE', category: 'COMMUNICATION',  pricing: 'FREE',  billing_cycle: 'MONTHLY', is_core: false, dependencies: [],                        ui_targets: ['sidebar', 'dashboard'], is_active: true },

  // ── Institute scope — Payments and Billing ────────────────────────────────
  { key: 'institute-payments',           label: 'Institute Fees',           description: 'Manage institute-level fee collection',               scope: 'INSTITUTE', category: 'PAYMENTS',       pricing: 'FREE',  billing_cycle: 'MONTHLY', is_core: false, dependencies: [],                        ui_targets: ['sidebar', 'dashboard'], is_active: true },
  { key: 'pending-submissions',          label: 'Review Payments',          description: 'Approve or reject pending payment submissions',       scope: 'INSTITUTE', category: 'PAYMENTS',       pricing: 'FREE',  billing_cycle: 'MONTHLY', is_core: false, dependencies: ['institute-payments'],    ui_targets: ['sidebar', 'dashboard'], is_active: true },
  { key: 'collect-physical-payment',    label: 'Collect Payment',          description: 'Record cash or physical fee payments',               scope: 'INSTITUTE', category: 'PAYMENTS',       pricing: 'FREE',  billing_cycle: 'MONTHLY', is_core: false, dependencies: ['institute-payments'],    ui_targets: ['sidebar'],              is_active: true },
  { key: 'institute-billing',            label: 'Institute Billing',        description: 'View and manage institute billing with Suraksha LMS', scope: 'INSTITUTE', category: 'PAYMENTS',       pricing: 'FREE',  billing_cycle: 'MONTHLY', is_core: false, dependencies: [],                        ui_targets: ['sidebar'],              is_active: true },
  { key: 'institute-credits',            label: 'Institute Credits',        description: 'Manage notification credit balance',                  scope: 'INSTITUTE', category: 'PAYMENTS',       pricing: 'FREE',  billing_cycle: 'MONTHLY', is_core: false, dependencies: [],                        ui_targets: ['sidebar'],              is_active: true },

  // ── Institute scope — Admin Tools ─────────────────────────────────────────
  { key: 'device-management',            label: 'Devices',                  description: 'Manage connected attendance devices and user sessions',scope: 'INSTITUTE', category: 'SERVICES',       pricing: 'FREE',  billing_cycle: 'MONTHLY', is_core: false, dependencies: [],                        ui_targets: ['sidebar', 'dashboard'], is_active: true },
  { key: 'institute-designs',            label: 'Designs',                  description: 'Design templates for ID cards, certificates, birthday wishes, and more. Generate and export in bulk.',                                           scope: 'INSTITUTE', category: 'SERVICES',       pricing: 'FREE',  billing_cycle: 'MONTHLY', is_core: false, dependencies: [],                        ui_targets: ['sidebar'],              is_active: true },

  // ── Institute scope — Services ────────────────────────────────────────────
  { key: 'transport',                     label: 'Transport',                description: 'Private transportation booking and management',        scope: 'INSTITUTE', category: 'TRANSPORT',      pricing: 'PAID',  billing_cycle: 'MONTHLY', is_core: false, dependencies: [],                        ui_targets: ['sidebar'],              is_active: true },
  { key: 'id-cards',                     label: 'ID Cards',                 description: 'Generate and manage NFC/PVC/temporary ID cards',      scope: 'INSTITUTE', category: 'SERVICES',       pricing: 'PAID',  billing_cycle: 'MONTHLY', is_core: false, dependencies: ['institute-users'],       ui_targets: ['sidebar'],              is_active: true },
  { key: 'organizations',                label: 'Organizations',            description: 'Manage institute-linked organizations',               scope: 'INSTITUTE', category: 'SERVICES',       pricing: 'PAID',  billing_cycle: 'MONTHLY', is_core: false, dependencies: [],                        ui_targets: ['sidebar'],              is_active: true },
  { key: 'system-payment',              label: 'System Payment',           description: 'Manage system-level payment configuration',           scope: 'INSTITUTE', category: 'PAYMENTS',       pricing: 'FREE',  billing_cycle: 'MONTHLY', is_core: false, dependencies: [],                        ui_targets: ['sidebar'],              is_active: true },

  // ── Institute scope — Settings and Branding ───────────────────────────────
  { key: 'institute-settings',           label: 'Settings',                 description: 'Configure institute settings and preferences',         scope: 'INSTITUTE', category: 'BRANDING',       pricing: 'FREE',  billing_cycle: 'MONTHLY', is_core: true,  dependencies: [],                        ui_targets: ['sidebar', 'dashboard'], is_active: true },
  { key: 'login-branding',               label: 'Login Branding',           description: 'Customize the login page appearance',                 scope: 'INSTITUTE', category: 'BRANDING',       pricing: 'PAID',  billing_cycle: 'MONTHLY', is_core: false, dependencies: ['institute-settings'],    ui_targets: ['settings'],             is_active: true },
  { key: 'custom-domain',               label: 'Custom Domain',            description: 'Use a custom domain for the institute portal',         scope: 'INSTITUTE', category: 'BRANDING',       pricing: 'PAID',  billing_cycle: 'MONTHLY', is_core: false, dependencies: ['institute-settings'],    ui_targets: ['settings'],             is_active: true },
  { key: 'subdomain',                    label: 'Subdomain',                description: 'Use a subdomain (*.suraksha.lk) for the institute',    scope: 'INSTITUTE', category: 'BRANDING',       pricing: 'FREE',  billing_cycle: 'MONTHLY', is_core: false, dependencies: ['institute-settings'],    ui_targets: ['settings'],             is_active: true },
  { key: 'video-background',             label: 'Video Background',         description: 'Custom video background for the login page',          scope: 'INSTITUTE', category: 'BRANDING',       pricing: 'PAID',  billing_cycle: 'MONTHLY', is_core: false, dependencies: ['login-branding'],        ui_targets: ['settings'],             is_active: true },
  { key: 'report-branding',             label: 'Report Branding',          description: 'Custom header and footer for PDF reports',            scope: 'INSTITUTE', category: 'BRANDING',       pricing: 'PAID',  billing_cycle: 'MONTHLY', is_core: false, dependencies: ['institute-settings'],    ui_targets: ['settings'],             is_active: true },

  // ── Class scope — Academics ───────────────────────────────────────────────
  { key: 'class-subjects',              label: 'Class Subjects',           description: 'Subjects assigned to this class',                     scope: 'CLASS',     category: 'ACADEMICS',      pricing: 'FREE',  billing_cycle: 'MONTHLY', is_core: true,  dependencies: [],                        ui_targets: ['sidebar', 'dashboard'], is_active: true },
  { key: 'class-lectures',             label: 'Class Lectures',           description: 'Lectures assigned at the class level',               scope: 'CLASS',     category: 'ACADEMICS',      pricing: 'FREE',  billing_cycle: 'MONTHLY', is_core: false, dependencies: ['class-subjects'],        ui_targets: ['sidebar'],              is_active: true },

  // ── Class scope — Users ───────────────────────────────────────────────────
  { key: 'students',                    label: 'Students',                 description: 'View and manage enrolled students',                   scope: 'CLASS',     category: 'SERVICES',       pricing: 'FREE',  billing_cycle: 'MONTHLY', is_core: true,  dependencies: [],                        ui_targets: ['sidebar', 'dashboard'], is_active: true },
  { key: 'unverified-students',        label: 'Pending Students',         description: 'Students awaiting admin approval',                    scope: 'CLASS',     category: 'SERVICES',       pricing: 'FREE',  billing_cycle: 'MONTHLY', is_core: false, dependencies: ['students'],              ui_targets: ['sidebar', 'dashboard'], is_active: true },

  // ── Class scope — Attendance ──────────────────────────────────────────────
  { key: 'class-mark-attendance',       label: 'Mark Attendance',           description: 'Mark class attendance via QR, RFID or manual entry',   scope: 'CLASS',    category: 'ATTENDANCE',     pricing: 'FREE',  billing_cycle: 'MONTHLY', is_core: false, dependencies: [],              ui_targets: ['sidebar'],              is_active: true },
  { key: 'class-daily-attendance',      label: 'Class Attendance',          description: 'View and manage daily attendance for this class',      scope: 'CLASS',    category: 'ATTENDANCE',     pricing: 'FREE',  billing_cycle: 'MONTHLY', is_core: false, dependencies: [],              ui_targets: ['sidebar', 'dashboard'], is_active: true },
  { key: 'class-live-attendance',       label: 'Live Lecture Attendance',   description: 'Real-time attendance tracking for class lectures',     scope: 'CLASS',    category: 'ATTENDANCE',     pricing: 'FREE',  billing_cycle: 'MONTHLY', is_core: true,  dependencies: [],                 ui_targets: ['sidebar'],             is_active: true },
  { key: 'class-recording-attendance',  label: 'Recording Attendance',      description: 'Track views for recorded class lecture videos',        scope: 'CLASS',    category: 'ATTENDANCE',     pricing: 'FREE',  billing_cycle: 'MONTHLY', is_core: true,  dependencies: [],                 ui_targets: ['sidebar'],             is_active: true },
  { key: 'class-my-attendance',         label: 'My Attendance',             description: 'Personal attendance history within this class',        scope: 'CLASS',    category: 'ATTENDANCE',     pricing: 'FREE',  billing_cycle: 'MONTHLY', is_core: false, dependencies: [],              ui_targets: ['sidebar', 'dashboard'], is_active: true },

  // ── Class scope — Users ───────────────────────────────────────────────────
  { key: 'class-parents',               label: 'Parents',                   description: 'Parent accounts linked to students in this class',     scope: 'CLASS',    category: 'SERVICES',       pricing: 'FREE',  billing_cycle: 'MONTHLY', is_core: false, dependencies: [],              ui_targets: ['sidebar'],              is_active: true },

  // ── Class scope — Payments ────────────────────────────────────────────────
  { key: 'class-payments',              label: 'Class Fees',                description: 'Manage class-level fee collection',                    scope: 'CLASS',    category: 'PAYMENTS',       pricing: 'FREE',  billing_cycle: 'MONTHLY', is_core: false, dependencies: [],              ui_targets: ['sidebar'],              is_active: true },
  { key: 'class-collect-payment',       label: 'Collect Payment',           description: 'Record cash or physical payments inside a class',      scope: 'CLASS',    category: 'PAYMENTS',       pricing: 'FREE',  billing_cycle: 'MONTHLY', is_core: false, dependencies: [],              ui_targets: ['sidebar'],              is_active: true },

  // ── Class scope — Communication ───────────────────────────────────────────
  { key: 'class-notifications',         label: 'Notifications',             description: 'View push notifications while inside a class',         scope: 'CLASS',    category: 'COMMUNICATION',  pricing: 'FREE',  billing_cycle: 'MONTHLY', is_core: false, dependencies: [],              ui_targets: ['sidebar'],              is_active: true },

  // ── Subject scope — Academics ─────────────────────────────────────────────
  { key: 'lectures',                     label: 'Lectures',                  description: 'Manage subject lectures',                              scope: 'SUBJECT',  category: 'ACADEMICS',      pricing: 'FREE',  billing_cycle: 'MONTHLY', is_core: true,  dependencies: [],              ui_targets: ['sidebar', 'dashboard'], is_active: true },
  { key: 'free-lectures',               label: 'Free Lectures',             description: 'Lectures available to all users without payment',      scope: 'SUBJECT',  category: 'ACADEMICS',      pricing: 'FREE',  billing_cycle: 'MONTHLY', is_core: false, dependencies: ['lectures'],    ui_targets: ['sidebar'],              is_active: true },
  { key: 'homework',                     label: 'Homework',                  description: 'Assignments and homework tasks',                       scope: 'SUBJECT',  category: 'ACADEMICS',      pricing: 'FREE',  billing_cycle: 'MONTHLY', is_core: false, dependencies: [],              ui_targets: ['sidebar', 'dashboard'], is_active: true },
  { key: 'exams',                        label: 'Exams',                     description: 'Examinations and results management',                  scope: 'SUBJECT',  category: 'ACADEMICS',      pricing: 'FREE',  billing_cycle: 'MONTHLY', is_core: false, dependencies: [],              ui_targets: ['sidebar', 'dashboard'], is_active: true },
  { key: 'grading',                      label: 'Grading',                   description: 'Grade and mark student submissions',                   scope: 'SUBJECT',  category: 'ACADEMICS',      pricing: 'FREE',  billing_cycle: 'MONTHLY', is_core: false, dependencies: ['exams'],       ui_targets: ['sidebar', 'dashboard'], is_active: true },
  { key: 'study-materials',             label: 'Study Materials',           description: 'Upload and share study materials',                     scope: 'SUBJECT',  category: 'ACADEMICS',      pricing: 'FREE',  billing_cycle: 'MONTHLY', is_core: false, dependencies: [],              ui_targets: ['sidebar'],              is_active: true },
  { key: 'lecture-welcome-message',     label: 'Lecture Welcome Message',   description: 'Custom welcome message displayed before lectures',     scope: 'SUBJECT',  category: 'ACADEMICS',      pricing: 'PAID',  billing_cycle: 'MONTHLY', is_core: false, dependencies: ['lectures'],    ui_targets: ['settings'],             is_active: true },

  // ── Subject scope — Attendance ────────────────────────────────────────────
  { key: 'subject-mark-attendance',     label: 'Mark Attendance',           description: 'Mark attendance for this subject session',             scope: 'SUBJECT',  category: 'ATTENDANCE',     pricing: 'FREE',  billing_cycle: 'MONTHLY', is_core: false, dependencies: [],              ui_targets: ['sidebar'],              is_active: true },
  { key: 'subject-daily-attendance',    label: 'Subject Attendance',        description: 'View attendance records for this subject',             scope: 'SUBJECT',  category: 'ATTENDANCE',     pricing: 'FREE',  billing_cycle: 'MONTHLY', is_core: false, dependencies: [],              ui_targets: ['sidebar', 'dashboard'], is_active: true },
  { key: 'subject-live-attendance',     label: 'Live Lecture Attendance',   description: 'Real-time attendance for subject lectures',            scope: 'SUBJECT',  category: 'ATTENDANCE',     pricing: 'FREE',  billing_cycle: 'MONTHLY', is_core: true,  dependencies: [],              ui_targets: ['sidebar'],              is_active: true },
  { key: 'subject-recording-attendance',label: 'Recording Attendance',      description: 'Track views of recorded subject lecture videos',       scope: 'SUBJECT',  category: 'ATTENDANCE',     pricing: 'FREE',  billing_cycle: 'MONTHLY', is_core: true,  dependencies: [],              ui_targets: ['sidebar'],              is_active: true },
  { key: 'subject-my-attendance',       label: 'My Attendance',             description: 'Personal attendance history within this subject',      scope: 'SUBJECT',  category: 'ATTENDANCE',     pricing: 'FREE',  billing_cycle: 'MONTHLY', is_core: false, dependencies: [],              ui_targets: ['sidebar', 'dashboard'], is_active: true },

  // ── Subject scope — Payments ──────────────────────────────────────────────
  { key: 'subject-payments',            label: 'Subject Fees',              description: 'Manage subject-level fee collection and submissions',   scope: 'SUBJECT',  category: 'PAYMENTS',       pricing: 'FREE',  billing_cycle: 'MONTHLY', is_core: false, dependencies: [],              ui_targets: ['sidebar', 'dashboard'], is_active: true },
  { key: 'subject-collect-payment',     label: 'Collect Payment',           description: 'Record cash or physical payments inside a subject',     scope: 'SUBJECT',  category: 'PAYMENTS',       pricing: 'FREE',  billing_cycle: 'MONTHLY', is_core: false, dependencies: [],              ui_targets: ['sidebar'],              is_active: true },

  // ── Subject scope — Communication ─────────────────────────────────────────
  { key: 'subject-notifications',       label: 'Notifications',             description: 'View push notifications while inside a subject',        scope: 'SUBJECT',  category: 'COMMUNICATION',  pricing: 'FREE',  billing_cycle: 'MONTHLY', is_core: false, dependencies: [],              ui_targets: ['sidebar'],              is_active: true },

  // ── Common (Institute scope — applies at institute level nav only) ─────────
  { key: 'my-attendance',               label: 'My Attendance',             description: 'Personal attendance history and stats',                scope: 'INSTITUTE', category: 'ATTENDANCE',    pricing: 'FREE',  billing_cycle: 'MONTHLY', is_core: true,  dependencies: [],              ui_targets: ['sidebar', 'dashboard'], is_active: true },
];

export class SeedFeatures1678886400001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const f of FEATURES) {
      await queryRunner.query(
        `INSERT INTO feature_catalog
           (\`key\`, label, description, scope, category, pricing, billing_cycle, is_core, dependencies, ui_targets, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           label        = VALUES(label),
           description  = VALUES(description),
           scope        = VALUES(scope),
           category     = VALUES(category),
           pricing      = VALUES(pricing),
           billing_cycle = VALUES(billing_cycle),
           is_core      = VALUES(is_core),
           dependencies = VALUES(dependencies),
           ui_targets   = VALUES(ui_targets),
           is_active    = VALUES(is_active)`,
        [
          f.key,
          f.label,
          f.description,
          f.scope,
          f.category,
          f.pricing,
          f.billing_cycle,
          f.is_core ? 1 : 0,
          JSON.stringify(f.dependencies),
          JSON.stringify(f.ui_targets),
          f.is_active ? 1 : 0,
        ],
      );
    }
    console.log(`✅ Seeded ${FEATURES.length} features into feature_catalog`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const keys = FEATURES.map(f => f.key);
    await queryRunner.query(
      `DELETE FROM feature_catalog WHERE \`key\` IN (${keys.map(() => '?').join(',')})`,
      keys,
    );
  }
}
