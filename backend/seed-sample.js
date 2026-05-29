import 'dotenv/config';
import { sql } from './db.js';

const existing = await sql`SELECT COUNT(*) AS count FROM universities`;
if (parseInt(existing[0].count) > 0) {
  console.log('Data already exists. Run with --force to overwrite.');
  if (!process.argv.includes('--force')) process.exit(0);
  // Truncate in dependency order
  await sql`TRUNCATE timetable_slots, timetables, class_entries,
    faculty_subjects, faculty_universities, faculty_batches,
    subjects, batches, streams, faculty, universities RESTART IDENTITY CASCADE`;
  console.log('Cleared existing data.');
}

const [adminRow] = await sql`SELECT id FROM users WHERE role = 'admin' LIMIT 1`;
const adminId = adminRow?.id ?? 1;

// ── Universities ──────────────────────────────────────────────────────────────

const [mu] = await sql`
  INSERT INTO universities (name, short_code) VALUES ('Mumbai University', 'MU') RETURNING id`;
const [pu] = await sql`
  INSERT INTO universities (name, short_code) VALUES ('Pune University', 'PU') RETURNING id`;
const [nu] = await sql`
  INSERT INTO universities (name, short_code) VALUES ('Nagpur University', 'NU') RETURNING id`;

console.log('Universities created.');

// ── Streams ───────────────────────────────────────────────────────────────────

const [muCS] = await sql`
  INSERT INTO streams (name, university_id, academic_year)
  VALUES ('B.Tech Computer Engineering', ${mu.id}, '2024') RETURNING id`;
const [muEC] = await sql`
  INSERT INTO streams (name, university_id, academic_year)
  VALUES ('B.Tech Electronics & Telecom', ${mu.id}, '2024') RETURNING id`;
const [muBCA] = await sql`
  INSERT INTO streams (name, university_id, academic_year)
  VALUES ('BCA', ${mu.id}, '2024') RETURNING id`;
const [puMBA] = await sql`
  INSERT INTO streams (name, university_id, academic_year)
  VALUES ('MBA', ${pu.id}, '2024') RETURNING id`;
const [puBSc] = await sql`
  INSERT INTO streams (name, university_id, academic_year)
  VALUES ('B.Sc Computer Science', ${pu.id}, '2024') RETURNING id`;
const [nuMech] = await sql`
  INSERT INTO streams (name, university_id, academic_year)
  VALUES ('B.Tech Mechanical Engineering', ${nu.id}, '2024') RETURNING id`;

console.log('Streams created.');

// ── Batches ───────────────────────────────────────────────────────────────────

const [csA1] = await sql`
  INSERT INTO batches (name, university_id, stream_id, semester)
  VALUES ('CS Batch A – Sem 1', ${mu.id}, ${muCS.id}, '1') RETURNING id`;
const [csA3] = await sql`
  INSERT INTO batches (name, university_id, stream_id, semester)
  VALUES ('CS Batch A – Sem 3', ${mu.id}, ${muCS.id}, '3') RETURNING id`;
const [csB1] = await sql`
  INSERT INTO batches (name, university_id, stream_id, semester)
  VALUES ('CS Batch B – Sem 1', ${mu.id}, ${muCS.id}, '1') RETURNING id`;
const [ecA1] = await sql`
  INSERT INTO batches (name, university_id, stream_id, semester)
  VALUES ('EC Batch A – Sem 1', ${mu.id}, ${muEC.id}, '1') RETURNING id`;
const [ecA3] = await sql`
  INSERT INTO batches (name, university_id, stream_id, semester)
  VALUES ('EC Batch A – Sem 3', ${mu.id}, ${muEC.id}, '3') RETURNING id`;
const [bca1] = await sql`
  INSERT INTO batches (name, university_id, stream_id, semester)
  VALUES ('BCA 2024 – Sem 1', ${mu.id}, ${muBCA.id}, '1') RETURNING id`;
const [mba1] = await sql`
  INSERT INTO batches (name, university_id, stream_id, semester)
  VALUES ('MBA 2024 – Sem 1', ${pu.id}, ${puMBA.id}, '1') RETURNING id`;
const [mba3] = await sql`
  INSERT INTO batches (name, university_id, stream_id, semester)
  VALUES ('MBA 2024 – Sem 3', ${pu.id}, ${puMBA.id}, '3') RETURNING id`;
const [bsc1] = await sql`
  INSERT INTO batches (name, university_id, stream_id, semester)
  VALUES ('BSc CS 2024 – Sem 1', ${pu.id}, ${puBSc.id}, '1') RETURNING id`;

console.log('Batches created.');

// ── Subjects ──────────────────────────────────────────────────────────────────

const [sMath] = await sql`
  INSERT INTO subjects (name, subject_code, university_id, stream_id, semester)
  VALUES ('Mathematics', 'MTH101', ${mu.id}, ${muCS.id}, '1') RETURNING id`;
const [sProg] = await sql`
  INSERT INTO subjects (name, subject_code, university_id, stream_id, semester)
  VALUES ('Programming in C', 'CS101', ${mu.id}, ${muCS.id}, '1') RETURNING id`;
const [sDLD] = await sql`
  INSERT INTO subjects (name, subject_code, university_id, stream_id, semester)
  VALUES ('Digital Logic Design', 'CS103', ${mu.id}, ${muCS.id}, '1') RETURNING id`;
const [sDS] = await sql`
  INSERT INTO subjects (name, subject_code, university_id, stream_id, semester)
  VALUES ('Data Structures', 'CS301', ${mu.id}, ${muCS.id}, '3') RETURNING id`;
const [sAlgo] = await sql`
  INSERT INTO subjects (name, subject_code, university_id, stream_id, semester)
  VALUES ('Algorithms', 'CS303', ${mu.id}, ${muCS.id}, '3') RETURNING id`;
const [sDBMS] = await sql`
  INSERT INTO subjects (name, subject_code, university_id, stream_id, semester)
  VALUES ('Database Systems', 'CS305', ${mu.id}, ${muCS.id}, '3') RETURNING id`;
const [sDE] = await sql`
  INSERT INTO subjects (name, subject_code, university_id, stream_id, semester)
  VALUES ('Digital Electronics', 'EC101', ${mu.id}, ${muEC.id}, '1') RETURNING id`;
const [sCT] = await sql`
  INSERT INTO subjects (name, subject_code, university_id, stream_id, semester)
  VALUES ('Circuit Theory', 'EC103', ${mu.id}, ${muEC.id}, '1') RETURNING id`;
const [sBStats] = await sql`
  INSERT INTO subjects (name, subject_code, university_id, stream_id, semester)
  VALUES ('Business Statistics', 'MBA101', ${pu.id}, ${puMBA.id}, '1') RETURNING id`;
const [sMktg] = await sql`
  INSERT INTO subjects (name, subject_code, university_id, stream_id, semester)
  VALUES ('Marketing Management', 'MBA103', ${pu.id}, ${puMBA.id}, '1') RETURNING id`;
const [sFinAcc] = await sql`
  INSERT INTO subjects (name, subject_code, university_id, stream_id, semester)
  VALUES ('Financial Accounting', 'MBA105', ${pu.id}, ${puMBA.id}, '1') RETURNING id`;
const [sPF] = await sql`
  INSERT INTO subjects (name, subject_code, university_id, stream_id, semester)
  VALUES ('Programming Fundamentals', 'BCA101', ${mu.id}, ${muBCA.id}, '1') RETURNING id`;

console.log('Subjects created.');

// ── Faculty ───────────────────────────────────────────────────────────────────

const [fRajesh] = await sql`
  INSERT INTO faculty (name, email, phone, payment_type, hourly_rate)
  VALUES ('Dr. Rajesh Sharma', 'rajesh.sharma@email.com', '9876543210', 'hourly', 800.00) RETURNING id`;
const [fAnjali] = await sql`
  INSERT INTO faculty (name, email, phone, payment_type, hourly_rate)
  VALUES ('Prof. Anjali Mehta', 'anjali.mehta@email.com', '9876543211', 'hourly', 750.00) RETURNING id`;
const [fSuresh] = await sql`
  INSERT INTO faculty (name, email, phone, payment_type, hourly_rate)
  VALUES ('Dr. Suresh Patel', 'suresh.patel@email.com', '9876543212', 'fixed', null) RETURNING id`;
const [fPriya] = await sql`
  INSERT INTO faculty (name, email, phone, payment_type, hourly_rate)
  VALUES ('Prof. Priya Singh', 'priya.singh@email.com', '9876543213', 'hourly', 700.00) RETURNING id`;
const [fKartik] = await sql`
  INSERT INTO faculty (name, email, phone, payment_type, hourly_rate)
  VALUES ('Mr. Kartik Nair', 'kartik.nair@email.com', '9876543214', 'hourly', 650.00) RETURNING id`;
const [fSunita] = await sql`
  INSERT INTO faculty (name, email, phone, payment_type, hourly_rate)
  VALUES ('Dr. Sunita Rao', 'sunita.rao@email.com', '9876543215', 'fixed', null) RETURNING id`;

console.log('Faculty created.');

// Faculty ↔ Universities
await sql`INSERT INTO faculty_universities (faculty_id, university_id) VALUES
  (${fRajesh.id}, ${mu.id}), (${fAnjali.id}, ${mu.id}), (${fAnjali.id}, ${pu.id}),
  (${fSuresh.id}, ${mu.id}), (${fPriya.id}, ${mu.id}), (${fPriya.id}, ${pu.id}),
  (${fKartik.id}, ${mu.id}), (${fSunita.id}, ${pu.id})`;

// Faculty ↔ Subjects
await sql`INSERT INTO faculty_subjects (faculty_id, subject_id) VALUES
  (${fRajesh.id}, ${sMath.id}), (${fRajesh.id}, ${sDS.id}),
  (${fAnjali.id}, ${sAlgo.id}), (${fAnjali.id}, ${sProg.id}), (${fAnjali.id}, ${sMktg.id}),
  (${fSuresh.id}, ${sMath.id}), (${fSuresh.id}, ${sDE.id}), (${fSuresh.id}, ${sDLD.id}),
  (${fPriya.id}, ${sDBMS.id}), (${fPriya.id}, ${sBStats.id}), (${fPriya.id}, ${sPF.id}),
  (${fKartik.id}, ${sDS.id}), (${fKartik.id}, ${sAlgo.id}), (${fKartik.id}, ${sPF.id}),
  (${fSunita.id}, ${sBStats.id}), (${fSunita.id}, ${sFinAcc.id})`;

// Faculty ↔ Batches
await sql`INSERT INTO faculty_batches (faculty_id, batch_id) VALUES
  (${fRajesh.id}, ${csA1.id}), (${fRajesh.id}, ${csA3.id}), (${fRajesh.id}, ${csB1.id}),
  (${fAnjali.id}, ${csA3.id}), (${fAnjali.id}, ${mba1.id}),
  (${fSuresh.id}, ${csA1.id}), (${fSuresh.id}, ${ecA1.id}),
  (${fPriya.id}, ${csA1.id}), (${fPriya.id}, ${bca1.id}), (${fPriya.id}, ${mba1.id}),
  (${fKartik.id}, ${csA3.id}), (${fKartik.id}, ${bca1.id}),
  (${fSunita.id}, ${mba1.id}), (${fSunita.id}, ${mba3.id})`;

console.log('Faculty associations created.');

// ── Timetables ────────────────────────────────────────────────────────────────
// CS Batch A – Sem 3: 3 separate timetables (3 classes per batch demo)

const [ttMath3] = await sql`
  INSERT INTO timetables (name, university_id, batch_id, created_by)
  VALUES ('CS Sem3 – Mathematics', ${mu.id}, ${csA3.id}, ${adminId}) RETURNING id`;
const [ttDS3] = await sql`
  INSERT INTO timetables (name, university_id, batch_id, created_by)
  VALUES ('CS Sem3 – Data Structures', ${mu.id}, ${csA3.id}, ${adminId}) RETURNING id`;
const [ttAlgo3] = await sql`
  INSERT INTO timetables (name, university_id, batch_id, created_by)
  VALUES ('CS Sem3 – Algorithms', ${mu.id}, ${csA3.id}, ${adminId}) RETURNING id`;

// CS Batch A – Sem 1: 2 timetables
const [ttMath1] = await sql`
  INSERT INTO timetables (name, university_id, batch_id, created_by)
  VALUES ('CS Sem1 – Mathematics', ${mu.id}, ${csA1.id}, ${adminId}) RETURNING id`;
const [ttProg1] = await sql`
  INSERT INTO timetables (name, university_id, batch_id, created_by)
  VALUES ('CS Sem1 – Programming in C', ${mu.id}, ${csA1.id}, ${adminId}) RETURNING id`;

// CS Batch B – Sem 1
const [ttMathB1] = await sql`
  INSERT INTO timetables (name, university_id, batch_id, created_by)
  VALUES ('CS Batch B – Mathematics', ${mu.id}, ${csB1.id}, ${adminId}) RETURNING id`;

// EC Batch A – Sem 1: 2 timetables
const [ttDE1] = await sql`
  INSERT INTO timetables (name, university_id, batch_id, created_by)
  VALUES ('EC Sem1 – Digital Electronics', ${mu.id}, ${ecA1.id}, ${adminId}) RETURNING id`;
const [ttCT1] = await sql`
  INSERT INTO timetables (name, university_id, batch_id, created_by)
  VALUES ('EC Sem1 – Circuit Theory', ${mu.id}, ${ecA1.id}, ${adminId}) RETURNING id`;

// BCA Sem 1
const [ttBCA] = await sql`
  INSERT INTO timetables (name, university_id, batch_id, created_by)
  VALUES ('BCA Sem1 – Programming Fundamentals', ${mu.id}, ${bca1.id}, ${adminId}) RETURNING id`;

// MBA Sem 1: 3 timetables
const [ttBSt] = await sql`
  INSERT INTO timetables (name, university_id, batch_id, created_by)
  VALUES ('MBA Sem1 – Business Statistics', ${pu.id}, ${mba1.id}, ${adminId}) RETURNING id`;
const [ttMktg] = await sql`
  INSERT INTO timetables (name, university_id, batch_id, created_by)
  VALUES ('MBA Sem1 – Marketing Management', ${pu.id}, ${mba1.id}, ${adminId}) RETURNING id`;
const [ttFinAcc] = await sql`
  INSERT INTO timetables (name, university_id, batch_id, created_by)
  VALUES ('MBA Sem1 – Financial Accounting', ${pu.id}, ${mba1.id}, ${adminId}) RETURNING id`;

console.log('Timetables created.');

// ── Timetable Slots ───────────────────────────────────────────────────────────

// CS Sem3 – Mathematics (Dr. Rajesh): Mon, Wed, Fri 09:00–10:00
await sql`INSERT INTO timetable_slots (timetable_id, day_of_week, start_time, end_time, faculty_id, subject_id) VALUES
  (${ttMath3.id}, 'Monday',    '09:00', '10:00', ${fRajesh.id}, ${sMath.id}),
  (${ttMath3.id}, 'Wednesday', '09:00', '10:00', ${fRajesh.id}, ${sMath.id}),
  (${ttMath3.id}, 'Friday',    '09:00', '10:00', ${fRajesh.id}, ${sMath.id})`;

// CS Sem3 – Data Structures (Mr. Kartik): Mon, Tue, Thu 10:15–11:45
await sql`INSERT INTO timetable_slots (timetable_id, day_of_week, start_time, end_time, faculty_id, subject_id) VALUES
  (${ttDS3.id}, 'Monday',    '10:15', '11:45', ${fKartik.id}, ${sDS.id}),
  (${ttDS3.id}, 'Tuesday',   '10:15', '11:45', ${fKartik.id}, ${sDS.id}),
  (${ttDS3.id}, 'Thursday',  '10:15', '11:45', ${fKartik.id}, ${sDS.id})`;

// CS Sem3 – Algorithms (Prof. Anjali): Tue, Wed, Sat 12:00–13:00
await sql`INSERT INTO timetable_slots (timetable_id, day_of_week, start_time, end_time, faculty_id, subject_id) VALUES
  (${ttAlgo3.id}, 'Tuesday',   '12:00', '13:00', ${fAnjali.id}, ${sAlgo.id}),
  (${ttAlgo3.id}, 'Wednesday', '12:00', '13:00', ${fAnjali.id}, ${sAlgo.id}),
  (${ttAlgo3.id}, 'Saturday',  '10:00', '11:00', ${fAnjali.id}, ${sAlgo.id})`;

// CS Sem1 – Mathematics (Dr. Suresh): Mon, Wed, Fri 08:00–09:00
await sql`INSERT INTO timetable_slots (timetable_id, day_of_week, start_time, end_time, faculty_id, subject_id) VALUES
  (${ttMath1.id}, 'Monday',    '08:00', '09:00', ${fSuresh.id}, ${sMath.id}),
  (${ttMath1.id}, 'Wednesday', '08:00', '09:00', ${fSuresh.id}, ${sMath.id}),
  (${ttMath1.id}, 'Friday',    '08:00', '09:00', ${fSuresh.id}, ${sMath.id})`;

// CS Sem1 – Programming in C (Prof. Anjali → substituted by Prof. Priya): Tue, Thu 10:00–11:30
await sql`INSERT INTO timetable_slots (timetable_id, day_of_week, start_time, end_time, faculty_id, subject_id) VALUES
  (${ttProg1.id}, 'Tuesday',  '10:00', '11:30', ${fPriya.id}, ${sProg.id}),
  (${ttProg1.id}, 'Thursday', '10:00', '11:30', ${fPriya.id}, ${sProg.id})`;

// CS Batch B – Mathematics (Dr. Rajesh): Tue, Thu, Sat 09:00–10:00
await sql`INSERT INTO timetable_slots (timetable_id, day_of_week, start_time, end_time, faculty_id, subject_id) VALUES
  (${ttMathB1.id}, 'Tuesday',   '09:00', '10:00', ${fRajesh.id}, ${sMath.id}),
  (${ttMathB1.id}, 'Thursday',  '09:00', '10:00', ${fRajesh.id}, ${sMath.id}),
  (${ttMathB1.id}, 'Saturday',  '09:00', '10:00', ${fRajesh.id}, ${sMath.id})`;

// EC Sem1 – Digital Electronics (Dr. Suresh): Mon, Wed, Fri 11:00–12:00
await sql`INSERT INTO timetable_slots (timetable_id, day_of_week, start_time, end_time, faculty_id, subject_id) VALUES
  (${ttDE1.id}, 'Monday',    '11:00', '12:00', ${fSuresh.id}, ${sDE.id}),
  (${ttDE1.id}, 'Wednesday', '11:00', '12:00', ${fSuresh.id}, ${sDE.id}),
  (${ttDE1.id}, 'Friday',    '11:00', '12:00', ${fSuresh.id}, ${sDE.id})`;

// EC Sem1 – Circuit Theory (Dr. Rajesh): Tue, Thu 14:00–15:30
await sql`INSERT INTO timetable_slots (timetable_id, day_of_week, start_time, end_time, faculty_id, subject_id) VALUES
  (${ttCT1.id}, 'Tuesday',  '14:00', '15:30', ${fRajesh.id}, ${sCT.id}),
  (${ttCT1.id}, 'Thursday', '14:00', '15:30', ${fRajesh.id}, ${sCT.id})`;

// BCA – Programming Fundamentals (Mr. Kartik): Mon, Tue, Wed, Thu 09:00–10:00
await sql`INSERT INTO timetable_slots (timetable_id, day_of_week, start_time, end_time, faculty_id, subject_id) VALUES
  (${ttBCA.id}, 'Monday',    '09:00', '10:00', ${fKartik.id}, ${sPF.id}),
  (${ttBCA.id}, 'Tuesday',   '09:00', '10:00', ${fKartik.id}, ${sPF.id}),
  (${ttBCA.id}, 'Wednesday', '09:00', '10:00', ${fKartik.id}, ${sPF.id}),
  (${ttBCA.id}, 'Thursday',  '09:00', '10:00', ${fKartik.id}, ${sPF.id})`;

// MBA Sem1 – Business Statistics (Dr. Sunita): Mon, Wed, Fri 10:00–11:00
await sql`INSERT INTO timetable_slots (timetable_id, day_of_week, start_time, end_time, faculty_id, subject_id) VALUES
  (${ttBSt.id}, 'Monday',    '10:00', '11:00', ${fSunita.id}, ${sBStats.id}),
  (${ttBSt.id}, 'Wednesday', '10:00', '11:00', ${fSunita.id}, ${sBStats.id}),
  (${ttBSt.id}, 'Friday',    '10:00', '11:00', ${fSunita.id}, ${sBStats.id})`;

// MBA Sem1 – Marketing Management (Prof. Anjali): Tue, Thu 14:00–15:30
await sql`INSERT INTO timetable_slots (timetable_id, day_of_week, start_time, end_time, faculty_id, subject_id) VALUES
  (${ttMktg.id}, 'Tuesday',  '14:00', '15:30', ${fAnjali.id}, ${sMktg.id}),
  (${ttMktg.id}, 'Thursday', '14:00', '15:30', ${fAnjali.id}, ${sMktg.id})`;

// MBA Sem1 – Financial Accounting (Dr. Sunita): Mon, Wed 12:00–13:00
await sql`INSERT INTO timetable_slots (timetable_id, day_of_week, start_time, end_time, faculty_id, subject_id) VALUES
  (${ttFinAcc.id}, 'Monday',    '12:00', '13:00', ${fSunita.id}, ${sFinAcc.id}),
  (${ttFinAcc.id}, 'Wednesday', '12:00', '13:00', ${fSunita.id}, ${sFinAcc.id})`;

console.log('Timetable slots created.');

// ── Class Entries (last 3 weeks: 2026-05-04 to 2026-05-22) ───────────────────

await sql`INSERT INTO class_entries
  (date, start_time, end_time, total_hours, faculty_id, subject_id, university_id, batch_id,
   unit_chapter, class_mode, is_recorded, recording_file_name, editing_status,
   upload_youtube, payment_status, created_by)
VALUES
  -- Week 1: May 5–9
  ('2026-05-05', '09:00', '10:00', 1.00, ${fRajesh.id}, ${sMath.id}, ${mu.id}, ${csA3.id},
   'Chapter 1 – Limits & Continuity', 'online', true, 'math_cs3_2026-05-05.mp4', 'edited', true, 'paid', ${adminId}),

  ('2026-05-05', '10:15', '11:45', 1.50, ${fKartik.id}, ${sDS.id}, ${mu.id}, ${csA3.id},
   'Arrays & Linked Lists – Intro', 'online', true, 'ds_cs3_2026-05-05.mp4', 'not_edited', false, 'paid', ${adminId}),

  ('2026-05-06', '12:00', '13:00', 1.00, ${fAnjali.id}, ${sAlgo.id}, ${mu.id}, ${csA3.id},
   'Complexity Analysis – Big-O Notation', 'online', false, null, 'not_edited', false, 'paid', ${adminId}),

  ('2026-05-06', '10:00', '11:30', 1.50, ${fPriya.id}, ${sProg.id}, ${mu.id}, ${csA1.id},
   'Variables, Data Types & Operators', 'offline', false, null, 'not_edited', false, 'paid', ${adminId}),

  ('2026-05-07', '09:00', '10:00', 1.00, ${fRajesh.id}, ${sMath.id}, ${mu.id}, ${csA3.id},
   'Chapter 1 – Differentiation', 'online', true, 'math_cs3_2026-05-07.mp4', 'edited', true, 'paid', ${adminId}),

  ('2026-05-07', '10:15', '11:45', 1.50, ${fKartik.id}, ${sDS.id}, ${mu.id}, ${csA3.id},
   'Singly Linked List – Operations', 'online', true, 'ds_cs3_2026-05-07.mp4', 'not_edited', false, 'paid', ${adminId}),

  ('2026-05-07', '12:00', '13:00', 1.00, ${fAnjali.id}, ${sAlgo.id}, ${mu.id}, ${csA3.id},
   'Recursion & Recurrence Relations', 'online', false, null, 'not_edited', false, 'paid', ${adminId}),

  ('2026-05-07', '08:00', '09:00', 1.00, ${fSuresh.id}, ${sMath.id}, ${mu.id}, ${csA1.id},
   'Introduction to Calculus', 'offline', false, null, 'not_edited', false, 'pending', ${adminId}),

  ('2026-05-08', '10:00', '11:30', 1.50, ${fPriya.id}, ${sProg.id}, ${mu.id}, ${csA1.id},
   'Control Flow – if/else, loops', 'offline', false, null, 'not_edited', false, 'paid', ${adminId}),

  ('2026-05-08', '11:00', '12:00', 1.00, ${fSuresh.id}, ${sDE.id}, ${mu.id}, ${ecA1.id},
   'Number Systems & Boolean Algebra', 'offline', true, 'de_ec1_2026-05-08.mp4', 'not_edited', false, 'paid', ${adminId}),

  ('2026-05-09', '09:00', '10:00', 1.00, ${fRajesh.id}, ${sMath.id}, ${mu.id}, ${csA3.id},
   'Chapter 2 – Integration Basics', 'online', true, 'math_cs3_2026-05-09.mp4', 'edited', true, 'paid', ${adminId}),

  ('2026-05-09', '10:00', '11:00', 1.00, ${fSunita.id}, ${sBStats.id}, ${pu.id}, ${mba1.id},
   'Introduction to Statistics & Data Types', 'online', false, null, 'not_edited', false, 'paid', ${adminId}),

  ('2026-05-09', '11:00', '12:00', 1.00, ${fSuresh.id}, ${sDE.id}, ${mu.id}, ${ecA1.id},
   'Logic Gates – AND, OR, NOT, NAND, NOR', 'offline', true, 'de_ec1_2026-05-09.mp4', 'not_edited', false, 'paid', ${adminId}),

  -- Week 2: May 12–16
  ('2026-05-12', '09:00', '10:00', 1.00, ${fRajesh.id}, ${sMath.id}, ${mu.id}, ${csA3.id},
   'Chapter 2 – Definite Integrals', 'online', true, 'math_cs3_2026-05-12.mp4', 'edited', true, 'paid', ${adminId}),

  ('2026-05-12', '10:15', '11:45', 1.50, ${fKartik.id}, ${sDS.id}, ${mu.id}, ${csA3.id},
   'Doubly Linked List', 'online', true, 'ds_cs3_2026-05-12.mp4', 'edited', false, 'paid', ${adminId}),

  ('2026-05-12', '09:00', '10:00', 1.00, ${fKartik.id}, ${sPF.id}, ${mu.id}, ${bca1.id},
   'Introduction to Programming Concepts', 'online', false, null, 'not_edited', false, 'paid', ${adminId}),

  ('2026-05-12', '10:00', '11:00', 1.00, ${fSunita.id}, ${sBStats.id}, ${pu.id}, ${mba1.id},
   'Measures of Central Tendency', 'online', false, null, 'not_edited', false, 'paid', ${adminId}),

  ('2026-05-13', '12:00', '13:00', 1.00, ${fAnjali.id}, ${sAlgo.id}, ${mu.id}, ${csA3.id},
   'Sorting – Bubble Sort & Selection Sort', 'online', true, 'algo_cs3_2026-05-13.mp4', 'not_edited', false, 'paid', ${adminId}),

  ('2026-05-13', '10:00', '11:30', 1.50, ${fPriya.id}, ${sProg.id}, ${mu.id}, ${csA1.id},
   'Functions & Scope', 'offline', false, null, 'not_edited', false, 'paid', ${adminId}),

  ('2026-05-13', '09:00', '10:00', 1.00, ${fKartik.id}, ${sPF.id}, ${mu.id}, ${bca1.id},
   'Variables and Data Types in C', 'online', false, null, 'not_edited', false, 'paid', ${adminId}),

  ('2026-05-13', '14:00', '15:30', 1.50, ${fAnjali.id}, ${sMktg.id}, ${pu.id}, ${mba1.id},
   'Introduction to Marketing Concepts', 'online', false, null, 'not_edited', false, 'paid', ${adminId}),

  ('2026-05-14', '09:00', '10:00', 1.00, ${fRajesh.id}, ${sMath.id}, ${mu.id}, ${csA3.id},
   'Chapter 3 – Differential Equations', 'online', true, 'math_cs3_2026-05-14.mp4', 'edited', true, 'paid', ${adminId}),

  ('2026-05-14', '10:15', '11:45', 1.50, ${fKartik.id}, ${sDS.id}, ${mu.id}, ${csA3.id},
   'Stacks – Implementation & Applications', 'online', true, 'ds_cs3_2026-05-14.mp4', 'not_edited', false, 'paid', ${adminId}),

  ('2026-05-14', '12:00', '13:00', 1.00, ${fAnjali.id}, ${sAlgo.id}, ${mu.id}, ${csA3.id},
   'Sorting – Merge Sort', 'online', false, null, 'not_edited', false, 'paid', ${adminId}),

  ('2026-05-14', '08:00', '09:00', 1.00, ${fSuresh.id}, ${sMath.id}, ${mu.id}, ${csA1.id},
   'Chapter 2 – Trigonometry Review', 'offline', false, null, 'not_edited', false, 'pending', ${adminId}),

  ('2026-05-14', '09:00', '10:00', 1.00, ${fKartik.id}, ${sPF.id}, ${mu.id}, ${bca1.id},
   'Input/Output in C', 'online', false, null, 'not_edited', false, 'paid', ${adminId}),

  ('2026-05-14', '10:00', '11:00', 1.00, ${fSunita.id}, ${sBStats.id}, ${pu.id}, ${mba1.id},
   'Measures of Dispersion – Variance & SD', 'online', false, null, 'not_edited', false, 'paid', ${adminId}),

  ('2026-05-14', '12:00', '13:00', 1.00, ${fSunita.id}, ${sFinAcc.id}, ${pu.id}, ${mba1.id},
   'Introduction to Accounting Principles', 'online', false, null, 'not_edited', false, 'paid', ${adminId}),

  ('2026-05-15', '10:00', '11:30', 1.50, ${fPriya.id}, ${sProg.id}, ${mu.id}, ${csA1.id},
   'Arrays – 1D & 2D', 'offline', false, null, 'not_edited', false, 'paid', ${adminId}),

  ('2026-05-15', '11:00', '12:00', 1.00, ${fSuresh.id}, ${sDE.id}, ${mu.id}, ${ecA1.id},
   'Combinational Circuits – Adders', 'offline', true, 'de_ec1_2026-05-15.mp4', 'not_edited', false, 'paid', ${adminId}),

  ('2026-05-15', '14:00', '15:30', 1.50, ${fAnjali.id}, ${sMktg.id}, ${pu.id}, ${mba1.id},
   'Market Segmentation & Targeting', 'online', false, null, 'not_edited', false, 'paid', ${adminId}),

  ('2026-05-16', '09:00', '10:00', 1.00, ${fRajesh.id}, ${sMath.id}, ${mu.id}, ${csA3.id},
   'Chapter 3 – Second Order ODEs', 'online', true, 'math_cs3_2026-05-16.mp4', 'edited', true, 'paid', ${adminId}),

  ('2026-05-16', '10:00', '11:00', 1.00, ${fSunita.id}, ${sBStats.id}, ${pu.id}, ${mba1.id},
   'Probability Basics', 'online', false, null, 'not_edited', false, 'paid', ${adminId}),

  ('2026-05-16', '11:00', '12:00', 1.00, ${fSuresh.id}, ${sDE.id}, ${mu.id}, ${ecA1.id},
   'Multiplexers & Demultiplexers', 'offline', false, null, 'not_edited', false, 'paid', ${adminId}),

  -- Week 3: May 19–22
  ('2026-05-19', '09:00', '10:00', 1.00, ${fRajesh.id}, ${sMath.id}, ${mu.id}, ${csA3.id},
   'Chapter 4 – Laplace Transforms', 'online', true, 'math_cs3_2026-05-19.mp4', 'not_edited', false, 'pending', ${adminId}),

  ('2026-05-19', '10:15', '11:45', 1.50, ${fKartik.id}, ${sDS.id}, ${mu.id}, ${csA3.id},
   'Queues – Circular Queue', 'online', true, 'ds_cs3_2026-05-19.mp4', 'not_edited', false, 'pending', ${adminId}),

  ('2026-05-19', '09:00', '10:00', 1.00, ${fKartik.id}, ${sPF.id}, ${mu.id}, ${bca1.id},
   'Control Structures – Loops', 'online', false, null, 'not_edited', false, 'pending', ${adminId}),

  ('2026-05-19', '10:00', '11:00', 1.00, ${fSunita.id}, ${sBStats.id}, ${pu.id}, ${mba1.id},
   'Bayes Theorem & Conditional Probability', 'online', false, null, 'not_edited', false, 'pending', ${adminId}),

  ('2026-05-20', '12:00', '13:00', 1.00, ${fAnjali.id}, ${sAlgo.id}, ${mu.id}, ${csA3.id},
   'Quick Sort & Time Complexity', 'online', false, null, 'not_edited', false, 'pending', ${adminId}),

  ('2026-05-20', '10:00', '11:30', 1.50, ${fPriya.id}, ${sProg.id}, ${mu.id}, ${csA1.id},
   'Pointers – Introduction', 'offline', false, null, 'not_edited', false, 'pending', ${adminId}),

  ('2026-05-20', '09:00', '10:00', 1.00, ${fKartik.id}, ${sPF.id}, ${mu.id}, ${bca1.id},
   'Functions in C', 'online', false, null, 'not_edited', false, 'pending', ${adminId}),

  ('2026-05-20', '14:00', '15:30', 1.50, ${fAnjali.id}, ${sMktg.id}, ${pu.id}, ${mba1.id},
   'Product Life Cycle & Pricing Strategy', 'online', false, null, 'not_edited', false, 'pending', ${adminId}),

  ('2026-05-21', '09:00', '10:00', 1.00, ${fRajesh.id}, ${sMath.id}, ${mu.id}, ${csA3.id},
   'Chapter 4 – Inverse Laplace', 'online', false, null, 'not_edited', false, 'pending', ${adminId}),

  ('2026-05-21', '10:15', '11:45', 1.50, ${fKartik.id}, ${sDS.id}, ${mu.id}, ${csA3.id},
   'Binary Trees – Traversal', 'online', true, 'ds_cs3_2026-05-21.mp4', 'not_edited', false, 'pending', ${adminId}),

  ('2026-05-21', '12:00', '13:00', 1.00, ${fAnjali.id}, ${sAlgo.id}, ${mu.id}, ${csA3.id},
   'Divide & Conquer Strategy', 'online', false, null, 'not_edited', false, 'pending', ${adminId}),

  ('2026-05-21', '08:00', '09:00', 1.00, ${fSuresh.id}, ${sMath.id}, ${mu.id}, ${csA1.id},
   'Chapter 3 – Matrices', 'offline', false, null, 'not_edited', false, 'pending', ${adminId}),

  ('2026-05-21', '09:00', '10:00', 1.00, ${fKartik.id}, ${sPF.id}, ${mu.id}, ${bca1.id},
   'Arrays – Sorting & Searching', 'online', false, null, 'not_edited', false, 'pending', ${adminId}),

  ('2026-05-21', '14:00', '15:30', 1.50, ${fRajesh.id}, ${sCT.id}, ${mu.id}, ${ecA1.id},
   'Kirchhoff Laws & Network Analysis', 'offline', false, null, 'not_edited', false, 'pending', ${adminId}),

  ('2026-05-22', '09:00', '10:00', 1.00, ${fRajesh.id}, ${sMath.id}, ${mu.id}, ${csA3.id},
   'Chapter 5 – Fourier Series', 'online', false, null, 'not_edited', false, 'pending', ${adminId}),

  ('2026-05-22', '10:00', '11:00', 1.00, ${fSunita.id}, ${sBStats.id}, ${pu.id}, ${mba1.id},
   'Normal Distribution & Z-scores', 'online', false, null, 'not_edited', false, 'pending', ${adminId}),

  ('2026-05-22', '12:00', '13:00', 1.00, ${fSunita.id}, ${sFinAcc.id}, ${pu.id}, ${mba1.id},
   'Journal Entries & Ledger', 'online', false, null, 'not_edited', false, 'pending', ${adminId})
`;

console.log('Class entries created.');
console.log('\nSample data seeded successfully!');
console.log('  3 universities, 6 streams, 9 batches');
console.log('  12 subjects, 6 faculty');
console.log('  12 timetables with 30 slots');
console.log('  ~50 class entries across 3 weeks');
process.exit(0);
