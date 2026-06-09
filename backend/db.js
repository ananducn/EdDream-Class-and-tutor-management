import { neon, types } from '@neondatabase/serverless';
import 'dotenv/config';

// Return PostgreSQL DATE columns (OID 1082) as plain 'YYYY-MM-DD' strings.
// By default the driver parses them into JS Date objects at LOCAL midnight,
// which in a non-UTC timezone shifts the value back a day once serialized to
// UTC JSON (e.g. 2026-05-29 -> "2026-05-28T18:30:00Z"). Keeping the raw string
// avoids that off-by-one and keeps dates stable across read/write round-trips.
types.setTypeParser(1082, (value) => value);

const sql = neon(process.env.DATABASE_URL);

export { sql };
