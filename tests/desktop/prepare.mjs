import {mkdir, readFile, writeFile} from 'node:fs/promises';

const production = JSON.parse(await readFile('src-tauri/tauri.conf.json', 'utf8'));
const config = {
  identifier: 'com.taskweave.reminder-qa',
  app: { windows: [{
    // Keep production host settings: overriding dragDropEnabled here would hide the bug.
    ...production.app.windows[0],
    label: 'main', title: 'TaskWeave isolated QA',
  }] },
};
await mkdir('src-tauri/target', {recursive: true});
await writeFile('src-tauri/target/native-reminder-qa.json', JSON.stringify(config, null, 2));
console.log('Generated isolated desktop QA configuration. Production database is not used.');
