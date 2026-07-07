# NIOS Module — Implementation Plan

## What We're Building

A brand-new **NIOS section** in the sidebar — completely separate from the existing Classes, Timetable, and Curriculum pages. Three new features:

1. **NIOS Curriculum** — manage batches, subjects, chapters, and study materials/assignments
2. **NIOS Classes** — log and track NIOS class sessions
3. **NIOS Timetable** — schedule weekly classes for NIOS batches

The two NIOS institutions ("NIOS +2" and "NIOS SSLC") are fixed and auto-created when the server starts. Faculty is shared with the existing system. Everything else is completely separate — 9 new tables, 8 new API routes, 5 new pages.

**Zero changes to existing tables, routes, or pages.**

---

## Part 1 — New Database Tables

All 9 tables are created in `backend/server.js` on startup using `CREATE TABLE IF NOT EXISTS` (safe to run multiple times). The slot table must be created before class entries because of the foreign key reference.

### `nios_universities`
The two fixed institutions. Auto-seeded on server start.
```sql
id SERIAL PRIMARY KEY
name TEXT NOT NULL UNIQUE
is_active BOOLEAN DEFAULT true
created_at TIMESTAMPTZ DEFAULT NOW()
```
Seed on startup:
```sql
INSERT INTO nios_universities (name) VALUES ('NIOS +2'), ('NIOS SSLC') ON CONFLICT (name) DO NOTHING
```

### `nios_batches`
A student cohort under a NIOS university (e.g., "Science Group 2024").
```sql
id SERIAL PRIMARY KEY
nios_university_id INTEGER NOT NULL REFERENCES nios_universities(id)
name TEXT NOT NULL
year TEXT                          -- e.g. "2024-25", free-form label
is_active BOOLEAN DEFAULT true
created_by INTEGER REFERENCES users(id)
created_at TIMESTAMPTZ DEFAULT NOW()
```

### `nios_subjects`
Subjects available in NIOS (not locked to one university — can be reused across both programs).
```sql
id SERIAL PRIMARY KEY
name TEXT NOT NULL
subject_code TEXT
is_active BOOLEAN DEFAULT true
created_by INTEGER REFERENCES users(id)
created_at TIMESTAMPTZ DEFAULT NOW()
```

### `nios_batch_subjects`
Assigns subjects to a batch. One subject can appear in many batches.
```sql
id SERIAL PRIMARY KEY
nios_batch_id INTEGER NOT NULL REFERENCES nios_batches(id) ON DELETE CASCADE
nios_subject_id INTEGER NOT NULL REFERENCES nios_subjects(id) ON DELETE CASCADE
created_at TIMESTAMPTZ DEFAULT NOW()
UNIQUE(nios_batch_id, nios_subject_id)
```

### `nios_chapters`
Chapters within a subject, scoped to a specific batch (content may differ per batch).
```sql
id SERIAL PRIMARY KEY
nios_batch_subject_id INTEGER NOT NULL REFERENCES nios_batch_subjects(id) ON DELETE CASCADE
title TEXT NOT NULL
description TEXT
chapter_order INTEGER NOT NULL DEFAULT 1
is_active BOOLEAN DEFAULT true
created_by INTEGER REFERENCES users(id)
created_at TIMESTAMPTZ DEFAULT NOW()
updated_at TIMESTAMPTZ DEFAULT NOW()
```

### `nios_resources`
Study materials and assignments attached to a chapter.
```sql
id SERIAL PRIMARY KEY
nios_chapter_id INTEGER NOT NULL REFERENCES nios_chapters(id) ON DELETE CASCADE
type TEXT NOT NULL CHECK (type IN ('notes','pdf','video','assignment','quiz','question_paper'))
title TEXT NOT NULL
url TEXT
description TEXT
is_active BOOLEAN DEFAULT true
created_by INTEGER REFERENCES users(id)
created_at TIMESTAMPTZ DEFAULT NOW()
updated_at TIMESTAMPTZ DEFAULT NOW()
```

### `nios_timetables`
A weekly timetable for a specific NIOS batch.
```sql
id SERIAL PRIMARY KEY
name TEXT NOT NULL
nios_university_id INTEGER REFERENCES nios_universities(id)
nios_batch_id INTEGER REFERENCES nios_batches(id)
week_start_date DATE
created_by INTEGER REFERENCES users(id)
created_at TIMESTAMPTZ DEFAULT NOW()
```

### `nios_timetable_slots`
Day/time slots within a timetable. *(Created before nios_class_entries.)*
```sql
id SERIAL PRIMARY KEY
nios_timetable_id INTEGER NOT NULL REFERENCES nios_timetables(id) ON DELETE CASCADE
day_of_week TEXT CHECK (day_of_week IN ('Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'))
start_time TIME
end_time TIME
faculty_id INTEGER REFERENCES faculty(id)
nios_subject_id INTEGER REFERENCES nios_subjects(id)
class_taken_status TEXT DEFAULT 'scheduled' CHECK (class_taken_status IN ('scheduled','taken','not_taken'))
notes TEXT
created_at TIMESTAMPTZ DEFAULT NOW()
updated_at TIMESTAMPTZ DEFAULT NOW()
```

### `nios_class_entries`
Individual class sessions. Same fields as existing `class_entries` but references NIOS tables.
```sql
id SERIAL PRIMARY KEY
date DATE NOT NULL
start_time TIME
end_time TIME
total_hours NUMERIC(4,2)
faculty_id INTEGER REFERENCES faculty(id)
nios_batch_id INTEGER REFERENCES nios_batches(id)
nios_subject_id INTEGER REFERENCES nios_subjects(id)
class_mode TEXT CHECK (class_mode IN ('online','offline'))
platform_used TEXT
notes TEXT
is_recorded BOOLEAN DEFAULT false
recording_file_name TEXT
recording_duration TEXT
storage_location TEXT
recording_link TEXT
backup_available BOOLEAN DEFAULT false
editing_status TEXT DEFAULT 'not_edited' CHECK (editing_status IN ('not_edited','edited'))
upload_student_app BOOLEAN DEFAULT false
upload_student_app_date DATE
upload_student_app_link TEXT
upload_youtube BOOLEAN DEFAULT false
upload_youtube_date DATE
upload_youtube_link TEXT
youtube_privacy TEXT CHECK (youtube_privacy IN ('public','unlisted','private'))
upload_gdrive BOOLEAN DEFAULT false
upload_gdrive_link TEXT
upload_harddisk BOOLEAN DEFAULT false
upload_harddisk_location TEXT
payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN ('paid','pending'))
payment_remarks TEXT
is_cancelled BOOLEAN DEFAULT false
class_status TEXT DEFAULT 'scheduled' CHECK (class_status IN ('scheduled','taken','not_taken'))
nios_timetable_slot_id INTEGER REFERENCES nios_timetable_slots(id) ON DELETE SET NULL
created_by INTEGER REFERENCES users(id)
created_at TIMESTAMPTZ DEFAULT NOW()
updated_at TIMESTAMPTZ DEFAULT NOW()
```

---

## Part 2 — New Backend Routes (8 files)

All placed in `backend/routes/`, all mounted in `server.js` under `/api/nios/`.  
All follow existing patterns: `auth` middleware on every route, `logActivity()` on every mutation, dynamic SQL with `conditions[]` + `params[]` arrays, `RETURNING *` on inserts/updates, soft-delete (`is_active = false`) + `PATCH /:id/activate`.

| File | Mount path | Notes |
|---|---|---|
| `nios-universities.js` | `/api/nios/universities` | GET list + GET /:id only — institutions are fixed, no create/edit/delete |
| `nios-batches.js` | `/api/nios/batches` | Full CRUD; GET `?nios_university_id=`; admin-only write |
| `nios-subjects.js` | `/api/nios/subjects` | Full CRUD; GET all (no required filter); admin-only write |
| `nios-batch-subjects.js` | `/api/nios/batch-subjects` | POST to assign; DELETE /:id to remove; GET `?nios_batch_id=` returns subjects with join info |
| `nios-chapters.js` | `/api/nios/chapters` | Full CRUD; GET requires `?nios_batch_subject_id=`; soft-delete + activate |
| `nios-resources.js` | `/api/nios/resources` | Full CRUD; GET requires `?nios_chapter_id=`; soft-delete + activate |
| `nios-classes.js` | `/api/nios/classes` | Full CRUD + GET `/summary`; filters: date range, faculty_id, nios_batch_id, nios_subject_id, class_mode, is_recorded, editing_status, class_status, payment_status |
| `nios-timetables.js` | `/api/nios/timetables` | Full CRUD + nested `/:id/slots` routes; includes `syncNiosClassForSlot()` — when a slot is marked "taken", auto-creates a `nios_class_entries` row |

`server.js` additions:
```js
// Imports
import niosUniversitiesRouter from './routes/nios-universities.js';
import niosBatchesRouter from './routes/nios-batches.js';
import niosSubjectsRouter from './routes/nios-subjects.js';
import niosBatchSubjectsRouter from './routes/nios-batch-subjects.js';
import niosChaptersRouter from './routes/nios-chapters.js';
import niosResourcesRouter from './routes/nios-resources.js';
import niosClassesRouter from './routes/nios-classes.js';
import niosTimetablesRouter from './routes/nios-timetables.js';

// Route registrations
app.use('/api/nios/universities', niosUniversitiesRouter);
app.use('/api/nios/batches', niosBatchesRouter);
app.use('/api/nios/subjects', niosSubjectsRouter);
app.use('/api/nios/batch-subjects', niosBatchSubjectsRouter);
app.use('/api/nios/chapters', niosChaptersRouter);
app.use('/api/nios/resources', niosResourcesRouter);
app.use('/api/nios/classes', niosClassesRouter);
app.use('/api/nios/timetables', niosTimetablesRouter);
```

---

## Part 3 — New Frontend Pages (5 files)

All placed in `frontend/src/pages/nios/`.

### `NIOSCurriculumPage.jsx` → `/nios/curriculum`
Drill-down page (same pattern as existing `CurriculumPage.jsx`).

`PARAM_ORDER = ['uni', 'batch', 'subject', 'chapter']`

| Level | What you see | API call | What you can add |
|---|---|---|---|
| 0 | NIOS Universities | `GET /api/nios/universities` | Nothing (fixed) |
| 1 | Batches for that uni | `GET /api/nios/batches?nios_university_id=` | New batch (name + year) |
| 2 | Subjects in that batch | `GET /api/nios/batch-subjects?nios_batch_id=` | Assign existing subject OR create + assign new one |
| 3 | Chapters in that subject | `GET /api/nios/chapters?nios_batch_subject_id=` | New chapter (title, order) |
| 4 | Study materials + assignments | `GET /api/nios/resources?nios_chapter_id=` | New resource (type, title, url) |

At level 2: loads all NIOS subjects (`GET /api/nios/subjects`), filters out already-assigned ones. "Create new subject" calls `POST /api/nios/subjects` then immediately `POST /api/nios/batch-subjects`. Resources at level 4 show a type badge visually separating "Study Materials" from "Assignments".

### `NIOSClassesPage.jsx` → `/nios/classes`
Same structure as existing `ClassesPage.jsx` but:
- Dropdowns load from NIOS routes (`/api/nios/universities`, `/api/nios/batches`)
- Posts/updates go to `/api/nios/classes`
- No stream field — form has: date, time, faculty, NIOS university, NIOS batch, NIOS subject, class mode, all recording/upload/payment fields
- Subject dropdown loads after batch is selected: `GET /api/nios/batch-subjects?nios_batch_id=`
- Filter bar: NIOS university, batch, subject, date range, faculty, mode, recorded, editing status, class status

### `NIOSTimetablePage.jsx` → `/nios/timetable`
Same as existing `TimetablePage.jsx` but calls `/api/nios/universities`, `/api/nios/timetables`, `/api/nios/batches`. Shows two university cards. Clicking navigates to `/nios/timetable/:uniId`.

### `NIOSTimetableUniversityPage.jsx` → `/nios/timetable/:uniId`
Shows NIOS batches for the selected university (`GET /api/nios/batches?nios_university_id=`). Batch cards show timetable count. Clicking a batch goes to `/nios/timetable/:uniId/:batchId`. Back button → `/nios/timetable`.

### `NIOSTimetableCalendarPage.jsx` → `/nios/timetable/:uniId/:batchId`
Weekly calendar for scheduling NIOS class slots. Calls `/api/nios/timetables` and `/api/nios/timetables/:id/slots`. When a slot is marked "taken", `syncNiosClassForSlot()` auto-creates a `nios_class_entries` row. Back button → `/nios/timetable/:uniId`.

---

## Part 4 — Changes to Existing Files (only 2)

### `frontend/src/components/AppLayout.jsx`
Add a "NIOS" nav group with 3 links (visible to all users — backend enforces write restrictions):
```js
const NAV_NIOS = [
  { to: '/nios/curriculum', label: 'NIOS Curriculum', icon: ... },
  { to: '/nios/classes',    label: 'NIOS Classes',    icon: ... },
  { to: '/nios/timetable',  label: 'NIOS Timetable',  icon: ... },
];
```
Rendered after `NAV_MAIN` items, before the Settings section:
```jsx
<NavGroup label="NIOS" collapsed={collapsed} />
{NAV_NIOS.map(item => <SidebarLink key={item.to} {...item} collapsed={collapsed} />)}
```

### `frontend/src/App.jsx`
Import 5 new pages and register 5 routes:
```jsx
<Route path="/nios/curriculum"               element={<ProtectedRoute><NIOSCurriculumPage /></ProtectedRoute>} />
<Route path="/nios/classes"                  element={<ProtectedRoute><NIOSClassesPage /></ProtectedRoute>} />
<Route path="/nios/timetable"                element={<ProtectedRoute><NIOSTimetablePage /></ProtectedRoute>} />
<Route path="/nios/timetable/:uniId"         element={<ProtectedRoute><NIOSTimetableUniversityPage /></ProtectedRoute>} />
<Route path="/nios/timetable/:uniId/:batchId" element={<ProtectedRoute><NIOSTimetableCalendarPage /></ProtectedRoute>} />
```

---

## What Does NOT Change
- Every existing table, route, and page — untouched
- `users` and `faculty` tables — shared (referenced by NIOS tables for created_by and faculty assignments)
- No existing routes modified

---

## Implementation Order

1. **`server.js`** — add 9 table migrations + seed query + 8 route imports/registrations
2. **8 backend route files** — nios-universities, nios-batches, nios-subjects, nios-batch-subjects, nios-chapters, nios-resources, nios-classes, nios-timetables
3. **`AppLayout.jsx`** — add NIOS nav group
4. **`App.jsx`** — register 5 new routes
5. **`NIOSCurriculumPage.jsx`** — 5-level drill-down
6. **`NIOSClassesPage.jsx`** — NIOS class management
7. **`NIOSTimetablePage.jsx`** + **`NIOSTimetableUniversityPage.jsx`** + **`NIOSTimetableCalendarPage.jsx`** — timetable section

---

## Verification Checklist
- [ ] Server starts, all 9 NIOS tables created, "NIOS +2" and "NIOS SSLC" appear in `nios_universities`
- [ ] NIOS sidebar section appears with 3 working links
- [ ] Curriculum: NIOS +2 → create batch → assign subject → add chapter → add study material and assignment
- [ ] Classes: log a NIOS class; it appears in NIOS Classes and NOT in the main Classes page
- [ ] Timetable: create timetable for NIOS batch → add slot → mark taken → `nios_class_entries` row auto-created
- [ ] All existing pages (Classes, Timetable, Curriculum) still work correctly
