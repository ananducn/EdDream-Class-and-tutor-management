import 'dotenv/config';
import express from 'express';
import { sql } from './db.js';
import helmet from 'helmet';
import cors from 'cors';
import { flushCacheOnWrite } from './middleware/cache.js';
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
import chapterRecordingsRouter from './routes/chapter-recordings.js';
import niosUniversitiesRouter from './routes/nios-universities.js';
import niosBatchesRouter from './routes/nios-batches.js';
import niosSubjectsRouter from './routes/nios-subjects.js';
import niosStreamsRouter from './routes/nios-streams.js';
import niosStreamSubjectsRouter from './routes/nios-stream-subjects.js';
import niosChaptersRouter from './routes/nios-chapters.js';
import niosChapterRecordingsRouter from './routes/nios-chapter-recordings.js';
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
  // Chapters root on the SUBJECT (current model). NOTE: two destructive legacy
  // migrations used to live here — `ADD COLUMN academic_year_subject_id` and
  // `DROP COLUMN subject_id` — which re-ran on every boot and wiped the re-rooted
  // subject_id (the later re-root block then couldn't backfill from the now-empty
  // old column). They are removed; the CREATE below is the current shape and the
  // re-root block further down still migrates any legacy academic_year_subject_id DB.
  () => sql`CREATE TABLE IF NOT EXISTS chapters (id SERIAL PRIMARY KEY, subject_id INTEGER REFERENCES subjects(id) ON DELETE CASCADE, title TEXT NOT NULL, description TEXT, chapter_order INTEGER NOT NULL DEFAULT 1, is_active BOOLEAN NOT NULL DEFAULT true, created_by INTEGER REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`,
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
  // A slot shared by several batches ("common class") gets the same slot_group_id
  // on every batch's copy, so an edit or delete on one applies to the whole group.
  () => sql`ALTER TABLE timetable_slots ADD COLUMN IF NOT EXISTS slot_group_id INTEGER`,
  () => sql`CREATE INDEX IF NOT EXISTS idx_timetable_slots_group ON timetable_slots(slot_group_id)`,

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

  // ── Curriculum-level recordings, shared syllabus across batches ──────────────
  // These migrations re-root the syllabus from batch to stream (NIOS: to
  // university), move recording off class sessions onto a canonical per-chapter
  // entity, and drop the now-unused per-session recording columns.
  //
  // They are structural + idempotent. Data backfills are intentionally omitted:
  // the only environment was wiped to dummy data, so the DROP COLUMNs below
  // discard nothing of value and no linkage needs re-mapping. On a fresh DB the
  // ADD/DROP ... IF (NOT) EXISTS calls are no-ops (setup-db.js already builds the
  // target shape), so the startup guard sees zero migration errors either way.

  // Main side: academic_years now belongs to a stream, not a batch.
  () => sql`ALTER TABLE academic_years ADD COLUMN IF NOT EXISTS stream_id INTEGER REFERENCES streams(id) ON DELETE CASCADE`,
  () => sql`ALTER TABLE academic_years DROP COLUMN IF EXISTS batch_id`,

  // Main side: strip recording/upload columns from class sessions.
  () => sql`ALTER TABLE class_entries
    DROP COLUMN IF EXISTS is_recorded,
    DROP COLUMN IF EXISTS recording_file_name,
    DROP COLUMN IF EXISTS recording_duration,
    DROP COLUMN IF EXISTS storage_location,
    DROP COLUMN IF EXISTS recording_link,
    DROP COLUMN IF EXISTS backup_available,
    DROP COLUMN IF EXISTS editing_status,
    DROP COLUMN IF EXISTS upload_student_app,
    DROP COLUMN IF EXISTS upload_student_app_date,
    DROP COLUMN IF EXISTS upload_student_app_link,
    DROP COLUMN IF EXISTS upload_youtube,
    DROP COLUMN IF EXISTS upload_youtube_date,
    DROP COLUMN IF EXISTS upload_youtube_link,
    DROP COLUMN IF EXISTS youtube_privacy,
    DROP COLUMN IF EXISTS upload_gdrive,
    DROP COLUMN IF EXISTS upload_gdrive_link,
    DROP COLUMN IF EXISTS upload_harddisk,
    DROP COLUMN IF EXISTS upload_harddisk_location`,

  // Main side: canonical per-chapter recording (shared across batches).
  () => sql`CREATE TABLE IF NOT EXISTS chapter_recordings (
    id SERIAL PRIMARY KEY,
    chapter_id INTEGER NOT NULL UNIQUE REFERENCES chapters(id) ON DELETE CASCADE,
    is_recorded BOOLEAN NOT NULL DEFAULT false,
    faculty_id INTEGER REFERENCES faculty(id),
    recording_date DATE,
    recording_file_name TEXT,
    recording_duration TEXT,
    notes TEXT,
    editing_status TEXT DEFAULT 'not_edited' CHECK (editing_status IN ('not_edited','edited')),
    backup_available BOOLEAN DEFAULT false,
    storage_location TEXT,
    upload_youtube BOOLEAN DEFAULT false,
    upload_youtube_link TEXT,
    youtube_privacy TEXT CHECK (youtube_privacy IN ('public','unlisted','private')),
    upload_gdrive BOOLEAN DEFAULT false,
    upload_gdrive_link TEXT,
    upload_student_app BOOLEAN DEFAULT false,
    upload_student_app_link TEXT,
    upload_harddisk BOOLEAN DEFAULT false,
    upload_harddisk_location TEXT,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`,

  // NIOS: the syllabus hangs off a STREAM (Science, Commerce, …) inside the
  // university. Before this, subjects sat on the university itself, so every
  // batch of "NIOS +2" inherited one flat subject list and a Science batch could
  // not differ from a Commerce one. Shape now mirrors the main app:
  // University → Stream → Batch, with the syllabus rooted on the stream.
  () => sql`CREATE TABLE IF NOT EXISTS nios_streams (
    id SERIAL PRIMARY KEY,
    nios_university_id INTEGER NOT NULL REFERENCES nios_universities(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(nios_university_id, name)
  )`,
  () => sql`CREATE TABLE IF NOT EXISTS nios_stream_subjects (
    id SERIAL PRIMARY KEY,
    nios_stream_id  INTEGER NOT NULL REFERENCES nios_streams(id) ON DELETE CASCADE,
    nios_subject_id INTEGER NOT NULL REFERENCES nios_subjects(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(nios_stream_id, nios_subject_id)
  )`,
  // A batch belongs to exactly one stream, so choosing a batch already fixes
  // which subjects are legal for it — nothing has to be picked twice.
  () => sql`ALTER TABLE nios_batches ADD COLUMN IF NOT EXISTS nios_stream_id INTEGER REFERENCES nios_streams(id)`,
  () => sql`ALTER TABLE nios_chapters DROP COLUMN IF EXISTS nios_batch_subject_id`,
  () => sql`DROP TABLE IF EXISTS nios_batch_subjects CASCADE`,
  () => sql`DROP TABLE IF EXISTS nios_university_subjects CASCADE`,

  // NIOS: strip recording/upload columns from class sessions.
  () => sql`ALTER TABLE nios_class_entries
    DROP COLUMN IF EXISTS is_recorded,
    DROP COLUMN IF EXISTS recording_file_name,
    DROP COLUMN IF EXISTS recording_duration,
    DROP COLUMN IF EXISTS storage_location,
    DROP COLUMN IF EXISTS recording_link,
    DROP COLUMN IF EXISTS backup_available,
    DROP COLUMN IF EXISTS editing_status,
    DROP COLUMN IF EXISTS upload_student_app,
    DROP COLUMN IF EXISTS upload_student_app_date,
    DROP COLUMN IF EXISTS upload_student_app_link,
    DROP COLUMN IF EXISTS upload_youtube,
    DROP COLUMN IF EXISTS upload_youtube_date,
    DROP COLUMN IF EXISTS upload_youtube_link,
    DROP COLUMN IF EXISTS youtube_privacy,
    DROP COLUMN IF EXISTS upload_gdrive,
    DROP COLUMN IF EXISTS upload_gdrive_link,
    DROP COLUMN IF EXISTS upload_harddisk,
    DROP COLUMN IF EXISTS upload_harddisk_location`,

  // NIOS: canonical per-chapter recording.
  () => sql`CREATE TABLE IF NOT EXISTS nios_chapter_recordings (
    id SERIAL PRIMARY KEY,
    nios_chapter_id INTEGER NOT NULL UNIQUE REFERENCES nios_chapters(id) ON DELETE CASCADE,
    is_recorded BOOLEAN NOT NULL DEFAULT false,
    faculty_id INTEGER REFERENCES faculty(id),
    recording_date DATE,
    recording_file_name TEXT,
    recording_duration TEXT,
    notes TEXT,
    editing_status TEXT DEFAULT 'not_edited' CHECK (editing_status IN ('not_edited','edited')),
    backup_available BOOLEAN DEFAULT false,
    storage_location TEXT,
    upload_youtube BOOLEAN DEFAULT false,
    upload_youtube_link TEXT,
    youtube_privacy TEXT CHECK (youtube_privacy IN ('public','unlisted','private')),
    upload_gdrive BOOLEAN DEFAULT false,
    upload_gdrive_link TEXT,
    upload_student_app BOOLEAN DEFAULT false,
    upload_student_app_link TEXT,
    upload_harddisk BOOLEAN DEFAULT false,
    upload_harddisk_location TEXT,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`,

  // ── Common subjects: shared chapters + recordings across stream-years ────────
  // Re-root chapters from the per-placement row (academic_year_subject) up to the
  // SUBJECT itself, so a subject linked to several stream-years (a "common
  // subject") shares one chapter list and — because chapter_recordings is keyed on
  // chapter_id — one recording. The subject↔stream-year M2M already exists
  // (academic_year_subjects); only this re-root was missing.
  //
  // Backfills are guarded with an IF-column-exists check so they are safe no-ops
  // on a fresh DB (where setup-db.js already builds the target shape and the old
  // column is absent), mirroring the guard rationale used by the re-root
  // migrations above.

  // Main side: chapters root on subject_id.
  () => sql`ALTER TABLE chapters ADD COLUMN IF NOT EXISTS subject_id INTEGER REFERENCES subjects(id) ON DELETE CASCADE`,
  () => sql`DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'chapters' AND column_name = 'academic_year_subject_id') THEN
        UPDATE chapters ch SET subject_id = ays.subject_id
        FROM academic_year_subjects ays
        WHERE ays.id = ch.academic_year_subject_id AND ch.subject_id IS NULL;
      END IF;
    END $$`,
  () => sql`ALTER TABLE chapters DROP COLUMN IF EXISTS academic_year_subject_id`,

  // Main side: a subject may now be common, so its single-stream binding is
  // relaxed to an optional "origin" label; placement flows through
  // academic_year_subjects.
  () => sql`ALTER TABLE subjects ALTER COLUMN stream_id DROP NOT NULL`,

  // Main side: fanned-out classes (one common-subject class across many batches)
  // share a group id so the UI can collapse them into a single card.
  () => sql`ALTER TABLE class_entries ADD COLUMN IF NOT EXISTS class_group_id INTEGER`,

  // NIOS side: mirror the re-root. nios_subjects are already global (no
  // university binding), so only the chapter root moves.
  () => sql`ALTER TABLE nios_chapters ADD COLUMN IF NOT EXISTS nios_subject_id INTEGER REFERENCES nios_subjects(id) ON DELETE CASCADE`,
  () => sql`ALTER TABLE nios_chapters DROP COLUMN IF EXISTS nios_university_subject_id`,
  () => sql`ALTER TABLE nios_class_entries ADD COLUMN IF NOT EXISTS nios_class_group_id INTEGER`,

  // A NIOS common class is the same slot in several batches' grids for one week.
  // Now that a subject can be shared across streams, the timetable needs the same
  // fan-out the Classes page already has. Group id is the first member's own id,
  // with no FK behind it — see lib/groups.js for the repair on partial deletes.
  () => sql`ALTER TABLE nios_timetable_slots ADD COLUMN IF NOT EXISTS nios_slot_group_id INTEGER`,

  // ── Performance indexes ──────────────────────────────────────────────────────
  // Postgres does NOT auto-index foreign keys, so the app's filters/joins were
  // doing full table scans. These index the columns actually used in WHERE/JOIN/
  // ORDER BY across the hot read paths. All idempotent (CREATE INDEX IF NOT EXISTS);
  // one statement per entry because the db wrapper uses the extended protocol.
  () => sql`CREATE INDEX IF NOT EXISTS idx_class_entries_date ON class_entries (date)`,
  () => sql`CREATE INDEX IF NOT EXISTS idx_class_entries_faculty ON class_entries (faculty_id)`,
  () => sql`CREATE INDEX IF NOT EXISTS idx_class_entries_subject ON class_entries (subject_id)`,
  () => sql`CREATE INDEX IF NOT EXISTS idx_class_entries_batch ON class_entries (batch_id)`,
  () => sql`CREATE INDEX IF NOT EXISTS idx_class_entries_stream ON class_entries (stream_id)`,
  () => sql`CREATE INDEX IF NOT EXISTS idx_class_entries_university ON class_entries (university_id)`,
  () => sql`CREATE INDEX IF NOT EXISTS idx_class_entries_group ON class_entries (class_group_id)`,
  () => sql`CREATE INDEX IF NOT EXISTS idx_class_entries_timetable_slot ON class_entries (timetable_slot_id)`,
  () => sql`CREATE INDEX IF NOT EXISTS idx_chapters_subject ON chapters (subject_id)`,
  () => sql`CREATE INDEX IF NOT EXISTS idx_academic_years_stream ON academic_years (stream_id)`,
  () => sql`CREATE INDEX IF NOT EXISTS idx_semesters_year ON semesters (academic_year_id)`,
  () => sql`CREATE INDEX IF NOT EXISTS idx_ays_subject ON academic_year_subjects (subject_id)`,
  () => sql`CREATE INDEX IF NOT EXISTS idx_learning_resources_chapter ON learning_resources (chapter_id)`,
  () => sql`CREATE INDEX IF NOT EXISTS idx_timetables_batch_week ON timetables (university_id, batch_id, week_start_date)`,
  () => sql`CREATE INDEX IF NOT EXISTS idx_timetable_slots_timetable ON timetable_slots (timetable_id)`,
  () => sql`CREATE INDEX IF NOT EXISTS idx_subjects_stream ON subjects (stream_id)`,
  () => sql`CREATE INDEX IF NOT EXISTS idx_subjects_university ON subjects (university_id)`,
  () => sql`CREATE INDEX IF NOT EXISTS idx_streams_university ON streams (university_id)`,
  () => sql`CREATE INDEX IF NOT EXISTS idx_batches_stream ON batches (stream_id)`,
  () => sql`CREATE INDEX IF NOT EXISTS idx_activity_logs_created ON activity_logs (created_at DESC)`,
  () => sql`CREATE INDEX IF NOT EXISTS idx_nios_class_entries_date ON nios_class_entries (date)`,
  () => sql`CREATE INDEX IF NOT EXISTS idx_nios_class_entries_batch ON nios_class_entries (nios_batch_id)`,
  () => sql`CREATE INDEX IF NOT EXISTS idx_nios_class_entries_subject ON nios_class_entries (nios_subject_id)`,
  () => sql`CREATE INDEX IF NOT EXISTS idx_nios_class_entries_group ON nios_class_entries (nios_class_group_id)`,
  () => sql`CREATE INDEX IF NOT EXISTS idx_nios_chapters_subject ON nios_chapters (nios_subject_id)`,
  () => sql`CREATE INDEX IF NOT EXISTS idx_nios_ss_subject ON nios_stream_subjects (nios_subject_id)`,
  () => sql`CREATE INDEX IF NOT EXISTS idx_nios_ss_stream ON nios_stream_subjects (nios_stream_id)`,
  () => sql`CREATE INDEX IF NOT EXISTS idx_nios_streams_university ON nios_streams (nios_university_id)`,
  () => sql`CREATE INDEX IF NOT EXISTS idx_nios_batches_stream ON nios_batches (nios_stream_id)`,
  () => sql`CREATE INDEX IF NOT EXISTS idx_nios_timetables_batch ON nios_timetables (nios_university_id, nios_batch_id, week_start_date)`,
  () => sql`CREATE INDEX IF NOT EXISTS idx_nios_tt_slots_timetable ON nios_timetable_slots (nios_timetable_id)`,
  () => sql`CREATE INDEX IF NOT EXISTS idx_nios_tt_slots_group ON nios_timetable_slots (nios_slot_group_id)`,
  () => sql`CREATE INDEX IF NOT EXISTS idx_nios_class_chapters_chapter ON nios_class_chapters (nios_chapter_id)`,
  () => sql`CREATE INDEX IF NOT EXISTS idx_nios_tt_slot_chapters_chapter ON nios_timetable_slot_chapters (nios_chapter_id)`,
  () => sql`CREATE INDEX IF NOT EXISTS idx_nios_resources_chapter ON nios_resources (nios_chapter_id)`,
  () => sql`CREATE INDEX IF NOT EXISTS idx_nios_batches_university ON nios_batches (nios_university_id)`,

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

// Railway terminates TLS and proxies to us, so without this every request looks
// like it comes from the proxy and the login rate limiter would count all users
// as one client — locking everybody out together. Trust exactly one hop.
app.set('trust proxy', 1);

app.use(helmet());
const allowedOrigins = [process.env.FRONTEND_URL, ...(process.env.NODE_ENV !== 'production' ? ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175'] : [])];
app.use(cors({ origin: allowedOrigins }));
app.use(express.json());
// Any successful write flushes the read cache so the next read is fresh.
app.use(flushCacheOnWrite());

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
app.use('/api/chapter-recordings', chapterRecordingsRouter);
app.use('/api/nios/universities', niosUniversitiesRouter);
app.use('/api/nios/batches', niosBatchesRouter);
app.use('/api/nios/subjects', niosSubjectsRouter);
app.use('/api/nios/streams', niosStreamsRouter);
app.use('/api/nios/stream-subjects', niosStreamSubjectsRouter);
app.use('/api/nios/chapters', niosChaptersRouter);
app.use('/api/nios/chapter-recordings', niosChapterRecordingsRouter);
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
