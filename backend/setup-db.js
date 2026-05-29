import 'dotenv/config';
import { sql } from './db.js';

console.log('Creating database tables...');

await sql`
  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'staff')),
    created_at TIMESTAMPTZ DEFAULT NOW()
  )
`;

await sql`
  CREATE TABLE IF NOT EXISTS universities (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    short_code TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )
`;

await sql`
  CREATE TABLE IF NOT EXISTS streams (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    university_id INTEGER REFERENCES universities(id),
    academic_year TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )
`;

await sql`
  CREATE TABLE IF NOT EXISTS batches (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    stream_id INTEGER REFERENCES streams(id),
    university_id INTEGER REFERENCES universities(id),
    semester TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )
`;

await sql`
  CREATE TABLE IF NOT EXISTS subjects (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    subject_code TEXT,
    university_id INTEGER REFERENCES universities(id),
    stream_id INTEGER REFERENCES streams(id),
    semester TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )
`;

await sql`
  CREATE TABLE IF NOT EXISTS faculty (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    payment_type TEXT CHECK (payment_type IN ('hourly', 'fixed')),
    hourly_rate NUMERIC(10,2),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )
`;

await sql`
  CREATE TABLE IF NOT EXISTS faculty_subjects (
    id SERIAL PRIMARY KEY,
    faculty_id INTEGER REFERENCES faculty(id) ON DELETE CASCADE,
    subject_id INTEGER REFERENCES subjects(id) ON DELETE CASCADE
  )
`;

await sql`
  CREATE TABLE IF NOT EXISTS faculty_universities (
    id SERIAL PRIMARY KEY,
    faculty_id INTEGER REFERENCES faculty(id) ON DELETE CASCADE,
    university_id INTEGER REFERENCES universities(id) ON DELETE CASCADE
  )
`;

await sql`
  CREATE TABLE IF NOT EXISTS faculty_batches (
    id SERIAL PRIMARY KEY,
    faculty_id INTEGER REFERENCES faculty(id) ON DELETE CASCADE,
    batch_id INTEGER REFERENCES batches(id) ON DELETE CASCADE
  )
`;

await sql`
  CREATE TABLE IF NOT EXISTS class_entries (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL,
    start_time TIME,
    end_time TIME,
    total_hours NUMERIC(4,2),
    faculty_id INTEGER REFERENCES faculty(id),
    subject_id INTEGER REFERENCES subjects(id),
    university_id INTEGER REFERENCES universities(id),
    batch_id INTEGER REFERENCES batches(id),
    unit_chapter TEXT,
    class_mode TEXT CHECK (class_mode IN ('online', 'offline')),
    platform_used TEXT,
    notes TEXT,
    is_recorded BOOLEAN DEFAULT false,
    recording_file_name TEXT,
    recording_duration TEXT,
    storage_location TEXT,
    recording_link TEXT,
    backup_available BOOLEAN DEFAULT false,
    editing_status TEXT DEFAULT 'not_edited' CHECK (editing_status IN ('not_edited', 'edited')),
    upload_student_app BOOLEAN DEFAULT false,
    upload_student_app_date DATE,
    upload_student_app_link TEXT,
    upload_youtube BOOLEAN DEFAULT false,
    upload_youtube_date DATE,
    upload_youtube_link TEXT,
    youtube_privacy TEXT CHECK (youtube_privacy IN ('public', 'unlisted', 'private')),
    upload_gdrive BOOLEAN DEFAULT false,
    upload_gdrive_link TEXT,
    upload_harddisk BOOLEAN DEFAULT false,
    upload_harddisk_location TEXT,
    payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN ('paid', 'pending')),
    payment_remarks TEXT,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )
`;

await sql`
  CREATE TABLE IF NOT EXISTS timetables (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    university_id INTEGER REFERENCES universities(id),
    batch_id INTEGER REFERENCES batches(id),
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
  )
`;

await sql`
  CREATE TABLE IF NOT EXISTS timetable_slots (
    id SERIAL PRIMARY KEY,
    timetable_id INTEGER REFERENCES timetables(id) ON DELETE CASCADE,
    day_of_week TEXT CHECK (day_of_week IN ('Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday')),
    start_time TIME,
    end_time TIME,
    faculty_id INTEGER REFERENCES faculty(id),
    subject_id INTEGER REFERENCES subjects(id),
    class_taken_status TEXT DEFAULT 'scheduled' CHECK (class_taken_status IN ('scheduled','taken','not_taken')),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )
`;

await sql`
  CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )
`;

await sql`
  CREATE TABLE IF NOT EXISTS invite_tokens (
    id SERIAL PRIMARY KEY,
    email TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'staff')),
    token_hash TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    accepted BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )
`;

await sql`
  CREATE TABLE IF NOT EXISTS activity_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    user_name TEXT,
    user_role TEXT,
    action TEXT NOT NULL,
    record_type TEXT,
    record_id INTEGER,
    details TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )
`;

console.log('All tables created successfully.');
process.exit(0);
