const fs=require('fs'),assert=require('assert');
const server=fs.readFileSync('server.js','utf8');
assert(server.includes("const SERVER_VERSION = '3.37.0'"),'server version must be v3.37.0');
assert(server.includes("app.use('/api/owner'"),'all owner API routes must have server-side owner middleware');
assert(server.includes("if(!isOwnerRequest(req)) return res.status(403).json({ok:false,error:'Owner authorization required'});"),'non-owner owner API requests must be rejected');
assert(!/owner.?password|password.?owner/i.test(server),'owner password flow must remain removed');
assert(server.includes('process.env.OUTLAST_OWNER_USERNAMES'),'owner allowlist must be configurable server-side');
assert(server.includes("app.get('/api/owner/access'"),'owner access probe route must exist');
console.log('v3.37.0 server owner-access regression test passed');