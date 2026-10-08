const fs=require('fs'),assert=require('assert');
const src=fs.readFileSync('server.js','utf8');
assert(src.includes("const REQUIRED_CLIENT_VERSION = '3.36.0'"),'server must declare required client version');
assert(src.includes("app.get('/api/version'"),'server must expose authoritative client version endpoint');
assert(src.includes('requiredClientVersion:REQUIRED_CLIENT_VERSION'),'version endpoint must return required client version');
assert(src.includes("return OWNER_USERNAMES.some(name=>owner.toLowerCase()===name.toLowerCase())"),'owner authorization must remain allowlist based');
assert(!src.includes('OWNER_PASSWORD'),'server owner password gate must remain removed');
console.log('OUTLAST server v3.36 regression checks passed');
