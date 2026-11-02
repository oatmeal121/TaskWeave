import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {connect} from './cdp.mjs';

const native=true;
const direct=process.argv.includes('--direct');
const physical=true;
const c=await connect(native?9352:9351);const {send,evaluate,wait}=c;
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const date=new Date().toLocaleDateString('sv-SE');
const base={description:'Drag QA',status:'todo',projectName:'Alpha',childCategory:null,tags:[],startDate:date,dueDate:null,completionDate:null,parentTaskId:null,sortOrder:0,isImportant:false,isUrgent:false,activityDates:[],deletedAt:null,recurringTemplateId:null,recurrenceOccurrenceDate:null};
const tasks=[{...base,id:'drag-a',title:'Drag Alpha A'},{...base,id:'drag-b',title:'Drag Alpha B',sortOrder:1},...process.argv.includes('--minimal')?[]:[{...base,id:'drag-c',title:'Drag Beta C',projectName:'Beta',sortOrder:2}]];
const card=title=>`[...document.querySelectorAll('.task-card')].find(e=>e.querySelector('.task-title-text')?.textContent.trim()===${JSON.stringify(title)})`;
const project=title=>`[...document.querySelectorAll('.project-group-toggle')].find(e=>e.querySelector('span')?.textContent.trim()===${JSON.stringify(title)})`;
let dragData=null;const events=[];
c.socket.addEventListener('message',({data})=>{const m=JSON.parse(data);if(m.method==='Input.dragIntercepted')dragData=m.params.data;});
const rect=expr=>evaluate(`{const e=${expr};if(!e)throw new Error('Missing drag control');e.scrollIntoView({block:'nearest',inline:'nearest'});const r=e.getBoundingClientRect();({x:r.x+r.width/2,y:r.y+r.height/2})}`);
async function drag(source,target){
  dragData=null;
  await rect(source);const b=await rect(target);const a=await rect(source);
  if(physical){
    const scale=await evaluate('devicePixelRatio');
    execFileSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File','tests/desktop/nativePointerDrag.ps1','-SourceX',String(Math.round(a.x*scale)),'-SourceY',String(Math.round(a.y*scale)),'-TargetX',String(Math.round(b.x*scale)),'-TargetY',String(Math.round(b.y*scale))],{windowsHide:true,stdio:'pipe'});
    await delay(250);return;
  }
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',...a});
  await send('Input.dispatchMouseEvent',{type:'mousePressed',...a,button:'left',buttons:1,clickCount:1});
  if(direct){
    for(let i=1;i<=20;i++){await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:a.x+(b.x-a.x)*i/20,y:a.y+(b.y-a.y)*i/20,button:'left',buttons:1});await delay(35);}
    await delay(200);
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',...b,button:'left',buttons:0});
    await delay(250);return;
  }
  for(let i=1;i<=12&&!dragData;i++) {await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:a.x+(b.x-a.x)*i/12,y:a.y+(b.y-a.y)*i/12,button:'left',buttons:1});await delay(30);}
  if(!dragData) {await send('Input.dispatchMouseEvent',{type:'mouseReleased',...b,button:'left',buttons:0});throw new Error('Native mouse drag did not start an HTML drag');}
  for(const type of ['dragEnter','dragOver','drop'])await send('Input.dispatchDragEvent',{type,...b,data:dragData});
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',...b,button:'left',buttons:0});
  await delay(250);
}
try {
  if(physical)await send('Emulation.clearDeviceMetricsOverride');else await send('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false});
  if(!native){
    await evaluate(`localStorage.clear();localStorage.setItem('taskweave.settings.language','en');localStorage.setItem('taskweave.help.hintDismissed','true');localStorage.setItem('taskweave.browser.tasks',${JSON.stringify(JSON.stringify(tasks))});localStorage.setItem('taskweave.browser.projects','[{"name":"Alpha","parentName":null},{"name":"Beta","parentName":null}]');localStorage.setItem('taskweave.browser.recurringTemplates','[]');location.reload()`);
  } else {
    await wait(`window.__TAURI_INTERNALS__ && document.querySelector('.app-shell')`);
    const appConfig=await evaluate(`window.__TAURI_INTERNALS__.invoke('plugin:path|resolve_directory',{directory:13})`);
    assert(appConfig.endsWith('com.taskweave.reminder-qa'),'Never seed a real user database');
    await evaluate(`window.__TAURI_INTERNALS__.invoke('plugin:sql|execute',{db:'sqlite:taskweave.db',query:"delete from tasks where id like 'drag-%'",values:[]})`);
    await evaluate(`localStorage.clear();localStorage.setItem('taskweave.settings.language','en');localStorage.setItem('taskweave.help.hintDismissed','true');location.reload()`);
    await wait(`document.querySelector('.nav-item[title="Settings"]')`);
    await evaluate(`document.querySelector('.nav-item[title="Settings"]').click()`);
    await wait(`document.querySelector('input[type=file]')`);
    const backup={format:'taskweave-backup',version:2,exportedAt:new Date().toISOString(),tasks,projects:[{name:'Alpha',parentName:null},{name:'Beta',parentName:null}],tags:[],recurringTemplates:[],reminders:[]};
    const filename=path.resolve('src-tauri/target/native-drag-fixture.json');
    await writeFile(filename,JSON.stringify(backup));
    const root=await send('DOM.getDocument');const node=await send('DOM.querySelector',{nodeId:root.root.nodeId,selector:'input[type=file]'});
    await send('DOM.setFileInputFiles',{nodeId:node.nodeId,files:[filename]});
    await wait(`document.body.innerText.includes('Imported')`);
    await evaluate(`document.querySelector('.nav-item[title="Kanban"]').click()`);
  }
  await wait(`document.querySelectorAll('.task-card').length===${tasks.length}`);
  await evaluate(`window.__dragQA=[];for(const type of ['pointerdown','dragstart','dragenter','dragover','drop','dragend'])document.addEventListener(type,e=>{if(type==='pointerdown'||type==='dragstart'||type==='drop'||type==='dragend')window.__dragQA.push({type,target:e.target.className,x:e.clientX,y:e.clientY,defaultPrevented:e.defaultPrevented})},true)`);
  await send('Input.setInterceptDrags',{enabled:!direct&&!physical});
  await drag(`${card('Drag Alpha A')}.querySelector('.drag-handle')`,card('Drag Alpha B'));
  assert.deepEqual(await evaluate(`[...document.querySelector('.project-task-list').querySelectorAll('.task-title-text')].map(e=>e.textContent.trim())`),['Drag Alpha B','Drag Alpha A'],'Task drag must persist a changed order');
  console.log('PASS: actual mouse drag reorders tasks');
  if(process.argv.includes('--minimal'))process.exitCode=0;
  else {
  await drag(project('Alpha'),project('Beta'));
  assert.deepEqual(await evaluate(`[...document.querySelector('.column').querySelectorAll('.project-group-toggle span')].map(e=>e.textContent.trim())`),['Beta','Alpha'],'Project drag must change group order');
  console.log('PASS: actual mouse drag reorders project groups');
  const column=status=>`[...document.querySelectorAll('.column')].find(e=>e.querySelector('h3')?.textContent.includes('${status}')).querySelector('.task-list')`;
  await drag(`${card('Drag Alpha A')}.querySelector('.drag-handle')`,column('Doing'));
  assert(await evaluate(`${column('Doing')}.innerText.includes('Drag Alpha A')`),'Dropping todo into Doing must change status');
  await drag(`${card('Drag Alpha A')}.querySelector('.drag-handle')`,column('Done'));
  assert(await evaluate(`${column('Done')}.innerText.includes('Drag Alpha A')`),'Dropping into Done must complete task');
  console.log('PASS: actual mouse drag moves Todo to Doing to Done');
  assert.equal(await evaluate("document.querySelectorAll('.task-card .status-select,.child-task .status-select').length"),0);
  assert(await evaluate("[...document.querySelectorAll('.task-card .task-edit-button')].every(e=>e.textContent.trim()===''&&e.getAttribute('aria-label'))"));
  await evaluate('location.reload()');
  await wait("document.querySelectorAll('.task-card').length===3");
  assert(await evaluate("document.querySelector('.column:nth-child(3)').innerText.includes('Drag Alpha A')"),'Status survives reload');
  assert.deepEqual(await evaluate("[...document.querySelector('.column').querySelectorAll('.project-group-toggle span')].map(e=>e.textContent.trim())"),['Beta','Alpha'],'Project order survives reload');
  const rows=await evaluate(`window.__TAURI_INTERNALS__.invoke('plugin:sql|select',{db:'sqlite:taskweave.db',query:"select id,status,completion_date from tasks where id='drag-a'",values:[]})`);
  assert.equal(rows[0].status,'done');assert.equal(rows[0].completion_date,date);
  console.log('PASS: icon labels, removed card dropdowns, database status and completion date, persistence after reload');
  }
} catch(error){console.log('DRAG EVENTS',await evaluate(`window.__dragQA`));throw error;}
finally {await send('Input.setInterceptDrags',{enabled:false});c.socket.close();}
