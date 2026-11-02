import assert from 'node:assert/strict';
import {connect} from './cdp.mjs';

// Run --prepare, stop/restart the isolated app, then run --verify.
const c=await connect(9352);
const invoke=(command,args={})=>c.evaluate(`window.__TAURI_INTERNALS__.invoke(${JSON.stringify(command)},${JSON.stringify(args)})`);
const execute=(query,values=[])=>invoke('plugin:sql|execute',{db:'sqlite:taskweave.db',query,values});
const select=(query,values=[])=>invoke('plugin:sql|select',{db:'sqlite:taskweave.db',query,values});
let popup;
try {
  await c.wait(`document.querySelector('.app-shell')`);
  assert((await invoke('plugin:path|resolve_directory',{directory:13})).endsWith('com.taskweave.reminder-qa'),'Only the isolated QA database may be modified');
  if(process.argv.includes('--prepare')) {
    await execute("delete from reminder_alerts where id like 'central-restart-%'");
    await execute("insert into reminder_alerts(id,title,description,scheduled_at,available_at,is_test) values('central-restart-pending','Restart: pending','Unacknowledged delivery','2020-01-01T14:00','2020-01-01T14:00:00',1),('central-restart-snoozed','Restart: snoozed','Delayed delivery','2020-01-01T14:00','2020-01-01T14:00:00',1)");
    await invoke('snooze_reminder_alert',{id:'central-restart-snoozed'});
    console.log('Prepared a pending alert and a five-minute snooze. Stop and restart the isolated app now.');
  } else {
    assert(process.argv.includes('--verify'),'Use --prepare or --verify');
    await c.wait(`window.__TAURI_INTERNALS__.invoke('plugin:window|is_visible',{label:'reminder-popup'}).catch(()=>false)`);
    popup=await connect(9352,'reminder-popup');
    await popup.wait(`document.querySelector('[data-alert-id="central-restart-pending"]')`);
    assert.equal(await popup.evaluate(`!!document.querySelector('[data-alert-id="central-restart-snoozed"]')`),false);
    const rows=await select("select id,available_at from reminder_alerts where id like 'central-restart-%' order by id");
    assert.equal(rows.length,2,'Restart preserves both deliveries without duplication');
    assert(new Date(rows.find(a=>a.id.endsWith('snoozed')).available_at).getTime()>Date.now(),'Snoozed delivery still waits until its own time');
    await execute("update reminder_alerts set available_at='2020-01-01T14:00:00' where id='central-restart-snoozed'");
    await popup.wait(`document.querySelector('[data-alert-id="central-restart-snoozed"]')`);
    await invoke('dismiss_reminder_alerts',{ids:rows.map(a=>a.id)});
    console.log('PASS: pending and snoozed alerts survive native app restart; only due alerts appear, no duplicates, snoozed alert returns when due.');
  }
} finally {popup?.socket.close();c.socket.close();}
