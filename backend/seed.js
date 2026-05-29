import 'dotenv/config';
import bcrypt from 'bcrypt';
import { sql } from './db.js';

const hash = await bcrypt.hash('Admin@1234', 12);
await sql`
  INSERT INTO users (name, email, password_hash, role)
  VALUES ('Admin', 'admin@classapp.com', ${hash}, 'admin')
  ON CONFLICT (email) DO NOTHING
`;
console.log('Admin user seeded.');
process.exit(0);
