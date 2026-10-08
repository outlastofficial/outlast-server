const fs=require('fs'),assert=require('assert');
const src=fs.readFileSync('server.js','utf8');
assert(src.includes("const SERVER_VERSION = '3.36.0'"));
assert(src.includes("const REQUIRED_CLIENT_VERSION = '3.36.0'"));
assert(src.includes("app.get('/api/version'"));
assert(src.includes('function isOwnerRequest'));
assert(!src.includes('OWNER_PASSWORD'));
console.log('OUTLAST tester server v3.36 regression checks passed');
