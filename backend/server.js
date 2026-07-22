import 'dotenv/config';
import express from 'express';
import { sql } from './db.js';
import helmet from 'helmet';
import cors from 'cors';
import authRouter from './routes/auth.js';
import universitiesRouter from './routes/universities.js';
import streamsRouter from './routes/streams.js';
import batchesRouter from './routes/batches.js';
import subjectsRouter from './routes/subjects.js';
import facultyRouter from './routes/faculty.js';
import classesRouter from './routes/classes.js';
import timetablesRouter from './routes/timetables.js';
import dashboardRouter from './routes/dashboard.js';
import reportsRouter from './routes/reports.js';
import usersRouter from './routes/users.js';
import activityLogRouter from './routes/activityLog.js';
import academicYearsRouter from './routes/academic-years.js';
import academicYearSubjectsRouter from './routes/academic-year-subjects.js';
import chaptersRouter from './routes/chapters.js';
import learningResourcesRouter from './routes/learning-resources.js';
import semestersRouter from './routes/semesters.js';
import niosUniversitiesRouter from './routes/nios-universities.js';
import niosBatchesRouter from './routes/nios-batches.js';
import niosSubjectsRouter from './routes/nios-subjects.js';
import niosBatchSubjectsRouter from './routes/nios-batch-subjects.js';
import niosChaptersRouter from './routes/nios-chapters.js';
import niosResourcesRouter from './routes/nios-resources.js';
import niosClassesRouter from './routes/nios-classes.js';
import niosTimetablesRouter from './routes/nios-timetables.js';

// Pending migrations, run idempotently on startup in dependency order. Each is a
// thunk so nothing executes until runMigrations() awaits them one at a time — a
// FK-dependent CREATE must never race ahead of its parent table, which is what
// broke fresh databases when these were fired concurrently (fire-and-forget).
const migrations = [
  () => sql`ALTER TABLE class_entries ADD COLUMN IF NOT EXISTS is_cancelled BOOLEAN DEFAULT false`,
  // Per-week timetable model: a timetable belongs to one specific week, and a class
  // entry can be linked to the slot it fulfils and carry its own scheduled/taken status.
  () => sql`ALTER TABLE timetables ADD COLUMN IF NOT EXISTS week_start_date DATE`,
  () => sql`ALTER TABLE class_entries ADD COLUMN IF NOT EXISTS timetable_slot_id INTEGER REFERENCES timetable_slots(id) ON DELETE SET NULL`,
  () => sql`ALTER TABLE class_entries ADD COLUMN IF NOT EXISTS stream_id INTEGER REFERENCES streams(id)`,
  () => sql`ALTER TABLE class_entries ADD COLUMN IF NOT EXISTS class_status TEXT DEFAULT 'scheduled'`,
  () => sql`CREATE TABLE IF NOT EXISTS academic_years (id SERIAL PRIMARY KEY, batch_id INTEGER NOT NULL REFERENCES batches(id) ON DELETE CASCADE, name TEXT NOT NULL, year_order INTEGER NOT NULL DEFAULT 1, is_active BOOLEAN NOT NULL DEFAULT true, created_at TIMESTAMPTZ DEFAULT NOW())`,
  () => sql`CREATE TABLE IF NOT EXISTS academic_year_subjects (id SERIAL PRIMARY KEY, academic_year_id INTEGER NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE, subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE, created_at TIMESTAMPTZ DEFAULT NOW(), UNIQUE(academic_year_id, subject_id))`,
  () => sql`CREATE TABLE IF NOT EXISTS chapters (id SERIAL PRIMARY KEY, academic_year_subject_id INTEGER NOT NULL REFERENCES academic_year_subjects(id) ON DELETE CASCADE, title TEXT NOT NULL, description TEXT, chapter_order INTEGER NOT NULL DEFAULT 1, is_active BOOLEAN NOT NULL DEFAULT true, created_by INTEGER REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`,
  () => sql`ALTER TABLE chapters ADD COLUMN IF NOT EXISTS academic_year_subject_id INTEGER REFERENCES academic_year_subjects(id) ON DELETE CASCADE`,
  () => sql`ALTER TABLE chapters DROP COLUMN IF EXISTS subject_id`,
  () => sql`ALTER TABLE streams DROP COLUMN IF EXISTS academic_year`,
  () => sql`ALTER TABLE batches DROP COLUMN IF EXISTS semester`,
  () => sql`ALTER TABLE subjects DROP COLUMN IF EXISTS semester`,
  () => sql`CREATE TABLE IF NOT EXISTS semesters (id SERIAL PRIMARY KEY, academic_year_id INTEGER NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE, name TEXT NOT NULL, semester_order INTEGER NOT NULL DEFAULT 1, is_active BOOLEAN NOT NULL DEFAULT true, created_at TIMESTAMPTZ DEFAULT NOW())`,
  () => sql`ALTER TABLE academic_year_subjects ADD COLUMN IF NOT EXISTS semester_id INTEGER REFERENCES semesters(id) ON DELETE SET NULL`,
  () => sql`ALTER TABLE timetables ADD COLUMN IF NOT EXISTS academic_year_id INTEGER REFERENCES academic_years(id)`,
  () => sql`ALTER TABLE timetables ADD COLUMN IF NOT EXISTS semester_id INTEGER REFERENCES semesters(id)`,
  () => sql`CREATE TABLE IF NOT EXISTS learning_resources (id SERIAL PRIMARY KEY, chapter_id INTEGER NOT NULL REFERENCES chapters(id) ON DELETE CASCADE, type TEXT NOT NULL CHECK (type IN ('notes','pdf','video','assignment','quiz','question_paper')), title TEXT NOT NULL, url TEXT, description TEXT, is_active BOOLEAN NOT NULL DEFAULT true, created_by INTEGER REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`,
  () => sql`ALTER TABLE class_entries ADD COLUMN IF NOT EXISTS academic_year_id INTEGER REFERENCES academic_years(id)`,
  () => sql`ALTER TABLE class_entries ADD COLUMN IF NOT EXISTS semester_id INTEGER REFERENCES semesters(id)`,
  () => sql`ALTER TABLE class_entries ADD COLUMN IF NOT EXISTS chapter_id INTEGER REFERENCES chapters(id)`,

  // ── NIOS tables ────────────────────────────────────────────────────────────────
  () => sql`CREATE TABLE IF NOT EXISTS nios_universities (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  () => sql`CREATE TABLE IF NOT EXISTS nios_batches (
    id SERIAL PRIMARY KEY,
    nios_university_id INTEGER NOT NULL REFERENCES nios_universities(id),
    name TEXT NOT NULL,
    year TEXT,
    is_active BOOLEAN DEFAULT true,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  () => sql`CREATE TABLE IF NOT EXISTS nios_subjects (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    subject_code TEXT,
    is_active BOOLEAN DEFAULT true,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  () => sql`CREATE TABLE IF NOT EXISTS nios_batch_subjects (
    id SERIAL PRIMARY KEY,
    nios_batch_id INTEGER NOT NULL REFERENCES nios_batches(id) ON DELETE CASCADE,
    nios_subject_id INTEGER NOT NULL REFERENCES nios_subjects(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(nios_batch_id, nios_subject_id)
  )`,
  () => sql`CREATE TABLE IF NOT EXISTS nios_timetables (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    nios_university_id INTEGER REFERENCES nios_universities(id),
    nios_batch_id INTEGER REFERENCES nios_batches(id),
    week_start_date DATE,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  () => sql`CREATE TABLE IF NOT EXISTS nios_timetable_slots (
    id SERIAL PRIMARY KEY,
    nios_timetable_id INTEGER NOT NULL REFERENCES nios_timetables(id) ON DELETE CASCADE,
    day_of_week TEXT CHECK (day_of_week IN ('Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday')),
    start_time TIME,
    end_time TIME,
    faculty_id INTEGER REFERENCES faculty(id),
    nios_subject_id INTEGER REFERENCES nios_subjects(id),
    class_taken_status TEXT DEFAULT 'scheduled' CHECK (class_taken_status IN ('scheduled','taken','not_taken')),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  () => sql`CREATE TABLE IF NOT EXISTS nios_class_entries (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL,
    start_time TIME,
    end_time TIME,
    total_hours NUMERIC(4,2),
    faculty_id INTEGER REFERENCES faculty(id),
    nios_batch_id INTEGER REFERENCES nios_batches(id),
    nios_subject_id INTEGER REFERENCES nios_subjects(id),
    class_mode TEXT CHECK (class_mode IN ('online','offline')),
    platform_used TEXT,
    notes TEXT,
    is_recorded BOOLEAN DEFAULT false,
    recording_file_name TEXT,
    recording_duration TEXT,
    storage_location TEXT,
    recording_link TEXT,
    backup_available BOOLEAN DEFAULT false,
    editing_status TEXT DEFAULT 'not_edited' CHECK (editing_status IN ('not_edited','edited')),
    upload_student_app BOOLEAN DEFAULT false,
    upload_student_app_date DATE,
    upload_student_app_link TEXT,
    upload_youtube BOOLEAN DEFAULT false,
    upload_youtube_date DATE,
    upload_youtube_link TEXT,
    youtube_privacy TEXT CHECK (youtube_privacy IN ('public','unlisted','private')),
    upload_gdrive BOOLEAN DEFAULT false,
    upload_gdrive_link TEXT,
    upload_harddisk BOOLEAN DEFAULT false,
    upload_harddisk_location TEXT,
    payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN ('paid','pending')),
    payment_remarks TEXT,
    is_cancelled BOOLEAN DEFAULT false,
    class_status TEXT DEFAULT 'scheduled' CHECK (class_status IN ('scheduled','taken','not_taken')),
    nios_timetable_slot_id INTEGER REFERENCES nios_timetable_slots(id) ON DELETE SET NULL,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  () => sql`CREATE TABLE IF NOT EXISTS nios_chapters (
    id SERIAL PRIMARY KEY,
    nios_batch_subject_id INTEGER NOT NULL REFERENCES nios_batch_subjects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    chapter_order INTEGER NOT NULL DEFAULT 1,
    is_active BOOLEAN DEFAULT true,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  () => sql`CREATE TABLE IF NOT EXISTS nios_resources (
    id SERIAL PRIMARY KEY,
    nios_chapter_id INTEGER NOT NULL REFERENCES nios_chapters(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('notes','pdf','video','assignment','quiz','question_paper')),
    title TEXT NOT NULL,
    url TEXT,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  () => sql`ALTER TABLE nios_class_entries ADD COLUMN IF NOT EXISTS nios_chapter_id INTEGER REFERENCES nios_chapters(id) ON DELETE SET NULL`,

  // Multi-chapter support: a class / timetable slot can cover many chapters
  () => sql`CREATE TABLE IF NOT EXISTS nios_class_chapters (
    id SERIAL PRIMARY KEY,
    nios_class_entry_id INTEGER NOT NULL REFERENCES nios_class_entries(id) ON DELETE CASCADE,
    nios_chapter_id     INTEGER NOT NULL REFERENCES nios_chapters(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(nios_class_entry_id, nios_chapter_id)
  )`,
  () => sql`CREATE TABLE IF NOT EXISTS nios_timetable_slot_chapters (
    id SERIAL PRIMARY KEY,
    nios_timetable_slot_id INTEGER NOT NULL REFERENCES nios_timetable_slots(id) ON DELETE CASCADE,
    nios_chapter_id        INTEGER NOT NULL REFERENCES nios_chapters(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(nios_timetable_slot_id, nios_chapter_id)
  )`,
  // Backfill class entries that already carry a single chapter
  () => sql`INSERT INTO nios_class_chapters (nios_class_entry_id, nios_chapter_id)
    SELECT id, nios_chapter_id FROM nios_class_entries WHERE nios_chapter_id IS NOT NULL
    ON CONFLICT DO NOTHING`,

  // Seed fixed NIOS universities
  () => sql`INSERT INTO nios_universities (name) VALUES ('NIOS +2'), ('NIOS SSLC') ON CONFLICT (name) DO NOTHING`,
];

// Runs every migration, collecting failures rather than stopping at the first —
// one broken statement shouldn't hide the state of the rest. Returns the list of
// failures so the caller can decide whether it is safe to serve traffic.
//
// Migrations are numbered by their position in the array above (1-based), which
// is how you find the offending statement from the log.
async function runMigrations() {
  const failures = [];
  for (const [i, migrate] of migrations.entries()) {
    try {
      await migrate();
    } catch (err) {
      failures.push({ number: i + 1, message: err.message });
      console.error(`Migration ${i + 1}/${migrations.length} FAILED: ${err.message}`);
    }
  }
  if (failures.length === 0) {
    console.log(`All ${migrations.length} migrations applied.`);
  }
  return failures;
}

const app = express();

app.use(helmet());
const allowedOrigins = [process.env.FRONTEND_URL, ...(process.env.NODE_ENV !== 'production' ? ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175'] : [])];
app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', authRouter);
app.use('/api/universities', universitiesRouter);
app.use('/api/streams', streamsRouter);
app.use('/api/batches', batchesRouter);
app.use('/api/subjects', subjectsRouter);
app.use('/api/faculty', facultyRouter);
app.use('/api/classes', classesRouter);
app.use('/api/timetables', timetablesRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/users', usersRouter);
app.use('/api/activity-logs', activityLogRouter);
app.use('/api/academic-years', academicYearsRouter);
app.use('/api/academic-year-subjects', academicYearSubjectsRouter);
app.use('/api/chapters', chaptersRouter);
app.use('/api/learning-resources', learningResourcesRouter);
app.use('/api/semesters', semestersRouter);
app.use('/api/nios/universities', niosUniversitiesRouter);
app.use('/api/nios/batches', niosBatchesRouter);
app.use('/api/nios/subjects', niosSubjectsRouter);
app.use('/api/nios/batch-subjects', niosBatchSubjectsRouter);
app.use('/api/nios/chapters', niosChaptersRouter);
app.use('/api/nios/resources', niosResourcesRouter);
app.use('/api/nios/classes', niosClassesRouter);
app.use('/api/nios/timetables', niosTimetablesRouter);

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

const PORT = process.env.PORT || 5000;
// Finish migrations (in dependency order) before serving, so the first requests
// after a fresh deploy never hit missing tables.
//
// A failed migration means the schema is incomplete, so we refuse to serve
// rather than coming up "healthy" on a half-built database — the previous
// behaviour logged one line per failure and started anyway, which on Railway
// looks like a successful deploy. Exiting non-zero makes the platform surface
// the deploy as failed; because every migration is idempotent, a restart simply
// retries them, so a transient DB blip heals itself.
//
// Set ALLOW_INCOMPLETE_SCHEMA=true to start regardless — an escape hatch for
// when a broken migration would otherwise keep the whole app down.
runMigrations()
  .then((failures) => {
    if (failures.length > 0) {
      const list = failures.map((f) => `  #${f.number}: ${f.message}`).join('\n');
      console.error(
        `\n${failures.length} of ${migrations.length} migrations FAILED — schema is incomplete:\n${list}\n`
      );
      if (process.env.ALLOW_INCOMPLETE_SCHEMA !== 'true') {
        console.error('Refusing to start. Set ALLOW_INCOMPLETE_SCHEMA=true to override.');
        process.exit(1);
      }
      console.error('ALLOW_INCOMPLETE_SCHEMA=true — starting anyway.');
    }
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Migration runner crashed:', err);
    process.exit(1);
  });
