# User Guide — Class & Recording Management System

*A simple guide for everyone. No technical knowledge needed.*

---

## 1. What is this app?

This app is a replacement for the messy Excel sheets the institute used to track classes and recordings. Think of it as a **digital register** that everyone in the team can open at the same time, from their own computer, and always see the latest information.

It keeps track of:

- **Classes** — who taught what, when, and for how long
- **Recordings** — was the class recorded, where is the video saved, was it edited, was it uploaded
- **Faculty** — the teachers and the subjects they teach
- **Timetables** — the weekly plan of which class happens on which day
- **Payments** — whether a teacher has been paid for a class
- **Reports** — summaries you can read on screen or download as a spreadsheet

Instead of one person owning an Excel file and emailing it around, everyone now looks at **one shared, always-up-to-date system**.

---

## 2. The two kinds of users

There are two types of people who log in:

| Role | What they can do |
|------|------------------|
| **Admin** | Everything. They set up the lists (universities, subjects, teachers), manage other users, and can see private reports and history logs. Think of them as the *manager*. |
| **Staff** | Day-to-day work. They add and update classes and recordings, view timetables, and read reports. They **cannot** change the master lists or manage users. Think of them as the *team member doing the recording/uploading work*. |

If you try to do something you're not allowed to, the app simply won't let you — it's a safety guard so important settings don't get changed by accident.

---

## 3. The big picture — how information flows

Before you can record a class, some "background lists" must exist. Here is the order in which information builds up, from the foundation to the daily work:

```
   STEP 1 — Set up the foundation (Admin does this once, then occasionally)
   ┌───────────────────────────────────────────────┐
   │  Universities  →  Streams  →  Batches          │
   │  Subjects                                       │
   │  Faculty (teachers + the subjects they teach)   │
   └───────────────────────────────────────────────┘
                          │
                          ▼
   STEP 2 — Plan the week (Timetable)
   ┌───────────────────────────────────────────────┐
   │  "On Monday, Batch A has Physics at 10 AM       │
   │   taught by Mr. Sharma."                        │
   └───────────────────────────────────────────────┘
                          │
                          ▼
   STEP 3 — Record what actually happened (Classes)
   ┌───────────────────────────────────────────────┐
   │  The class is held. A team member logs it:      │
   │  date, time, hours, was it recorded, the video  │
   │  file, was it edited, where was it uploaded,    │
   │  was the teacher paid.                           │
   └───────────────────────────────────────────────┘
                          │
                          ▼
   STEP 4 — See the results (Dashboard & Reports)
   ┌───────────────────────────────────────────────┐
   │  Counts, pending work, teacher hours, payments, │
   │  downloadable spreadsheets.                      │
   └───────────────────────────────────────────────┘
```

**In plain words:** First you tell the app about your teachers, subjects and batches. Then you plan a weekly timetable. Then, as classes happen, you fill in the details. The app automatically adds everything up and shows you summaries and reports — no manual counting.

A helpful way to think about it: the foundation lists (universities, subjects, faculty) are like the **drop-down menus** you'll pick from later. Setting them up once means that when you log a class, you just *choose* the teacher and subject instead of typing them every time. This keeps the data clean and consistent.

---

## 4. Getting started — logging in

1. Open the web address your admin gives you (it opens in a normal web browser like Chrome).
2. You'll see a **login screen**. Type your email and password and click **Log in**.
3. If you forget your password, click **Forgot password**. The app emails you a link to set a new one. (The link works for one hour, then expires for safety.)
4. New team members don't create their own account — an **admin invites them by email**. The invite email has a link where the new person sets their own password, and then they can log in.

Once logged in, you stay logged in for about 8 hours, after which you'll be asked to log in again.

---

## 5. The main sections (the menu)

After logging in, you'll see a menu. Here's what each part does, in plain language.

### 🏠 Dashboard
Your **home screen**. It shows a quick health-check of the current month at a glance:

- How many classes happened this month
- How many were **online** vs **offline**
- **Pending work** — classes still waiting to be recorded, edited, or uploaded
- Total teaching **hours per teacher**
- A short list of **recent activity** (what was changed lately)

This is the screen to open every morning to see "what still needs doing."

### 📚 Classes
The **heart of the app**. This is where each class gets logged. For every class you can record a lot of detail (you only fill what you need):

- **Basics:** date, start/end time, total hours, teacher, subject, university, batch, the chapter/unit covered
- **How it was held:** online or offline, which platform (Zoom, etc.)
- **Recording:** was it recorded, the video file name, how long it is, where it's stored, a link to it, and whether there's a backup
- **Editing:** has the video been edited yet
- **Uploading:** was it put on the student app, YouTube, Google Drive, or a hard disk — with dates and links for each
- **Payment:** has the teacher been paid, plus any remarks
- **Status:** scheduled, taken, cancelled, etc.

You can **filter** this list — for example, "show me only classes that haven't been recorded yet" or "only Batch A in May." This makes finding pending work easy.

### 🗓️ Timetable
The **weekly plan**. You first pick a university, then a batch, and you see a calendar-style grid of the week. Each slot says which subject, which teacher, and the time. A slot can be marked as **scheduled**, **taken**, or **not taken**, so you can see at a glance whether the planned class actually happened.

### 👨‍🏫 Faculty *(Admin only)*
The list of **teachers**. For each teacher you store their name and details, and link them to the **subjects** they teach, the **universities** they work with, and the **batches** they handle. These links are what make the teacher appear as an option when logging a class.

### 📊 Reports
**Summaries you can read or download.** There are five ready-made reports:

1. **Faculty report** — hours taught and classes per teacher
2. **Recordings report** — how many classes were recorded vs not, edited vs not
3. **Uploads report** — what's been uploaded and where
4. **Payment report** — who's paid and who's pending
5. **University report** — activity grouped by university

You choose a date range, and you can **download any report as a spreadsheet (CSV)** to open in Excel or Google Sheets.

### ⚙️ Settings *(Admin only)*
This is where the **foundation lists** live. Four lists:

- **Universities** — the institutions
- **Streams** — broad categories within a university (e.g., Science, Commerce)
- **Batches** — the specific student groups
- **Subjects** — the subjects taught

Admins add, rename, or deactivate items here. (Items are usually *deactivated* rather than fully deleted, so old records that point to them stay intact.)

### 👥 Users *(Admin only)*
Where the admin **invites new team members**, sets whether they are admin or staff, resets passwords, and removes people who've left.

### 📜 Activity Log *(Admin only)*
A **history book**. Every important change — who created a class, who edited a teacher, who deleted something — is recorded here with the person's name and the time. Useful for accountability and for answering "who changed this and when?"

---

## 6. A typical workflow (walkthrough)

Here's how a normal week might go, step by step:

**One-time setup (Admin):**
1. Go to **Settings** and add your universities, streams, batches, and subjects.
2. Go to **Faculty** and add each teacher, ticking the subjects and batches they handle.
3. Go to **Users** and invite your team members.

**Planning (Admin or staff):**
4. Open **Timetable**, pick a university and batch, and lay out the week's classes.

**Every day (Staff):**
5. After a class is taught, open **Classes** and click to add a new class.
6. Fill in the date, time, teacher, subject, and batch.
7. Tick whether it was recorded, and where the video is saved.
8. Later, when the video is edited and uploaded, come back and update those fields.
9. When the teacher is paid, mark the payment as done.

**Reviewing (Anyone):**
10. Check the **Dashboard** each morning for pending recordings/edits/uploads.
11. At month-end, open **Reports**, pick the date range, and download the spreadsheets you need.

---

## 7. Common tasks — quick steps

**Log a new class**
→ Classes → "Add" → fill the form → Save.

**Mark a recording as uploaded to YouTube**
→ Classes → find the class → edit it → tick "Upload YouTube," add the date and link → Save.

**Find all classes not yet recorded**
→ Classes → use the filter and choose "not recorded."

**Download this month's payment report**
→ Reports → choose Payment → set the date range → Download.

**Add a new teacher** *(Admin)*
→ Faculty → "Add" → enter name → tick their subjects/batches → Save.

**Invite a new team member** *(Admin)*
→ Users → "Invite" → enter their name, email, and role → they get an email to finish setup.

**See who changed something** *(Admin)*
→ Activity Log → scroll or search the history.

---

## 8. Where the data is kept (in simple terms)

- Everything you enter is saved in a secure **online database** in the cloud. It is not stored on your personal computer, so any team member with permission sees the same up-to-date information.
- Because it's online, **the changes you make are instant** for everyone — no emailing files back and forth.
- The app keeps a **history log**, so changes can be traced.
- Logging in is protected by a password, and the system remembers you for a few hours before asking again.

> **Note on videos:** The app stores the *details about* a recording — its name, length, and a **link** to where the video lives (Google Drive, YouTube, hard disk, etc.). The actual video files themselves live in those storage places, not inside this app. Think of the app as the *catalogue/index*, and the video files as the *books on the shelf*.

---

## 9. Glossary (plain meanings)

| Word you'll see | What it means |
|-----------------|---------------|
| **Faculty** | A teacher |
| **Batch** | A specific group of students |
| **Stream** | A broad category like Science or Commerce |
| **Master data / Settings** | The background lists (universities, subjects, etc.) you pick from |
| **Slot** | One time-box in the weekly timetable (e.g., Monday 10 AM) |
| **Editing status** | Whether a recorded video has been edited yet |
| **Upload** | Putting the video somewhere students can see it (app, YouTube, Drive) |
| **CSV** | A spreadsheet file you can open in Excel or Google Sheets |
| **Activity Log** | The history of who changed what and when |
| **Admin / Staff** | Manager-level access vs day-to-day access |

---

## 10. Tips & troubleshooting

- **"I can't see Settings / Faculty / Users."** Those are admin-only. Ask your admin if you need access changed.
- **"My filter shows nothing."** You may have filters that are too narrow (e.g., a date range with no classes). Clear the filters and try again.
- **"I was logged out."** For security, you're logged out after about 8 hours. Just log back in — nothing is lost.
- **"I forgot my password."** Use **Forgot password** on the login screen; the reset link is valid for one hour.
- **Keep the foundation tidy.** Whenever a new subject, batch, or teacher appears, add it in Settings/Faculty *first* — then it'll be available to pick when logging classes.

---

*That's it! In short: set up your lists once, plan your timetable, log each class as it happens, and let the Dashboard and Reports do the counting for you.*
