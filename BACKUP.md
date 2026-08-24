# Database backups

Railway's Hobby plan takes no automatic database backups, so the app takes its
own: a nightly `pg_dump` run by GitHub Actions, kept as a workflow artifact.

| | |
|---|---|
| What runs it | `.github/workflows/db-backup.yml`, on `origin` (`ananducn/EdDream-Class-and-tutor-management`) |
| When | 19:30 UTC / 01:00 IST, daily — plus any manual run |
| Format | `pg_dump --format=custom`, compressed, `--no-owner --no-privileges` |
| Where it lands | The run's artifact, named `eddream-db-<timestamp>` |
| How long it is kept | 90 days, then GitHub expires it |

## One-time setup

1. **Get the public connection string.** In the Railway project, open the
   **Postgres** service → **Variables** → copy `DATABASE_PUBLIC_URL`. It looks
   like `postgresql://postgres:…@…proxy.rlwy.net:PORT/railway`.

   Use the *public* URL, not `DATABASE_URL`. The private
   `postgres.railway.internal` host only resolves inside Railway's network; from
   a GitHub runner it fails with `ENOTFOUND`.

2. **Add it as a repository secret.** On GitHub → the repo → **Settings** →
   **Secrets and variables** → **Actions** → **New repository secret**:

   - Name: `DATABASE_URL`
   - Value: the URL from step 1

3. **Run it once by hand** to confirm it works: **Actions** → **Database
   backup** → **Run workflow**. A good run finishes with a summary listing the
   dump's size and its table count, and an artifact to download.

   Note what that check does and does not prove. It counts `TABLE DATA` entries
   in the archive, and `pg_dump` writes one per table whether or not the table
   has rows — so it catches a truncated or corrupt file, not an empty database.
   A dump of a database with nothing in it passes.

4. **Do a restore test now, not during an outage.** See below.

## Restoring

Download the artifact from the run's page and unzip it — GitHub wraps artifacts
in a zip, so you get `eddream-<timestamp>.dump` out of it.

Restore into a **scratch database first** and look at it before you go anywhere
near production:

```sh
createdb eddream_restore_test                      # or create one on the host
pg_restore --no-owner --no-privileges \
  -d "postgresql://…/eddream_restore_test" \
  eddream-20260824-193000.dump
```

Restoring over a live database is destructive — `--clean --if-exists` drops each
object before recreating it, and anything written since the dump is gone:

```sh
pg_restore --clean --if-exists --no-owner --no-privileges \
  -d "$DATABASE_PUBLIC_URL" \
  eddream-20260824-193000.dump
```

Take a fresh dump of the current state before doing that, even when the current
state looks broken — it is the only copy of whatever happened since last night.

## Backing up right now

`backend/scripts/backup-db.sh` dumps on demand — worth doing before a migration
or a manual data fix:

```sh
./backend/scripts/backup-db.sh                        # DATABASE_URL from backend/.env
DATABASE_URL='postgres://…' ./backend/scripts/backup-db.sh
```

Dumps land in `backups/` (git-ignored) and ones older than 30 days are pruned;
override with `BACKUP_KEEP_DAYS`. It needs `pg_dump` at a major version at least
as new as the server, which is PostgreSQL 18:

```sh
brew install postgresql@18
echo 'export PATH="/opt/homebrew/opt/postgresql@18/bin:$PATH"' >> ~/.zshrc
```

## Things that will bite you

- **The schedule only runs from the default branch.** GitHub reads `schedule:`
  triggers from `main` only. While this workflow lives on a feature branch you
  can run it manually, but nothing fires nightly until it is merged to `main`.
- **GitHub pauses cron on quiet repos.** A repository with no commits for 60
  days has its scheduled workflows disabled, silently. Either push something
  occasionally or check the Actions tab monthly.
- **A run that fails is a night without a backup.** GitHub emails the repo owner
  on a failed scheduled run — don't filter those away.
- **This is a logical dump of one database.** It carries schema and data, not
  roles, not other databases on the server, not anything living outside Postgres.
- **The secret goes stale if the database is recreated.** Railway issues a new
  password when the Postgres service is re-provisioned; update the secret then.
- **A backup nobody has restored is a guess.** Restore-test after any schema
  change big enough to worry about.
