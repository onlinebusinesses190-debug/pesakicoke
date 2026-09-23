/* eslint-disable */

const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
const db = new sqlite3.Database('C:\\Users\\Administrator\\.local\\share\\kilo\\kilo.db');

// The session that did the admin work
const session = 'ses_f3444a664ffeRUFpsXErHBhQDf';

// Files to extract (with their write content if available)
const files = [
  { name: 'admin.tsx', paths: ['admin.tsx'] },
  { name: 'admin.index.tsx', paths: ['admin.index.tsx'] },
  { name: 'admin.users.tsx', paths: ['admin.users.tsx'] },
  { name: 'admin.deposits.tsx', paths: ['admin.deposits.tsx'] },
  { name: 'admin.withdrawals.tsx', paths: ['admin.withdrawals.tsx'] },
  { name: 'admin.referrals.tsx', paths: ['admin.referrals.tsx'] },
  { name: 'admin.actions.tsx', paths: ['admin.actions.tsx'] },
  { name: 'admin.finance.tsx', paths: ['admin.finance.tsx'] },
  { name: 'admin.business.tsx', paths: ['admin.business.tsx'] },
  { name: 'admin.banking.tsx', paths: ['admin.banking.tsx'] },
  { name: 'admin.kazi.tsx', paths: ['admin.kazi.tsx'] },
  { name: 'admin.notifications.tsx', paths: ['admin.notifications.tsx'] },
  { name: 'admin.support.tsx', paths: ['admin.support.tsx'] },
  { name: 'admin.reports.tsx', paths: ['admin.reports.tsx'] },
  { name: 'admin.commissions.tsx', paths: ['admin.commissions.tsx'] },
  { name: 'admin.trading.tsx', paths: ['admin.trading.tsx'] },
  { name: 'AdminShell.tsx', paths: ['AdminShell.tsx'] },
  { name: 'useAdmin.ts', paths: ['useAdmin.ts'] },
  { name: 'admin-utils.ts', paths: ['admin-utils.ts'] },
  { name: 'admin.ts', paths: ['admin.ts'] },
];

const results: Record<string, string> = {};

for (const file of files) {
  for (const p of file.paths) {
    const pattern = `%${p}%`;
    db.all(
      "SELECT time_created, data FROM part WHERE session_id = ? AND data LIKE ? ORDER BY time_created DESC LIMIT 50",
      [session, pattern],
      (err: Error | null, rows: Array<{ time_created: string; data: string }>) => {
        if (err) { console.error(err.message); return; }
        for (const row of rows) {
          try {
            const data: { type?: string; tool?: string; state?: { input?: { content?: string }; output?: string } } = JSON.parse(row.data);
            if (data.type === 'tool') {
              if (data.tool === 'write' && data.state?.input?.content) {
                const content = data.state.input.content;
                if (content && content.length > 0) {
                  if (!results[file.name] || results[file.name].length < content.length) {
                    results[file.name] = content;
                    console.log(`Found WRITE for ${file.name}: ${content.length} chars`);
                  }
                }
              } else if (data.tool === 'read' && data.state?.output) {
                const output = data.state.output;
                // Extract content from output
                const contentMatch = output.match(/<content>\n([\s\S]*?)<\/type>/);
                if (contentMatch && contentMatch[1].length > 0) {
                  const content = contentMatch[1];
                  if (!results[file.name] || results[file.name].length < content.length) {
                    results[file.name] = content;
                    console.log(`Found READ for ${file.name}: ${content.length} chars`);
                  }
                }
              }
            }
          } catch(e: unknown) {
            // Skip
          }
        }
      }
    );
  }
}

setTimeout(() => {
  console.log('\n=== Extraction Summary ===');
  Object.keys(results).forEach(name => {
    let outPath: string;
    if (name.endsWith('.ts') && name !== 'admin-utils.ts') {
      // Backend file
      outPath = path.join('C:\\temp\\pesakicoko_restore\\pesaki-server\\src\\routes', name);
    } else if (name === 'AdminShell.tsx') {
      outPath = path.join('C:\\temp\\pesakicoko_restore\\src\\components', name);
    } else if (name === 'useAdmin.ts') {
      outPath = path.join('C:\\temp\\pesakicoko_restore\\src\\hooks', name);
    } else if (name === 'admin-utils.ts') {
      outPath = path.join('C:\\temp\\pesakicoko_restore\\src\\lib', name);
    } else if (name === 'admin.ts') {
      outPath = path.join('C:\\temp\\pesakicoko_restore\\pesaki-server\\src\\routes', name);
    } else {
      outPath = path.join('C:\\temp\\pesakicoko_restore\\src\\routes', name);
    }
    
    try {
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, results[name]);
      console.log(`Saved: ${outPath} (${results[name].length} chars)`);
    } catch(e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`Failed to save ${outPath}: ${msg}`);
    }
  });
  db.close();
}, 10000);