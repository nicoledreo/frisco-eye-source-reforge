#!/usr/bin/env node
/* chatlog.mjs — turn a Claude Code session transcript into a readable log.
 *
 *   node _tooling/chatlog.mjs <session.jsonl> <out.md> "<title>"
 *
 * The raw transcript is JSONL and mostly base64 screenshot payloads (25 MB for
 * this session). This keeps what is worth re-reading — what was asked, what was
 * decided, what each tool call did — and drops the binary.
 */
import fs from 'node:fs';

const [src, out, title] = process.argv.slice(2);
const lines = fs.readFileSync(src, 'utf8').split('\n').filter(Boolean);

const clip = (s, n) => { s = String(s).replace(/\r/g, ''); return s.length > n ? s.slice(0, n) + ' …[truncated]' : s; };
const rows = [];
let users = 0, assists = 0, tools = 0, images = 0;

for (const line of lines) {
  let e; try { e = JSON.parse(line); } catch { continue; }
  const m = e.message;
  if (!m || !m.role) continue;
  const parts = Array.isArray(m.content) ? m.content : [{ type: 'text', text: m.content }];

  for (const p of parts) {
    if (!p) continue;
    if (p.type === 'image') { images++; continue; }

    if (p.type === 'text' && p.text && p.text.trim()) {
      const t = p.text.trim();
      // drop the harness noise, keep the conversation
      if (/^<(command-name|command-message|local-command|system-reminder)/.test(t)) continue;
      if (/^\[SYSTEM NOTIFICATION/.test(t)) continue;
      if (m.role === 'user') { users++; rows.push({ role: 'user', text: clip(t, 4000) }); }
      else { assists++; rows.push({ role: 'assistant', text: clip(t, 6000) }); }
    }

    if (p.type === 'tool_use') {
      tools++;
      const i = p.input || {};
      const what = i.description || i.command || i.file_path || i.pattern || i.prompt || i.url || '';
      rows.push({ role: 'tool', name: p.name, text: clip(String(what).replace(/\s+/g, ' '), 300) });
    }
  }
}

const md = [];
md.push('# ' + title, '');
md.push('Session transcript, Claude Code. Generated ' + new Date().toISOString().slice(0, 10) + '.', '');
md.push('| | |', '|---|---|');
md.push('| Session id | `' + src.split(/[\\/]/).pop().replace('.jsonl', '') + '` |');
md.push('| User messages | ' + users + ' |');
md.push('| Assistant replies | ' + assists + ' |');
md.push('| Tool calls | ' + tools + ' |');
md.push('| Screenshots reviewed | ' + images + ' |');
md.push('| Raw transcript | `' + src.split(/[\\/]/).pop() + '` (kept beside this file) |');
md.push('');
md.push('Tool calls are listed as `▸ Tool — what it did`, so the log reads as a narrative');
md.push('rather than a dump. Long outputs are truncated; the raw `.jsonl` beside this file');
md.push('is the complete record.');
md.push('', '---', '');

let lastRole = null;
for (const r of rows) {
  if (r.role === 'tool') { md.push('▸ **' + r.name + '** — ' + r.text, ''); lastRole = 'tool'; continue; }
  if (r.role === 'user') { md.push('', '## 🧑 User', '', r.text, ''); lastRole = 'user'; continue; }
  if (lastRole !== 'assistant') md.push('### 🤖 Claude', '');
  md.push(r.text, '');
  lastRole = 'assistant';
}

fs.writeFileSync(out, md.join('\n'));
console.log('chatlog written');
console.log('  ' + out);
console.log('  ' + users + ' user messages · ' + assists + ' replies · ' + tools + ' tool calls · ' + images + ' screenshots');
console.log('  ' + (fs.statSync(out).size / 1024).toFixed(0) + ' KB');
