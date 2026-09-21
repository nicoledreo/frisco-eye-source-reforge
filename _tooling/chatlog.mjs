#!/usr/bin/env node
/* chatlog.mjs — turn a Claude Code session transcript into a readable log.
 *
 *   node _tooling/chatlog.mjs <session.jsonl> <out.md> "<title>" [preamble.md]
 *
 * The raw transcript is JSONL and mostly base64 screenshot payloads. This keeps
 * what is worth re-reading — what was asked, what was decided, what each tool
 * call did — and drops the binary.
 *
 * Captures three things the naive pass misses:
 *   - mid-turn user messages, stored as {type:"queue-operation",operation:"enqueue"}
 *     with no message.role, so a role-based filter drops them entirely;
 *   - AskUserQuestion answers, which arrive as tool_result blocks — i.e. the
 *     user's actual decisions were being thrown away;
 *   - an optional preamble file inserted after the stats table, for a
 *     resume-here summary (the live session cannot log its own final turn).
 */
import fs from 'node:fs';

const [src, out, title, preamble] = process.argv.slice(2);
const lines = fs.readFileSync(src, 'utf8').split('\n').filter(Boolean);

const clip = (s, n) => { s = String(s).replace(/\r/g, ''); return s.length > n ? s.slice(0, n) + ' …[truncated]' : s; };
const rows = [];
const toolNames = new Map();          // tool_use id -> tool name
let users = 0, assists = 0, tools = 0, images = 0, decisions = 0, midturn = 0;

for (const line of lines) {
  let e; try { e = JSON.parse(line); } catch { continue; }

  // Mid-turn user messages: no message.role, so the role filter never sees them.
  // "enqueue" only — "remove" is the same text echoed back on absorption.
  if (e.type === 'queue-operation' && e.operation === 'enqueue' && e.content) {
    users++; midturn++;
    rows.push({ role: 'user', text: clip(String(e.content).trim(), 4000), mid: true });
    continue;
  }

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
      toolNames.set(p.id, p.name);
      const i = p.input || {};
      const what = i.description || i.command || i.file_path || i.pattern || i.prompt || i.url || '';
      rows.push({ role: 'tool', name: p.name, text: clip(String(what).replace(/\s+/g, ' '), 300) });
    }

    // The user's decisions come back as tool_result, not as a user message.
    if (p.type === 'tool_result' && toolNames.get(p.tool_use_id) === 'AskUserQuestion') {
      const c = typeof p.content === 'string'
        ? p.content
        : (Array.isArray(p.content) ? p.content.map(x => x && x.text ? x.text : '').join('\n') : '');
      const picked = [...String(c).matchAll(/"([^"]+)"\s*=\s*"([^"]+)"/g)]
        .map(mm => `- **${mm[1]}**\n  - → chose: **${mm[2]}**`);
      if (picked.length) { decisions++; rows.push({ role: 'decision', text: picked.join('\n') }); }
    }
  }
}

const rawSibling = out.replace(/\.md$/, '.raw.jsonl');
const rawHere = fs.existsSync(rawSibling);

// Paths arrive in either separator style — the documented transcript path is
// Windows-style, so splitting on '/' alone would leave the whole path as the id.
const SEP = /[\\/]/;
const base = p => String(p).split(SEP).pop();

const md = [];
md.push('# ' + title, '');
// Local date, not UTC: at GMT+0800 a late-evening run stamps the previous day,
// which is part of why the first two session logs both read 2026-09-21.
const today = (d => new Date(d.getTime() - d.getTimezoneOffset() * 60000)
  .toISOString().slice(0, 10))(new Date());
md.push('Session transcript, Claude Code. Generated ' + today + '.', '');
md.push('| | |', '|---|---|');
md.push('| Session id | `' + base(src).replace('.jsonl', '') + '` |');
md.push('| User messages | ' + users + (midturn ? ' (' + midturn + ' sent mid-turn)' : '') + ' |');
md.push('| Assistant replies | ' + assists + ' |');
md.push('| Tool calls | ' + tools + ' |');
md.push('| Decisions recorded | ' + decisions + ' |');
md.push('| Screenshots reviewed | ' + images + ' |');
md.push('| Raw transcript | ' + (rawHere
  ? '`' + base(rawSibling) + '` (kept beside this file) |'
  : '`' + String(src).split(SEP).join('/') + '` (NOT copied here) |'));
md.push('');
md.push('Tool calls are listed as `▸ Tool — what it did`, so the log reads as a narrative');
md.push('rather than a dump. Long outputs are truncated' + (rawHere
  ? '; the raw `.jsonl` beside this file is the complete record.'
  : '. The raw transcript was not copied into this folder; the path above is the complete record.'));
md.push('');

if (preamble && fs.existsSync(preamble)) {
  md.push('---', '', fs.readFileSync(preamble, 'utf8').trim(), '');
}

md.push('---', '');

let lastRole = null;
for (const r of rows) {
  if (r.role === 'tool') { md.push('▸ **' + r.name + '** — ' + r.text, ''); lastRole = 'tool'; continue; }
  if (r.role === 'decision') { md.push('', '> 🟦 **User decision**', '>', ...r.text.split('\n').map(l => '> ' + l), ''); lastRole = 'decision'; continue; }
  if (r.role === 'user') { md.push('', '## 🧑 User' + (r.mid ? ' _(sent mid-turn)_' : ''), '', r.text, ''); lastRole = 'user'; continue; }
  if (lastRole !== 'assistant') md.push('### 🤖 Claude', '');
  md.push(r.text, '');
  lastRole = 'assistant';
}

fs.writeFileSync(out, md.join('\n'));
console.log('chatlog written');
console.log('  ' + out);
console.log('  ' + users + ' user messages (' + midturn + ' mid-turn) · ' + assists + ' replies · ' + tools + ' tool calls · ' + decisions + ' decisions · ' + images + ' screenshots');
console.log('  ' + (fs.statSync(out).size / 1024).toFixed(0) + ' KB');
