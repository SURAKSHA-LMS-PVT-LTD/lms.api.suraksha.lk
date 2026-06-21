/**
 * PHASE 2 — Migrate Thilina Dhananjaya Academy data into Suraksha target DB.
 *
 * Source institute: inst-td-001 (Thilina Dhananjaya Academy)
 * Classes migrated: AL -2028 - Online, Grade 10 -2026 (Online),
 *                   Grade 11 - English - Home Class, Shehara, English - Grade 11 - Online
 *
 * Maps:
 *   Class (source) → institute_classes (target)
 *   Month (source) → subjects (target)           [per-class month = subject]
 *   Lecture (source) → institute_class_subject_lectures (target)
 *   Recording (source) → subject_recordings (target)
 *
 * Run: node migrate-thilina.cjs
 * Dry run: DRY_RUN=1 node migrate-thilina.cjs
 *
 * Idempotent: skips rows that already exist (by code for classes/subjects,
 * by rec_url_id/live_url_id for recordings/lectures).
 */
'use strict';
require('dotenv').config();
const mysql = require('mysql2/promise');
const crypto = require('crypto');

const DRY_RUN = process.env.DRY_RUN === '1';
const TARGET_INSTITUTE_ID = '6e09518a-89ac-47e1-8961-326b5fd5fc9c';

// ── Source data (extracted directly from thilinadhananjaya_lms) ───────────────

// Only td-001 classes
const SRC_CLASSES = [
  { id: 'd9438d82-8e72-42be-853f-46b8877377d4', name: 'AL -2028 - Online',             subject: 'English', monthlyFee: 3000, thumbnail: 'https://storage.thilinadhananjaya.lk/classes/ebbaf740-8dd8-4fc2-97d4-99d430274b86.png' },
  { id: '7675c9ef-2a66-47f7-94d0-1e3564b88441', name: 'Grade 10 -2026 (Online)',        subject: 'English', monthlyFee: 1300, thumbnail: 'https://storage.thilinadhananjaya.lk/classes/56f794b5-9ee2-4856-ba11-423d8a2f8693.png' },
  { id: '36b5e873-198b-4467-9eb3-9f9e8a1855bf', name: 'Grade 11 - English - Home Class',subject: 'English', monthlyFee: 1000, thumbnail: 'https://storage.thilinadhananjaya.lk/classes/cf48cca4-fffd-4117-938f-4c8f8fa6394d.png' },
  { id: 'ac24d52c-e602-4507-a668-370a2a39e22d', name: 'Shehara',                        subject: null,      monthlyFee: 3000, thumbnail: 'https://storage.thilinadhananjaya.lk/classes/78f5a246-80ac-45a1-b826-811bc2214b5a.png' },
  { id: '2a2cbbe9-7eb5-4a2f-b78d-9cbdee342a9d', name: 'English - Grade 11 - Online',    subject: null,      monthlyFee: 1600, thumbnail: 'https://storage.thilinadhananjaya.lk/classes/a99f988e-8e65-41c0-98af-fec4874ad6d1.png' },
];

const SRC_MONTHS = [
  // AL -2028 - Online
  { id: 'a8038692-aafb-441f-af0e-d4ca059f0851', classId: 'd9438d82-8e72-42be-853f-46b8877377d4', name: 'May 2026',  year: 2026, month: 5, status: 'ANYONE'        },
  { id: '4ab7c7ac-6166-49ab-92a0-eec76398d2fa', classId: 'd9438d82-8e72-42be-853f-46b8877377d4', name: 'June 2026', year: 2026, month: 6, status: 'STUDENTS_ONLY'  },
  // Grade 10 -2026 (Online)
  { id: '82fff1c3-a557-419e-83ef-5053fa191efd', classId: '7675c9ef-2a66-47f7-94d0-1e3564b88441', name: 'May 2026',  year: 2026, month: 5, status: 'ANYONE'        },
  { id: '217581fe-2799-448e-8ded-0d7bdb74f118', classId: '7675c9ef-2a66-47f7-94d0-1e3564b88441', name: 'June 2026', year: 2026, month: 6, status: 'STUDENTS_ONLY'  },
  // Grade 11 - English - Home Class
  { id: 'ab810528-0ee9-43f7-a936-246716f459f3', classId: '36b5e873-198b-4467-9eb3-9f9e8a1855bf', name: 'May 2026',  year: 2026, month: 5, status: 'STUDENTS_ONLY'  },
  { id: '4897bb19-1731-4580-ba1d-b9046cd24176', classId: '36b5e873-198b-4467-9eb3-9f9e8a1855bf', name: 'June 2026', year: 2026, month: 6, status: 'STUDENTS_ONLY'  },
  // Shehara
  { id: '39fa100c-3b38-48df-8a55-83e02b9c5ee3', classId: 'ac24d52c-e602-4507-a668-370a2a39e22d', name: 'May 2026',  year: 2026, month: 5, status: 'STUDENTS_ONLY'  },
  { id: 'd0e8deb8-da43-43d6-aadf-a57fea703ba6', classId: 'ac24d52c-e602-4507-a668-370a2a39e22d', name: 'june 2026', year: 2026, month: 6, status: 'STUDENTS_ONLY'  },
  // English - Grade 11 - Online
  { id: 'aab79f54-0a04-4909-b6c8-7f4a3525601a', classId: '2a2cbbe9-7eb5-4a2f-b78d-9cbdee342a9d', name: 'May 2026',  year: 2026, month: 5, status: 'STUDENTS_ONLY'  },
  { id: '4fc594b3-9bbf-4ed3-80f7-49c6f6d0199f', classId: '2a2cbbe9-7eb5-4a2f-b78d-9cbdee342a9d', name: 'June 2026', year: 2026, month: 6, status: 'STUDENTS_ONLY'  },
];

// All lectures belonging to td-001 months
const SRC_LECTURES = [
  // AL-2028 May
  { id: '3b664de9-b1be-4ffe-9808-dc4dc3840cff', monthId: 'a8038692-aafb-441f-af0e-d4ca059f0851', title: 'Numerical English',           startTime: '2026-05-08T09:45:00.000Z', endTime: '2026-05-08T12:45:00.000Z', sessionLink: 'https://us06web.zoom.us/j/86363803271', status: 'ANYONE',        platform: 'Zoom' },
  { id: '3b0caf09-bf84-4454-be65-b52920053c22', monthId: 'a8038692-aafb-441f-af0e-d4ca059f0851', title: 'Advanced English - 2028',        startTime: '2026-05-15T09:45:00.000Z', endTime: '2026-05-15T12:45:00.000Z', sessionLink: 'https://us06web.zoom.us/j/81365572140', status: 'STUDENTS_ONLY', platform: 'Zoom' },
  { id: '8eac247a-a7f0-46a4-9286-6cdd84407ff1', monthId: 'a8038692-aafb-441f-af0e-d4ca059f0851', title: 'Numerical English - Day 02',     startTime: '2026-05-21T09:30:00.000Z', endTime: '2026-05-21T11:45:00.000Z', sessionLink: 'https://us06web.zoom.us/j/81071840024', status: 'STUDENTS_ONLY', platform: 'Zoom' },
  // AL-2028 June
  { id: '05a76a40-c772-4c5d-aaac-2373c33b4293', monthId: '4ab7c7ac-6166-49ab-92a0-eec76398d2fa', title: 'Advanced English - 05th June 2026', startTime: '2026-06-05T09:45:00.000Z', endTime: '2026-06-05T11:45:00.000Z', sessionLink: 'https://us06web.zoom.us/j/85079182606', status: 'STUDENTS_ONLY', platform: 'Zoom' },
  { id: 'fa91bb69-f0eb-417a-b464-b853de0d7779', monthId: '4ab7c7ac-6166-49ab-92a0-eec76398d2fa', title: 'Advanced English - 19th June 2026', startTime: '2026-06-19T09:45:00.000Z', endTime: '2026-06-19T12:45:00.000Z', sessionLink: 'https://zoom.us/j/92334452260',          status: 'STUDENTS_ONLY', platform: 'Zoom' },
  // Grade10 May
  { id: '019ec903-2a93-414a-9b9b-389154eaf7b5', monthId: '82fff1c3-a557-419e-83ef-5053fa191efd', title: 'Poems - Part 02',                startTime: '2026-05-08T07:30:00.000Z', endTime: '2026-05-08T09:30:00.000Z', sessionLink: 'https://us06web.zoom.us/j/82870207728', status: 'ANYONE',        platform: 'Zoom' },
  { id: 'f226d4b1-d69f-49b8-8088-f187aa04b934', monthId: '82fff1c3-a557-419e-83ef-5053fa191efd', title: 'English - Grade 10',             startTime: '2026-05-15T07:45:00.000Z', endTime: '2026-05-15T09:45:00.000Z', sessionLink: 'https://us06web.zoom.us/j/81079184937', status: 'STUDENTS_ONLY', platform: 'Zoom' },
  { id: '032c1663-a6d0-4b02-879e-acddd995e519', monthId: '82fff1c3-a557-419e-83ef-5053fa191efd', title: 'Affixes - Day 2',                startTime: '2026-05-21T07:30:00.000Z', endTime: '2026-05-21T09:30:00.000Z', sessionLink: 'https://us06web.zoom.us/j/82280528547', status: 'STUDENTS_ONLY', platform: 'Zoom' },
  // Grade10 June
  { id: '9b204cef-02de-474f-9d4d-6ef6c7a8405f', monthId: '217581fe-2799-448e-8ded-0d7bdb74f118', title: 'English - Grade 10 - 05th June 2026', startTime: '2026-06-05T07:30:00.000Z', endTime: '2026-06-05T09:30:00.000Z', sessionLink: 'https://us06web.zoom.us/j/84621004638', status: 'STUDENTS_ONLY', platform: 'Zoom' },
  { id: '5ff3646b-1857-41fc-a500-554fccaa61e1', monthId: '217581fe-2799-448e-8ded-0d7bdb74f118', title: 'English - 19th june 2026',        startTime: '2026-06-19T07:30:00.000Z', endTime: '2026-06-19T10:00:00.000Z', sessionLink: 'https://zoom.us/j/97762939206',          status: 'STUDENTS_ONLY', platform: 'Zoom' },
  // G11 Home May
  { id: '1cb239f4-ece9-4f0c-804d-ecb68939c46d', monthId: 'ab810528-0ee9-43f7-a936-246716f459f3', title: 'Paper Class - Paper 02-A - Day 02',    startTime: '2026-05-17T09:30:00.000Z', endTime: '2026-05-17T12:30:00.000Z', sessionLink: 'https://us06web.zoom.us/j/83729205275', status: 'STUDENTS_ONLY', platform: 'Zoom' },
  { id: '0a009920-8133-4821-ac83-3f8e9ad7a3a4', monthId: 'ab810528-0ee9-43f7-a936-246716f459f3', title: 'Paper Class - Paper 02 A - Part 03',    startTime: '2026-05-24T09:30:00.000Z', endTime: '2026-05-24T12:30:00.000Z', sessionLink: 'https://us06web.zoom.us/j/85908262889', status: 'STUDENTS_ONLY', platform: 'Zoom' },
  // G11 Home June
  { id: '0231d925-ca4c-4bc6-baa1-5914a8fca39f', monthId: '4897bb19-1731-4580-ba1d-b9046cd24176', title: 'English With My kids',              startTime: '2026-06-06T08:00:00.000Z', endTime: '2026-06-06T10:30:00.000Z', sessionLink: 'https://us06web.zoom.us/j/89467382722', status: 'STUDENTS_ONLY', platform: 'Zoom' },
  { id: 'be521950-4403-4c86-a98c-1b6ada60ec86', monthId: '4897bb19-1731-4580-ba1d-b9046cd24176', title: 'Paper Class -G11 - 07th june 2026', startTime: '2026-06-07T09:30:00.000Z', endTime: '2026-06-07T11:30:00.000Z', sessionLink: 'https://zoom.us/j/98553601018',          status: 'STUDENTS_ONLY', platform: 'Zoom' },
  { id: 'd461f158-4f59-463a-878d-bae5e456bf66', monthId: '4897bb19-1731-4580-ba1d-b9046cd24176', title: 'Paper Class 2026/06/14 Essay writing', startTime: '2026-06-14T09:45:00.000Z', endTime: '2026-06-14T12:45:00.000Z', sessionLink: 'https://zoom.us/j/93813652135',          status: 'STUDENTS_ONLY', platform: 'Zoom' },
  // Shehara May
  { id: '7ccd5f6f-2691-4755-8390-3c644aadc0b6', monthId: '39fa100c-3b38-48df-8a55-83e02b9c5ee3', title: 'English With Shehara',             startTime: '2026-05-12T11:15:00.000Z', endTime: '2026-05-12T15:30:00.000Z', sessionLink: 'https://us06web.zoom.us/j/88592722785', status: 'STUDENTS_ONLY', platform: 'Zoom' },
  { id: '6b8ad7dc-21d9-4829-8082-e531559145dc', monthId: '39fa100c-3b38-48df-8a55-83e02b9c5ee3', title: 'Shehara English',                  startTime: '2026-05-23T11:00:00.000Z', endTime: '2026-05-23T14:00:00.000Z', sessionLink: 'https://us06web.zoom.us/j/83227796976', status: 'STUDENTS_ONLY', platform: 'Zoom' },
  { id: '66889dac-5dab-4c25-801a-d6d51377afae', monthId: '39fa100c-3b38-48df-8a55-83e02b9c5ee3', title: 'Shehara - 2026.05.30',             startTime: '2026-05-30T10:15:00.000Z', endTime: '2026-05-30T13:30:00.000Z', sessionLink: 'https://us06web.zoom.us/j/84786005312', status: 'STUDENTS_ONLY', platform: 'Zoom' },
  // Shehara June
  { id: '4aeeb565-4c27-4f46-9b35-6e101f1218d2', monthId: 'd0e8deb8-da43-43d6-aadf-a57fea703ba6', title: 'Shehara English 2026 06 09',       startTime: '2026-06-09T11:15:00.000Z', endTime: '2026-06-09T14:00:00.000Z', sessionLink: 'https://zoom.us/j/94962580514',          status: 'STUDENTS_ONLY', platform: 'Zoom' },
  // G11 Online May
  { id: 'ab4498ac-aa20-4aa2-ab85-af608fe3426b', monthId: 'aab79f54-0a04-4909-b6c8-7f4a3525601a', title: 'Paper Class - Paper 02 A -Day 02',  startTime: '2026-05-17T09:30:00.000Z', endTime: '2026-05-17T12:30:00.000Z', sessionLink: 'https://us06web.zoom.us/j/83729205275', status: 'STUDENTS_ONLY', platform: 'Zoom' },
  { id: '78389245-9dc7-4e00-a0b9-3ce58c8709ea', monthId: 'aab79f54-0a04-4909-b6c8-7f4a3525601a', title: 'Paper Class - Paper 02-A',          startTime: '2026-05-10T09:30:00.000Z', endTime: '2026-05-10T12:30:00.000Z', sessionLink: 'https://us06web.zoom.us/j/82949803530', status: 'STUDENTS_ONLY', platform: 'Zoom' },
  { id: '684aa700-c55c-4a74-aac9-ce2a95eb931f', monthId: 'aab79f54-0a04-4909-b6c8-7f4a3525601a', title: 'Paper Class - Paper 02A - Day 03',  startTime: '2026-05-24T09:30:00.000Z', endTime: '2026-05-24T12:30:00.000Z', sessionLink: 'https://us06web.zoom.us/j/85908262889', status: 'STUDENTS_ONLY', platform: 'Zoom' },
  // G11 Online June
  { id: '4770c1fc-28bf-43a2-b528-2a4ab9570913', monthId: '4fc594b3-9bbf-4ed3-80f7-49c6f6d0199f', title: 'Paper Class G 11 - 2026 June 07',   startTime: '2026-06-07T09:30:00.000Z', endTime: '2026-06-07T11:30:00.000Z', sessionLink: 'https://zoom.us/j/98553601018',          status: 'STUDENTS_ONLY', platform: 'Zoom' },
  { id: 'b2dd9752-118f-4337-9b61-cb952a6a9480', monthId: '4fc594b3-9bbf-4ed3-80f7-49c6f6d0199f', title: 'Paper Class 2026/06/14 Essay writing', startTime: '2026-06-14T09:45:00.000Z', endTime: '2026-06-14T12:45:00.000Z', sessionLink: 'https://zoom.us/j/93813652135',          status: 'STUDENTS_ONLY', platform: 'Zoom' },
];

// All recordings belonging to td-001 months
const SRC_RECORDINGS = [
  // AL-2028 May
  { id: 'c4285ae4-c232-4e7c-b348-7ca28172a0e0', monthId: 'a8038692-aafb-441f-af0e-d4ca059f0851', title: 'Numerical English Basics - Part 01', videoUrl: 'https://youtu.be/ZTDr7HkC7-M', thumbnail: 'https://storage.thilinadhananjaya.lk/recordings/849ab0ea-30e2-47f6-be3b-57ceae812d41.png', status: 'STUDENTS_ONLY' },
  // AL-2028 June (no recordings)
  // Grade10 May
  { id: '79d1e46c-e0a5-4db4-8525-187ef300e274', monthId: '82fff1c3-a557-419e-83ef-5053fa191efd', title: 'Poems - Part 01',    videoUrl: 'https://youtu.be/WaudwECk2ZM', thumbnail: 'https://storage.thilinadhananjaya.lk/recordings/2c8aefb3-dca5-46ad-b8e5-6053117e6d2f.png', status: 'STUDENTS_ONLY' },
  { id: 'c9ce3afc-849f-49ae-ab3c-78b08be7e477', monthId: '82fff1c3-a557-419e-83ef-5053fa191efd', title: 'Poems - Part 02',    videoUrl: 'https://youtu.be/uMQ2MUoLsew', thumbnail: 'https://storage.thilinadhananjaya.lk/recordings/66062b3e-d46a-41f1-885d-1b170f0125d2.png', status: 'STUDENTS_ONLY' },
  { id: '3ce2bf91-1e68-4db8-abe4-bca7aa3bf71d', monthId: '82fff1c3-a557-419e-83ef-5053fa191efd', title: 'Prefixes - Part 01', videoUrl: 'https://youtu.be/SzpG9Phb6Lc', thumbnail: 'https://storage.thilinadhananjaya.lk/recordings/48dd29a1-1f00-4027-b5be-48c04974115e.png', status: 'ENROLLED_ONLY' },
  // Grade10 June
  { id: '7e83f254-d226-4460-a9f3-1624e29e07e9', monthId: '217581fe-2799-448e-8ded-0d7bdb74f118', title: 'Prefixes Part 02',   videoUrl: 'https://youtu.be/3Agr22NC8EI', thumbnail: 'https://storage.thilinadhananjaya.lk/recordings/b626ab82-814f-4323-8256-ffaa5719f8e6.png', status: 'STUDENTS_ONLY' },
  { id: 'a94eba5c-487d-4d20-a962-c65ae0aec904', monthId: '217581fe-2799-448e-8ded-0d7bdb74f118', title: 'Suffixes - Part 01', videoUrl: 'https://youtu.be/tiYcSSKHGNc', thumbnail: 'https://storage.thilinadhananjaya.lk/recordings/3f5d9977-4f73-40fd-9889-079658a5d713.png', status: 'STUDENTS_ONLY' },
  // G11 Home May
  { id: 'e6c80a87-f83c-42e2-90eb-053a82d3b53a', monthId: 'ab810528-0ee9-43f7-a936-246716f459f3', title: 'Paper Class - Paper 01A - Part 01',  videoUrl: 'https://youtu.be/y6TYt2u3OIw', thumbnail: 'https://storage.thilinadhananjaya.lk/recordings/1f59466b-e889-4b87-8679-03dd8b386ec9.png', status: 'STUDENTS_ONLY' },
  { id: 'e0fe1f59-fdd2-4a5c-bbe3-ed92bfc2b145', monthId: 'ab810528-0ee9-43f7-a936-246716f459f3', title: 'Paper Class - Paper01A - Part 02',   videoUrl: 'https://youtu.be/btQZy3JIURc', thumbnail: 'https://storage.thilinadhananjaya.lk/recordings/29637b10-4aca-4b08-893e-82dcfb249c87.png', status: 'STUDENTS_ONLY' },
  { id: '95a0a846-fc4b-4062-b510-5a335f8ad22d', monthId: 'ab810528-0ee9-43f7-a936-246716f459f3', title: 'Paper Class - Paper 01B- Part 01',   videoUrl: 'https://youtu.be/IIqchZaW9y0', thumbnail: 'https://storage.thilinadhananjaya.lk/recordings/c9fe5c32-3989-48af-a61d-e9e5d7de000c.png', status: 'STUDENTS_ONLY' },
  { id: '197b7ef2-edf6-40db-9438-3aced4eb4473', monthId: 'ab810528-0ee9-43f7-a936-246716f459f3', title: 'Paper Class - Paper 01B- Part 02',   videoUrl: 'https://youtu.be/alkPhxNztGQ', thumbnail: 'https://storage.thilinadhananjaya.lk/recordings/04165c77-b036-4e58-b39e-c8100754dbdf.png', status: 'STUDENTS_ONLY' },
  { id: '781b5a57-b62e-4023-8f3e-99fcf53402e2', monthId: 'ab810528-0ee9-43f7-a936-246716f459f3', title: 'Paper Class - Paper 01B Part 03',    videoUrl: 'https://youtu.be/WaudwECk2ZM', thumbnail: 'https://storage.thilinadhananjaya.lk/recordings/b14c5653-ca9e-44e3-8e6d-c3af407003de.png', status: 'STUDENTS_ONLY' },
  { id: 'ddad350c-1b14-4ed4-9b39-86f92129574b', monthId: 'ab810528-0ee9-43f7-a936-246716f459f3', title: 'Paper Class - Paper 02A- Part 01',   videoUrl: 'https://youtu.be/dXc-t5Q5t-8', thumbnail: 'https://storage.thilinadhananjaya.lk/recordings/760b6261-c340-4dc0-95af-f65afbfcfd68.png', status: 'STUDENTS_ONLY' },
  { id: 'b74b475b-2eb2-4029-8b2d-18d3b3678f8d', monthId: 'ab810528-0ee9-43f7-a936-246716f459f3', title: 'Paper Class - Paper 02 A Part 02',   videoUrl: 'https://youtu.be/CjTb5jHrAyA', thumbnail: 'https://storage.thilinadhananjaya.lk/recordings/fe9731a0-cb8c-473e-ad94-92c914200ccc.png', status: 'STUDENTS_ONLY' },
  { id: 'b1c09d17-2e53-47cb-9640-da741cb3aff0', monthId: 'ab810528-0ee9-43f7-a936-246716f459f3', title: 'Paper Class - paper 2A - Part 03',   videoUrl: 'https://youtu.be/ltkDJnXjBm0', thumbnail: 'https://storage.thilinadhananjaya.lk/recordings/eaec1851-ed70-4711-8ebd-62b12522de7b.png', status: 'STUDENTS_ONLY' },
  // G11 Home June
  { id: '7ca21eb4-561d-4a31-ac5d-15d82d4b07ea', monthId: '4897bb19-1731-4580-ba1d-b9046cd24176', title: 'Paper Class - Essay Planning',  videoUrl: 'https://youtu.be/zy8p9x_dJ0c', thumbnail: 'https://storage.thilinadhananjaya.lk/recordings/74cf2431-5d39-4338-a759-8442f28f53c7.png', status: 'STUDENTS_ONLY' },
  { id: 'b4c9ec07-34a5-48b9-b4de-9102d4a6dd0b', monthId: '4897bb19-1731-4580-ba1d-b9046cd24176', title: 'Paper Class - Graph writing',    videoUrl: 'https://youtu.be/XWRBelUbd0E', thumbnail: 'https://storage.thilinadhananjaya.lk/recordings/c9e4e604-c48a-4179-bfc2-9d0a794e4b5a.png', status: 'STUDENTS_ONLY' },
  // Shehara May
  { id: 'f09f1640-c18d-4903-875d-0ef83d51b85a', monthId: '481bd4b9-2bf8-46df-bae6-feafe9f68c29', title: 'Numerical English Basics - Part 01', videoUrl: 'https://youtu.be/ZTDr7HkC7-M', thumbnail: 'https://storage.thilinadhananjaya.lk/recordings/b43f150b-ed8a-45df-85e5-6da9b9401eb2.png', status: 'STUDENTS_ONLY' },
  // G11 Online May
  { id: '8a1d760a-7fda-41a1-b469-34aa191e04d8', monthId: 'aab79f54-0a04-4909-b6c8-7f4a3525601a', title: 'Paper Class -Paper 01 A',          videoUrl: 'https://youtu.be/y6TYt2u3OIw',  thumbnail: null, status: 'STUDENTS_ONLY' },
  { id: '32530dcd-4b05-4838-a551-18b24a71c67b', monthId: 'aab79f54-0a04-4909-b6c8-7f4a3525601a', title: 'Paper Class - Paper 1A- Part 02',   videoUrl: 'https://youtu.be/btQZy3JIURc', thumbnail: null, status: 'STUDENTS_ONLY' },
  { id: 'c37b42f0-223d-4e30-8863-fad0bb90796e', monthId: 'aab79f54-0a04-4909-b6c8-7f4a3525601a', title: 'Paper Class - Paper 01 B - Part 01', videoUrl: 'https://youtu.be/IIqchZaW9y0', thumbnail: null, status: 'STUDENTS_ONLY' },
  { id: 'be9f6c54-7027-43f0-80eb-1877aea9b197', monthId: 'aab79f54-0a04-4909-b6c8-7f4a3525601a', title: 'Paper Class - Paper 01 B- Part 02',  videoUrl: 'https://youtu.be/alkPhxNztGQ', thumbnail: null, status: 'STUDENTS_ONLY' },
  { id: 'a77a1934-3279-4861-99fa-d3282e7b4e08', monthId: 'aab79f54-0a04-4909-b6c8-7f4a3525601a', title: 'Paper Class - Paper 01 B - part 03', videoUrl: 'https://youtu.be/WaudwECk2ZM', thumbnail: null, status: 'STUDENTS_ONLY' },
  { id: 'a5b0f4f4-2a6a-4358-be92-1383e62b5c76', monthId: 'aab79f54-0a04-4909-b6c8-7f4a3525601a', title: 'Paper Class - Paper 02A - Part 01',  videoUrl: 'https://youtu.be/dXc-t5Q5t-8',  thumbnail: null, status: 'STUDENTS_ONLY' },
  { id: 'b3bdb265-4598-4772-91a8-117ba13df007', monthId: 'aab79f54-0a04-4909-b6c8-7f4a3525601a', title: 'Paper Class - Paper 02 A - Part 02', videoUrl: 'https://youtu.be/CjTb5jHrAyA',  thumbnail: null, status: 'STUDENTS_ONLY' },
  { id: '46126ece-2cc1-4b8a-ab60-9ee2f1999f60', monthId: 'aab79f54-0a04-4909-b6c8-7f4a3525601a', title: 'Paper Class Paper 02A - Part 03',    videoUrl: 'https://youtu.be/ltkDJnXjBm0',  thumbnail: null, status: 'STUDENTS_ONLY' },
  // G11 Online June
  { id: '32527e14-00de-4375-b6a8-2f0d24aaa206', monthId: '4fc594b3-9bbf-4ed3-80f7-49c6f6d0199f', title: 'Paper Class - Essay Planning',  videoUrl: 'https://youtu.be/zy8p9x_dJ0c', thumbnail: 'https://storage.thilinadhananjaya.lk/recordings/f279979f-6742-4b27-a1af-9fbfb1a6b59e.png', status: 'STUDENTS_ONLY' },
  { id: 'bf3ad585-a829-4e4f-8e47-53772b660886', monthId: '4fc594b3-9bbf-4ed3-80f7-49c6f6d0199f', title: 'Paper Class - Graph writing',    videoUrl: 'https://youtu.be/XWRBelUbd0E', thumbnail: 'https://storage.thilinadhananjaya.lk/recordings/6275bd9d-3012-43b6-a150-e51b60ffbc71.png', status: 'STUDENTS_ONLY' },
  // G11 Home May - extra recordings
  { id: 'dcb665ac-facb-490f-9f41-bf4333802e72', monthId: 'ca43f398-e377-4026-9849-51735bdacc14', title: 'Paper 01 - B - Part 03',  videoUrl: 'https://youtu.be/WaudwECk2ZM', thumbnail: null, status: 'STUDENTS_ONLY' },
  { id: '11d788d5-ac56-4472-a114-c0fcfe4a20b7', monthId: 'ca43f398-e377-4026-9849-51735bdacc14', title: 'Paper 01 - B - Part 01',  videoUrl: 'https://youtu.be/IIqchZaW9y0', thumbnail: null, status: 'STUDENTS_ONLY' },
  { id: '04a2c879-4bca-4a89-bcbc-541c6abfec1c', monthId: 'ca43f398-e377-4026-9849-51735bdacc14', title: 'Paper 01 - B - Part 02',  videoUrl: 'https://youtu.be/alkPhxNztGQ', thumbnail: null, status: 'STUDENTS_ONLY' },
  { id: '1e571192-f5ab-4851-9301-2d4e7c3b66ee', monthId: 'ca43f398-e377-4026-9849-51735bdacc14', title: 'Paper 02 - A - Part 01',  videoUrl: 'https://youtu.be/dXc-t5Q5t-8',  thumbnail: null, status: 'STUDENTS_ONLY' },
  { id: 'eb1ba562-d349-4fc3-b554-de3fc1c435b5', monthId: 'ca43f398-e377-4026-9849-51735bdacc14', title: 'Paper 02-A - Part 02',    videoUrl: 'https://youtu.be/CjTb5jHrAyA',  thumbnail: 'https://storage.thilinadhananjaya.lk/recordings/c54ed8b5-4bc9-4a41-87d5-c30a4d4fed8a.png', status: 'STUDENTS_ONLY' },
  { id: 'aa81f9f5-0de4-4c49-b468-6a3e283592b2', monthId: 'ca43f398-e377-4026-9849-51735bdacc14', title: 'Paper Class - Paper 2A Part 03', videoUrl: 'https://youtu.be/ltkDJnXjBm0', thumbnail: 'https://storage.thilinadhananjaya.lk/recordings/f4f38d7d-9997-415b-a1db-95077a924839.png', status: 'STUDENTS_ONLY' },
  // Sihasma G11 May/June recordings
  { id: 'b538d035-fbc3-4cb7-b921-7a69b04f85ae_r1', monthId: 'b538d035-fbc3-4cb7-b921-7a69b04f85ae', title: 'Paper Class - Graph Writing',        videoUrl: 'https://youtu.be/XWRBelUbd0E', thumbnail: null, status: 'STUDENTS_ONLY' },
  { id: '168555bc-39f7-4ea4-bd69-7c30e1e845a8', monthId: 'b538d035-fbc3-4cb7-b921-7a69b04f85ae', title: 'Paper Class - Essay Planning - Part 01', videoUrl: 'https://youtu.be/zy8p9x_dJ0c', thumbnail: null, status: 'STUDENTS_ONLY' },
  // Grade10 June - Sihasma
  { id: 'b08ea819_r1', monthId: 'b08ea819-799f-4d9d-9f33-b5a0f5fe1cfc', title: 'Prefixes Part 01',   videoUrl: 'https://youtu.be/SzpG9Phb6Lc', thumbnail: 'https://storage.thilinadhananjaya.lk/recordings/b0ec8521-f3d3-47fc-9e3c-9956d8398aba.png', status: 'STUDENTS_ONLY' },
  { id: 'b08ea819_r2', monthId: 'b08ea819-799f-4d9d-9f33-b5a0f5fe1cfc', title: 'Prefixes - Part 02', videoUrl: 'https://youtu.be/3Agr22NC8EI', thumbnail: 'https://storage.thilinadhananjaya.lk/recordings/1d338202-ed28-4b28-b372-a40401f2af15.png', status: 'STUDENTS_ONLY' },
  { id: 'b08ea819_r3', monthId: 'b08ea819-799f-4d9d-9f33-b5a0f5fe1cfc', title: 'Suffixes - Part 01', videoUrl: 'https://youtu.be/tiYcSSKHGNc', thumbnail: 'https://storage.thilinadhananjaya.lk/recordings/c9dcfa1b-148c-4865-ba70-d50e6aa46d73.png', status: 'STUDENTS_ONLY' },
  // G11 Home June essay recordings
  { id: 'ae57cb1f-b84f-4d8c-83c7-180742a2fd45', monthId: '6a7b050f-7a6f-4262-a8e2-49d9c0bf9e66', title: 'Paper Class - Essay Planning', videoUrl: 'https://youtu.be/zy8p9x_dJ0c', thumbnail: null, status: 'STUDENTS_ONLY' },
  { id: 'b2f3f2df-44da-4294-bc9f-d74e1e0d7552', monthId: '6a7b050f-7a6f-4262-a8e2-49d9c0bf9e66', title: 'Paper Class - Graph writing',  videoUrl: 'https://youtu.be/XWRBelUbd0E', thumbnail: null, status: 'STUDENTS_ONLY' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function genId() { return crypto.randomUUID(); }
function shortToken(src) { return crypto.createHash('md5').update(src).digest('hex').slice(0, 24); }
function mapStatus(srcStatus) {
  // source: ANYONE / STUDENTS_ONLY / ENROLLED_ONLY → target rec_access_level
  if (srcStatus === 'ANYONE') return 'ANYONE';
  if (srcStatus === 'ENROLLED_ONLY') return 'ENROLLED_ONLY';
  return 'ENROLLED_ONLY'; // STUDENTS_ONLY → treat as enrolled
}
function mapLecStatus(s) {
  // Zoom lectures → 'scheduled' or 'completed' (all in the past)
  return 'completed';
}
function now() { return new Date().toISOString().replace('T', ' ').replace('Z', ''); }
function toMysql(iso) { return iso ? iso.replace('T', ' ').replace('Z', '').slice(0, 19) : null; }

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST, port: +(process.env.DB_PORT||3306),
    user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE, connectTimeout: 15000,
    ssl: { rejectUnauthorized: false }, multipleStatements: false,
  });

  // ID maps: source UUID → target UUID/id
  const classMap   = {};  // srcClassId   → tgt class id (varchar 36)
  const subjectMap = {};  // srcMonthId   → tgt subject id (varchar 36)
  let inserted = { classes: 0, subjects: 0, classSubjects: 0, lectures: 0, recordings: 0 };
  let skipped  = { classes: 0, subjects: 0, lectures: 0, recordings: 0 };

  // ── 1. Classes ──────────────────────────────────────────────────────────────
  console.log('\n── Classes ──');
  for (const cls of SRC_CLASSES) {
    const code = `TD_${cls.name.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30)}_${cls.id.slice(0,4)}`;
    const [existing] = await conn.query('SELECT id FROM institute_classes WHERE code=? AND institute_id=?', [code, TARGET_INSTITUTE_ID]);
    if (existing.length) {
      classMap[cls.id] = existing[0].id;
      console.log(`  SKIP class: ${cls.name} → existing ${existing[0].id}`);
      skipped.classes++;
      continue;
    }
    const newId = genId();
    classMap[cls.id] = newId;
    if (!DRY_RUN) {
      await conn.query(
        `INSERT INTO institute_classes (id, name, code, class_type, is_active, image_url, institute_id, created_at, updated_at)
         VALUES (?, ?, ?, 'REGULAR', 1, ?, ?, NOW(6), NOW(6))`,
        [newId, cls.name, code, cls.thumbnail || null, TARGET_INSTITUTE_ID]
      );
    }
    console.log(`  INSERT class: ${cls.name} → ${newId}${DRY_RUN?' [DRY]':''}`);
    inserted.classes++;
  }

  // ── 2. Subjects (months) ────────────────────────────────────────────────────
  console.log('\n── Subjects (months) ──');
  for (const m of SRC_MONTHS) {
    const tgtClassId = classMap[m.classId];
    if (!tgtClassId) { console.log(`  SKIP month ${m.name}: no class mapping for ${m.classId}`); continue; }
    const code = `TD_${m.classId.slice(0,4)}_${m.year}_${m.month}`;
    const [existing] = await conn.query('SELECT id FROM subjects WHERE code=? AND institute_id=?', [code, TARGET_INSTITUTE_ID]);
    if (existing.length) {
      subjectMap[m.id] = existing[0].id;
      console.log(`  SKIP subject: ${m.name} → existing ${existing[0].id}`);
      skipped.subjects++;
      continue;
    }
    const newId = genId();
    subjectMap[m.id] = newId;
    if (!DRY_RUN) {
      await conn.query(
        `INSERT INTO subjects (id, code, name, subject_type, is_active, institute_id, created_at, updated_at)
         VALUES (?, ?, ?, 'MONTHLY', 1, ?, NOW(6), NOW(6))`,
        [newId, code, m.name, TARGET_INSTITUTE_ID]
      );
    }
    console.log(`  INSERT subject: ${m.name} (${code}) → ${newId}${DRY_RUN?' [DRY]':''}`);
    inserted.subjects++;

    // ── 2b. class_subject mapping ──────────────────────────────────────────
    const [csExist] = await conn.query(
      'SELECT class_id FROM institute_class_subjects WHERE class_id=? AND subject_id=?',
      [tgtClassId, newId]
    );
    if (!csExist.length) {
      if (!DRY_RUN) {
        await conn.query(
          `INSERT INTO institute_class_subjects (class_id, subject_id, institute_id, is_active, created_at, updated_at) VALUES (?, ?, ?, 1, NOW(6), NOW(6))`,
          [tgtClassId, newId, TARGET_INSTITUTE_ID]
        );
      }
      inserted.classSubjects++;
    }
  }

  // ── 3. Lectures ─────────────────────────────────────────────────────────────
  console.log('\n── Lectures ──');
  for (const lec of SRC_LECTURES) {
    const tgtClassId   = classMap[lec.monthId.split('_')[0]] || (() => {
      // find via month
      const m = SRC_MONTHS.find(x => x.id === lec.monthId);
      return m ? classMap[m.classId] : null;
    })();
    const tgtSubjectId = subjectMap[lec.monthId];
    const m = SRC_MONTHS.find(x => x.id === lec.monthId);
    const realClassId = m ? classMap[m.classId] : null;

    if (!realClassId || !tgtSubjectId) {
      console.log(`  SKIP lec: ${lec.title} (no class/subject mapping)`);
      continue;
    }
    const liveUrlId = shortToken('lec_live_' + lec.id);
    const recUrlId  = shortToken('lec_rec_'  + lec.id);
    const [existing] = await conn.query(
      'SELECT id FROM institute_class_subject_lectures WHERE live_url_id=? AND institute_id=?',
      [liveUrlId, TARGET_INSTITUTE_ID]
    );
    if (existing.length) {
      console.log(`  SKIP lec: ${lec.title}`);
      skipped.lectures++;
      continue;
    }
    if (!DRY_RUN) {
      await conn.query(
        `INSERT INTO institute_class_subject_lectures
           (title, lecture_type, start_time, end_time, status, meeting_link, is_active,
            live_attendance_enabled, live_url_id, live_access_level,
            rec_url_id, rec_attendance_enabled, rec_access_level,
            institute_id, class_id, subject_id, created_at, updated_at)
         VALUES (?, 'online', ?, ?, ?, ?, 1, 1, ?, 'ENROLLED_ONLY', ?, 1, 'ENROLLED_ONLY', ?, ?, ?, NOW(6), NOW(6))`,
        [lec.title, toMysql(lec.startTime), toMysql(lec.endTime), mapLecStatus(lec.status),
         lec.sessionLink, liveUrlId, recUrlId,
         TARGET_INSTITUTE_ID, realClassId, tgtSubjectId]
      );
    }
    console.log(`  INSERT lec: ${lec.title}${DRY_RUN?' [DRY]':''}`);
    inserted.lectures++;
  }

  // ── 4. Recordings ───────────────────────────────────────────────────────────
  console.log('\n── Recordings ──');
  for (const rec of SRC_RECORDINGS) {
    const m = SRC_MONTHS.find(x => x.id === rec.monthId);
    const tgtClassId   = m ? classMap[m.classId] : null;
    const tgtSubjectId = subjectMap[rec.monthId];
    if (!tgtClassId || !tgtSubjectId) {
      console.log(`  SKIP rec: ${rec.title} (no class/subject — monthId ${rec.monthId} not in td-001)`);
      continue;
    }
    const recUrlId = shortToken('rec_' + rec.id);
    const [existing] = await conn.query(
      'SELECT id FROM subject_recordings WHERE rec_url_id=? AND institute_id=?',
      [recUrlId, TARGET_INSTITUTE_ID]
    );
    if (existing.length) {
      console.log(`  SKIP rec: ${rec.title}`);
      skipped.recordings++;
      continue;
    }
    const platform = rec.videoUrl && rec.videoUrl.includes('youtu') ? 'YOUTUBE' : 'EXTERNAL';
    if (!DRY_RUN) {
      await conn.query(
        `INSERT INTO subject_recordings
           (institute_id, class_id, subject_id, title, platform, recording_url,
            thumbnail_url, status, is_active, rec_attendance_enabled,
            rec_url_id, rec_access_level, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'published', 1, 1, ?, ?, NOW(6), NOW(6))`,
        [TARGET_INSTITUTE_ID, tgtClassId, tgtSubjectId,
         rec.title, platform, rec.videoUrl,
         rec.thumbnail || null, recUrlId, mapStatus(rec.status)]
      );
    }
    console.log(`  INSERT rec: ${rec.title}${DRY_RUN?' [DRY]':''}`);
    inserted.recordings++;
  }

  await conn.end();

  console.log('\n══════════════════════════════════════');
  console.log(`DONE ${DRY_RUN ? '[DRY RUN — nothing written]' : ''}`);
  console.log('Inserted:', inserted);
  console.log('Skipped: ', skipped);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
