import 'dotenv/config';
import { sql, pool } from './db.js';
import { mondayOf, dayNameOf } from './lib/week.js';

// ─────────────────────────────────────────────────────────────────────────────
// Sample data for the shared-syllabus / chapter-recording model.
//
// Built to exercise every filter and report in the app, so it deliberately
// spreads data across the full range of each dimension:
//   • Two universities. Streams both WITH semesters (B.Com, BBA) and WITHOUT
//     (BA English, M.Com), so the "semester picker only when the year has
//     semesters" behaviour is testable both ways.
//   • Syllabus defined ONCE per stream; several batches per stream inherit it.
//   • Chapter recordings in every state: uploaded to each destination, recorded
//     but NOT uploaded (the "Pending Upload" stat), flagged not-recorded, and
//     no recording row at all.
//   • Hundreds of class sessions covering both class modes (online AND offline)
//     and all three statuses (taken / not_taken / scheduled), across many
//     faculty, subjects, batches, years and semesters, over a ~4 month window.
//   • Weekly timetables with slots for the current week.
//   • The NIOS side mirrored with the same variety.
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

// "Today" for deciding which classes are already taken vs still scheduled.
const TODAY = new Date().toISOString().slice(0, 10);

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

// ── helpers ──────────────────────────────────────────────────────────────────

const one = async (rows) => rows[0];

// Deterministic pseudo-random so re-runs produce the same data set.
let _seed = 42;
function rnd() {
  _seed = (_seed * 1103515245 + 12345) % 2147483648;
  return _seed / 2147483648;
}
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function hours(start, end) {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  return ((eh * 60 + em - sh * 60 - sm) / 60).toFixed(2);
}

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

async function addChapter(subjectId, title, order) {
  return one(await sql`
    INSERT INTO chapters (subject_id, title, chapter_order, created_by)
    VALUES (${subjectId}, ${title}, ${order}, ${ADMIN}) RETURNING *`);
}

async function addResource(chapterId, type, title, url) {
  await sql`
    INSERT INTO learning_resources (chapter_id, type, title, url, created_by)
    VALUES (${chapterId}, ${type}, ${title}, ${url}, ${ADMIN})`;
}

async function addBatch(name, universityId, streamId) {
  return one(await sql`
    INSERT INTO batches (name, university_id, stream_id)
    VALUES (${name}, ${universityId}, ${streamId}) RETURNING *`);
}

async function addClass(c) {
  return one(await sql`
    INSERT INTO class_entries (
      date, start_time, end_time, total_hours, faculty_id, subject_id, university_id,
      batch_id, stream_id, academic_year_id, semester_id, chapter_id,
      class_mode, platform_used, class_status, payment_status, notes, created_by
    ) VALUES (
      ${c.date}, ${c.start}, ${c.end}, ${hours(c.start, c.end)}, ${c.fac}, ${c.subject},
      ${c.university}, ${c.batch}, ${c.stream}, ${c.year}, ${c.sem || null}, ${c.chapter || null},
      ${c.mode}, ${c.platform || null}, ${c.status}, ${c.payment || 'pending'}, ${c.notes || null}, ${ADMIN}
    ) RETURNING *`);
}

// ── recording states ─────────────────────────────────────────────────────────
// Every chapter gets one of these, cycled, so each page has a healthy mix:
//   full     — recorded, edited, on YouTube + Drive + student app
//   yt       — recorded, YouTube only
//   gd       — recorded, Google Drive only
//   app      — recorded, student app only
//   hdd      — recorded, local hard disk only (no link, a location label)
//   pending  — recorded but on NO destination  → "Pending Upload"
//   flagged  — a recording row that says NOT recorded (edge case)
//   none     — no recording row at all
const REC_STATES = ['full', 'yt', 'gd', 'app', 'hdd', 'pending', 'none', 'yt', 'full', 'none', 'flagged', 'pending'];

async function recordChapter(chapterId, state, { fac, slug, date, dur }) {
  if (state === 'none') return;
  const base = {
    is_recorded: state !== 'flagged',
    faculty_id: fac,
    recording_date: date,
    file: `${slug}.mp4`,
    dur,
    edited: ['full', 'gd'].includes(state),
    yt: ['full', 'yt'].includes(state) ? `https://youtu.be/${slug}` : null,
    gd: ['full', 'gd'].includes(state) ? `https://drive.google.com/file/d/${slug}/view` : null,
    app: ['full', 'app'].includes(state) ? `https://app.eddream.in/lesson/${slug}` : null,
    hdd: state === 'hdd' ? 'Studio HDD-02 / 2026 / Q3' : null,
  };
  await sql`
    INSERT INTO chapter_recordings (
      chapter_id, is_recorded, faculty_id, recording_date, recording_file_name,
      recording_duration, notes, editing_status, backup_available, storage_location,
      upload_youtube, upload_youtube_link, youtube_privacy,
      upload_gdrive, upload_gdrive_link,
      upload_student_app, upload_student_app_link,
      upload_harddisk, upload_harddisk_location, created_by
    ) VALUES (
      ${chapterId}, ${base.is_recorded}, ${base.faculty_id}, ${base.recording_date}, ${base.file},
      ${base.dur}, ${state === 'pending' ? 'Awaiting upload — needs an intro cut.' : null},
      ${base.edited ? 'edited' : 'not_edited'}, ${state === 'full'}, ${'Studio NAS / ' + slug},
      ${!!base.yt}, ${base.yt}, ${base.yt ? 'unlisted' : null},
      ${!!base.gd}, ${base.gd},
      ${!!base.app}, ${base.app},
      ${!!base.hdd}, ${base.hdd}, ${ADMIN}
    )`;
}

// ── faculty ──────────────────────────────────────────────────────────────────

console.log('Seeding faculty…');
const FACULTY = [
  ['Dr. Anjali Menon',     'anjali.menon@eddream.in',    '9847011111', 'hourly', 1200],
  ['Prof. Rajesh Kumar',   'rajesh.kumar@eddream.in',    '9847022222', 'hourly', 1000],
  ['Ms. Sneha Pillai',     'sneha.pillai@eddream.in',    '9847033333', 'fixed',  null],
  ['Mr. Vinod Nair',       'vinod.nair@eddream.in',      '9847044444', 'hourly', 900],
  ['Dr. Fathima Rasheed',  'fathima.rasheed@eddream.in', '9847055555', 'hourly', 1350],
  ['Prof. George Mathew',  'george.mathew@eddream.in',   '9847066666', 'fixed',  null],
  ['Ms. Divya Krishnan',   'divya.krishnan@eddream.in',  '9847077777', 'hourly', 950],
  ['Mr. Arun Prakash',     'arun.prakash@eddream.in',    '9847088888', 'hourly', 1100],
  ['Dr. Meera Suresh',     'meera.suresh@eddream.in',    '9847099999', 'hourly', 1250],
  ['Mr. Tom Sebastian',    'tom.sebastian@eddream.in',   '9847010101', 'fixed',  null],
];
const fac = {};
for (const [name, email, phone, type, rate] of FACULTY) {
  const row = await addFaculty(name, email, phone, type, rate);
  fac[name.split(' ').slice(-1)[0]] = row.id; // key by surname
}

// ── syllabus definitions ─────────────────────────────────────────────────────
// A stream is: subjects (each with chapters), years, optional semesters, and a
// layout placing subjects into year/semester.

const chapters = (...titles) => titles;

const STREAMS = [
  {
    university: 'IGNOU', name: 'B.Com', semesters: true,
    years: [
      { name: 'First Year',  order: 1, sems: ['Semester 1', 'Semester 2'] },
      { name: 'Second Year', order: 2, sems: ['Semester 3', 'Semester 4'] },
      { name: 'Third Year',  order: 3, sems: ['Semester 5', 'Semester 6'] },
    ],
    subjects: [
      { name: 'Financial Accounting', code: 'BCOM-101', fac: 'Menon', year: 'First Year', sem: 'Semester 1',
        chapters: chapters('Introduction to Accounting', 'Journal & Ledger', 'Trial Balance', 'Final Accounts', 'Depreciation Accounting') },
      { name: 'Business Organisation & Management', code: 'BCOM-102', fac: 'Nair', year: 'First Year', sem: 'Semester 1',
        chapters: chapters('Nature & Scope of Business', 'Forms of Business Organisation', 'Functions of Management', 'Organising & Staffing') },
      { name: 'Business Economics', code: 'BCOM-103', fac: 'Kumar', year: 'First Year', sem: 'Semester 2',
        chapters: chapters('Demand & Supply', 'Elasticity of Demand', 'Theory of Production', 'Market Structures', 'National Income') },
      { name: 'Business Mathematics', code: 'BCOM-104', fac: 'Kumar', year: 'First Year', sem: 'Semester 2',
        chapters: chapters('Ratio & Proportion', 'Matrices & Determinants', 'Differentiation', 'Interest & Annuities') },
      { name: 'Corporate Accounting', code: 'BCOM-201', fac: 'Menon', year: 'Second Year', sem: 'Semester 3',
        chapters: chapters('Issue of Shares', 'Issue of Debentures', 'Company Final Accounts', 'Amalgamation & Absorption', 'Valuation of Goodwill') },
      { name: 'Cost Accounting', code: 'BCOM-202', fac: 'Menon', year: 'Second Year', sem: 'Semester 3',
        chapters: chapters('Introduction to Costing', 'Material Cost', 'Labour Cost', 'Overheads') },
      { name: 'Business Law', code: 'BCOM-203', fac: 'Mathew', year: 'Second Year', sem: 'Semester 4',
        chapters: chapters('Indian Contract Act', 'Sale of Goods Act', 'Negotiable Instruments', 'Consumer Protection') },
      { name: 'Income Tax Law & Practice', code: 'BCOM-204', fac: 'Prakash', year: 'Second Year', sem: 'Semester 4',
        chapters: chapters('Basic Concepts', 'Residential Status', 'Income from Salary', 'Income from House Property', 'Deductions & Rebates') },
      { name: 'Auditing', code: 'BCOM-301', fac: 'Suresh', year: 'Third Year', sem: 'Semester 5',
        chapters: chapters('Nature of Auditing', 'Internal Control', 'Vouching', 'Company Audit') },
      { name: 'Management Accounting', code: 'BCOM-302', fac: 'Menon', year: 'Third Year', sem: 'Semester 6',
        chapters: chapters('Ratio Analysis', 'Fund Flow Statement', 'Cash Flow Statement', 'Budgetary Control', 'Marginal Costing') },
    ],
    batches: ['B.Com 2023–2026', 'B.Com 2024–2027', 'B.Com 2025–2028', 'B.Com 2026–2029'],
  },
  {
    university: 'IGNOU', name: 'BA English', semesters: false,
    years: [
      { name: 'First Year',  order: 1 },
      { name: 'Second Year', order: 2 },
      { name: 'Third Year',  order: 3 },
    ],
    subjects: [
      { name: 'British Poetry', code: 'BAEG-101', fac: 'Pillai', year: 'First Year',
        chapters: chapters('The Elizabethan Age', 'The Metaphysical Poets', 'Romantic Poetry', 'Victorian Poetry') },
      { name: 'Indian Writing in English', code: 'BAEG-102', fac: 'Pillai', year: 'First Year',
        chapters: chapters('Introduction to Indian Writing', 'Poetry: Tagore & Naidu', 'The Indian Novel', 'Post-colonial Themes') },
      { name: 'British Drama', code: 'BAEG-201', fac: 'Sebastian', year: 'Second Year',
        chapters: chapters('Elizabethan Drama', 'Shakespearean Tragedy', 'Restoration Comedy', 'Modern Drama') },
      { name: 'Literary Criticism', code: 'BAEG-202', fac: 'Pillai', year: 'Second Year',
        chapters: chapters('Classical Criticism', 'Practical Criticism', 'Modern Literary Theories') },
      { name: 'American Literature', code: 'BAEG-301', fac: 'Sebastian', year: 'Third Year',
        chapters: chapters('Transcendentalism', 'The American Novel', 'Modern American Poetry', 'Drama & Identity') },
    ],
    batches: ['BA English 2024–2027', 'BA English 2025–2028'],
  },
  {
    university: 'Calicut University', name: 'BBA', semesters: true,
    years: [
      { name: 'First Year',  order: 1, sems: ['Semester 1', 'Semester 2'] },
      { name: 'Second Year', order: 2, sems: ['Semester 3', 'Semester 4'] },
    ],
    subjects: [
      { name: 'Principles of Management', code: 'BBA-101', fac: 'Nair', year: 'First Year', sem: 'Semester 1',
        chapters: chapters('Evolution of Management', 'Planning', 'Organising', 'Directing & Controlling') },
      { name: 'Business Communication', code: 'BBA-102', fac: 'Krishnan', year: 'First Year', sem: 'Semester 1',
        chapters: chapters('Communication Process', 'Business Correspondence', 'Report Writing', 'Presentation Skills') },
      { name: 'Financial Management', code: 'BBA-103', fac: 'Rasheed', year: 'First Year', sem: 'Semester 2',
        chapters: chapters('Time Value of Money', 'Capital Budgeting', 'Cost of Capital', 'Working Capital') },
      { name: 'Marketing Management', code: 'BBA-201', fac: 'Krishnan', year: 'Second Year', sem: 'Semester 3',
        chapters: chapters('Marketing Concepts', 'Consumer Behaviour', 'Product & Pricing', 'Promotion & Distribution') },
      { name: 'Human Resource Management', code: 'BBA-202', fac: 'Rasheed', year: 'Second Year', sem: 'Semester 3',
        chapters: chapters('HR Planning', 'Recruitment & Selection', 'Training & Development', 'Performance Appraisal') },
      { name: 'Operations Research', code: 'BBA-203', fac: 'Prakash', year: 'Second Year', sem: 'Semester 4',
        chapters: chapters('Linear Programming', 'Transportation Problem', 'Assignment Problem', 'Queuing Theory') },
    ],
    batches: ['BBA 2024–2027', 'BBA 2025–2028', 'BBA 2026–2029'],
  },
  {
    university: 'Calicut University', name: 'M.Com', semesters: false,
    years: [
      { name: 'First Year',  order: 1 },
      { name: 'Second Year', order: 2 },
    ],
    subjects: [
      { name: 'Advanced Corporate Accounting', code: 'MCOM-101', fac: 'Menon', year: 'First Year',
        chapters: chapters('Holding Company Accounts', 'Liquidation of Companies', 'Banking Company Accounts', 'Insurance Accounts') },
      { name: 'Quantitative Techniques', code: 'MCOM-102', fac: 'Prakash', year: 'First Year',
        chapters: chapters('Probability Distributions', 'Hypothesis Testing', 'Correlation & Regression', 'Time Series') },
      { name: 'Strategic Management', code: 'MCOM-201', fac: 'Mathew', year: 'Second Year',
        chapters: chapters('Strategy Formulation', 'Environmental Analysis', 'Corporate Strategy', 'Strategy Implementation') },
      { name: 'International Business', code: 'MCOM-202', fac: 'Suresh', year: 'Second Year',
        chapters: chapters('Globalisation', 'Trade Theories', 'Foreign Exchange', 'MNCs & FDI') },
    ],
    batches: ['M.Com 2025–2027', 'M.Com 2026–2028'],
  },
];

// ── build universities / streams / syllabus ──────────────────────────────────

console.log('Seeding universities, streams & shared syllabus…');
const uni = {};
uni['IGNOU'] = await addUniversity('IGNOU', 'IGNOU');
uni['Calicut University'] = await addUniversity('Calicut University', 'CU');

const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

let recCycle = 0;
const built = []; // { stream, university, years:{name:{row,sems:{name:row}}}, subjects:[{row,def,chapters:[ids]}] }

for (const def of STREAMS) {
  const u = uni[def.university];
  const stream = await addStream(def.name, u.id);

  // years + semesters
  const years = {};
  for (const y of def.years) {
    const yearRow = await addYear(stream.id, y.name, y.order);
    const sems = {};
    if (def.semesters && y.sems) {
      let so = (y.order - 1) * 2 + 1;
      for (const sname of y.sems) sems[sname] = await addSemester(yearRow.id, sname, so++);
    }
    years[y.name] = { row: yearRow, sems };
  }

  // subjects + chapters + recordings + resources
  const subjects = [];
  for (const s of def.subjects) {
    const subjRow = await addSubject(s.name, s.code, u.id, stream.id);
    const year = years[s.year];
    const sem = s.sem ? year.sems[s.sem] : null;
    await assignSubject(year.row.id, subjRow.id, sem ? sem.id : null);

    const chapterRows = [];
    let n = 1;
    for (const title of s.chapters) {
      const ch = await addChapter(subjRow.id, title, n);
      chapterRows.push(ch);
      const state = REC_STATES[recCycle++ % REC_STATES.length];
      await recordChapter(ch.id, state, {
        fac: fac[s.fac],
        slug: slugify(`${s.code}-${title}`),
        date: addDays('2026-05-01', (recCycle * 3) % 80),
        dur: pick(['45m', '50m', '55m', '1h', '1h 05m', '1h 15m', '1h 30m']),
      });
      // a couple of learning resources on the first chapters
      if (n === 1) {
        await addResource(ch.id, 'pdf', `${title} — Notes`, `https://files.eddream.in/${slugify(title)}.pdf`);
        await addResource(ch.id, 'question_paper', `${title} — Previous Paper`, `https://files.eddream.in/${slugify(title)}-qp.pdf`);
      }
      n++;
    }
    subjects.push({ row: subjRow, def: s, chapters: chapterRows, year, sem });
  }

  // batches
  const batches = [];
  for (const bname of def.batches) batches.push(await addBatch(bname, u.id, stream.id));

  built.push({ def, university: u, stream, years, subjects, batches });
}

// ── class sessions ───────────────────────────────────────────────────────────
// Spread over ~4 months around today, alternating mode and cycling faculty so
// every filter combination has rows behind it.

console.log('Seeding class sessions…');
const SLOTS = [
  ['09:30', '11:00'], ['11:15', '12:45'], ['14:00', '15:30'], ['16:00', '17:30'], ['18:00', '19:30'],
];
const PLATFORMS = ['Zoom', 'Google Meet', 'Microsoft Teams'];
const ROOMS = ['Room 101', 'Room 204', 'Seminar Hall', 'Lab 2'];
const START = '2026-06-01';

let classCount = 0;
let dayCursor = 0;

for (const b of built) {
  for (const batch of b.batches) {
    for (const subj of b.subjects) {
      // 6 sessions per subject per batch, one per chapter (wrapping if fewer).
      for (let i = 0; i < 6; i++) {
        const date = addDays(START, (dayCursor * 2) % 120);
        dayCursor++;
        const [start, end] = SLOTS[classCount % SLOTS.length];
        const online = classCount % 2 === 0;
        const past = date <= TODAY;
        // Past classes are mostly taken, with a realistic minority missed.
        const status = past ? (classCount % 7 === 0 ? 'not_taken' : 'taken') : 'scheduled';
        const chapter = subj.chapters[i % subj.chapters.length];

        await addClass({
          date, start, end,
          fac: fac[subj.def.fac],
          subject: subj.row.id,
          university: b.university.id,
          batch: batch.id,
          stream: b.stream.id,
          year: subj.year.row.id,
          sem: subj.sem ? subj.sem.id : null,
          chapter: chapter.id,
          mode: online ? 'online' : 'offline',
          platform: online ? pick(PLATFORMS) : pick(ROOMS),
          status,
          payment: status === 'taken' ? (classCount % 3 === 0 ? 'paid' : 'pending') : 'pending',
          notes: status === 'not_taken' ? 'Faculty on leave — to be rescheduled.' : null,
        });
        classCount++;
      }
    }
  }
}

// ── weekly timetables ────────────────────────────────────────────────────────

console.log('Seeding timetables…');
const thisMonday = mondayOf(TODAY);
let timetableCount = 0;
let slotCount = 0;

for (const b of built) {
  for (const batch of b.batches.slice(0, 2)) { // first two batches of each stream
    for (const weekOffset of [0, 7]) {
      const weekStart = addDays(thisMonday, weekOffset);
      const tt = await one(await sql`
        INSERT INTO timetables (name, university_id, batch_id, week_start_date, created_by)
        VALUES (${`Week of ${weekStart} – ${batch.name}`}, ${b.university.id}, ${batch.id}, ${weekStart}, ${ADMIN})
        RETURNING *`);
      timetableCount++;

      // Mon–Fri, one subject per day, cycling through the stream's subjects.
      for (let d = 0; d < 5; d++) {
        const subj = b.subjects[(d + weekOffset) % b.subjects.length];
        const [start, end] = SLOTS[d % SLOTS.length];
        const day = dayNameOf(addDays(weekStart, d));
        await sql`
          INSERT INTO timetable_slots (timetable_id, day_of_week, start_time, end_time, faculty_id, subject_id, class_taken_status)
          VALUES (${tt.id}, ${day}, ${start}, ${end}, ${fac[subj.def.fac]}, ${subj.row.id},
                  ${weekOffset === 0 && d < 3 ? 'taken' : 'scheduled'})`;
        slotCount++;
      }
    }
  }
}

// ── NIOS ─────────────────────────────────────────────────────────────────────

console.log('Seeding NIOS subjects, syllabus, recordings, batches & classes…');
const niosUnis = await sql`SELECT id, name FROM nios_universities ORDER BY id`;
const niosPlusTwo = niosUnis.find((u) => u.name === 'NIOS +2');
const niosSSLC    = niosUnis.find((u) => u.name === 'NIOS SSLC');

async function addNiosSubject(name, code) {
  return one(await sql`INSERT INTO nios_subjects (name, subject_code, created_by) VALUES (${name}, ${code}, ${ADMIN}) RETURNING *`);
}
async function addNiosStream(uniId, name) {
  return one(await sql`
    INSERT INTO nios_streams (nios_university_id, name, created_by)
    VALUES (${uniId}, ${name}, ${ADMIN}) ON CONFLICT DO NOTHING RETURNING *`);
}
async function assignNiosSubject(streamId, subjectId) {
  return one(await sql`
    INSERT INTO nios_stream_subjects (nios_stream_id, nios_subject_id)
    VALUES (${streamId}, ${subjectId}) ON CONFLICT DO NOTHING RETURNING *`);
}
async function addNiosChapter(subjectId, title, order) {
  return one(await sql`
    INSERT INTO nios_chapters (nios_subject_id, title, chapter_order, created_by)
    VALUES (${subjectId}, ${title}, ${order}, ${ADMIN}) RETURNING *`);
}
async function recordNiosChapter(chapterId, state, { fac: f, slug, date, dur }) {
  if (state === 'none') return;
  const yt  = ['full', 'yt'].includes(state) ? `https://youtu.be/${slug}` : null;
  const gd  = ['full', 'gd'].includes(state) ? `https://drive.google.com/file/d/${slug}/view` : null;
  const app = ['full', 'app'].includes(state) ? `https://app.eddream.in/lesson/${slug}` : null;
  const hdd = state === 'hdd' ? 'Studio HDD-03 / NIOS' : null;
  await sql`
    INSERT INTO nios_chapter_recordings (
      nios_chapter_id, is_recorded, faculty_id, recording_date, recording_file_name,
      recording_duration, notes, editing_status, backup_available, storage_location,
      upload_youtube, upload_youtube_link, youtube_privacy,
      upload_gdrive, upload_gdrive_link,
      upload_student_app, upload_student_app_link,
      upload_harddisk, upload_harddisk_location, created_by
    ) VALUES (
      ${chapterId}, ${state !== 'flagged'}, ${f}, ${date}, ${`${slug}.mp4`},
      ${dur}, ${state === 'pending' ? 'Awaiting upload.' : null},
      ${['full', 'gd'].includes(state) ? 'edited' : 'not_edited'}, ${state === 'full'}, ${'Studio NAS / ' + slug},
      ${!!yt}, ${yt}, ${yt ? 'unlisted' : null},
      ${!!gd}, ${gd},
      ${!!app}, ${app},
      ${!!hdd}, ${hdd}, ${ADMIN}
    )`;
}
async function addNiosBatch(stream, name, year) {
  return one(await sql`
    INSERT INTO nios_batches (nios_university_id, nios_stream_id, name, year, created_by)
    VALUES (${stream.nios_university_id}, ${stream.id}, ${name}, ${year}, ${ADMIN}) RETURNING *`);
}

// `streams` lists which of the university's streams carry each subject. A
// subject named in two streams (Mathematics (+2), English) is a common subject:
// one chapter list and one set of recordings, shared by both.
const NIOS = [
  { uni: niosPlusTwo, streams: ['Science', 'Commerce'], subjects: [
    { name: 'Physics', code: '312', fac: 'Kumar', streams: ['Science'], chapters: chapters('Motion in a Straight Line', 'Laws of Motion', 'Work, Energy & Power', 'Gravitation', 'Thermodynamics') },
    { name: 'Chemistry', code: '313', fac: 'Kumar', streams: ['Science'], chapters: chapters('Atomic Structure', 'Chemical Bonding', 'States of Matter', 'Chemical Kinetics') },
    { name: 'Biology', code: '314', fac: 'Suresh', streams: ['Science'], chapters: chapters('The Living World', 'Cell Structure', 'Plant Physiology', 'Human Physiology') },
    { name: 'Mathematics (+2)', code: '311', fac: 'Prakash', streams: ['Science', 'Commerce'], chapters: chapters('Sets & Functions', 'Trigonometric Functions', 'Calculus', 'Vectors', 'Probability') },
    { name: 'Accountancy', code: '320', fac: 'Menon', streams: ['Commerce'], chapters: chapters('Basics of Accounting', 'Journal & Ledger', 'Financial Statements', 'Partnership Accounts') },
    { name: 'Business Studies', code: '319', fac: 'Nair', streams: ['Commerce'], chapters: chapters('Nature of Business', 'Forms of Organisation', 'Management Principles', 'Marketing') },
  ] },
  { uni: niosSSLC, streams: ['General'], subjects: [
    { name: 'Mathematics', code: '211', fac: 'Prakash', streams: ['General'], chapters: chapters('Real Numbers', 'Polynomials', 'Linear Equations', 'Trigonometry', 'Statistics') },
    { name: 'Science & Technology', code: '212', fac: 'Suresh', streams: ['General'], chapters: chapters('Life Processes', 'Electricity', 'Chemical Reactions', 'Light & Reflection') },
    { name: 'Social Science', code: '213', fac: 'Nair', streams: ['General'], chapters: chapters('Nationalism in India', 'Resources & Development', 'Democratic Politics', 'Money & Credit') },
    { name: 'English', code: '202', fac: 'Pillai', streams: ['General'], chapters: chapters('Reading Comprehension', 'Grammar in Use', 'Writing Skills', 'Literature Reader') },
    { name: 'Hindi', code: '201', fac: 'Sebastian', streams: ['General'], chapters: chapters('गद्य खंड', 'पद्य खंड', 'व्याकरण', 'रचना') },
  ] },
];

let niosRecCycle = 0;
const niosBuilt = [];
for (const group of NIOS) {
  const streamsByName = {};
  for (const name of group.streams) {
    streamsByName[name] = await addNiosStream(group.uni.id, name);
  }
  const subjects = [];
  for (const s of group.subjects) {
    const subj = await addNiosSubject(s.name, s.code);
    for (const streamName of s.streams) {
      await assignNiosSubject(streamsByName[streamName].id, subj.id);
    }
    const chapterRows = [];
    let n = 1;
    for (const title of s.chapters) {
      const ch = await addNiosChapter(subj.id, title, n++);
      chapterRows.push(ch);
      const state = REC_STATES[niosRecCycle++ % REC_STATES.length];
      await recordNiosChapter(ch.id, state, {
        fac: fac[s.fac],
        slug: slugify(`nios-${s.code}-${title}`) || `nios-${s.code}-${n}`,
        date: addDays('2026-05-10', (niosRecCycle * 4) % 70),
        dur: pick(['45m', '55m', '1h', '1h 10m', '1h 20m']),
      });
    }
    subjects.push({ row: subj, def: s, chapters: chapterRows });
  }
  niosBuilt.push({ uni: group.uni, streamsByName, subjects });
}

const niosStreamOf = (uni, name) => niosBuilt.find((g) => g.uni.id === uni.id).streamsByName[name];

const niosBatches = [];
niosBatches.push(await addNiosBatch(niosStreamOf(niosPlusTwo, 'Science'),  'NIOS +2 2025', '2025'));
niosBatches.push(await addNiosBatch(niosStreamOf(niosPlusTwo, 'Science'),  'NIOS +2 2026', '2026'));
niosBatches.push(await addNiosBatch(niosStreamOf(niosPlusTwo, 'Commerce'), 'NIOS +2 2026', '2026'));
niosBatches.push(await addNiosBatch(niosStreamOf(niosSSLC, 'General'), 'NIOS SSLC 2025', '2025'));
niosBatches.push(await addNiosBatch(niosStreamOf(niosSSLC, 'General'), 'NIOS SSLC 2026', '2026'));

async function addNiosClass(c) {
  const row = await one(await sql`
    INSERT INTO nios_class_entries (date, start_time, end_time, total_hours, faculty_id, nios_batch_id, nios_subject_id, nios_chapter_id, class_mode, platform_used, class_status, payment_status, created_by)
    VALUES (${c.date}, ${c.start}, ${c.end}, ${hours(c.start, c.end)}, ${c.fac}, ${c.batch}, ${c.subject}, ${c.chapter}, ${c.mode}, ${c.platform || null}, ${c.status}, ${c.payment || 'pending'}, ${ADMIN})
    RETURNING *`);
  await sql`INSERT INTO nios_class_chapters (nios_class_entry_id, nios_chapter_id) VALUES (${row.id}, ${c.chapter}) ON CONFLICT DO NOTHING`;
  return row;
}

let niosClassCount = 0;
for (const group of niosBuilt) {
  const groupBatches = niosBatches.filter((b) => b.nios_university_id === group.uni.id);
  for (const batch of groupBatches) {
    const streamName = Object.keys(group.streamsByName)
      .find((n) => group.streamsByName[n].id === batch.nios_stream_id);
    // A batch can only be taught subjects carried by its own stream.
    for (const subj of group.subjects.filter((s) => s.def.streams.includes(streamName))) {
      for (let i = 0; i < 4; i++) {
        const date = addDays(START, (niosClassCount * 3) % 120);
        const [start, end] = SLOTS[niosClassCount % SLOTS.length];
        const online = niosClassCount % 2 === 0;
        const past = date <= TODAY;
        await addNiosClass({
          date, start, end,
          fac: fac[subj.def.fac],
          batch: batch.id,
          subject: subj.row.id,
          chapter: subj.chapters[i % subj.chapters.length].id,
          mode: online ? 'online' : 'offline',
          platform: online ? pick(PLATFORMS) : pick(ROOMS),
          status: past ? (niosClassCount % 8 === 0 ? 'not_taken' : 'taken') : 'scheduled',
          payment: niosClassCount % 3 === 0 ? 'paid' : 'pending',
        });
        niosClassCount++;
      }
    }
  }
}

// ── summary ──────────────────────────────────────────────────────────────────

const counts = await one(await sql`SELECT
  (SELECT count(*) FROM universities) universities,
  (SELECT count(*) FROM streams) streams,
  (SELECT count(*) FROM nios_streams) nios_streams,
  (SELECT count(*) FROM faculty) faculty,
  (SELECT count(*) FROM subjects) subjects,
  (SELECT count(*) FROM chapters) chapters,
  (SELECT count(*) FROM chapter_recordings) recordings,
  (SELECT count(*) FROM learning_resources) resources,
  (SELECT count(*) FROM batches) batches,
  (SELECT count(*) FROM class_entries) classes,
  (SELECT count(*) FROM timetables) timetables,
  (SELECT count(*) FROM timetable_slots) slots`);

const niosCounts = await one(await sql`SELECT
  (SELECT count(*) FROM nios_subjects) nios_subjects,
  (SELECT count(*) FROM nios_chapters) nios_chapters,
  (SELECT count(*) FROM nios_chapter_recordings) nios_recordings,
  (SELECT count(*) FROM nios_batches) nios_batches,
  (SELECT count(*) FROM nios_class_entries) nios_classes`);

const modeMix = await sql`SELECT class_mode, class_status, count(*)::int FROM class_entries GROUP BY 1,2 ORDER BY 1,2`;

console.log('\nSample data seeded:');
console.table([counts]);
console.table([niosCounts]);
console.log('Class mode / status mix:');
console.table(modeMix);

await pool.end();
console.log('Done.');
process.exit(0);
