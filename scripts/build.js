// Usage: node build.js <planner index.html> <edits.json> <progress.json> <from YYYY-MM-DD> <out.ics>
// Builds a calendar of open deadlines and exams from the Fall 2026 planner page and its saved data.
const fs=require('fs');
const [page,edPath,donePath,from,out]=process.argv.slice(2);
const html=fs.readFileSync(page,'utf8');
const cut=(a,b)=>{const i=html.indexOf(a),j=html.indexOf(b,i);if(i<0||j<0)throw new Error('Planner layout changed: '+a);return html.slice(i,j);};
const code=[cut('const COURSES =','let ITEMS ='),cut('const pad =','const TODAY'),cut('const TERM_START','const HELP')].join('\n');
eval(code.replace(/^(const|let) /gm,'var '));
const edits=JSON.parse(fs.readFileSync(edPath,'utf8'));
const done=JSON.parse(fs.readFileSync(donePath,'utf8'));
function addDays(s,n){const d=parse(s);d.setDate(d.getDate()+n);return iso(d);}
// same layering as the page's rebuild()
const applyOv=i=>edits.ov[i.id]?{...i,...edits.ov[i.id]}:i, notHidden=i=>!(edits.ov[i.id]&&edits.ov[i.id].hidden);
const base=BASE_ITEMS.map(applyOv).filter(notHidden);
const GEN=base.filter(i=>i.k==="exam"&&i.d).map(i=>{const n=(EXAM_INFO[i.id]&&EXAM_INFO[i.id].prep)||7;
  return {id:"prep-"+i.id,c:i.c,d:addDays(i.d,-n),k:"task",t:"Start studying: "+i.t,note:n+" days before the exam on "+i.d+"."};});
const ITEMS=base.concat(GEN.map(applyOv).filter(notHidden),edits.custom.map(x=>({...x,mine:true})));
const SESSIONS=BASE_SESSIONS.map((s,i)=>({...s,...(edits.sess["s"+i]||{}),sid:"s"+i}));
const skipped=(s,ds)=>SKIP.find(k=>ds>=k.from&&ds<=k.to&&k.c===s.c&&(!k.kind||s.kind.startsWith(k.kind)));
const cancelled=(s,ds)=>edits.cancels.some(k=>k.d===ds&&k.sid===s.sid);
const FL={est:"estimated",tent:"tentative",check:"to confirm",conflict:"sources disagree",tba:"time or room TBA"};
const esc=t=>String(t).replace(/\\/g,'\\\\').replace(/;/g,'\;').replace(/,/g,'\\,').replace(/\r?\n/g,'\\n');
const fold=l=>{const b=Buffer.from(l,'utf8');if(b.length<=75)return l;let o=[],cur='',len=0,lim=75;for(const ch of l){const n=Buffer.byteLength(ch);if(len+n>lim){o.push(cur);cur=' ';len=1;lim=75;}cur+=ch;len+=n;}o.push(cur);return o.join('\r\n');};
const dt=(d,t)=>d.replace(/-/g,'')+'T'+t.replace(':','').padStart(4,'0')+'00';
const addMin=(t,m)=>{let [h,mi]=t.split(':').map(Number);mi+=h*60+m;return pad(Math.floor(mi/60))+':'+pad(mi%60);};
const stamp=new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d+/,'');
const ev=[];
function add(uid,sum,d,s,e,desc,loc){const L=['BEGIN:VEVENT','UID:'+uid+'@fall2026-planner','DTSTAMP:'+stamp];
  if(s){L.push('DTSTART;TZID=America/Toronto:'+dt(d,s),'DTEND;TZID=America/Toronto:'+dt(d,e));}
  else{L.push('DTSTART;VALUE=DATE:'+d.replace(/-/g,''),'DTEND;VALUE=DATE:'+addDays(d,1).replace(/-/g,''),'TRANSP:TRANSPARENT');}
  L.push('SUMMARY:'+esc(sum));if(loc)L.push('LOCATION:'+esc(loc));if(desc)L.push('DESCRIPTION:'+esc(desc));L.push('END:VEVENT');ev.push(...L);}
let nItems=0,nClass=0;
for(const i of ITEMS){
  if(!i.d||i.d<from||done[i.id]||(i.k==='event'&&i.id!=='u-wnoref')||/^prep-/.test(i.id))continue;
  const code=COURSES[i.c]?COURSES[i.c].code:'';
  const tm=i.time||'';let s=null,e=null;
  const r=tm.match(/^(\d{1,2}:\d{2})(?: to (\d{1,2}:\d{2}))?/);
  if(i.k!=='task'){ if(i.s&&i.e){s=i.s;e=i.e;} else if(r){s=r[1];e=r[2]||addMin(r[1],i.k==='exam'?60:30);} }
  let sum=(code&&i.c!=='mine'?code+': ':'')+i.t;
  if(!s&&i.k==='task'&&!/^Start studying/.test(i.t)){ sum='Due'+(r&&!r[2]&&!/^Closes/.test(tm)?' '+r[1]:'')+': '+sum; }
  if(/Closes (\d{1,2}:\d{2})/.test(tm)) sum=sum.replace(/^Due: /,'Due '+tm.match(/Closes (\d{1,2}:\d{2})/)[1]+': ');
  if(i.flag&&FL[i.flag])sum+=' ['+FL[i.flag]+']';
  const desc=[tm&&!s?'Time: '+tm:'',i.note||'',i.w?'Worth '+i.w+'% of the course grade.':'',i.src?'Source: '+i.src:''].filter(Boolean).join('\n\n');
  add(i.id,sum,i.d,s,e,desc,i.room||'');nItems++;
}
for(let d=from;process.env.CLASSES&&d<=TERM_END;d=addDays(d,1)){
  const wd=parse(d).getDay();
  SESSIONS.filter(s=>s.day===wd&&(!NO_CLASS[d]||s.meeting)&&(!s.from||d>=s.from)&&(!s.until||d<=s.until)&&!skipped(s,d)&&!cancelled(s,d)).forEach(s=>{
    const desc=[s.who?'With '+s.who:'',s.note||'',DAY_NOTE[d]||''].filter(Boolean).join('\n\n');
    add('class-'+s.sid+'-'+d,COURSES[s.c].code+' '+s.kind,d,s.s,s.e,desc,s.room||'');nClass++;});
}
const VTZ=['BEGIN:VTIMEZONE','TZID:America/Toronto','BEGIN:DAYLIGHT','TZOFFSETFROM:-0500','TZOFFSETTO:-0400','TZNAME:EDT','DTSTART:19700308T020000','RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU','END:DAYLIGHT','BEGIN:STANDARD','TZOFFSETFROM:-0400','TZOFFSETTO:-0500','TZNAME:EST','DTSTART:19701101T020000','RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU','END:STANDARD','END:VTIMEZONE'];
const all=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Fall 2026 planner//EN','CALSCALE:GREGORIAN','X-WR-CALNAME:McGill Fall 2026','X-WR-TIMEZONE:America/Toronto',...VTZ,...ev,'END:VCALENDAR'];
fs.writeFileSync(out,all.map(fold).join('\r\n')+'\r\n');
console.log('items',nItems,'classes',nClass);
