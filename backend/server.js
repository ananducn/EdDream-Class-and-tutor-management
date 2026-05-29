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

// Run any pending migrations idempotently on startup
sql`ALTER TABLE class_entries ADD COLUMN IF NOT EXISTS is_cancelled BOOLEAN DEFAULT false`.catch(console.error);
// Per-week timetable model: a timetable belongs to one specific week, and a class
// entry can be linked to the slot it fulfils and carry its own scheduled/taken status.
sql`ALTER TABLE timetables ADD COLUMN IF NOT EXISTS week_start_date DATE`.catch(console.error);
sql`ALTER TABLE class_entries ADD COLUMN IF NOT EXISTS timetable_slot_id INTEGER REFERENCES timetable_slots(id) ON DELETE SET NULL`.catch(console.error);
sql`ALTER TABLE class_entries ADD COLUMN IF NOT EXISTS stream_id INTEGER REFERENCES streams(id)`.catch(console.error);
sql`ALTER TABLE class_entries ADD COLUMN IF NOT EXISTS class_status TEXT DEFAULT 'scheduled'`.catch(console.error);

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

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
