const fs=require('fs'),assert=require('assert');
const server=fs.readFileSync('server.js','utf8');
assert(server.includes("const SERVER_VERSION = '3.36.0'"),'server version must match v3.36.0');
assert(server.includes("app.use('/api/owner'"),'all owner API routes must have a server-side owner gate');
assert(server.includes("if(!isOwnerRequest(req)) return res.status(403).json({ok:false,error:'Owner authorization required'});"),'owner authorization must reject non-owners');
assert(!server.match(/owner.?password|password.?owner/i),'owner password flow must be removed');
assert(server.includes("app.get('/api/owner/global-event'"),'owner global-event status route must exist');
assert(server.indexOf("app.use('/api/owner'") < server.indexOf("app.get('/api/owner/global-event'"),'global-event owner route must be behind the owner middleware');
console.log('v3.36.0 server owner-access regression test passed');