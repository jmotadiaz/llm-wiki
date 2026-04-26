import fs from 'fs';
import path from 'path';

async function restore() {
  const bkDir = path.join(process.cwd(), 'data-bk', 'raw');
  const files = fs.readdirSync(bkDir);
  
  for (const file of files) {
    if (!file.toLowerCase().endsWith('.md')) continue;
    const content = fs.readFileSync(path.join(bkDir, file), 'utf-8');
    let title = file.replace(/^\d+-/, '').replace(/\.md$/i, '').replace(/-/g, ' ');
    const match = content.match(/^#\s+(.+)$/m);
    if (match) title = match[1].trim();

    try {
      const res = await fetch('http://localhost:3005/api/ingest/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title,
          content: content,
          sourceUrl: `restore://${file}`
        })
      });
      const data = await res.json();
      console.log(`Restored ${file}:`, data);
    } catch (e) {
      console.error(`Error restoring ${file}:`, e.message);
    }
  }
}

restore();
