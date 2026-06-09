import 'dotenv/config';
import { sql } from './db.js';

const existing = await sql`SELECT COUNT(*) AS count FROM universities`;
if (parseInt(existing[0].count) > 0) {
  console.log('Data already exists. Run with --force to overwrite.');
  if (!process.argv.includes('--force')) process.exit(0);
}

// Wipe in FK-safe order
await sql`TRUNCATE learning_resources, chapters, academic_year_subjects, semesters, academic_years,
  timetable_slots, timetables, class_entries,
  faculty_batches, faculty_subjects, faculty_universities,
  subjects, batches, streams, faculty, universities RESTART IDENTITY CASCADE`;
console.log('Cleared existing data.');

const [adminRow] = await sql`SELECT id FROM users WHERE role = 'admin' LIMIT 1`;
const adminId = adminRow?.id ?? 1;

// ── University ────────────────────────────────────────────────────────────────

const [ei] = await sql`INSERT INTO universities (name, short_code) VALUES ('EdDream Institute', 'EI') RETURNING id`;
console.log('University created.');

// ── Streams ───────────────────────────────────────────────────────────────────

const [sBCom] = await sql`INSERT INTO streams (name, university_id) VALUES ('B.Com',               ${ei.id}) RETURNING id`;
const [sBA]   = await sql`INSERT INTO streams (name, university_id) VALUES ('BA English',           ${ei.id}) RETURNING id`;
const [sBSc]  = await sql`INSERT INTO streams (name, university_id) VALUES ('BSc Computer Science', ${ei.id}) RETURNING id`;
console.log('Streams created.');

// ── Batches ───────────────────────────────────────────────────────────────────

const [bCom2427] = await sql`INSERT INTO batches (name, university_id, stream_id) VALUES ('Batch 2024–2027', ${ei.id}, ${sBCom.id}) RETURNING id`;
const [bCom2528] = await sql`INSERT INTO batches (name, university_id, stream_id) VALUES ('Batch 2025–2028', ${ei.id}, ${sBCom.id}) RETURNING id`;
const [bCom2629] = await sql`INSERT INTO batches (name, university_id, stream_id) VALUES ('Batch 2026–2029', ${ei.id}, ${sBCom.id}) RETURNING id`;
const [bBA2427]  = await sql`INSERT INTO batches (name, university_id, stream_id) VALUES ('Batch 2024–2027', ${ei.id}, ${sBA.id}) RETURNING id`;
const [bBSc2427] = await sql`INSERT INTO batches (name, university_id, stream_id) VALUES ('Batch 2024–2027', ${ei.id}, ${sBSc.id}) RETURNING id`;
console.log('Batches created.');

// ── Subjects ──────────────────────────────────────────────────────────────────

// B.Com – Year 1
const [sFinAcc]  = await sql`INSERT INTO subjects (name, subject_code, university_id, stream_id) VALUES ('Financial Accounting', 'BCOM101', ${ei.id}, ${sBCom.id}) RETURNING id`;
const [sBusEco]  = await sql`INSERT INTO subjects (name, subject_code, university_id, stream_id) VALUES ('Business Economics', 'BCOM102', ${ei.id}, ${sBCom.id}) RETURNING id`;
const [sBusMgmt] = await sql`INSERT INTO subjects (name, subject_code, university_id, stream_id) VALUES ('Business Management', 'BCOM103', ${ei.id}, ${sBCom.id}) RETURNING id`;

// B.Com – Year 2
const [sCostAcc] = await sql`INSERT INTO subjects (name, subject_code, university_id, stream_id) VALUES ('Cost Accounting', 'BCOM201', ${ei.id}, ${sBCom.id}) RETURNING id`;
const [sBusLaw]  = await sql`INSERT INTO subjects (name, subject_code, university_id, stream_id) VALUES ('Business Law', 'BCOM202', ${ei.id}, ${sBCom.id}) RETURNING id`;
const [sStats]   = await sql`INSERT INTO subjects (name, subject_code, university_id, stream_id) VALUES ('Statistics', 'BCOM203', ${ei.id}, ${sBCom.id}) RETURNING id`;

// B.Com – Year 3
const [sAudit]   = await sql`INSERT INTO subjects (name, subject_code, university_id, stream_id) VALUES ('Auditing', 'BCOM301', ${ei.id}, ${sBCom.id}) RETURNING id`;
const [sIncomeTax]= await sql`INSERT INTO subjects (name, subject_code, university_id, stream_id) VALUES ('Income Tax', 'BCOM302', ${ei.id}, ${sBCom.id}) RETURNING id`;
const [sBusComm] = await sql`INSERT INTO subjects (name, subject_code, university_id, stream_id) VALUES ('Business Communication', 'BCOM303', ${ei.id}, ${sBCom.id}) RETURNING id`;

// BA English – Year 1
const [sLitProse]= await sql`INSERT INTO subjects (name, subject_code, university_id, stream_id) VALUES ('English Prose & Fiction', 'BA101', ${ei.id}, ${sBA.id}) RETURNING id`;
const [sLinguis] = await sql`INSERT INTO subjects (name, subject_code, university_id, stream_id) VALUES ('Introduction to Linguistics', 'BA102', ${ei.id}, ${sBA.id}) RETURNING id`;

// BSc CS – Year 1
const [sProgramming] = await sql`INSERT INTO subjects (name, subject_code, university_id, stream_id) VALUES ('Programming Fundamentals', 'BSC101', ${ei.id}, ${sBSc.id}) RETURNING id`;
const [sMaths]       = await sql`INSERT INTO subjects (name, subject_code, university_id, stream_id) VALUES ('Discrete Mathematics', 'BSC102', ${ei.id}, ${sBSc.id}) RETURNING id`;

console.log('Subjects created.');

// ── Faculty ───────────────────────────────────────────────────────────────────

const [fPriya]  = await sql`INSERT INTO faculty (name, email, phone, payment_type, hourly_rate) VALUES ('Prof. Priya Sharma', 'priya.sharma@eddream.in', '9876543210', 'hourly', 900.00) RETURNING id`;
const [fRajesh] = await sql`INSERT INTO faculty (name, email, phone, payment_type, hourly_rate) VALUES ('Dr. Rajesh Nair', 'rajesh.nair@eddream.in', '9876543211', 'hourly', 850.00) RETURNING id`;
const [fAnita]  = await sql`INSERT INTO faculty (name, email, phone, payment_type, hourly_rate) VALUES ('Ms. Anita Desai', 'anita.desai@eddream.in', '9876543212', 'fixed', null) RETURNING id`;
const [fSuresh] = await sql`INSERT INTO faculty (name, email, phone, payment_type, hourly_rate) VALUES ('Mr. Suresh Pillai', 'suresh.pillai@eddream.in', '9876543213', 'hourly', 800.00) RETURNING id`;

await sql`INSERT INTO faculty_universities (faculty_id, university_id) VALUES
  (${fPriya.id}, ${ei.id}), (${fRajesh.id}, ${ei.id}),
  (${fAnita.id}, ${ei.id}), (${fSuresh.id}, ${ei.id})`;

await sql`INSERT INTO faculty_subjects (faculty_id, subject_id) VALUES
  (${fPriya.id},  ${sFinAcc.id}),  (${fPriya.id},  ${sCostAcc.id}), (${fPriya.id}, ${sAudit.id}),
  (${fRajesh.id}, ${sBusEco.id}),  (${fRajesh.id}, ${sStats.id}),   (${fRajesh.id}, ${sIncomeTax.id}),
  (${fAnita.id},  ${sBusMgmt.id}), (${fAnita.id},  ${sBusLaw.id}),  (${fAnita.id}, ${sBusComm.id}),
  (${fSuresh.id}, ${sProgramming.id}), (${fSuresh.id}, ${sMaths.id})`;

await sql`INSERT INTO faculty_batches (faculty_id, batch_id) VALUES
  (${fPriya.id},  ${bCom2427.id}), (${fPriya.id},  ${bCom2528.id}),
  (${fRajesh.id}, ${bCom2427.id}), (${fRajesh.id}, ${bCom2528.id}),
  (${fAnita.id},  ${bCom2427.id}), (${fAnita.id},  ${bBA2427.id}),
  (${fSuresh.id}, ${bBSc2427.id})`;

console.log('Faculty created.');

// ── Academic Years ────────────────────────────────────────────────────────────

const years = ['First Year', 'Second Year', 'Third Year'];
const batches = [bCom2427, bCom2528, bCom2629, bBA2427, bBSc2427];
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

// B.Com 2024–2027
const [y1, y2, y3] = yearIds[bCom2427.id];
const [ays2427_finAcc]  = await sql`INSERT INTO academic_year_subjects (academic_year_id, subject_id) VALUES (${y1}, ${sFinAcc.id})  RETURNING id`;
const [ays2427_busEco]  = await sql`INSERT INTO academic_year_subjects (academic_year_id, subject_id) VALUES (${y1}, ${sBusEco.id})  RETURNING id`;
const [ays2427_busMgmt] = await sql`INSERT INTO academic_year_subjects (academic_year_id, subject_id) VALUES (${y1}, ${sBusMgmt.id}) RETURNING id`;
await sql`INSERT INTO academic_year_subjects (academic_year_id, subject_id) VALUES
  (${y2}, ${sCostAcc.id}), (${y2}, ${sBusLaw.id}), (${y2}, ${sStats.id}),
  (${y3}, ${sAudit.id}),  (${y3}, ${sIncomeTax.id}), (${y3}, ${sBusComm.id})`;

// B.Com 2025–2028 — separate junction rows so chapters can differ per batch
const [y1b, y2b, y3b] = yearIds[bCom2528.id];
const [ays2528_finAcc]  = await sql`INSERT INTO academic_year_subjects (academic_year_id, subject_id) VALUES (${y1b}, ${sFinAcc.id})  RETURNING id`;
const [ays2528_busEco]  = await sql`INSERT INTO academic_year_subjects (academic_year_id, subject_id) VALUES (${y1b}, ${sBusEco.id})  RETURNING id`;
const [ays2528_busMgmt] = await sql`INSERT INTO academic_year_subjects (academic_year_id, subject_id) VALUES (${y1b}, ${sBusMgmt.id}) RETURNING id`;
await sql`INSERT INTO academic_year_subjects (academic_year_id, subject_id) VALUES
  (${y2b}, ${sCostAcc.id}), (${y2b}, ${sBusLaw.id}), (${y2b}, ${sStats.id}),
  (${y3b}, ${sAudit.id}),  (${y3b}, ${sIncomeTax.id}), (${y3b}, ${sBusComm.id})`;

// BA 2024–2027
const [y1ba] = yearIds[bBA2427.id];
await sql`INSERT INTO academic_year_subjects (academic_year_id, subject_id) VALUES
  (${y1ba}, ${sLitProse.id}), (${y1ba}, ${sLinguis.id})`;

// BSc CS 2024–2027 — uses semesters
const [y1bsc] = yearIds[bBSc2427.id];
const [bscSem1] = await sql`INSERT INTO semesters (academic_year_id, name, semester_order) VALUES (${y1bsc}, 'Semester 1', 1) RETURNING id`;
const [bscSem2] = await sql`INSERT INTO semesters (academic_year_id, name, semester_order) VALUES (${y1bsc}, 'Semester 2', 2) RETURNING id`;

const [ays_bsc_prog] = await sql`INSERT INTO academic_year_subjects (academic_year_id, subject_id, semester_id) VALUES (${y1bsc}, ${sProgramming.id}, ${bscSem1.id}) RETURNING id`;
await sql`INSERT INTO academic_year_subjects (academic_year_id, subject_id, semester_id) VALUES (${y1bsc}, ${sMaths.id}, ${bscSem2.id})`;

console.log('Curriculum subject mappings created.');

// ── Chapters (per academic_year_subject — batch-specific) ─────────────────────

// B.Com 2024–2027 → First Year → Financial Accounting
const [ch1] = await sql`INSERT INTO chapters (academic_year_subject_id, title, chapter_order, created_by) VALUES (${ays2427_finAcc.id}, 'Introduction to Accounting', 1, ${adminId}) RETURNING id`;
const [ch2] = await sql`INSERT INTO chapters (academic_year_subject_id, title, chapter_order, created_by) VALUES (${ays2427_finAcc.id}, 'Journal Entries', 2, ${adminId}) RETURNING id`;
const [ch3] = await sql`INSERT INTO chapters (academic_year_subject_id, title, chapter_order, created_by) VALUES (${ays2427_finAcc.id}, 'Ledger Posting', 3, ${adminId}) RETURNING id`;
const [ch4] = await sql`INSERT INTO chapters (academic_year_subject_id, title, chapter_order, created_by) VALUES (${ays2427_finAcc.id}, 'Trial Balance', 4, ${adminId}) RETURNING id`;
const [ch5] = await sql`INSERT INTO chapters (academic_year_subject_id, title, chapter_order, created_by) VALUES (${ays2427_finAcc.id}, 'Final Accounts', 5, ${adminId}) RETURNING id`;

// B.Com 2024–2027 → First Year → Business Economics
const [ch6] = await sql`INSERT INTO chapters (academic_year_subject_id, title, chapter_order, created_by) VALUES (${ays2427_busEco.id}, 'Basic Concepts of Economics', 1, ${adminId}) RETURNING id`;
const [ch7] = await sql`INSERT INTO chapters (academic_year_subject_id, title, chapter_order, created_by) VALUES (${ays2427_busEco.id}, 'Demand and Supply Analysis', 2, ${adminId}) RETURNING id`;
const [ch8] = await sql`INSERT INTO chapters (academic_year_subject_id, title, chapter_order, created_by) VALUES (${ays2427_busEco.id}, 'Market Structures', 3, ${adminId}) RETURNING id`;

// B.Com 2024–2027 → First Year → Business Management
const [ch9]  = await sql`INSERT INTO chapters (academic_year_subject_id, title, chapter_order, created_by) VALUES (${ays2427_busMgmt.id}, 'Introduction to Management', 1, ${adminId}) RETURNING id`;
const [ch10] = await sql`INSERT INTO chapters (academic_year_subject_id, title, chapter_order, created_by) VALUES (${ays2427_busMgmt.id}, 'Planning and Organising', 2, ${adminId}) RETURNING id`;
const [ch11] = await sql`INSERT INTO chapters (academic_year_subject_id, title, chapter_order, created_by) VALUES (${ays2427_busMgmt.id}, 'Staffing and Direction', 3, ${adminId}) RETURNING id`;

// B.Com 2025–2028 → First Year → Financial Accounting (DIFFERENT chapters — different batch)
const [ch12] = await sql`INSERT INTO chapters (academic_year_subject_id, title, chapter_order, created_by) VALUES (${ays2528_finAcc.id}, 'Accounting Concepts & Principles', 1, ${adminId}) RETURNING id`;
const [ch13] = await sql`INSERT INTO chapters (academic_year_subject_id, title, chapter_order, created_by) VALUES (${ays2528_finAcc.id}, 'Double Entry System', 2, ${adminId}) RETURNING id`;
const [ch14] = await sql`INSERT INTO chapters (academic_year_subject_id, title, chapter_order, created_by) VALUES (${ays2528_finAcc.id}, 'Subsidiary Books', 3, ${adminId}) RETURNING id`;

// B.Com 2025–2028 → First Year → Business Economics
const [ch15] = await sql`INSERT INTO chapters (academic_year_subject_id, title, chapter_order, created_by) VALUES (${ays2528_busEco.id}, 'Micro vs Macro Economics', 1, ${adminId}) RETURNING id`;
const [ch16] = await sql`INSERT INTO chapters (academic_year_subject_id, title, chapter_order, created_by) VALUES (${ays2528_busEco.id}, 'Price Elasticity', 2, ${adminId}) RETURNING id`;

// BSc CS 2024–2027 → First Year → Programming Fundamentals
const [ch17] = await sql`INSERT INTO chapters (academic_year_subject_id, title, chapter_order, created_by) VALUES (${ays_bsc_prog.id}, 'Introduction to Programming', 1, ${adminId}) RETURNING id`;
const [ch18] = await sql`INSERT INTO chapters (academic_year_subject_id, title, chapter_order, created_by) VALUES (${ays_bsc_prog.id}, 'Variables and Data Types', 2, ${adminId}) RETURNING id`;
const [ch19] = await sql`INSERT INTO chapters (academic_year_subject_id, title, chapter_order, created_by) VALUES (${ays_bsc_prog.id}, 'Control Flow Statements', 3, ${adminId}) RETURNING id`;

console.log('Chapters created.');

// ── Learning Resources ────────────────────────────────────────────────────────

await sql`INSERT INTO learning_resources (chapter_id, type, title, url, description, created_by) VALUES
  -- Batch 2024-27 · Financial Accounting: Introduction to Accounting
  (${ch1.id}, 'notes',   'Accounting Basics – Class Notes',              'https://drive.google.com/sample/acc-notes-ch1',  'Handwritten class notes', ${adminId}),
  (${ch1.id}, 'video',   'Accounting Concepts Explained',                'https://www.youtube.com/watch?v=sample1',         'Recorded lecture: 45 min', ${adminId}),
  (${ch1.id}, 'pdf',     'Accounting Standards Reference Sheet',         'https://drive.google.com/sample/acc-ref-ch1',    'Quick reference PDF', ${adminId}),

  -- Batch 2024-27 · Financial Accounting: Journal Entries
  (${ch2.id}, 'notes',   'Journal Entry Rules – Notes',                  'https://drive.google.com/sample/acc-notes-ch2',  'Debit/credit rules', ${adminId}),
  (${ch2.id}, 'video',   'Journal Entries – Practice Session',           'https://www.youtube.com/watch?v=sample2',         'Solved examples recording', ${adminId}),
  (${ch2.id}, 'assignment', 'Journal Entry Practice Problems',           'https://drive.google.com/sample/acc-assign-ch2', '20 practice problems', ${adminId}),
  (${ch2.id}, 'quiz',    'Journal Entries Quiz',                         'https://forms.google.com/sample/acc-quiz-ch2',   '10 MCQs', ${adminId}),

  -- Batch 2024-27 · Financial Accounting: Ledger Posting
  (${ch3.id}, 'notes',   'Ledger Posting – Class Notes',                 'https://drive.google.com/sample/acc-notes-ch3',  NULL, ${adminId}),
  (${ch3.id}, 'video',   'Ledger Posting Walkthrough',                   'https://www.youtube.com/watch?v=sample3',         'Step-by-step recording', ${adminId}),
  (${ch3.id}, 'pdf',     'Ledger Format Templates',                      'https://drive.google.com/sample/acc-pdf-ch3',    'Blank templates', ${adminId}),

  -- Batch 2024-27 · Financial Accounting: Trial Balance
  (${ch4.id}, 'notes',   'Trial Balance Preparation – Notes',            'https://drive.google.com/sample/acc-notes-ch4',  NULL, ${adminId}),
  (${ch4.id}, 'video',   'Trial Balance – Solved Examples',              'https://www.youtube.com/watch?v=sample4',         NULL, ${adminId}),
  (${ch4.id}, 'question_paper', 'Trial Balance – Previous Year Questions','https://drive.google.com/sample/acc-qp-ch4',    '2022–2024 papers', ${adminId}),

  -- Batch 2024-27 · Business Economics: Basic Concepts
  (${ch6.id}, 'notes',   'Economics Concepts – Intro Notes',             'https://drive.google.com/sample/eco-notes-ch1',  NULL, ${adminId}),
  (${ch6.id}, 'video',   'Intro to Business Economics',                  'https://www.youtube.com/watch?v=sample5',         NULL, ${adminId}),

  -- Batch 2024-27 · Business Economics: Demand and Supply
  (${ch7.id}, 'notes',   'Demand & Supply Analysis Notes',               'https://drive.google.com/sample/eco-notes-ch2',  NULL, ${adminId}),
  (${ch7.id}, 'pdf',     'Demand Curve Diagrams',                        'https://drive.google.com/sample/eco-pdf-ch2',    'Diagram reference sheet', ${adminId}),

  -- Batch 2025-28 · Financial Accounting: Accounting Concepts (different batch, different content)
  (${ch12.id}, 'notes',  'Accounting Concepts – 2025 Batch Notes',       'https://drive.google.com/sample/acc-2528-ch1',   NULL, ${adminId}),
  (${ch12.id}, 'video',  'Accounting Concepts – 2025 Batch Lecture',     'https://www.youtube.com/watch?v=sample8',         NULL, ${adminId}),

  -- Batch 2025-28 · Financial Accounting: Double Entry System
  (${ch13.id}, 'notes',  'Double Entry System Notes',                    'https://drive.google.com/sample/acc-2528-ch2',   NULL, ${adminId}),
  (${ch13.id}, 'assignment', 'Double Entry Practice Set',                'https://drive.google.com/sample/acc-2528-assign', '15 problems', ${adminId}),

  -- BSc CS · Programming Fundamentals: Introduction
  (${ch17.id}, 'video',  'Introduction to Programming – Lecture 1',      'https://www.youtube.com/watch?v=sample6',         'First lecture', ${adminId}),
  (${ch17.id}, 'notes',  'Programming Basics Notes',                     'https://drive.google.com/sample/prog-notes-ch1', NULL, ${adminId}),

  -- BSc CS · Programming Fundamentals: Variables and Data Types
  (${ch18.id}, 'video',  'Variables and Data Types in C',                'https://www.youtube.com/watch?v=sample7',         NULL, ${adminId}),
  (${ch18.id}, 'assignment', 'Variable Declaration Exercises',           'https://drive.google.com/sample/prog-assign-ch2', '10 programs', ${adminId})
`;

console.log('Learning resources created.');

// ── Timetable (minimal — for B.Com 2024–2027) ─────────────────────────────────

const [ttFinAcc] = await sql`
  INSERT INTO timetables (name, university_id, batch_id, week_start_date, created_by)
  VALUES ('B.Com 2024-27 – Financial Accounting – Week of 2026-06-01', ${ei.id}, ${bCom2427.id}, '2026-06-01', ${adminId})
  RETURNING id`;

const [ttBusEco] = await sql`
  INSERT INTO timetables (name, university_id, batch_id, week_start_date, created_by)
  VALUES ('B.Com 2024-27 – Business Economics – Week of 2026-06-01', ${ei.id}, ${bCom2427.id}, '2026-06-01', ${adminId})
  RETURNING id`;

await sql`INSERT INTO timetable_slots (timetable_id, day_of_week, start_time, end_time, faculty_id, subject_id) VALUES
  (${ttFinAcc.id}, 'Monday',    '09:00', '10:30', ${fPriya.id},  ${sFinAcc.id}),
  (${ttFinAcc.id}, 'Wednesday', '09:00', '10:30', ${fPriya.id},  ${sFinAcc.id}),
  (${ttFinAcc.id}, 'Friday',    '09:00', '10:30', ${fPriya.id},  ${sFinAcc.id}),
  (${ttBusEco.id}, 'Tuesday',   '11:00', '12:30', ${fRajesh.id}, ${sBusEco.id}),
  (${ttBusEco.id}, 'Thursday',  '11:00', '12:30', ${fRajesh.id}, ${sBusEco.id})`;

console.log('Timetables created.');

// ── Class Entries ─────────────────────────────────────────────────────────────

await sql`INSERT INTO class_entries
  (date, start_time, end_time, total_hours, faculty_id, subject_id, university_id, batch_id,
   unit_chapter, class_mode, is_recorded, recording_file_name, editing_status,
   upload_youtube, class_status, payment_status, created_by)
VALUES
  ('2026-06-02', '09:00', '10:30', 1.50, ${fPriya.id},  ${sFinAcc.id}, ${ei.id}, ${bCom2427.id},
   'Introduction to Accounting', 'offline', true, 'fin_acc_2026-06-02.mp4', 'edited', false, 'taken', 'paid', ${adminId}),

  ('2026-06-03', '11:00', '12:30', 1.50, ${fRajesh.id}, ${sBusEco.id}, ${ei.id}, ${bCom2427.id},
   'Basic Concepts of Economics', 'offline', false, null, 'not_edited', false, 'taken', 'pending', ${adminId}),

  ('2026-06-04', '09:00', '10:30', 1.50, ${fPriya.id},  ${sFinAcc.id}, ${ei.id}, ${bCom2427.id},
   'Journal Entries – Rules & Format', 'offline', true, 'fin_acc_2026-06-04.mp4', 'not_edited', false, 'taken', 'paid', ${adminId}),

  ('2026-06-05', '11:00', '12:30', 1.50, ${fRajesh.id}, ${sBusEco.id}, ${ei.id}, ${bCom2427.id},
   'Demand and Supply Analysis', 'offline', false, null, 'not_edited', false, 'scheduled', 'pending', ${adminId}),

  ('2026-06-06', '09:00', '10:30', 1.50, ${fPriya.id},  ${sFinAcc.id}, ${ei.id}, ${bCom2427.id},
   'Ledger Posting', 'offline', false, null, 'not_edited', false, 'scheduled', 'pending', ${adminId})
`;

console.log('Class entries created.');
console.log('\nSample data seeded successfully!');
console.log('  1 university (EdDream Institute)');
console.log('  3 streams: B.Com, BA English, BSc Computer Science');
console.log('  5 batches');
console.log('  13 subjects');
console.log('  4 faculty');
console.log('  15 academic years (3 per batch)');
console.log('  19 chapters (batch-specific) with 25 learning resources');
process.exit(0);
