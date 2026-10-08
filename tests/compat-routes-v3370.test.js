const fs=require('fs'),assert=require('assert');
for(const file of ['server.js']){
 const server=fs.readFileSync(file,'utf8');
 assert(server.includes("app.get('/api/event/state'"),'legacy event state compatibility route must exist');
 assert(server.includes("active:false"),'compatibility event route must report no legacy event as active');
}
console.log('v3.37 event compatibility route regression test passed');
