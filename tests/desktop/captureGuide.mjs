import assert from 'node:assert/strict';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {resolve, relative, isAbsolute} from 'node:path';
import {connect} from './cdp.mjs';

const arg=(name,fallback)=>process.argv.find(v=>v.startsWith(name+'='))?.slice(name.length+1)??fallback;
const port=Number(arg('--port','9354'));
const origin=new URL(arg('--origin','http://127.0.0.1:4174')).origin;
assert(['127.0.0.1','localhost'].includes(new URL(origin).hostname),'Only a local development server may be used');
assert(Number.isInteger(port)&&port>0&&port<65536,'Invalid CDP port');
const c=await connect(port,origin);
const {send,evaluate,wait}=c;
const date=(offset=0)=>{const d=new Date();d.setDate(d.getDate()+offset);return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');};
const settle=async()=>{await evaluate('document.fonts.ready');await new Promise(r=>setTimeout(r,350));};
const snap=async(path,selector)=>{await settle();if(selector==='.workspace'){const clip=await evaluate(`{const r=document.querySelector('.workspace').getBoundingClientRect();const bottom=Math.max(...[...document.querySelectorAll('.task-card')].map(e=>e.getBoundingClientRect().bottom));({x:r.left+scrollX,y:r.top+scrollY,width:r.width,height:bottom-r.top+20,scale:1})}`);const result=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip});await writeFile(path,Buffer.from(result.data,'base64'));}else await c.screenshot(path,selector);const b=await readFile(path);console.log(path,b.readUInt32BE(16)+'x'+b.readUInt32BE(20));};
const nav=async(label)=>{await evaluate(`document.querySelector('.nav-item[title=${JSON.stringify(label)}]').click()`);await settle();};
const set=async(selector,value,event='input')=>{await evaluate(`{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw new Error(${JSON.stringify(selector)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event(${JSON.stringify(event)},{bubbles:true}));}`);};
try {
  assert.equal(await evaluate('location.origin'),origin);
  // Refuse normal browser profiles before reading or replacing demo storage.
  let browserArgs;
  try { browserArgs=(await send('Browser.getBrowserCommandLine')).arguments; }
  catch { throw new Error('Launch an isolated browser with --enable-automation and a profile inside src-tauri/target. See tests/desktop/README.md.'); }
  const profileArg=browserArgs.find(v=>v.startsWith('--user-data-dir='));
  assert(profileArg,'An isolated browser profile is required');
  const profile=resolve(profileArg.slice('--user-data-dir='.length).replace(/^"|"$/g,''));
  const profileRelative=relative(resolve('src-tauri/target'),profile);
  assert(profileRelative&&!profileRelative.startsWith('..')&&!isAbsolute(profileRelative),'The browser profile must be inside this workspace’s src-tauri/target directory');
  assert.equal(await evaluate('Boolean(window.__TAURI_INTERNALS__)'),false);
  await mkdir('public/help',{recursive:true});
  await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  for(const lang of ['zh','en']) {
    const zh=lang==='zh';
    const parent=zh?'工作':'Work';const project=zh?'周五汇报':'Friday presentation';const personal=zh?'个人':'Personal';
    const base={description:zh?'整理本周进展，准备需要讨论的问题。':'Summarize this week’s progress and prepare questions for discussion.',status:'todo',projectName:project,tags:[],startDate:date(-3),startTime:null,dueDate:date(4),dueTime:null,completionDate:null,parentTaskId:null,parentTitle:null,childCategory:null,childCount:0,sortOrder:0,isImportant:true,isUrgent:false,isOverdue:false,workedToday:false,activityDates:[],deletedAt:null,recurringTemplateId:null,recurrenceOccurrenceDate:null};
    const tasks=[
      {...base,id:'journey-prepare',title:zh?'准备周五的汇报':'Prepare Friday’s presentation',activityDates:[date(-2),date(-1)]},
      {...base,id:'journey-slides',title:zh?'整理汇报资料':'Gather presentation materials',status:'doing',activityDates:[date(-2),date()],workedToday:true,isUrgent:true},
      {...base,id:'journey-confirm',title:zh?'确认汇报时间':'Confirm the presentation time',status:'done',completionDate:date(),isImportant:false,isUrgent:true,activityDates:[date(-1),date()]},
      {...base,id:'journey-reading',title:zh?'整理阅读笔记':'Organize reading notes',projectName:personal,isImportant:false,isUrgent:false,startDate:date(),dueDate:null,sortOrder:1},
    ];
    const projects=[{name:parent,parentName:null},{name:project,parentName:parent},{name:personal,parentName:null}];
    const store={'taskweave.settings.language':lang,'taskweave.settings.theme':'light','taskweave.help.hintDismissed':'true','taskweave.browser.tasks':JSON.stringify(tasks),'taskweave.browser.projects':JSON.stringify(projects),'taskweave.browser.tags':'[]','taskweave.browser.recurringTemplates':'[]','taskweave.browser.reminders':'[]'};
    await evaluate(`localStorage.clear();for(const [k,v] of Object.entries(${JSON.stringify(store)}))localStorage.setItem(k,v);location.reload()`);
    await wait(`document.querySelectorAll('.task-card').length===4`);
    await send('Emulation.setDeviceMetricsOverride',{width:1280,height:780,deviceScaleFactor:1,mobile:false});
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:700,y:740});
    await settle();
    await snap(`public/help/workspace-${lang}.png`,'.workspace');
    await evaluate(`document.querySelector('.filter-add-button').click()`);
    await wait(`document.querySelector('.task-form-create')`);
    await set('.task-form-create .title-field input',zh?'准备周五的汇报':'Prepare Friday’s presentation');
    await evaluate(`if(!document.querySelector('.task-form-create .importance-toggle').classList.contains('active'))document.querySelector('.task-form-create .importance-toggle').click();if(document.querySelector('.task-form-create .urgency-toggle').classList.contains('active'))document.querySelector('.task-form-create .urgency-toggle').click();document.activeElement?.blur()`);
    await snap(`public/help/create-task-${lang}.png`,'.task-form-create');
    await evaluate(`document.querySelector('.task-form-create .form-heading .icon-button').click()`);
    await nav(zh?'项目':'Projects');
    await wait(`document.querySelectorAll('.project-tree-row').length===3`);
    await set('.manager-create input',zh?'下周汇报':'Next week’s presentation');
    await set('.project-parent-field select',parent,'change');
    await snap(`public/help/projects-${lang}.png`,'.manager-panel');
    await nav(zh?'甘特图':'Gantt');
    await wait(`document.querySelector('.gantt-chart .gantt_task')`);
    await evaluate(`{const dates=document.querySelectorAll('.gantt-range-field .date-text-input');dates[0].value=${JSON.stringify(date(-4))};dates[0].dispatchEvent(new Event('input',{bubbles:true}));dates[1].value=${JSON.stringify(date(4))};dates[1].dispatchEvent(new Event('input',{bubbles:true}));}`);
    await wait(`document.querySelector('[data-tw-activity-task-id="journey-slides"][data-tw-activity-date="${date()}"]')`);
    await snap(`public/help/gantt-${lang}.png`,'.gantt-panel');
    await nav(zh?'提醒':'Reminders');
    await wait(`document.querySelector('.reminder-fields')`);
    await set('.reminder-fields .field:nth-child(2) input',zh?'起身走动':'Stand up and walk');
    await set('.reminder-fields .field:nth-child(5) select','hourly','change');
    await set('.reminder-fields .date-text-input',date());
    await set('.reminder-fields input[type=time]','09:30');
    await set('.reminder-fields textarea',zh?'离开工位，活动几分钟。':'Step away from the desk for a few minutes.');
    await snap(`public/help/reminders-${lang}.png`,'.reminder-form');
  }
  assert.deepEqual(c.errors.filter(e=>!JSON.stringify(e).includes('chrome-extension://')),[]);
  await writeFile('src-tauri/target/journey-captures.json',JSON.stringify({capturedAt:new Date().toISOString(),origin,languages:['zh','en'],images:['workspace','create-task','projects','gantt','reminders'],browser:'isolated headless Edge',demoDataOnly:true},null,2));
} finally { c.socket.close(); }
