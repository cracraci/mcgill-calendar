// Usage: node check.js <new.ics> <current.ics> <today YYYY-MM-DD>
// Exits non-zero if the new calendar looks broken, so a bad run never replaces a good file.
const fs=require('fs');
const [nw,cur,today]=process.argv.slice(2);
const n=fs.readFileSync(nw,'utf8'), c=fs.existsSync(cur)?fs.readFileSync(cur,'utf8'):'';
const count=s=>(s.match(/^BEGIN:VEVENT/gm)||[]).length;
const fail=m=>{console.error('REFUSED: '+m);process.exit(1);};
if(!n.startsWith('BEGIN:VCALENDAR')||!/END:VCALENDAR\s*$/.test(n)) fail('not a complete calendar file');
const a=count(n), b=count(c);
if(a===0 && today<'2026-12-17') fail('no events left before the end of exams');
if(b>0 && a<b*0.5 && b-a>10) fail(`event count dropped from ${b} to ${a}`);
const strip=s=>s.replace(/^DTSTAMP:.*\r?\n/gm,'');
console.log(strip(n)===strip(c)?'UNCHANGED':`CHANGED ${b} -> ${a} events`);
