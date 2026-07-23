import 'dotenv/config';
import { sql, pool } from './db.js';

// ─────────────────────────────────────────────────────────────────────────────
// Sample data for the shared-syllabus / chapter-recording model.
//
// Shape of the world it builds:
//   • IGNOU university with two streams (B.Com with semesters, BA English with
//     direct subjects) — the syllabus is defined ONCE per stream.
//   • Several batches per stream that all inherit that one syllabus.
//   • Chapter recordings marked on the shared chapters (partial progress, with
//     YouTube / Drive links) — every batch sees them.
//   • A handful of scheduled/taken class sessions.
//   • The NIOS side mirrored: subjects + chapters under each NIOS university,
//     recordings, batches, and a couple of classes.
//
// Safe to re-run: it wipes the sample tables first (NIOS universities are kept —
// the server re-seeds those on boot). Pass nothing; just `node seed-sample.js`.
// ─────────────────────────────────────────────────────────────────────────────

const admin = (await sql`SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1`)[0];
if (!admin) {
  console.error('No admin user found — run `node seed.js` first.');
  process.exit(1);
}
const ADMIN = admin.id;

console.log('Clearing existing sample data…');
await sql`TRUNCATE
  chapter_recordings, learning_resources, chapters, academic_year_subjects, semesters, academic_years,
  timetable_slots, timetables, class_entries,
  faculty_batches, faculty_subjects, faculty_universities,
  subjects, batches, streams, faculty, universities,
  nios_chapter_recordings, nios_resources, nios_class_chapters, nios_timetable_slot_chapters,
  nios_class_entries, nios_timetable_slots, nios_timetables, nios_chapters,
  nios_university_subjects, nios_batches, nios_subjects
  RESTART IDENTITY CASCADE`;

// ── helpers ──────────────────────────────────────────────────────────────────

const one = async (rows) => rows[0];

async function addFaculty(name, email, phone, payType, rate) {
  return one(await sql`
    INSERT INTO faculty (name, email, phone, payment_type, hourly_rate)
    VALUES (${name}, ${email}, ${phone}, ${payType}, ${rate})
    RETURNING *`);
}

async function addUniversity(name, code) {
  return one(await sql`INSERT INTO universities (name, short_code) VALUES (${name}, ${code}) RETURNING *`);
}

async function addStream(name, universityId) {
  return one(await sql`INSERT INTO streams (name, university_id) VALUES (${name}, ${universityId}) RETURNING *`);
}

async function addSubject(name, code, universityId, streamId) {
  return one(await sql`
    INSERT INTO subjects (name, subject_code, university_id, stream_id)
    VALUES (${name}, ${code}, ${universityId}, ${streamId}) RETURNING *`);
}

async function addYear(streamId, name, order) {
  return one(await sql`
    INSERT INTO academic_years (stream_id, name, year_order)
    VALUES (${streamId}, ${name}, ${order}) RETURNING *`);
}

async function addSemester(yearId, name, order) {
  return one(await sql`
    INSERT INTO semesters (academic_year_id, name, semester_order)
    VALUES (${yearId}, ${name}, ${order}) RETURNING *`);
}

async function assignSubject(yearId, subjectId, semesterId) {
  return one(await sql`
    INSERT INTO academic_year_subjects (academic_year_id, subject_id, semester_id)
    VALUES (${yearId}, ${subjectId}, ${semesterId})
    ON CONFLICT (academic_year_id, subject_id) DO NOTHING RETURNING *`);
}

async function addChapter(aysId, title, order) {
  return one(await sql`
    INSERT INTO chapters (academic_year_subject_id, title, chapter_order, created_by)
    VALUES (${aysId}, ${title}, ${order}, ${ADMIN}) RETURNING *`);
}

// rec: { fac, date, dur, yt, gd, edited } — marks the shared chapter recorded
async function recordChapter(chapterId, rec) {
  await sql`
    INSERT INTO chapter_recordings (
      chapter_id, is_recorded, faculty_id, recording_date, recording_duration,
      editing_status, backup_available,
      upload_youtube, upload_youtube_link, youtube_privacy,
      upload_gdrive, upload_gdrive_link, created_by
    ) VALUES (
      ${chapterId}, true, ${rec.fac || null}, ${rec.date || null}, ${rec.dur || null},
      ${rec.edited ? 'edited' : 'not_edited'}, true,
      ${!!rec.yt}, ${rec.yt || null}, ${rec.yt ? 'unlisted' : null},
      ${!!rec.gd}, ${rec.gd || null}, ${ADMIN}
    )`;
}

async function addBatch(name, universityId, streamId) {
  return one(await sql`
    INSERT INTO batches (name, university_id, stream_id)
    VALUES (${name}, ${universityId}, ${streamId}) RETURNING *`);
}

function hours(start, end) {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  return ((eh * 60 + em - sh * 60 - sm) / 60).toFixed(2);
}

async function addClass(c) {
  return one(await sql`
    INSERT INTO class_entries (
      date, start_time, end_time, total_hours, faculty_id, subject_id, university_id,
      batch_id, stream_id, academic_year_id, semester_id, chapter_id,
      class_mode, platform_used, class_status, payment_status, created_by
    ) VALUES (
      ${c.date}, ${c.start}, ${c.end}, ${hours(c.start, c.end)}, ${c.fac}, ${c.subject},
      ${c.university}, ${c.batch}, ${c.stream}, ${c.year}, ${c.sem || null}, ${c.chapter},
      ${c.mode}, ${c.platform || null}, ${c.status}, ${c.payment || 'pending'}, ${ADMIN}
    ) RETURNING *`);
}

// ── faculty ──────────────────────────────────────────────────────────────────

console.log('Seeding faculty…');
const facAnjali = await addFaculty('Dr. Anjali Menon', 'anjali.menon@eddream.in', '98470-11111', 'hourly', 1200);
const facRajesh = await addFaculty('Prof. Rajesh Kumar', 'rajesh.kumar@eddream.in', '98470-22222', 'hourly', 1000);
const facSneha  = await addFaculty('Ms. Sneha Pillai', 'sneha.pillai@eddream.in', '98470-33333', 'fixed', null);
const facVinod  = await addFaculty('Mr. Vinod Nair', 'vinod.nair@eddream.in', '98470-44444', 'hourly', 900);

// ── IGNOU ────────────────────────────────────────────────────────────────────

console.log('Seeding IGNOU university, streams & shared syllabus…');
const ignou = await addUniversity('IGNOU', 'IGNOU');

// Chapter definitions per subject. `rec` (optional) marks it recorded.
// Only some chapters are recorded — realistic partial progress.
const bcomSubjects = {
  'Financial Accounting': {
    code: 'BCOM-101', fac: facAnjali.id,
    chapters: [
      { t: 'Introduction to Accounting', rec: { dur: '1h 15m', edited: true, yt: 'https://youtu.be/fa-ch1', gd: 'https://drive.google.com/fa-ch1' } },
      { t: 'Journal & Ledger',            rec: { dur: '1h 30m', edited: true, yt: 'https://youtu.be/fa-ch2', gd: 'https://drive.google.com/fa-ch2' } },
      { t: 'Trial Balance',               rec: { dur: '55m', yt: 'https://youtu.be/fa-ch3' } },
      { t: 'Final Accounts' },
      { t: 'Depreciation Accounting' },
    ],
  },
  'Business Organisation & Management': {
    code: 'BCOM-102', fac: facVinod.id,
    chapters: [
      { t: 'Nature & Scope of Business', rec: { dur: '1h', yt: 'https://youtu.be/bom-ch1' } },
      { t: 'Forms of Business Organisation', rec: { dur: '1h 10m', edited: true, yt: 'https://youtu.be/bom-ch2', gd: 'https://drive.google.com/bom-ch2' } },
      { t: 'Functions of Management' },
      { t: 'Organising & Staffing' },
    ],
  },
  'Business Economics': {
    code: 'BCOM-103', fac: facRajesh.id,
    chapters: [
      { t: 'Demand & Supply', rec: { dur: '1h 20m', edited: true, yt: 'https://youtu.be/be-ch1', gd: 'https://drive.google.com/be-ch1' } },
      { t: 'Elasticity of Demand', rec: { dur: '1h', yt: 'https://youtu.be/be-ch2' } },
      { t: 'Theory of Production' },
      { t: 'Market Structures' },
    ],
  },
  'Business Mathematics': {
    code: 'BCOM-104', fac: facRajesh.id,
    chapters: [
      { t: 'Ratio & Proportion', rec: { dur: '50m', yt: 'https://youtu.be/bm-ch1' } },
      { t: 'Matrices & Determinants' },
      { t: 'Differentiation' },
      { t: 'Interest & Annuities' },
    ],
  },
  'Corporate Accounting': {
    code: 'BCOM-201', fac: facAnjali.id,
    chapters: [
      { t: 'Issue of Shares', rec: { dur: '1h 25m', edited: true, yt: 'https://youtu.be/ca-ch1', gd: 'https://drive.google.com/ca-ch1' } },
      { t: 'Issue of Debentures', rec: { dur: '1h 05m', yt: 'https://youtu.be/ca-ch2' } },
      { t: 'Company Final Accounts' },
      { t: 'Amalgamation & Absorption' },
    ],
  },
  'Cost Accounting': {
    code: 'BCOM-202', fac: facAnjali.id,
    chapters: [
      { t: 'Introduction to Costing', rec: { dur: '1h', yt: 'https://youtu.be/cost-ch1' } },
      { t: 'Material Cost' },
      { t: 'Labour Cost' },
      { t: 'Overheads' },
    ],
  },
};

const baSubjects = {
  'British Poetry': {
    code: 'BAEG-101', fac: facSneha.id,
    chapters: [
      { t: 'The Elizabethan Age', rec: { dur: '1h', edited: true, yt: 'https://youtu.be/bp-ch1', gd: 'https://drive.google.com/bp-ch1' } },
      { t: 'The Metaphysical Poets', rec: { dur: '55m', yt: 'https://youtu.be/bp-ch2' } },
      { t: 'Romantic Poetry' },
      { t: 'Victorian Poetry' },
    ],
  },
  'Indian Writing in English': {
    code: 'BAEG-102', fac: facSneha.id,
    chapters: [
      { t: 'Introduction to Indian Writing', rec: { dur: '45m', yt: 'https://youtu.be/iwe-ch1' } },
      { t: 'Poetry: Tagore & Naidu' },
      { t: 'The Indian Novel' },
      { t: 'Post-colonial Themes' },
    ],
  },
  'Literary Criticism': {
    code: 'BAEG-201', fac: facSneha.id,
    chapters: [
      { t: 'Classical Criticism' },
      { t: 'Practical Criticism' },
      { t: 'Modern Literary Theories' },
    ],
  },
};

// Remember chapter ids so we can attach class sessions later.
const chapterId = {}; // key: `${subjectName}|${chapterTitle}`
const subjectId = {}; // key: subjectName

async function buildSubjectChapters(aysId, subjectName, def) {
  let n = 1;
  for (const ch of def.chapters) {
    const c = await addChapter(aysId, ch.t, n++);
    chapterId[`${subjectName}|${ch.t}`] = c.id;
    if (ch.rec) await recordChapter(c.id, { fac: def.fac, date: '2026-06-20', ...ch.rec });
  }
}

// ---- B.Com stream (with semesters) ----
const bcom = await addStream('B.Com', ignou.id);
for (const [name, def] of Object.entries(bcomSubjects)) {
  subjectId[name] = (await addSubject(name, def.code, ignou.id, bcom.id)).id;
}
const bcomYear1 = await addYear(bcom.id, 'First Year', 1);
const bcomYear2 = await addYear(bcom.id, 'Second Year', 2);
const bcomS1 = await addSemester(bcomYear1.id, 'Semester 1', 1);
const bcomS2 = await addSemester(bcomYear1.id, 'Semester 2', 2);
const bcomS3 = await addSemester(bcomYear2.id, 'Semester 3', 3);

const bcomLayout = [
  { year: bcomYear1, sem: bcomS1, subjects: ['Financial Accounting', 'Business Organisation & Management'] },
  { year: bcomYear1, sem: bcomS2, subjects: ['Business Economics', 'Business Mathematics'] },
  { year: bcomYear2, sem: bcomS3, subjects: ['Corporate Accounting', 'Cost Accounting'] },
];
const aysBcom = {}; // key: subjectName -> ays id
for (const row of bcomLayout) {
  for (const sname of row.subjects) {
    const ays = await assignSubject(row.year.id, subjectId[sname], row.sem.id);
    aysBcom[sname] = ays.id;
    await buildSubjectChapters(ays.id, sname, bcomSubjects[sname]);
  }
}

// ---- BA English stream (direct subjects, no semesters) ----
const baeng = await addStream('BA English', ignou.id);
for (const [name, def] of Object.entries(baSubjects)) {
  subjectId[name] = (await addSubject(name, def.code, ignou.id, baeng.id)).id;
}
const baYear1 = await addYear(baeng.id, 'First Year', 1);
const baYear2 = await addYear(baeng.id, 'Second Year', 2);
const baLayout = [
  { year: baYear1, subjects: ['British Poetry', 'Indian Writing in English'] },
  { year: baYear2, subjects: ['Literary Criticism'] },
];
for (const row of baLayout) {
  for (const sname of row.subjects) {
    const ays = await assignSubject(row.year.id, subjectId[sname], null);
    await buildSubjectChapters(ays.id, sname, baSubjects[sname]);
  }
}

// ── batches (all inherit the shared stream syllabus) ─────────────────────────

console.log('Seeding batches…');
const bcom2324 = await addBatch('B.Com 2023–2026', ignou.id, bcom.id);
const bcom2427 = await addBatch('B.Com 2024–2027', ignou.id, bcom.id);
const bcom2629 = await addBatch('B.Com 2026–2029', ignou.id, bcom.id);
const ba2427   = await addBatch('BA English 2024–2027', ignou.id, baeng.id);

// ── a few class sessions for the B.Com 2024–2027 batch (Year 2 / Sem 3) ──────

console.log('Seeding class sessions…');
const caCh = (t) => chapterId[`Corporate Accounting|${t}`];
const classes = [
  { date: '2026-07-06', start: '09:30', end: '11:00', chapter: caCh('Issue of Shares'),        status: 'taken',     payment: 'paid' },
  { date: '2026-07-08', start: '09:30', end: '11:00', chapter: caCh('Issue of Debentures'),    status: 'taken',     payment: 'paid' },
  { date: '2026-07-13', start: '09:30', end: '11:00', chapter: caCh('Company Final Accounts'), status: 'taken',     payment: 'pending' },
  { date: '2026-07-15', start: '09:30', end: '11:00', chapter: caCh('Amalgamation & Absorption'), status: 'scheduled' },
  { date: '2026-07-20', start: '09:30', end: '11:00', chapter: caCh('Issue of Shares'),        status: 'scheduled' },
];
for (const cl of classes) {
  await addClass({
    ...cl, fac: facAnjali.id, subject: subjectId['Corporate Accounting'],
    university: ignou.id, batch: bcom2427.id, stream: bcom.id,
    year: bcomYear2.id, sem: bcomS3.id, mode: 'online', platform: 'Zoom',
  });
}

// ── NIOS ─────────────────────────────────────────────────────────────────────

console.log('Seeding NIOS subjects, syllabus, recordings, batches & classes…');
const niosUnis = await sql`SELECT id, name FROM nios_universities ORDER BY id`;
const niosPlusTwo = niosUnis.find((u) => u.name === 'NIOS +2');
const niosSSLC    = niosUnis.find((u) => u.name === 'NIOS SSLC');

async function addNiosSubject(name, code) {
  return one(await sql`INSERT INTO nios_subjects (name, subject_code, created_by) VALUES (${name}, ${code}, ${ADMIN}) RETURNING *`);
}
async function assignNiosSubject(uniId, subjectId) {
  return one(await sql`
    INSERT INTO nios_university_subjects (nios_university_id, nios_subject_id)
    VALUES (${uniId}, ${subjectId}) ON CONFLICT DO NOTHING RETURNING *`);
}
async function addNiosChapter(usId, title, order) {
  return one(await sql`
    INSERT INTO nios_chapters (nios_university_subject_id, title, chapter_order, created_by)
    VALUES (${usId}, ${title}, ${order}, ${ADMIN}) RETURNING *`);
}
async function recordNiosChapter(chapterId, rec) {
  await sql`
    INSERT INTO nios_chapter_recordings (
      nios_chapter_id, is_recorded, faculty_id, recording_date, recording_duration,
      editing_status, backup_available, upload_youtube, upload_youtube_link, youtube_privacy, created_by
    ) VALUES (
      ${chapterId}, true, ${rec.fac || null}, ${rec.date || null}, ${rec.dur || null},
      ${rec.edited ? 'edited' : 'not_edited'}, true, ${!!rec.yt}, ${rec.yt || null}, ${rec.yt ? 'unlisted' : null}, ${ADMIN}
    )`;
}
async function addNiosBatch(uniId, name, year) {
  return one(await sql`
    INSERT INTO nios_batches (nios_university_id, name, year, created_by)
    VALUES (${uniId}, ${name}, ${year}, ${ADMIN}) RETURNING *`);
}

const niosDefs = [
  { uni: niosPlusTwo, subjects: {
    'Physics':          { code: '312', fac: facRajesh.id, chapters: [
      { t: 'Motion in a Straight Line', rec: { dur: '1h', yt: 'https://youtu.be/phy-1' } },
      { t: 'Laws of Motion', rec: { dur: '1h 05m', edited: true, yt: 'https://youtu.be/phy-2' } },
      { t: 'Work, Energy & Power' },
      { t: 'Gravitation' },
    ] },
    'Chemistry':        { code: '313', fac: facRajesh.id, chapters: [
      { t: 'Atomic Structure', rec: { dur: '55m', yt: 'https://youtu.be/chem-1' } },
      { t: 'Chemical Bonding' },
      { t: 'States of Matter' },
    ] },
    'Accountancy':      { code: '320', fac: facAnjali.id, chapters: [
      { t: 'Basics of Accounting', rec: { dur: '1h', edited: true, yt: 'https://youtu.be/acc-1' } },
      { t: 'Journal & Ledger' },
      { t: 'Financial Statements' },
    ] },
  } },
  { uni: niosSSLC, subjects: {
    'Mathematics':      { code: '211', fac: facRajesh.id, chapters: [
      { t: 'Real Numbers', rec: { dur: '50m', yt: 'https://youtu.be/math-1' } },
      { t: 'Polynomials', rec: { dur: '55m', yt: 'https://youtu.be/math-2' } },
      { t: 'Linear Equations' },
      { t: 'Trigonometry' },
    ] },
    'Science & Technology': { code: '212', fac: facRajesh.id, chapters: [
      { t: 'Life Processes', rec: { dur: '1h', yt: 'https://youtu.be/sci-1' } },
      { t: 'Electricity' },
      { t: 'Chemical Reactions' },
    ] },
    'Social Science':   { code: '213', fac: facVinod.id, chapters: [
      { t: 'Nationalism in India' },
      { t: 'Resources & Development' },
    ] },
  } },
];

const niosChapterId = {}; // key `${subjectName}|${chapterTitle}`
for (const group of niosDefs) {
  for (const [sname, def] of Object.entries(group.subjects)) {
    const subj = await addNiosSubject(sname, def.code);
    const us = await assignNiosSubject(group.uni.id, subj.id);
    let n = 1;
    for (const ch of def.chapters) {
      const c = await addNiosChapter(us.id, ch.t, n++);
      niosChapterId[`${sname}|${ch.t}`] = c.id;
      if (ch.rec) await recordNiosChapter(c.id, { fac: def.fac, date: '2026-06-15', ...ch.rec });
    }
  }
}

const niosBatchSci = await addNiosBatch(niosPlusTwo.id, 'NIOS +2 2025 — Science', '2025');
await addNiosBatch(niosPlusTwo.id, 'NIOS +2 2026 — Commerce', '2026');
await addNiosBatch(niosSSLC.id, 'NIOS SSLC 2026', '2026');

// a couple of NIOS classes for the Science batch, each linked to a chapter
async function addNiosClass(c) {
  const entry = one(await sql`
    INSERT INTO nios_class_entries (date, start_time, end_time, total_hours, faculty_id, nios_batch_id, nios_subject_id, nios_chapter_id, class_mode, platform_used, class_status, created_by)
    VALUES (${c.date}, ${c.start}, ${c.end}, ${hours(c.start, c.end)}, ${c.fac}, ${c.batch}, ${c.subject}, ${c.chapter}, ${c.mode}, ${c.platform || null}, ${c.status}, ${ADMIN})
    RETURNING *`);
  const e = await entry;
  await sql`INSERT INTO nios_class_chapters (nios_class_entry_id, nios_chapter_id) VALUES (${e.id}, ${c.chapter}) ON CONFLICT DO NOTHING`;
  return e;
}
const physicsSubjId = (await sql`SELECT id FROM nios_subjects WHERE name = 'Physics'`)[0].id;
await addNiosClass({ date: '2026-07-07', start: '16:00', end: '17:30', fac: facRajesh.id, batch: niosBatchSci.id, subject: physicsSubjId, chapter: niosChapterId['Physics|Motion in a Straight Line'], mode: 'online', platform: 'Google Meet', status: 'taken' });
await addNiosClass({ date: '2026-07-09', start: '16:00', end: '17:30', fac: facRajesh.id, batch: niosBatchSci.id, subject: physicsSubjId, chapter: niosChapterId['Physics|Laws of Motion'], mode: 'online', platform: 'Google Meet', status: 'taken' });

// ── summary ──────────────────────────────────────────────────────────────────

const counts = one(await sql`SELECT
  (SELECT count(*) FROM universities) universities,
  (SELECT count(*) FROM streams) streams,
  (SELECT count(*) FROM subjects) subjects,
  (SELECT count(*) FROM chapters) chapters,
  (SELECT count(*) FROM chapter_recordings) recordings,
  (SELECT count(*) FROM batches) batches,
  (SELECT count(*) FROM class_entries) classes,
  (SELECT count(*) FROM nios_subjects) nios_subjects,
  (SELECT count(*) FROM nios_chapters) nios_chapters,
  (SELECT count(*) FROM nios_chapter_recordings) nios_recordings,
  (SELECT count(*) FROM nios_batches) nios_batches`);
console.log('\nSample data seeded:');
console.table([await counts]);

await pool.end();
console.log('Done.');
process.exit(0);
