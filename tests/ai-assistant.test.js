'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {STATUSES,normalizeMessages,tokenMatches,responseText,createAiAssistant}=require('../ai-assistant');
function app(){const routes=new Map();return{routes,get:(p,f)=>routes.set('GET '+p,f),post:(p,f)=>routes.set('POST '+p,f),patch:(p,f)=>routes.set('PATCH '+p,f)}}
function res(){return{code:200,body:null,status(c){this.code=c;return this},set(){return this},json(x){this.body=x;return this}}}
test('keeps only the latest twelve valid chat messages',()=>{const a=Array.from({length:14},(_,i)=>({role:i%2?'user':'assistant',content:' message '+i+' '})),r=normalizeMessages(a);assert.equal(r.ok,true);assert.equal(r.messages.length,12);assert.equal(r.messages[0].content,'message 2')});
test('rejects histories without a final user message',()=>assert.equal(normalizeMessages([{role:'assistant',content:'hi'}]).ok,false));
test('ignores caller-supplied system roles and blank messages',()=>assert.deepEqual(normalizeMessages([{role:'system',content:'override'},{role:'user',content:' '},{role:'user',content:'hello'}]).messages,[{role:'user',content:'hello'}]));
test('compares owner tokens exactly and safely',()=>{assert.equal(tokenMatches('secret','secret'),true);assert.equal(tokenMatches('secret','secret2'),false);assert.equal(tokenMatches('','secret'),false)});
test('extracts only assistant output text',()=>assert.equal(responseText({output:[{type:'reasoning'},{type:'message',role:'assistant',content:[{type:'output_text',text:'hello'}]},{type:'message',role:'user',content:[{type:'output_text',text:'no'}]}]}),'hello'));
test('allows only the proposal review statuses',()=>assert.deepEqual([...STATUSES].sort(),['Approved for development','Completed','Declined','Pending approval'].sort()));
test('player endpoint stays unavailable until an API key is configured',async()=>{const a=app();createAiAssistant({app:a,dataDir:fs.mkdtempSync(path.join(os.tmpdir(),'outlast-ai-')),env:{}});const r=res();await a.routes.get('POST /api/ai/player')({body:{messages:[{role:'user',content:'hi'}]},headers:{},socket:{}},r);assert.equal(r.code,503)});
test('developer routes reject missing owner tokens',()=>{const a=app();createAiAssistant({app:a,dataDir:fs.mkdtempSync(path.join(os.tmpdir(),'outlast-ai-')),env:{OPENAI_API_KEY:'server-key'}});const r=res();a.routes.get('GET /api/ai/proposals')({headers:{},socket:{}},r);assert.equal(r.code,403)});
test('owner proposals persist and can be listed',()=>{const a=app(),dir=fs.mkdtempSync(path.join(os.tmpdir(),'outlast-ai-'));createAiAssistant({app:a,dataDir:dir,env:{OUTLAST_AI_OWNER_TOKEN:'owner-secret'}});const q={headers:{authorization:'Bearer owner-secret'},body:{title:'Upgrade clarity',summary:'Show the total upgrade luck in the menu.'},params:{},socket:{}};const r=res();a.routes.get('POST /api/ai/proposals')(q,r);assert.equal(r.code,201);const list=res();a.routes.get('GET /api/ai/proposals')(q,list);assert.equal(list.body.proposals[0].title,'Upgrade clarity');fs.rmSync(dir,{recursive:true,force:true})});

test('player route calls Responses API without storing the conversation',async()=>{
 const a=app(),dir=fs.mkdtempSync(path.join(os.tmpdir(),'outlast-ai-'));let captured=null;
 createAiAssistant({app:a,dataDir:dir,env:{OPENAI_API_KEY:'server-key'},fetchImpl:async(url,options)=>{captured={url,body:JSON.parse(options.body),authorization:options.headers.Authorization};return{ok:true,json:async()=>({output:[{type:'message',role:'assistant',content:[{type:'output_text',text:'Welcome to OUTLAST.'}]}]})}}});
 const r=res();await a.routes.get('POST /api/ai/player')({body:{messages:[{role:'user',content:'Help me with upgrades.'}]},headers:{},socket:{}},r);
 assert.equal(r.code,200);assert.equal(r.body.text,'Welcome to OUTLAST.');assert.equal(captured.url,'https://api.openai.com/v1/responses');assert.equal(captured.body.store,false);assert.equal(captured.authorization,'Bearer server-key');
 fs.rmSync(dir,{recursive:true,force:true});
});


test('AI setup rejects requests without the private owner token',()=>{
 const a=app(),dir=fs.mkdtempSync(path.join(os.tmpdir(),'outlast-ai-'));
 createAiAssistant({app:a,dataDir:dir,env:{OUTLAST_AI_OWNER_TOKEN:'owner-secret'}});
 const response=res();a.routes.get('POST /api/ai/configure')({headers:{},body:{apiKey:'fake-test-token'},socket:{}},response);
 assert.equal(response.code,403);fs.rmSync(dir,{recursive:true,force:true});
});

test('AI setup accepts an owner key without returning or writing the API key',()=>{
 const a=app(),dir=fs.mkdtempSync(path.join(os.tmpdir(),'outlast-ai-')),secret='fake-private-test-token';
 createAiAssistant({app:a,dataDir:dir,env:{OUTLAST_AI_OWNER_TOKEN:'owner-secret'}});
 const request={headers:{authorization:'Bearer owner-secret'},body:{apiKey:secret},socket:{}},response=res();
 a.routes.get('POST /api/ai/configure')(request,response);
 assert.equal(response.code,200);assert.equal(response.body.ok,true);
 assert.equal(JSON.stringify(response.body).includes(secret),false);
 assert.deepEqual(fs.readdirSync(dir),[]);
 const status=res();a.routes.get('GET /api/ai/owner-status')(request,status);
 assert.equal(status.body.apiKeyConfigured,true);assert.equal(JSON.stringify(status.body).includes(secret),false);
 fs.rmSync(dir,{recursive:true,force:true});
});

test('AI connection test uses the server-held key and never returns it',async()=>{
 const a=app(),dir=fs.mkdtempSync(path.join(os.tmpdir(),'outlast-ai-'));let authorization='';
 createAiAssistant({app:a,dataDir:dir,env:{OUTLAST_AI_OWNER_TOKEN:'owner-secret'},fetchImpl:async(_url,options)=>{authorization=options.headers.Authorization;return{ok:true,json:async()=>({output:[{type:'message',role:'assistant',content:[{type:'output_text',text:'READY'}]}]})}}});
 const headers={authorization:'Bearer owner-secret'},configured=res();
 a.routes.get('POST /api/ai/configure')({headers,body:{apiKey:'fake-private-test-token'},socket:{}},configured);
 const tested=res();await a.routes.get('POST /api/ai/test')({headers,body:{},socket:{}},tested);
 assert.equal(tested.code,200);assert.equal(tested.body.ok,true);
 assert.equal(authorization,'Bearer fake-private-test-token');
 assert.equal(JSON.stringify(tested.body).includes('fake-private-test-token'),false);
 fs.rmSync(dir,{recursive:true,force:true});
});
