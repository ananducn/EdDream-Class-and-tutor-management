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

// Run any pending migrations idempotently on startup
sql`ALTER TABLE class_entries ADD COLUMN IF NOT EXISTS is_cancelled BOOLEAN DEFAULT false`.catch(console.error);
// Per-week timetable model: a timetable belongs to one specific week, and a class
// entry can be linked to the slot it fulfils and carry its own scheduled/taken status.
sql`ALTER TABLE timetables ADD COLUMN IF NOT EXISTS week_start_date DATE`.catch(console.error);
sql`ALTER TABLE class_entries ADD COLUMN IF NOT EXISTS timetable_slot_id INTEGER REFERENCES timetable_slots(id) ON DELETE SET NULL`.catch(console.error);
sql`ALTER TABLE class_entries ADD COLUMN IF NOT EXISTS stream_id INTEGER REFERENCES streams(id)`.catch(console.error);
sql`ALTER TABLE class_entries ADD COLUMN IF NOT EXISTS class_status TEXT DEFAULT 'scheduled'`.catch(console.error);
sql`CREATE TABLE IF NOT EXISTS academic_years (id SERIAL PRIMARY KEY, batch_id INTEGER NOT NULL REFERENCES batches(id) ON DELETE CASCADE, name TEXT NOT NULL, year_order INTEGER NOT NULL DEFAULT 1, is_active BOOLEAN NOT NULL DEFAULT true, created_at TIMESTAMPTZ DEFAULT NOW())`.catch(console.error);
sql`CREATE TABLE IF NOT EXISTS academic_year_subjects (id SERIAL PRIMARY KEY, academic_year_id INTEGER NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE, subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE, created_at TIMESTAMPTZ DEFAULT NOW(), UNIQUE(academic_year_id, subject_id))`.catch(console.error);
sql`CREATE TABLE IF NOT EXISTS chapters (id SERIAL PRIMARY KEY, academic_year_subject_id INTEGER NOT NULL REFERENCES academic_year_subjects(id) ON DELETE CASCADE, title TEXT NOT NULL, description TEXT, chapter_order INTEGER NOT NULL DEFAULT 1, is_active BOOLEAN NOT NULL DEFAULT true, created_by INTEGER REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`.catch(console.error);
sql`ALTER TABLE chapters ADD COLUMN IF NOT EXISTS academic_year_subject_id INTEGER REFERENCES academic_year_subjects(id) ON DELETE CASCADE`.catch(console.error);
sql`ALTER TABLE chapters DROP COLUMN IF EXISTS subject_id`.catch(console.error);
sql`ALTER TABLE streams DROP COLUMN IF EXISTS academic_year`.catch(console.error);
sql`ALTER TABLE batches DROP COLUMN IF EXISTS semester`.catch(console.error);
sql`ALTER TABLE subjects DROP COLUMN IF EXISTS semester`.catch(console.error);
sql`CREATE TABLE IF NOT EXISTS semesters (id SERIAL PRIMARY KEY, academic_year_id INTEGER NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE, name TEXT NOT NULL, semester_order INTEGER NOT NULL DEFAULT 1, is_active BOOLEAN NOT NULL DEFAULT true, created_at TIMESTAMPTZ DEFAULT NOW())`.catch(console.error);
sql`ALTER TABLE academic_year_subjects ADD COLUMN IF NOT EXISTS semester_id INTEGER REFERENCES semesters(id) ON DELETE SET NULL`.catch(console.error);
sql`ALTER TABLE timetables ADD COLUMN IF NOT EXISTS academic_year_id INTEGER REFERENCES academic_years(id)`.catch(console.error);
sql`ALTER TABLE timetables ADD COLUMN IF NOT EXISTS semester_id INTEGER REFERENCES semesters(id)`.catch(console.error);
sql`CREATE TABLE IF NOT EXISTS learning_resources (id SERIAL PRIMARY KEY, chapter_id INTEGER NOT NULL REFERENCES chapters(id) ON DELETE CASCADE, type TEXT NOT NULL CHECK (type IN ('notes','pdf','video','assignment','quiz','question_paper')), title TEXT NOT NULL, url TEXT, description TEXT, is_active BOOLEAN NOT NULL DEFAULT true, created_by INTEGER REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`.catch(console.error);
sql`ALTER TABLE class_entries ADD COLUMN IF NOT EXISTS academic_year_id INTEGER REFERENCES academic_years(id)`.catch(console.error);
sql`ALTER TABLE class_entries ADD COLUMN IF NOT EXISTS semester_id INTEGER REFERENCES semesters(id)`.catch(console.error);
sql`ALTER TABLE class_entries ADD COLUMN IF NOT EXISTS chapter_id INTEGER REFERENCES chapters(id)`.catch(console.error);

const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL }));
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

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
