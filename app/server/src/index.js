// Entry point: loads optional app/.env, then starts the API.
const fs = require('fs');
const path = require('path');

const envFile = path.resolve(__dirname, '../../.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/i);
    if (m && !m[1].startsWith('#') && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const { createApp } = require('./app');

const port = Number(process.env.PORT) || 4000;
const { app } = createApp();
app.listen(port, () => {
  console.log(`LOTO API listening on http://localhost:${port}/api`);
  if (!process.env.SESSION_SECRET) console.log('SESSION_SECRET not set: using a random per-process secret (sessions reset on restart).');
});
