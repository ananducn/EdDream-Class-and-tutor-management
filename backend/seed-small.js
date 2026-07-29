// Small sample data set — enough to click through every screen, without the
// thousands of sequential round-trips that make seed-sample.js fragile over
// Railway's public proxy. Every insert here is a single multi-row statement.
import 'dotenv/config';
import { sql } from './db.js';

const rows = (r) => r;
const one = (r) => r[0];

console.log('Clearing existing sample data…');
await sql`TRUNCATE
  chapter_recordings, learning_resources, chapters, academic_year_subjects, semesters, academic_years,
  timetable_slots, timetables, class_entries,
  faculty_batches, faculty_subjects, faculty_universities,
  subjects, batches, streams, faculty, universities,
  nios_chapter_recordings, nios_resources, nios_class_chapters, nios_timetable_slot_chapters,
  nios_class_entries, nios_timetable_slots, nios_timetables, nios_chapters,
  nios_stream_subjects, nios_batches, nios_streams, nios_subjects
  RESTART IDENTITY CASCADE`;

const admin = one(await sql`SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1`);
const ADMIN = admin?.id ?? null;

const today = new Date();
const day = (offset) => {
  const d = new Date(today);
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
};

// ── Faculty ──────────────────────────────────────────────────────────────────
console.log('Seeding faculty…');
const faculty = rows(await sql`
  INSERT INTO faculty (name, email, phone, payment_type, hourly_rate) VALUES
    ('Anil Kumar',   'anil@eddream.in',   '9847000001', 'hourly', 800),
    ('Suresh Menon', 'suresh@eddream.in', '9847000002', 'hourly', 900),
    ('Divya Nair',   'divya@eddream.in',  '9847000003', 'fixed',  null)
  RETURNING *`);
const [anil, suresh, divya] = faculty;

// ── Main app: University → Stream → Batch, syllabus on the stream ────────────
console.log('Seeding university, streams, batches & syllabus…');
const uni = one(await sql`
  INSERT INTO universities (name, short_code) VALUES ('Calicut University', 'CU') RETURNING *`);

const streams = rows(await sql`
  INSERT INTO streams (name, university_id) VALUES
    ('B.Com', ${uni.id}), ('BBA', ${uni.id})
  RETURNING *`);
const [bcom, bba] = streams;

await sql`
  INSERT INTO batches (name, stream_id, university_id) VALUES
    ('B.Com 2025', ${bcom.id}, ${uni.id}),
    ('B.Com 2026', ${bcom.id}, ${uni.id}),
    ('BBA 2026',   ${bba.id},  ${uni.id})`;
const batches = rows(await sql`SELECT * FROM batches ORDER BY id`);

const years = rows(await sql`
  INSERT INTO academic_years (stream_id, name, year_order) VALUES
    (${bcom.id}, 'Year 1', 1), (${bba.id}, 'Year 1', 1)
  RETURNING *`);
const [bcomYear, bbaYear] = years;

const sems = rows(await sql`
  INSERT INTO semesters (academic_year_id, name, semester_order) VALUES
    (${bcomYear.id}, 'Semester 1', 1), (${bbaYear.id}, 'Semester 1', 1)
  RETURNING *`);
const [bcomSem, bbaSem] = sems;

const subjects = rows(await sql`
  INSERT INTO subjects (name, subject_code, university_id, stream_id) VALUES
    ('Financial Accounting', 'CU101', ${uni.id}, ${bcom.id}),
    ('Business Statistics',  'CU102', ${uni.id}, ${bcom.id}),
    ('Principles of Management', 'CU201', ${uni.id}, ${bba.id})
  RETURNING *`);
const [accounting, stats, mgmt] = subjects;

// Business Statistics sits in both streams — a common subject, so it shares one
// chapter list and one set of recordings.
await sql`
  INSERT INTO academic_year_subjects (academic_year_id, subject_id, semester_id) VALUES
    (${bcomYear.id}, ${accounting.id}, ${bcomSem.id}),
    (${bcomYear.id}, ${stats.id},      ${bcomSem.id}),
    (${bbaYear.id},  ${mgmt.id},       ${bbaSem.id}),
    (${bbaYear.id},  ${stats.id},      ${bbaSem.id})`;

const chapters = rows(await sql`
  INSERT INTO chapters (subject_id, title, chapter_order, created_by) VALUES
    (${accounting.id}, 'Introduction to Accounting', 1, ${ADMIN}),
    (${accounting.id}, 'Journal & Ledger',           2, ${ADMIN}),
    (${accounting.id}, 'Final Accounts',             3, ${ADMIN}),
    (${stats.id},      'Measures of Central Tendency', 1, ${ADMIN}),
    (${stats.id},      'Correlation & Regression',     2, ${ADMIN}),
    (${mgmt.id},       'Nature of Management',       1, ${ADMIN}),
    (${mgmt.id},       'Planning & Organising',      2, ${ADMIN})
  RETURNING *`);

await sql`
  INSERT INTO chapter_recordings (chapter_id, is_recorded, faculty_id, recording_date, recording_duration, editing_status, upload_youtube, upload_youtube_link, youtube_privacy, created_by) VALUES
    (${chapters[0].id}, true,  ${anil.id},   ${day(-20)}, '55m', 'edited',     true,  'https://youtu.be/sample-acc-1', 'unlisted', ${ADMIN}),
    (${chapters[1].id}, true,  ${anil.id},   ${day(-14)}, '1h',  'not_edited', false, null, null, ${ADMIN}),
    (${chapters[3].id}, true,  ${suresh.id}, ${day(-9)},  '45m', 'edited',     true,  'https://youtu.be/sample-stat-1', 'unlisted', ${ADMIN})`;

await sql`
  INSERT INTO faculty_universities (faculty_id, university_id) VALUES
    (${anil.id}, ${uni.id}), (${suresh.id}, ${uni.id}), (${divya.id}, ${uni.id})`;
await sql`
  INSERT INTO faculty_subjects (faculty_id, subject_id) VALUES
    (${anil.id}, ${accounting.id}), (${suresh.id}, ${stats.id}), (${divya.id}, ${mgmt.id})`;

console.log('Seeding class sessions…');
await sql`
  INSERT INTO class_entries (date, start_time, end_time, total_hours, faculty_id, subject_id, university_id, stream_id, batch_id, unit_chapter, class_mode, platform_used, class_status, payment_status, created_by) VALUES
    (${day(-7)}, '10:00', '11:00', 1, ${anil.id},   ${accounting.id}, ${uni.id}, ${bcom.id}, ${batches[0].id}, 'Introduction to Accounting', 'online',  'Google Meet', 'taken',     'paid',    ${ADMIN}),
    (${day(-5)}, '11:00', '12:30', 1.5, ${anil.id}, ${accounting.id}, ${uni.id}, ${bcom.id}, ${batches[0].id}, 'Journal & Ledger',           'online',  'Google Meet', 'taken',     'pending', ${ADMIN}),
    (${day(-3)}, '09:30', '10:30', 1, ${suresh.id}, ${stats.id},      ${uni.id}, ${bcom.id}, ${batches[1].id}, 'Measures of Central Tendency','offline', 'Room 204',    'taken',     'pending', ${ADMIN}),
    (${day(2)},  '10:00', '11:00', 1, ${divya.id},  ${mgmt.id},       ${uni.id}, ${bba.id},  ${batches[2].id}, 'Nature of Management',       'online',  'Zoom',        'scheduled', 'pending', ${ADMIN}),
    (${day(4)},  '14:00', '15:00', 1, ${suresh.id}, ${stats.id},      ${uni.id}, ${bba.id},  ${batches[2].id}, 'Correlation & Regression',   'online',  'Zoom',        'scheduled', 'pending', ${ADMIN})`;

// ── NIOS: University → Stream → Batch, syllabus on the stream ────────────────
console.log('Seeding NIOS streams, syllabus, batches & classes…');
const niosUnis = rows(await sql`SELECT id, name FROM nios_universities ORDER BY id`);
const plusTwo = niosUnis.find((u) => u.name === 'NIOS +2');
const sslc    = niosUnis.find((u) => u.name === 'NIOS SSLC');

const niosStreams = rows(await sql`
  INSERT INTO nios_streams (nios_university_id, name, created_by) VALUES
    (${plusTwo.id}, 'Science',  ${ADMIN}),
    (${plusTwo.id}, 'Commerce', ${ADMIN}),
    (${sslc.id},    'General',  ${ADMIN})
  RETURNING *`);
const [science, commerce, general] = niosStreams;

const niosSubjects = rows(await sql`
  INSERT INTO nios_subjects (name, subject_code, created_by) VALUES
    ('Physics',          '312', ${ADMIN}),
    ('Chemistry',        '313', ${ADMIN}),
    ('Accountancy',      '320', ${ADMIN}),
    ('Business Studies', '319', ${ADMIN}),
    ('Mathematics (+2)', '311', ${ADMIN}),
    ('Social Science',   '213', ${ADMIN})
  RETURNING *`);
const [physics, chemistry, accountancy, business, maths, social] = niosSubjects;

// Mathematics (+2) is placed in BOTH streams — the NIOS common subject.
await sql`
  INSERT INTO nios_stream_subjects (nios_stream_id, nios_subject_id) VALUES
    (${science.id},  ${physics.id}),
    (${science.id},  ${chemistry.id}),
    (${science.id},  ${maths.id}),
    (${commerce.id}, ${accountancy.id}),
    (${commerce.id}, ${business.id}),
    (${commerce.id}, ${maths.id}),
    (${general.id},  ${social.id})`;

const niosChapters = rows(await sql`
  INSERT INTO nios_chapters (nios_subject_id, title, chapter_order, created_by) VALUES
    (${physics.id},     'Motion in a Straight Line', 1, ${ADMIN}),
    (${physics.id},     'Laws of Motion',            2, ${ADMIN}),
    (${chemistry.id},   'Atomic Structure',          1, ${ADMIN}),
    (${chemistry.id},   'Chemical Bonding',          2, ${ADMIN}),
    (${accountancy.id}, 'Basics of Accounting',      1, ${ADMIN}),
    (${accountancy.id}, 'Partnership Accounts',      2, ${ADMIN}),
    (${business.id},    'Nature of Business',        1, ${ADMIN}),
    (${maths.id},       'Sets & Functions',          1, ${ADMIN}),
    (${maths.id},       'Calculus',                  2, ${ADMIN}),
    (${social.id},      'Nationalism in India',      1, ${ADMIN})
  RETURNING *`);
const chapterOf = (subjectId, order) =>
  niosChapters.find((c) => c.nios_subject_id === subjectId && c.chapter_order === order);

await sql`
  INSERT INTO nios_chapter_recordings (nios_chapter_id, is_recorded, faculty_id, recording_date, recording_duration, editing_status, upload_youtube, upload_youtube_link, youtube_privacy, created_by) VALUES
    (${chapterOf(physics.id, 1).id}, true, ${anil.id},   ${day(-18)}, '1h',  'edited',     true,  'https://youtu.be/nios-phy-1', 'unlisted', ${ADMIN}),
    (${chapterOf(maths.id, 1).id},   true, ${suresh.id}, ${day(-11)}, '55m', 'not_edited', false, null, null, ${ADMIN})`;

const niosBatches = rows(await sql`
  INSERT INTO nios_batches (nios_university_id, nios_stream_id, name, year, created_by) VALUES
    (${plusTwo.id}, ${science.id},  'NIOS +2 2026 Science',  '2026', ${ADMIN}),
    (${plusTwo.id}, ${commerce.id}, 'NIOS +2 2026 Commerce', '2026', ${ADMIN}),
    (${sslc.id},    ${general.id},  'NIOS SSLC 2026',        '2026', ${ADMIN})
  RETURNING *`);
const [sciBatch, comBatch, sslcBatch] = niosBatches;

const niosClasses = rows(await sql`
  INSERT INTO nios_class_entries (date, start_time, end_time, total_hours, faculty_id, nios_batch_id, nios_subject_id, nios_chapter_id, class_mode, platform_used, class_status, payment_status, created_by) VALUES
    (${day(-6)}, '09:00', '10:00', 1, ${anil.id},   ${sciBatch.id},  ${physics.id},     ${chapterOf(physics.id, 1).id},     'online',  'Google Meet', 'taken',     'paid',    ${ADMIN}),
    (${day(-4)}, '10:00', '11:00', 1, ${anil.id},   ${sciBatch.id},  ${chemistry.id},   ${chapterOf(chemistry.id, 1).id},   'online',  'Google Meet', 'taken',     'pending', ${ADMIN}),
    (${day(-2)}, '11:00', '12:00', 1, ${divya.id},  ${comBatch.id},  ${accountancy.id}, ${chapterOf(accountancy.id, 1).id}, 'offline', 'Room 101',    'taken',     'pending', ${ADMIN}),
    (${day(3)},  '09:00', '10:00', 1, ${suresh.id}, ${sslcBatch.id}, ${social.id},      ${chapterOf(social.id, 1).id},      'online',  'Zoom',        'scheduled', 'pending', ${ADMIN})
  RETURNING *`);

await sql`
  INSERT INTO nios_class_chapters (nios_class_entry_id, nios_chapter_id) VALUES
    (${niosClasses[0].id}, ${chapterOf(physics.id, 1).id}),
    (${niosClasses[1].id}, ${chapterOf(chemistry.id, 1).id}),
    (${niosClasses[2].id}, ${chapterOf(accountancy.id, 1).id}),
    (${niosClasses[3].id}, ${chapterOf(social.id, 1).id})`;

// A common-subject class: one Mathematics (+2) session fanned out across the
// Science and Commerce batches, tied together by nios_class_group_id.
const shared = rows(await sql`
  INSERT INTO nios_class_entries (date, start_time, end_time, total_hours, faculty_id, nios_batch_id, nios_subject_id, nios_chapter_id, class_mode, platform_used, class_status, payment_status, created_by) VALUES
    (${day(5)}, '15:00', '16:00', 1, ${suresh.id}, ${sciBatch.id}, ${maths.id}, ${chapterOf(maths.id, 1).id}, 'online', 'Zoom', 'scheduled', 'pending', ${ADMIN}),
    (${day(5)}, '15:00', '16:00', 1, ${suresh.id}, ${comBatch.id}, ${maths.id}, ${chapterOf(maths.id, 1).id}, 'online', 'Zoom', 'scheduled', 'pending', ${ADMIN})
  RETURNING *`);
await sql`UPDATE nios_class_entries SET nios_class_group_id = ${shared[0].id} WHERE id = ANY(${shared.map((r) => r.id)})`;
await sql`
  INSERT INTO nios_class_chapters (nios_class_entry_id, nios_chapter_id) VALUES
    (${shared[0].id}, ${chapterOf(maths.id, 1).id}),
    (${shared[1].id}, ${chapterOf(maths.id, 1).id})`;

const counts = one(await sql`SELECT
  (SELECT count(*) FROM universities) universities,
  (SELECT count(*) FROM streams) streams,
  (SELECT count(*) FROM batches) batches,
  (SELECT count(*) FROM subjects) subjects,
  (SELECT count(*) FROM chapters) chapters,
  (SELECT count(*) FROM class_entries) classes,
  (SELECT count(*) FROM faculty) faculty,
  (SELECT count(*) FROM nios_streams) nios_streams,
  (SELECT count(*) FROM nios_subjects) nios_subjects,
  (SELECT count(*) FROM nios_stream_subjects) nios_placements,
  (SELECT count(*) FROM nios_chapters) nios_chapters,
  (SELECT count(*) FROM nios_batches) nios_batches,
  (SELECT count(*) FROM nios_class_entries) nios_classes`);

console.log('Done. Row counts:', counts);
process.exit(0);
