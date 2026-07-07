import 'dotenv/config';
import { sql } from './db.js';

const existing = await sql`SELECT COUNT(*) AS count FROM universities`;
if (parseInt(existing[0].count) > 0) {
  console.log('Data already exists. Run with --force to overwrite.');
  if (!process.argv.includes('--force')) process.exit(0);
}

// Wipe in FK-safe order (NIOS universities are preserved — they're re-seeded on server start)
await sql`TRUNCATE learning_resources, chapters, academic_year_subjects, semesters, academic_years,
  timetable_slots, timetables, class_entries,
  faculty_batches, faculty_subjects, faculty_universities,
  subjects, batches, streams, faculty, universities,
  nios_resources, nios_chapters, nios_batch_subjects,
  nios_class_entries, nios_timetable_slots, nios_timetables,
  nios_batches, nios_subjects
  RESTART IDENTITY CASCADE`;
// Ensure fixed NIOS universities exist after cascade wipe
await sql`INSERT INTO nios_universities (name) VALUES ('NIOS +2'), ('NIOS SSLC') ON CONFLICT (name) DO NOTHING`;
console.log('Cleared existing data.');

const [adminRow] = await sql`SELECT id FROM users WHERE role = 'admin' LIMIT 1`;
const adminId = adminRow?.id ?? 1;

// ── University ────────────────────────────────────────────────────────────────

const [hgu] = await sql`INSERT INTO universities (name, short_code) VALUES ('Horizon Global University', 'HGU') RETURNING id`;
console.log('University created.');

// ── Streams ───────────────────────────────────────────────────────────────────

const [sBBA]  = await sql`INSERT INTO streams (name, university_id) VALUES ('BBA',                       ${hgu.id}) RETURNING id`;
const [sPsy]  = await sql`INSERT INTO streams (name, university_id) VALUES ('BA Psychology',              ${hgu.id}) RETURNING id`;
const [sIT]   = await sql`INSERT INTO streams (name, university_id) VALUES ('BSc Information Technology', ${hgu.id}) RETURNING id`;
console.log('Streams created.');

// ── Batches ───────────────────────────────────────────────────────────────────

const [bBBA2528] = await sql`INSERT INTO batches (name, university_id, stream_id) VALUES ('Batch 2025–2028', ${hgu.id}, ${sBBA.id}) RETURNING id`;
const [bBBA2629] = await sql`INSERT INTO batches (name, university_id, stream_id) VALUES ('Batch 2026–2029', ${hgu.id}, ${sBBA.id}) RETURNING id`;
const [bBBA2730] = await sql`INSERT INTO batches (name, university_id, stream_id) VALUES ('Batch 2027–2030', ${hgu.id}, ${sBBA.id}) RETURNING id`;
const [bPsy2528] = await sql`INSERT INTO batches (name, university_id, stream_id) VALUES ('Batch 2025–2028', ${hgu.id}, ${sPsy.id}) RETURNING id`;
const [bIT2528]  = await sql`INSERT INTO batches (name, university_id, stream_id) VALUES ('Batch 2025–2028', ${hgu.id}, ${sIT.id})  RETURNING id`;
console.log('Batches created.');

// ── Subjects ──────────────────────────────────────────────────────────────────

// BBA – Year 1
const [sMgmtPrin] = await sql`INSERT INTO subjects (name, subject_code, university_id, stream_id) VALUES ('Principles of Management',        'BBA101', ${hgu.id}, ${sBBA.id}) RETURNING id`;
const [sBizStats]  = await sql`INSERT INTO subjects (name, subject_code, university_id, stream_id) VALUES ('Business Statistics',               'BBA102', ${hgu.id}, ${sBBA.id}) RETURNING id`;
const [sFinForMgr] = await sql`INSERT INTO subjects (name, subject_code, university_id, stream_id) VALUES ('Financial Accounting for Managers', 'BBA103', ${hgu.id}, ${sBBA.id}) RETURNING id`;

// BBA – Year 2
const [sOrgBehav] = await sql`INSERT INTO subjects (name, subject_code, university_id, stream_id) VALUES ('Organizational Behaviour', 'BBA201', ${hgu.id}, ${sBBA.id}) RETURNING id`;
const [sMktMgmt]  = await sql`INSERT INTO subjects (name, subject_code, university_id, stream_id) VALUES ('Marketing Management',     'BBA202', ${hgu.id}, ${sBBA.id}) RETURNING id`;
const [sHRM]      = await sql`INSERT INTO subjects (name, subject_code, university_id, stream_id) VALUES ('Human Resource Management','BBA203', ${hgu.id}, ${sBBA.id}) RETURNING id`;

// BBA – Year 3
const [sStratMgmt] = await sql`INSERT INTO subjects (name, subject_code, university_id, stream_id) VALUES ('Strategic Management',        'BBA301', ${hgu.id}, ${sBBA.id}) RETURNING id`;
const [sEntrepren] = await sql`INSERT INTO subjects (name, subject_code, university_id, stream_id) VALUES ('Entrepreneurship Development', 'BBA302', ${hgu.id}, ${sBBA.id}) RETURNING id`;
const [sIntlBiz]   = await sql`INSERT INTO subjects (name, subject_code, university_id, stream_id) VALUES ('International Business',       'BBA303', ${hgu.id}, ${sBBA.id}) RETURNING id`;

// BA Psychology – Year 1
const [sIntroPsy] = await sql`INSERT INTO subjects (name, subject_code, university_id, stream_id) VALUES ('Introduction to Psychology', 'PSY101', ${hgu.id}, ${sPsy.id}) RETURNING id`;
const [sDevPsy]   = await sql`INSERT INTO subjects (name, subject_code, university_id, stream_id) VALUES ('Developmental Psychology',   'PSY102', ${hgu.id}, ${sPsy.id}) RETURNING id`;

// BSc IT – Year 1
const [sPyProg]  = await sql`INSERT INTO subjects (name, subject_code, university_id, stream_id) VALUES ('Programming in Python', 'BSCIT101', ${hgu.id}, ${sIT.id}) RETURNING id`;
const [sNetworks] = await sql`INSERT INTO subjects (name, subject_code, university_id, stream_id) VALUES ('Computer Networks',    'BSCIT102', ${hgu.id}, ${sIT.id}) RETURNING id`;

console.log('Subjects created.');

// ── Faculty ───────────────────────────────────────────────────────────────────

const [fMeera]  = await sql`INSERT INTO faculty (name, email, phone, payment_type, hourly_rate) VALUES ('Dr. Meera Iyer',     'meera.iyer@horizonglobal.edu',   '9845012345', 'hourly', 950.00) RETURNING id`;
const [fArjun]  = await sql`INSERT INTO faculty (name, email, phone, payment_type, hourly_rate) VALUES ('Prof. Arjun Kapoor', 'arjun.kapoor@horizonglobal.edu', '9845012346', 'hourly', 900.00) RETURNING id`;
const [fKavya]  = await sql`INSERT INTO faculty (name, email, phone, payment_type, hourly_rate) VALUES ('Ms. Kavya Menon',    'kavya.menon@horizonglobal.edu',  '9845012347', 'fixed', null) RETURNING id`;
const [fVikram] = await sql`INSERT INTO faculty (name, email, phone, payment_type, hourly_rate) VALUES ('Mr. Vikram Rao',     'vikram.rao@horizonglobal.edu',   '9845012348', 'hourly', 850.00) RETURNING id`;

await sql`INSERT INTO faculty_universities (faculty_id, university_id) VALUES
  (${fMeera.id}, ${hgu.id}), (${fArjun.id}, ${hgu.id}),
  (${fKavya.id}, ${hgu.id}), (${fVikram.id}, ${hgu.id})`;

await sql`INSERT INTO faculty_subjects (faculty_id, subject_id) VALUES
  (${fMeera.id},  ${sMgmtPrin.id}), (${fMeera.id},  ${sOrgBehav.id}), (${fMeera.id}, ${sStratMgmt.id}),
  (${fArjun.id},  ${sBizStats.id}), (${fArjun.id},  ${sHRM.id}),      (${fArjun.id}, ${sEntrepren.id}),
  (${fKavya.id},  ${sFinForMgr.id}),(${fKavya.id},  ${sMktMgmt.id}),  (${fKavya.id}, ${sIntlBiz.id}),
  (${fKavya.id},  ${sIntroPsy.id}), (${fKavya.id},  ${sDevPsy.id}),
  (${fVikram.id}, ${sPyProg.id}),   (${fVikram.id}, ${sNetworks.id})`;

await sql`INSERT INTO faculty_batches (faculty_id, batch_id) VALUES
  (${fMeera.id},  ${bBBA2528.id}), (${fMeera.id},  ${bBBA2629.id}),
  (${fArjun.id},  ${bBBA2528.id}), (${fArjun.id},  ${bBBA2629.id}),
  (${fKavya.id},  ${bBBA2528.id}), (${fKavya.id},  ${bPsy2528.id}),
  (${fVikram.id}, ${bIT2528.id})`;

console.log('Faculty created.');

// ── Academic Years ────────────────────────────────────────────────────────────

const years = ['First Year', 'Second Year', 'Third Year'];
const batches = [bBBA2528, bBBA2629, bBBA2730, bPsy2528, bIT2528];
const yearIds = {};

for (const batch of batches) {
  yearIds[batch.id] = [];
  for (let i = 0; i < years.length; i++) {
    const [row] = await sql`
      INSERT INTO academic_years (batch_id, name, year_order)
      VALUES (${batch.id}, ${years[i]}, ${i + 1}) RETURNING id`;
    yearIds[batch.id].push(row.id);
  }
}
console.log('Academic years created.');

// ── Academic Year → Subject mappings (curriculum) ─────────────────────────────

// BBA 2025–2028
const [y1, y2, y3] = yearIds[bBBA2528.id];
const [ays2528_mgmtPrin] = await sql`INSERT INTO academic_year_subjects (academic_year_id, subject_id) VALUES (${y1}, ${sMgmtPrin.id})  RETURNING id`;
const [ays2528_bizStats] = await sql`INSERT INTO academic_year_subjects (academic_year_id, subject_id) VALUES (${y1}, ${sBizStats.id})  RETURNING id`;
const [ays2528_finForMgr]= await sql`INSERT INTO academic_year_subjects (academic_year_id, subject_id) VALUES (${y1}, ${sFinForMgr.id}) RETURNING id`;
await sql`INSERT INTO academic_year_subjects (academic_year_id, subject_id) VALUES
  (${y2}, ${sOrgBehav.id}), (${y2}, ${sMktMgmt.id}), (${y2}, ${sHRM.id}),
  (${y3}, ${sStratMgmt.id}), (${y3}, ${sEntrepren.id}), (${y3}, ${sIntlBiz.id})`;

// BBA 2026–2029 — separate junction rows so chapters can differ per batch
const [y1b, y2b, y3b] = yearIds[bBBA2629.id];
const [ays2629_mgmtPrin] = await sql`INSERT INTO academic_year_subjects (academic_year_id, subject_id) VALUES (${y1b}, ${sMgmtPrin.id})  RETURNING id`;
const [ays2629_bizStats] = await sql`INSERT INTO academic_year_subjects (academic_year_id, subject_id) VALUES (${y1b}, ${sBizStats.id})  RETURNING id`;
const [ays2629_finForMgr]= await sql`INSERT INTO academic_year_subjects (academic_year_id, subject_id) VALUES (${y1b}, ${sFinForMgr.id}) RETURNING id`;
await sql`INSERT INTO academic_year_subjects (academic_year_id, subject_id) VALUES
  (${y2b}, ${sOrgBehav.id}), (${y2b}, ${sMktMgmt.id}), (${y2b}, ${sHRM.id}),
  (${y3b}, ${sStratMgmt.id}), (${y3b}, ${sEntrepren.id}), (${y3b}, ${sIntlBiz.id})`;

// BA Psychology 2025–2028
const [y1psy] = yearIds[bPsy2528.id];
await sql`INSERT INTO academic_year_subjects (academic_year_id, subject_id) VALUES
  (${y1psy}, ${sIntroPsy.id}), (${y1psy}, ${sDevPsy.id})`;

// BSc IT 2025–2028 — uses semesters
const [y1it] = yearIds[bIT2528.id];
const [itSem1] = await sql`INSERT INTO semesters (academic_year_id, name, semester_order) VALUES (${y1it}, 'Semester 1', 1) RETURNING id`;
const [itSem2] = await sql`INSERT INTO semesters (academic_year_id, name, semester_order) VALUES (${y1it}, 'Semester 2', 2) RETURNING id`;

const [ays_it_prog] = await sql`INSERT INTO academic_year_subjects (academic_year_id, subject_id, semester_id) VALUES (${y1it}, ${sPyProg.id}, ${itSem1.id}) RETURNING id`;
await sql`INSERT INTO academic_year_subjects (academic_year_id, subject_id, semester_id) VALUES (${y1it}, ${sNetworks.id}, ${itSem2.id})`;

console.log('Curriculum subject mappings created.');

// ── Chapters (per academic_year_subject — batch-specific) ─────────────────────

// BBA 2025–2028 → First Year → Principles of Management
const [ch1] = await sql`INSERT INTO chapters (academic_year_subject_id, title, chapter_order, created_by) VALUES (${ays2528_mgmtPrin.id}, 'Foundations of Management', 1, ${adminId}) RETURNING id`;
const [ch2] = await sql`INSERT INTO chapters (academic_year_subject_id, title, chapter_order, created_by) VALUES (${ays2528_mgmtPrin.id}, 'Planning and Decision Making', 2, ${adminId}) RETURNING id`;
const [ch3] = await sql`INSERT INTO chapters (academic_year_subject_id, title, chapter_order, created_by) VALUES (${ays2528_mgmtPrin.id}, 'Organizing and Staffing', 3, ${adminId}) RETURNING id`;
const [ch4] = await sql`INSERT INTO chapters (academic_year_subject_id, title, chapter_order, created_by) VALUES (${ays2528_mgmtPrin.id}, 'Directing and Motivation', 4, ${adminId}) RETURNING id`;
const [ch5] = await sql`INSERT INTO chapters (academic_year_subject_id, title, chapter_order, created_by) VALUES (${ays2528_mgmtPrin.id}, 'Controlling Function', 5, ${adminId}) RETURNING id`;

// BBA 2025–2028 → First Year → Business Statistics
const [ch6] = await sql`INSERT INTO chapters (academic_year_subject_id, title, chapter_order, created_by) VALUES (${ays2528_bizStats.id}, 'Measures of Central Tendency', 1, ${adminId}) RETURNING id`;
const [ch7] = await sql`INSERT INTO chapters (academic_year_subject_id, title, chapter_order, created_by) VALUES (${ays2528_bizStats.id}, 'Measures of Dispersion', 2, ${adminId}) RETURNING id`;
const [ch8] = await sql`INSERT INTO chapters (academic_year_subject_id, title, chapter_order, created_by) VALUES (${ays2528_bizStats.id}, 'Correlation and Regression', 3, ${adminId}) RETURNING id`;

// BBA 2025–2028 → First Year → Financial Accounting for Managers
const [ch9]  = await sql`INSERT INTO chapters (academic_year_subject_id, title, chapter_order, created_by) VALUES (${ays2528_finForMgr.id}, 'Accounting Fundamentals for Managers', 1, ${adminId}) RETURNING id`;
const [ch10] = await sql`INSERT INTO chapters (academic_year_subject_id, title, chapter_order, created_by) VALUES (${ays2528_finForMgr.id}, 'Reading Financial Statements', 2, ${adminId}) RETURNING id`;
const [ch11] = await sql`INSERT INTO chapters (academic_year_subject_id, title, chapter_order, created_by) VALUES (${ays2528_finForMgr.id}, 'Budgeting and Variance Analysis', 3, ${adminId}) RETURNING id`;

// BBA 2026–2029 → First Year → Principles of Management (DIFFERENT chapters — different batch)
const [ch12] = await sql`INSERT INTO chapters (academic_year_subject_id, title, chapter_order, created_by) VALUES (${ays2629_mgmtPrin.id}, 'Evolution of Management Thought', 1, ${adminId}) RETURNING id`;
const [ch13] = await sql`INSERT INTO chapters (academic_year_subject_id, title, chapter_order, created_by) VALUES (${ays2629_mgmtPrin.id}, 'Management Functions Overview', 2, ${adminId}) RETURNING id`;
const [ch14] = await sql`INSERT INTO chapters (academic_year_subject_id, title, chapter_order, created_by) VALUES (${ays2629_mgmtPrin.id}, 'Decision-Making Techniques', 3, ${adminId}) RETURNING id`;

// BBA 2026–2029 → First Year → Business Statistics
const [ch15] = await sql`INSERT INTO chapters (academic_year_subject_id, title, chapter_order, created_by) VALUES (${ays2629_bizStats.id}, 'Introduction to Data and Statistics', 1, ${adminId}) RETURNING id`;
const [ch16] = await sql`INSERT INTO chapters (academic_year_subject_id, title, chapter_order, created_by) VALUES (${ays2629_bizStats.id}, 'Probability Distributions', 2, ${adminId}) RETURNING id`;

// BSc IT 2025–2028 → First Year → Programming in Python
const [ch17] = await sql`INSERT INTO chapters (academic_year_subject_id, title, chapter_order, created_by) VALUES (${ays_it_prog.id}, 'Getting Started with Python', 1, ${adminId}) RETURNING id`;
const [ch18] = await sql`INSERT INTO chapters (academic_year_subject_id, title, chapter_order, created_by) VALUES (${ays_it_prog.id}, 'Data Types and Control Flow', 2, ${adminId}) RETURNING id`;
const [ch19] = await sql`INSERT INTO chapters (academic_year_subject_id, title, chapter_order, created_by) VALUES (${ays_it_prog.id}, 'Functions and Modules', 3, ${adminId}) RETURNING id`;

console.log('Chapters created.');

// ── Learning Resources ────────────────────────────────────────────────────────

await sql`INSERT INTO learning_resources (chapter_id, type, title, url, description, created_by) VALUES
  -- Batch 2025-28 · Principles of Management: Foundations of Management
  (${ch1.id}, 'notes',   'Foundations of Management – Class Notes',      'https://drive.google.com/sample/mgmt-notes-ch1',  'Handwritten class notes', ${adminId}),
  (${ch1.id}, 'video',   'What is Management? — Explained',              'https://www.youtube.com/watch?v=sample1',         'Recorded lecture: 40 min', ${adminId}),
  (${ch1.id}, 'pdf',     'Management Theories Reference Sheet',          'https://drive.google.com/sample/mgmt-ref-ch1',    'Quick reference PDF', ${adminId}),

  -- Batch 2025-28 · Principles of Management: Planning and Decision Making
  (${ch2.id}, 'notes',   'Planning Process – Notes',                     'https://drive.google.com/sample/mgmt-notes-ch2',  'Steps in planning', ${adminId}),
  (${ch2.id}, 'video',   'Decision Making — Case Studies',                'https://www.youtube.com/watch?v=sample2',         'Solved case discussion', ${adminId}),
  (${ch2.id}, 'assignment', 'Planning Practice Problems',                 'https://drive.google.com/sample/mgmt-assign-ch2', '15 practice problems', ${adminId}),
  (${ch2.id}, 'quiz',    'Planning and Decision Making Quiz',             'https://forms.google.com/sample/mgmt-quiz-ch2',   '10 MCQs', ${adminId}),

  -- Batch 2025-28 · Principles of Management: Organizing and Staffing
  (${ch3.id}, 'notes',   'Organizing Function – Class Notes',            'https://drive.google.com/sample/mgmt-notes-ch3',  NULL, ${adminId}),
  (${ch3.id}, 'video',   'Organizational Structures Walkthrough',        'https://www.youtube.com/watch?v=sample3',         'Step-by-step recording', ${adminId}),
  (${ch3.id}, 'pdf',     'Org Chart Templates',                          'https://drive.google.com/sample/mgmt-pdf-ch3',    'Blank templates', ${adminId}),

  -- Batch 2025-28 · Principles of Management: Directing and Motivation
  (${ch4.id}, 'notes',   'Motivation Theories – Notes',                  'https://drive.google.com/sample/mgmt-notes-ch4',  NULL, ${adminId}),
  (${ch4.id}, 'video',   'Directing — Solved Examples',                  'https://www.youtube.com/watch?v=sample4',         NULL, ${adminId}),
  (${ch4.id}, 'question_paper', 'Directing and Motivation – Previous Year Questions','https://drive.google.com/sample/mgmt-qp-ch4', '2024–2026 papers', ${adminId}),

  -- Batch 2025-28 · Business Statistics: Measures of Central Tendency
  (${ch6.id}, 'notes',   'Central Tendency – Intro Notes',               'https://drive.google.com/sample/stats-notes-ch1', NULL, ${adminId}),
  (${ch6.id}, 'video',   'Mean, Median and Mode Explained',              'https://www.youtube.com/watch?v=sample5',         NULL, ${adminId}),

  -- Batch 2025-28 · Business Statistics: Measures of Dispersion
  (${ch7.id}, 'notes',   'Dispersion Measures Notes',                    'https://drive.google.com/sample/stats-notes-ch2', NULL, ${adminId}),
  (${ch7.id}, 'pdf',     'Standard Deviation Reference Sheet',           'https://drive.google.com/sample/stats-pdf-ch2',   'Formula sheet', ${adminId}),

  -- Batch 2026-29 · Principles of Management: Evolution of Management Thought (different batch, different content)
  (${ch12.id}, 'notes',  'Evolution of Management – 2026 Batch Notes',   'https://drive.google.com/sample/mgmt-2629-ch1',   NULL, ${adminId}),
  (${ch12.id}, 'video',  'Classical vs Modern Management Thought',       'https://www.youtube.com/watch?v=sample8',         NULL, ${adminId}),

  -- Batch 2026-29 · Principles of Management: Management Functions Overview
  (${ch13.id}, 'notes',  'Management Functions Notes',                   'https://drive.google.com/sample/mgmt-2629-ch2',   NULL, ${adminId}),
  (${ch13.id}, 'assignment', 'Management Functions Practice Set',        'https://drive.google.com/sample/mgmt-2629-assign', '12 problems', ${adminId}),

  -- BSc IT · Programming in Python: Getting Started
  (${ch17.id}, 'video',  'Getting Started with Python – Lecture 1',      'https://www.youtube.com/watch?v=sample6',         'First lecture', ${adminId}),
  (${ch17.id}, 'notes',  'Python Basics Notes',                          'https://drive.google.com/sample/py-notes-ch1',    NULL, ${adminId}),

  -- BSc IT · Programming in Python: Data Types and Control Flow
  (${ch18.id}, 'video',  'Data Types and Control Flow in Python',        'https://www.youtube.com/watch?v=sample7',         NULL, ${adminId}),
  (${ch18.id}, 'assignment', 'Control Flow Exercises',                   'https://drive.google.com/sample/py-assign-ch2',   '12 programs', ${adminId})
`;

console.log('Learning resources created.');

// ── Timetable (minimal — for BBA 2025–2028) ───────────────────────────────────

const [ttMgmtPrin] = await sql`
  INSERT INTO timetables (name, university_id, batch_id, week_start_date, created_by)
  VALUES ('BBA 2025-28 – Principles of Management – Week of 2026-06-29', ${hgu.id}, ${bBBA2528.id}, '2026-06-29', ${adminId})
  RETURNING id`;

const [ttBizStats] = await sql`
  INSERT INTO timetables (name, university_id, batch_id, week_start_date, created_by)
  VALUES ('BBA 2025-28 – Business Statistics – Week of 2026-06-29', ${hgu.id}, ${bBBA2528.id}, '2026-06-29', ${adminId})
  RETURNING id`;

await sql`INSERT INTO timetable_slots (timetable_id, day_of_week, start_time, end_time, faculty_id, subject_id) VALUES
  (${ttMgmtPrin.id}, 'Monday',    '09:00', '10:30', ${fMeera.id}, ${sMgmtPrin.id}),
  (${ttMgmtPrin.id}, 'Wednesday', '09:00', '10:30', ${fMeera.id}, ${sMgmtPrin.id}),
  (${ttMgmtPrin.id}, 'Friday',    '09:00', '10:30', ${fMeera.id}, ${sMgmtPrin.id}),
  (${ttBizStats.id}, 'Tuesday',   '11:00', '12:30', ${fArjun.id}, ${sBizStats.id}),
  (${ttBizStats.id}, 'Thursday',  '11:00', '12:30', ${fArjun.id}, ${sBizStats.id})`;

console.log('Timetables created.');

// ── Class Entries ─────────────────────────────────────────────────────────────

// y1 = First Year ID for BBA 2025-28 (yearIds contains raw IDs)
const bBBA2528_y1 = yearIds[bBBA2528.id][0];

await sql`INSERT INTO class_entries
  (date, start_time, end_time, total_hours,
   faculty_id, subject_id, university_id, stream_id, batch_id,
   academic_year_id, semester_id, chapter_id,
   class_mode, is_recorded, recording_file_name, editing_status,
   class_status, payment_status, created_by)
VALUES
  ('2026-06-30', '09:00', '10:30', 1.50,
   ${fMeera.id}, ${sMgmtPrin.id}, ${hgu.id}, ${sBBA.id}, ${bBBA2528.id},
   ${bBBA2528_y1}, null, ${ch1.id},
   'offline', true, 'mgmt_prin_2026-06-30.mp4', 'edited',
   'taken', 'paid', ${adminId}),

  ('2026-07-01', '11:00', '12:30', 1.50,
   ${fArjun.id}, ${sBizStats.id}, ${hgu.id}, ${sBBA.id}, ${bBBA2528.id},
   ${bBBA2528_y1}, null, ${ch6.id},
   'offline', false, null, 'not_edited',
   'taken', 'pending', ${adminId}),

  ('2026-07-02', '09:00', '10:30', 1.50,
   ${fMeera.id}, ${sMgmtPrin.id}, ${hgu.id}, ${sBBA.id}, ${bBBA2528.id},
   ${bBBA2528_y1}, null, ${ch2.id},
   'offline', true, 'mgmt_prin_2026-07-02.mp4', 'not_edited',
   'taken', 'paid', ${adminId}),

  ('2026-07-03', '11:00', '12:30', 1.50,
   ${fArjun.id}, ${sBizStats.id}, ${hgu.id}, ${sBBA.id}, ${bBBA2528.id},
   ${bBBA2528_y1}, null, ${ch7.id},
   'offline', false, null, 'not_edited',
   'taken', 'pending', ${adminId}),

  ('2026-07-06', '09:00', '10:30', 1.50,
   ${fMeera.id}, ${sMgmtPrin.id}, ${hgu.id}, ${sBBA.id}, ${bBBA2528.id},
   ${bBBA2528_y1}, null, ${ch3.id},
   'offline', false, null, 'not_edited',
   'scheduled', 'pending', ${adminId})
`;

console.log('Class entries created.');

// ── NIOS Data ─────────────────────────────────────────────────────────────────

const [niosPlus2] = await sql`SELECT id FROM nios_universities WHERE name = 'NIOS +2'  LIMIT 1`;
const [niosSslc]  = await sql`SELECT id FROM nios_universities WHERE name = 'NIOS SSLC' LIMIT 1`;

// NIOS Subjects (official NIOS subject codes)
const [nsPhy] = await sql`INSERT INTO nios_subjects (name, subject_code) VALUES ('Physics',              '212') RETURNING id`;
const [nsChe] = await sql`INSERT INTO nios_subjects (name, subject_code) VALUES ('Chemistry',            '313') RETURNING id`;
const [nsMat] = await sql`INSERT INTO nios_subjects (name, subject_code) VALUES ('Mathematics',          '311') RETURNING id`;
const [nsEng] = await sql`INSERT INTO nios_subjects (name, subject_code) VALUES ('English',              '302') RETURNING id`;
const [nsSci] = await sql`INSERT INTO nios_subjects (name, subject_code) VALUES ('Science & Technology', '232') RETURNING id`;
const [nsSoc] = await sql`INSERT INTO nios_subjects (name, subject_code) VALUES ('Social Science',       '213') RETURNING id`;
const [nsHin] = await sql`INSERT INTO nios_subjects (name, subject_code) VALUES ('Hindi',                '201') RETURNING id`;
const [nsEco] = await sql`INSERT INTO nios_subjects (name, subject_code) VALUES ('Economics',            '318') RETURNING id`;

// NIOS +2 Batches
const [nb1] = await sql`INSERT INTO nios_batches (nios_university_id, name, year) VALUES (${niosPlus2.id}, 'Science Batch 2026',  '2026') RETURNING id`;
const [nb2] = await sql`INSERT INTO nios_batches (nios_university_id, name, year) VALUES (${niosPlus2.id}, 'Science Batch 2027',  '2027') RETURNING id`;
const [nb3] = await sql`INSERT INTO nios_batches (nios_university_id, name, year) VALUES (${niosPlus2.id}, 'Commerce Batch 2026', '2026') RETURNING id`;

// NIOS SSLC Batches
const [nb4] = await sql`INSERT INTO nios_batches (nios_university_id, name, year) VALUES (${niosSslc.id}, 'SSLC Batch 2026', '2026') RETURNING id`;
const [nb5] = await sql`INSERT INTO nios_batches (nios_university_id, name, year) VALUES (${niosSslc.id}, 'SSLC Batch 2027', '2027') RETURNING id`;

// Assign subjects → NIOS +2 Science Batch 2026
const [nbs1_phy] = await sql`INSERT INTO nios_batch_subjects (nios_batch_id, nios_subject_id) VALUES (${nb1.id}, ${nsPhy.id}) RETURNING id`;
const [nbs1_che] = await sql`INSERT INTO nios_batch_subjects (nios_batch_id, nios_subject_id) VALUES (${nb1.id}, ${nsChe.id}) RETURNING id`;
const [nbs1_mat] = await sql`INSERT INTO nios_batch_subjects (nios_batch_id, nios_subject_id) VALUES (${nb1.id}, ${nsMat.id}) RETURNING id`;
const [nbs1_eng] = await sql`INSERT INTO nios_batch_subjects (nios_batch_id, nios_subject_id) VALUES (${nb1.id}, ${nsEng.id}) RETURNING id`;

// Assign subjects → NIOS +2 Commerce Batch 2026
const [nbs3_mat] = await sql`INSERT INTO nios_batch_subjects (nios_batch_id, nios_subject_id) VALUES (${nb3.id}, ${nsMat.id}) RETURNING id`;
const [nbs3_eco] = await sql`INSERT INTO nios_batch_subjects (nios_batch_id, nios_subject_id) VALUES (${nb3.id}, ${nsEco.id}) RETURNING id`;
const [nbs3_eng] = await sql`INSERT INTO nios_batch_subjects (nios_batch_id, nios_subject_id) VALUES (${nb3.id}, ${nsEng.id}) RETURNING id`;

// Assign subjects → NIOS SSLC Batch 2026
const [nbs4_sci] = await sql`INSERT INTO nios_batch_subjects (nios_batch_id, nios_subject_id) VALUES (${nb4.id}, ${nsSci.id}) RETURNING id`;
const [nbs4_mat] = await sql`INSERT INTO nios_batch_subjects (nios_batch_id, nios_subject_id) VALUES (${nb4.id}, ${nsMat.id}) RETURNING id`;
const [nbs4_soc] = await sql`INSERT INTO nios_batch_subjects (nios_batch_id, nios_subject_id) VALUES (${nb4.id}, ${nsSoc.id}) RETURNING id`;
const [nbs4_eng] = await sql`INSERT INTO nios_batch_subjects (nios_batch_id, nios_subject_id) VALUES (${nb4.id}, ${nsEng.id}) RETURNING id`;
const [nbs4_hin] = await sql`INSERT INTO nios_batch_subjects (nios_batch_id, nios_subject_id) VALUES (${nb4.id}, ${nsHin.id}) RETURNING id`;

// NIOS +2 Science Batch 2026 — Physics chapters
const [ncp1] = await sql`INSERT INTO nios_chapters (nios_batch_subject_id, title, description, chapter_order, created_by) VALUES (${nbs1_phy.id}, 'Motion and Its Description',   'Distance, displacement, velocity and acceleration', 1, ${adminId}) RETURNING id`;
const [ncp2] = await sql`INSERT INTO nios_chapters (nios_batch_subject_id, title, description, chapter_order, created_by) VALUES (${nbs1_phy.id}, 'Force and Laws of Motion',      'Newton laws and friction', 2, ${adminId}) RETURNING id`;
const [ncp3] = await sql`INSERT INTO nios_chapters (nios_batch_subject_id, title, description, chapter_order, created_by) VALUES (${nbs1_phy.id}, 'Work, Energy and Power',        'Work-energy theorem, kinetic and potential energy', 3, ${adminId}) RETURNING id`;
const [ncp4] = await sql`INSERT INTO nios_chapters (nios_batch_subject_id, title, description, chapter_order, created_by) VALUES (${nbs1_phy.id}, 'Gravitation',                   'Gravity, satellites and escape velocity', 4, ${adminId}) RETURNING id`;

// Chemistry chapters
const [ncc1] = await sql`INSERT INTO nios_chapters (nios_batch_subject_id, title, description, chapter_order, created_by) VALUES (${nbs1_che.id}, 'Matter and Its Composition',    'States of matter and properties', 1, ${adminId}) RETURNING id`;
const [ncc2] = await sql`INSERT INTO nios_chapters (nios_batch_subject_id, title, description, chapter_order, created_by) VALUES (${nbs1_che.id}, 'Atomic Structure',              'Bohr model and quantum numbers', 2, ${adminId}) RETURNING id`;
const [ncc3] = await sql`INSERT INTO nios_chapters (nios_batch_subject_id, title, description, chapter_order, created_by) VALUES (${nbs1_che.id}, 'Chemical Bonding',             'Ionic and covalent bonding', 3, ${adminId}) RETURNING id`;
const [ncc4] = await sql`INSERT INTO nios_chapters (nios_batch_subject_id, title, description, chapter_order, created_by) VALUES (${nbs1_che.id}, 'Chemical Reactions',           'Types of reactions and balancing equations', 4, ${adminId}) RETURNING id`;

// Mathematics chapters
const [ncm1] = await sql`INSERT INTO nios_chapters (nios_batch_subject_id, title, description, chapter_order, created_by) VALUES (${nbs1_mat.id}, 'Number System',                'Real, rational and irrational numbers', 1, ${adminId}) RETURNING id`;
const [ncm2] = await sql`INSERT INTO nios_chapters (nios_batch_subject_id, title, description, chapter_order, created_by) VALUES (${nbs1_mat.id}, 'Algebra',                      'Polynomials, linear and quadratic equations', 2, ${adminId}) RETURNING id`;
const [ncm3] = await sql`INSERT INTO nios_chapters (nios_batch_subject_id, title, description, chapter_order, created_by) VALUES (${nbs1_mat.id}, 'Trigonometry',                 'Trigonometric ratios and identities', 3, ${adminId}) RETURNING id`;
const [ncm4] = await sql`INSERT INTO nios_chapters (nios_batch_subject_id, title, description, chapter_order, created_by) VALUES (${nbs1_mat.id}, 'Coordinate Geometry',          'Lines, circles and conic sections', 4, ${adminId}) RETURNING id`;

// English chapters
const [nce1] = await sql`INSERT INTO nios_chapters (nios_batch_subject_id, title, description, chapter_order, created_by) VALUES (${nbs1_eng.id}, 'Reading Comprehension',        'Unseen passages and inference', 1, ${adminId}) RETURNING id`;
const [nce2] = await sql`INSERT INTO nios_chapters (nios_batch_subject_id, title, description, chapter_order, created_by) VALUES (${nbs1_eng.id}, 'Writing Skills',               'Essays, letters and reports', 2, ${adminId}) RETURNING id`;
const [nce3] = await sql`INSERT INTO nios_chapters (nios_batch_subject_id, title, description, chapter_order, created_by) VALUES (${nbs1_eng.id}, 'Grammar',                      'Tenses, voice, narration and punctuation', 3, ${adminId}) RETURNING id`;

// SSLC 2026 — Science chapters
const [ncsi1] = await sql`INSERT INTO nios_chapters (nios_batch_subject_id, title, description, chapter_order, created_by) VALUES (${nbs4_sci.id}, 'Our Environment',             'Ecosystem, food chains and pollution', 1, ${adminId}) RETURNING id`;
const [ncsi2] = await sql`INSERT INTO nios_chapters (nios_batch_subject_id, title, description, chapter_order, created_by) VALUES (${nbs4_sci.id}, 'Electricity and Circuits',    'Current, voltage, resistance and Ohm law', 2, ${adminId}) RETURNING id`;
const [ncsi3] = await sql`INSERT INTO nios_chapters (nios_batch_subject_id, title, description, chapter_order, created_by) VALUES (${nbs4_sci.id}, 'Light: Reflection and Refraction', 'Mirrors, lenses and human eye', 3, ${adminId}) RETURNING id`;

// SSLC 2026 — Social Science chapters
const [ncso1] = await sql`INSERT INTO nios_chapters (nios_batch_subject_id, title, description, chapter_order, created_by) VALUES (${nbs4_soc.id}, 'India — Physical Features',   'Rivers, mountains and plateaus', 1, ${adminId}) RETURNING id`;
const [ncso2] = await sql`INSERT INTO nios_chapters (nios_batch_subject_id, title, description, chapter_order, created_by) VALUES (${nbs4_soc.id}, 'Freedom Movement',            'Key events and leaders of Indian independence', 2, ${adminId}) RETURNING id`;
const [ncso3] = await sql`INSERT INTO nios_chapters (nios_batch_subject_id, title, description, chapter_order, created_by) VALUES (${nbs4_soc.id}, 'Indian Constitution',         'Fundamental rights and duties', 3, ${adminId}) RETURNING id`;

// SSLC 2026 — Mathematics chapters
const [ncsm1] = await sql`INSERT INTO nios_chapters (nios_batch_subject_id, title, description, chapter_order, created_by) VALUES (${nbs4_mat.id}, 'Real Numbers',                'Euclid division lemma and irrational numbers', 1, ${adminId}) RETURNING id`;
const [ncsm2] = await sql`INSERT INTO nios_chapters (nios_batch_subject_id, title, description, chapter_order, created_by) VALUES (${nbs4_mat.id}, 'Polynomials',                 'Zeros of a polynomial and factor theorem', 2, ${adminId}) RETURNING id`;
const [ncsm3] = await sql`INSERT INTO nios_chapters (nios_batch_subject_id, title, description, chapter_order, created_by) VALUES (${nbs4_mat.id}, 'Linear Equations',            'Two-variable equations and graphical method', 3, ${adminId}) RETURNING id`;

// SSLC 2026 — English chapters
const [ncse1] = await sql`INSERT INTO nios_chapters (nios_batch_subject_id, title, description, chapter_order, created_by) VALUES (${nbs4_eng.id}, 'Reading Skills',              'Comprehension and vocabulary in context', 1, ${adminId}) RETURNING id`;
const [ncse2] = await sql`INSERT INTO nios_chapters (nios_batch_subject_id, title, description, chapter_order, created_by) VALUES (${nbs4_eng.id}, 'Writing Skills',              'Paragraph, email and notice writing', 2, ${adminId}) RETURNING id`;
const [ncse3] = await sql`INSERT INTO nios_chapters (nios_batch_subject_id, title, description, chapter_order, created_by) VALUES (${nbs4_eng.id}, 'Grammar and Usage',           'Parts of speech, tenses and sentence transformation', 3, ${adminId}) RETURNING id`;

// NIOS Learning Resources — 3 per chapter (notes, video, assignment)
const niosChapters = [
  ncp1, ncp2, ncp3, ncp4,
  ncc1, ncc2, ncc3, ncc4,
  ncm1, ncm2, ncm3, ncm4,
  nce1, nce2, nce3,
  ncsi1, ncsi2, ncsi3,
  ncso1, ncso2, ncso3,
  ncsm1, ncsm2, ncsm3,
  ncse1, ncse2, ncse3,
];
for (const ch of niosChapters) {
  await sql`INSERT INTO nios_resources (nios_chapter_id, type, title, description, created_by) VALUES
    (${ch.id}, 'pdf',        ${ch.title + ' — Study Notes'},      'NIOS study material', ${adminId}),
    (${ch.id}, 'video',      ${ch.title + ' — Concept Video'},    'Recorded lecture video', ${adminId}),
    (${ch.id}, 'assignment', ${ch.title + ' — Practice Sheet'},   'NIOS pattern practice questions', ${adminId})`;
}

// NIOS Sample Classes
const [fac1] = await sql`SELECT id FROM faculty ORDER BY id LIMIT 1`;
await sql`INSERT INTO nios_class_entries
  (date, start_time, end_time, total_hours, faculty_id, nios_batch_id, nios_subject_id,
   class_status, class_mode, is_recorded, editing_status, payment_status, notes)
VALUES
  ('2026-06-30', '09:00', '10:30', 1.5, ${fac1.id}, ${nb1.id}, ${nsPhy.id}, 'taken',     'online',  true,  'edited',     'paid',    'Motion and displacement — covered with examples'),
  ('2026-07-02', '09:00', '10:30', 1.5, ${fac1.id}, ${nb1.id}, ${nsPhy.id}, 'taken',     'online',  true,  'not_edited', 'pending', 'Newton laws — problem solving session'),
  ('2026-07-07', '09:00', '10:30', 1.5, ${fac1.id}, ${nb1.id}, ${nsChe.id}, 'taken',     'online',  false, 'not_edited', 'paid',    'Atomic structure overview'),
  ('2026-07-09', '09:00', '10:30', 1.5, ${fac1.id}, ${nb1.id}, ${nsMat.id}, 'taken',     'offline', false, 'not_edited', 'pending', 'Number system and rationalization'),
  ('2026-07-14', '09:00', '10:30', 1.5, ${fac1.id}, ${nb1.id}, ${nsMat.id}, 'scheduled', 'online',  false, 'not_edited', 'pending', null),
  ('2026-07-01', '14:00', '15:30', 1.5, ${fac1.id}, ${nb4.id}, ${nsSci.id}, 'taken',     'offline', false, 'not_edited', 'paid',    'Ecosystem and food chains'),
  ('2026-07-08', '14:00', '15:30', 1.5, ${fac1.id}, ${nb4.id}, ${nsSoc.id}, 'taken',     'offline', false, 'not_edited', 'pending', 'India physical features — map work')`;

console.log('NIOS data created.');

console.log('\n✅  Sample data seeded successfully!\n');
console.log('  Main System:');
console.log('    1 university (Horizon Global University)');
console.log('    3 streams: BBA, BA Psychology, BSc Information Technology');
console.log('    5 batches, 13 subjects, 4 faculty');
console.log('    Academic years + semesters + curriculum mappings');
console.log('    19 chapters, 25 learning resources, 5 class entries');
console.log('    2 timetables with 5 slots');
console.log('  NIOS:');
console.log('    NIOS +2: 3 batches (Science 2026/2027, Commerce 2026)');
console.log('    NIOS SSLC: 2 batches (2026, 2027)');
console.log('    8 NIOS subjects, 27 chapters, 81 resources, 7 class entries\n');
process.exit(0);
