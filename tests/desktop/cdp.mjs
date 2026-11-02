import { writeFile } from 'node:fs/promises';
export async function connect(port = 9351, pageQuery = null) {
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const target = targets.find(t => t.type === 'page' && (pageQuery ? t.url.includes(pageQuery) : port === 9351 ? t.url.startsWith('http://127.0.0.1:4173') : !t.url.includes('reminder-popup')));
  if (!target) throw new Error('Isolated preview browser is not available');
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve,reject) => { socket.addEventListener('open', resolve, {once:true}); socket.addEventListener('error', reject, {once:true}); });
  let id=0; const pending=new Map(); const errors=[];
  socket.addEventListener('message', ({data}) => {
    const msg=JSON.parse(data);
    if(msg.method==='Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails);
    const request=pending.get(msg.id);
    if(request) {clearTimeout(request.timer); pending.delete(msg.id); msg.error?request.reject(msg.error):request.resolve(msg.result);}
  });
  const send=(method,params={})=>new Promise((resolve,reject)=>{const requestId=++id; const timer=setTimeout(()=>{pending.delete(requestId);reject(new Error(method+' timed out'));},10000);pending.set(requestId,{resolve,reject,timer});socket.send(JSON.stringify({id:requestId,method,params}));});
  const evaluate=async expression=>{const result=await send('Runtime.evaluate',{expression:`(() => eval(${JSON.stringify(expression)}))()`,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw new Error(JSON.stringify(result.exceptionDetails));return result.result.value;};
  const wait=async(expression,label=expression)=>{for(let i=0;i<120;i++){if(await evaluate(expression))return;await new Promise(r=>setTimeout(r,75));}throw new Error('Timed out: '+label);};
  const screenshot=async(path,selector=null,marks=[])=>{
    if(selector) await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center'})`);
    await evaluate(`document.querySelectorAll('[data-guide-marker]').forEach(e=>e.remove());`);
    await evaluate(`for(const mark of ${JSON.stringify(marks)}) { const target=document.querySelector(mark.selector); if(!target)throw new Error('Screenshot control missing: '+mark.selector); const r=target.getBoundingClientRect(); const label=document.createElement('span'); label.dataset.guideMarker='true'; label.textContent=mark.label; label.style.cssText='position:absolute;z-index:2147483647;display:grid;place-items:center;width:24px;height:24px;border-radius:50%;border:2px solid white;background:#b53d23;color:white;font:700 13px/1 system-ui;box-shadow:0 1px 4px #0005;pointer-events:none'; label.style.left=(r.left+scrollX+r.width*(mark.x??1)-12)+'px'; label.style.top=(r.top+scrollY+r.height*(mark.y??0)-12)+'px'; document.body.appendChild(label); }`);
    let clip;
    if(selector) clip=await evaluate(`{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); ({x:Math.max(0,r.left+scrollX-8),y:Math.max(0,r.top+scrollY-8),width:r.width+16,height:r.height+16,scale:1})}`);
    const result=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:!!selector,...(clip?{clip}:{})});
    await writeFile(path,Buffer.from(result.data,'base64'));
    await evaluate(`document.querySelectorAll('[data-guide-marker]').forEach(e=>e.remove())`);
  };
  await send('Runtime.enable');await send('Page.enable');
  return {socket,send,evaluate,wait,screenshot,errors};
}
