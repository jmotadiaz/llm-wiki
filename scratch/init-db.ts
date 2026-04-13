import { getDatabase } from './server/src/db/schema.js';
import path from 'path';
import { fileURLToPath } from 'url';

const db = getDatabase();
console.log('Database initialized');
db.close();
