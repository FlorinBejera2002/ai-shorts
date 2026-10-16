import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

for (const count of [80, 125, 200, 250]) test(`large upload queue: ${count} selections, retry, backpressure, cancellation and cleanup`, async () => {
 const source=readFileSync(new URL('../src/components/story/use-story-uploads.ts',import.meta.url),'utf8')
 const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
 const states=[],refs=[],effects=[];let stateIndex=0,refIndex=0,active=0,maximum=0
 const transfers=new Map(), registrations=new Map(), accepted=[],revoked=[]
 const react={useState:initial=>{const i=stateIndex++;if(!(i in states))states[i]=initial;return[states[i],next=>states[i]=typeof next==='function'?next(states[i]):next]},useRef:initial=>refs[refIndex++]??(refs[refIndex-1]={current:initial}),useCallback:value=>value,useEffect:callback=>effects.push(callback)}
 const api={uploadStoryFile:async(file,signal,onProgress)=>{active++;maximum=Math.max(maximum,active);transfers.set(file.name,(transfers.get(file.name)??0)+1);try{await new Promise(resolve=>setImmediate(resolve));signal.throwIfAborted();onProgress(file.size);if(file.name==='clip-17.mp4'&&transfers.get(file.name)===1)throw new Error('temporary transfer failure');return 'owned/'+file.name}finally{active--}},storyRequest:async(path,method,body)=>{registrations.set(body.name,(registrations.get(body.name)??0)+1);if(body.name==='clip-23.mp4'&&registrations.get(body.name)===1)throw new Error('registration failed');if(body.name==='clip-25.mp4'&&registrations.get(body.name)<=8)throw Object.assign(new Error('busy'),{retryAfterSeconds:.001});accepted.push(body);return{id:'collection'}}}
 const exports={};vm.runInNewContext(compiled,{exports,require:name=>name==='react'?react:api,Map,AbortController,DOMException,Error,Date,setTimeout,clearTimeout,crypto:globalThis.crypto,queueMicrotask,URL:{createObjectURL:file=>'blob:'+file.name,revokeObjectURL:url=>revoked.push(url)}})
 const render=()=>{stateIndex=refIndex=0;effects.length=0;const uploads=exports.useStoryUploads('collection',async()=>{});effects.at(-1)();return uploads}
 let uploads=render();uploads.add(Array.from({length:count},(_,i)=>({name:'clip-'+i+'.mp4',size:100})));uploads=render()
 const cancelled=uploads.items.at(-1);uploads.forget(cancelled.id);uploads.forget(uploads.items[0].id)
 for(let tick=0;tick<2000;tick++){uploads=render();await new Promise(resolve=>setTimeout(resolve,1));if(!uploads.busy)break}
 uploads=render();assert.equal(uploads.items.filter(item=>item.status==='failed').length,2)
 uploads.retry()
 for(let tick=0;tick<100;tick++){uploads=render();await new Promise(resolve=>setTimeout(resolve,1));if(!uploads.busy)break}
 uploads=render();assert.equal(uploads.busy,false);assert.equal(accepted.length,count-2);assert.equal(maximum,2);assert.equal(registrations.get('clip-25.mp4'),9,'Temporary backpressure does not exhaust a retry budget')
 assert.equal(transfers.get('clip-17.mp4'),2);assert.equal(transfers.get('clip-23.mp4'),1);assert.equal(registrations.get('clip-23.mp4'),2);assert.equal(transfers.has(cancelled.file.name),false);assert.equal(registrations.has('clip-0.mp4'),false)
 for(const item of accepted)assert.equal(item.order,Number(item.name.match(/clip-(\d+)/)[1]))
 assert.equal(new Set(accepted.map(item=>item.id)).size,count-2);assert.equal(new Set(revoked).size,count);assert.equal(uploads.items.every(item=>item.preview===''),true)
})
