const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const WebSocket = require('ws');
const { Pool } = require('pg');
const { initDiscord } = require('./discord-bot');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const PORT = process.env.PORT || 10000;
const SERVER_VERSION = '3.29.2';
const MAP_SYSTEM_VERSION = '3.29.2';
const GAME_MAPS = {"Forest":12,"Desert":12,"Snow":12,"Lava":12,"City":12,"Hospital":12,"Laboratory":12,"Subway":12,"Prison":12,"MilitaryBase":12,"RuinedTown":12,"Harbor":12,"Bunker":12,"Swamp":12,"Skyscraper":12,"Wasteland":12};

const DATA_DIR = process.env.OUTLAST_DATA_DIR || path.join(__dirname, 'data');
const FEEDBACK_FILE = path.join(DATA_DIR, 'feedback.json');
const CHAT_FILE = path.join(DATA_DIR, 'chat.json');
const ANNOUNCEMENTS_FILE = path.join(DATA_DIR, 'announcements.json');
const LEADERBOARD_FILE = path.join(DATA_DIR, 'leaderboard.json');
const LEADERBOARD_BACKUP_FILE = path.join(DATA_DIR, 'leaderboard.backup.json');
const LEADERBOARD_MIRROR_FILE = path.join(DATA_DIR, 'leaderboard.mirror.json');
const LEADERBOARD_JOURNAL_FILE = path.join(DATA_DIR, 'leaderboard.journal.json');
const BETA_PLAYERS_FILE = path.join(DATA_DIR, 'beta-players.json');
const COIN_GIFTS_FILE = path.join(DATA_DIR, 'coin-gifts.json');
const GLOBAL_EVENT_FILE = path.join(DATA_DIR, 'global-event.json');
const PLAYERS_FILE = path.join(DATA_DIR, 'players.json');
const BANNED_PLAYERS_FILE = path.join(DATA_DIR, 'banned-players.json');
const OWNER_USERNAMES = ['BestGamer', 'Landon', 'Phone Landon', 'Poke', 'BillyBimbo'];
const CHAT_OWNER_USERNAMES = ['BestGamer', 'Landon', 'Phone Landon', 'Poke', 'BillyBimbo'];
const CHAT_TESTER_USERNAMES = ['Max', 'SS'];
const BETA_BADGE_LIMIT = 25;
fs.mkdirSync(DATA_DIR, { recursive: true });
for(const legacyFile of ['event-progress.json','event-players.json']){
  try{const legacyPath=path.join(DATA_DIR,legacyFile);if(fs.existsSync(legacyPath))fs.unlinkSync(legacyPath);}catch(_){}
}

// Leaderboards use Postgres when DATABASE_URL is configured. The JSON file remains
// as a migration/fallback cache so the server can still boot if the database is unavailable.
const leaderboardPool = process.env.DATABASE_URL ? new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
  max: 5,
}) : null;
let leaderboardDbReady = false;
let banDbReady = false;

function loadFeedback() {
  try { const parsed = JSON.parse(fs.readFileSync(FEEDBACK_FILE, 'utf8')); return Array.isArray(parsed) ? parsed : []; }
  catch (_) { return []; }
}
function loadChatHistory() {
  try { const parsed = JSON.parse(fs.readFileSync(CHAT_FILE, 'utf8')); return Array.isArray(parsed) ? parsed.slice(-200) : []; }
  catch (_) { return []; }
}
function saveChatHistory() {
  try {
    const tmp=CHAT_FILE+'.tmp';
    fs.writeFileSync(tmp, JSON.stringify(chatHistory.slice(-CHAT_MAX_HISTORY),null,2),'utf8');
    fs.renameSync(tmp,CHAT_FILE);
  } catch (_) {}
}
function loadAnnouncements() {
  try { const parsed=JSON.parse(fs.readFileSync(ANNOUNCEMENTS_FILE,'utf8')); return Array.isArray(parsed) ? parsed.slice(-100) : []; }
  catch (_) { return []; }
}
function saveAnnouncements() {
  try {
    const tmp=ANNOUNCEMENTS_FILE+'.tmp';
    fs.writeFileSync(tmp, JSON.stringify(announcementHistory.slice(-100),null,2),'utf8');
    fs.renameSync(tmp,ANNOUNCEMENTS_FILE);
  } catch (_) {}
}
function loadJson(file, fallback) { try { const parsed=JSON.parse(fs.readFileSync(file,'utf8')); return parsed; } catch (_) { return fallback; } }
function saveJson(file, value) {
  const tmp=file+'.tmp';
  if(file===LEADERBOARD_FILE){
    try{ if(fs.existsSync(file)) fs.copyFileSync(file,LEADERBOARD_BACKUP_FILE); }catch(_) {}
    try{ fs.writeFileSync(LEADERBOARD_MIRROR_FILE, JSON.stringify(value,null,2),'utf8'); }catch(_) {}
    try{ fs.writeFileSync(LEADERBOARD_JOURNAL_FILE, JSON.stringify({savedAt:Date.now(),count:Array.isArray(value)?value.length:0},null,2),'utf8'); }catch(_) {}
  }
  fs.writeFileSync(tmp, JSON.stringify(value,null,2),'utf8');
  fs.renameSync(tmp,file);
}
let feedback = loadFeedback();
let leaderboard = loadJson(LEADERBOARD_FILE, null);
if(!Array.isArray(leaderboard)){
  const mirror=loadJson(LEADERBOARD_MIRROR_FILE, []);
  const backup=loadJson(LEADERBOARD_BACKUP_FILE, []);
  leaderboard=Array.isArray(mirror)&&mirror.length?mirror:(Array.isArray(backup)?backup:[]);
  if(Array.isArray(leaderboard)&&leaderboard.length) saveJson(LEADERBOARD_FILE,leaderboard);
}
leaderboard=normalizeLeaderboard(leaderboard);
let betaPlayers = loadJson(BETA_PLAYERS_FILE, []);
let coinGifts = loadJson(COIN_GIFTS_FILE, {});
let knownPlayers = loadJson(PLAYERS_FILE, []);
let bannedPlayers = loadJson(BANNED_PLAYERS_FILE, {});
if(Array.isArray(bannedPlayers)){
  const migrated={};
  for(const item of bannedPlayers){
    const username=String(item?.username||'').trim().slice(0,18);
    if(username)migrated[normalizePlayerKey(username)]={username,reason:clean(item?.reason,160)||'Owner moderation',at:Number(item?.at)||Date.now(),by:clean(item?.by,18)||'Owner',version:2};
  }
  bannedPlayers=migrated;
}else if(!bannedPlayers || typeof bannedPlayers!=='object'){
  bannedPlayers={};
}
let globalEvent = loadJson(GLOBAL_EVENT_FILE, {active:false});
let adminAbuse={active:false,action:'',label:'',startedAt:0,endsAt:0,startedBy:''};
if(!globalEvent || typeof globalEvent!=='object') globalEvent={active:false};
if(!coinGifts || typeof coinGifts!=='object' || Array.isArray(coinGifts)) coinGifts={};
if(!Array.isArray(betaPlayers)) betaPlayers=[];
if(!Array.isArray(leaderboard)) leaderboard=[];
if(!Array.isArray(knownPlayers)) knownPlayers=[];

async function initLeaderboardDatabase(){
  if(!leaderboardPool) return false;
  await leaderboardPool.query(
    `CREATE TABLE IF NOT EXISTS outlast_leaderboard (
      record_key TEXT PRIMARY KEY,
      id TEXT NOT NULL,
      name TEXT NOT NULL,
      score BIGINT NOT NULL DEFAULT 0,
      level INTEGER NOT NULL DEFAULT 1,
      kills BIGINT NOT NULL DEFAULT 0,
      mode TEXT NOT NULL DEFAULT 'Classic',
      difficulty TEXT NOT NULL DEFAULT 'Normal',
      duration INTEGER NOT NULL DEFAULT 0,
      seed TEXT,
      modifier TEXT NOT NULL DEFAULT 'None',
      challenge TEXT NOT NULL DEFAULT 'None',
      weapon TEXT,
      character TEXT,
      extracted BOOLEAN NOT NULL DEFAULT FALSE,
      date TEXT,
      updated_at BIGINT NOT NULL
    )`
  );
  const existing=await leaderboardPool.query('SELECT record_key FROM outlast_leaderboard LIMIT 1');
  if(existing.rowCount===0 && Array.isArray(leaderboard) && leaderboard.length){
    for(const entry of normalizeLeaderboard(leaderboard)) await upsertLeaderboardDb(entry);
  }
  leaderboardDbReady=true;
  return true;
}
async function upsertLeaderboardDb(entry){
  if(!leaderboardPool) return;
  const recordKey=String(entry.name||'Player').toLowerCase()+'|'+String(entry.mode||'Classic').toLowerCase()+'|'+String(entry.difficulty||'Normal').toLowerCase();
  await leaderboardPool.query(
    `INSERT INTO outlast_leaderboard
      (record_key,id,name,score,level,kills,mode,difficulty,duration,seed,modifier,challenge,weapon,character,extracted,date,updated_at)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
     ON CONFLICT(record_key) DO UPDATE SET
      id=EXCLUDED.id,name=EXCLUDED.name,score=EXCLUDED.score,level=EXCLUDED.level,kills=EXCLUDED.kills,
      mode=EXCLUDED.mode,difficulty=EXCLUDED.difficulty,duration=EXCLUDED.duration,seed=EXCLUDED.seed,
      modifier=EXCLUDED.modifier,challenge=EXCLUDED.challenge,weapon=EXCLUDED.weapon,character=EXCLUDED.character,
      extracted=EXCLUDED.extracted,date=EXCLUDED.date,updated_at=EXCLUDED.updated_at
     WHERE outlast_leaderboard.score <= EXCLUDED.score`,
    [recordKey,entry.id,entry.name,entry.score,entry.level,entry.kills,entry.mode,entry.difficulty,entry.duration,entry.seed||null,entry.modifier,entry.challenge,entry.weapon||null,entry.character||null,Boolean(entry.extracted),entry.date||null,Number(entry.updatedAt)||Date.now()]
  );
}
async function readLeaderboardDb(mode,difficulty,limit){
  if(!leaderboardPool || !leaderboardDbReady) return null;
  const values=[];
  const where=[];
  if(mode){values.push(mode);where.push('LOWER(mode)=LOWER($'+values.length+')');}
  if(difficulty){values.push(difficulty);where.push('LOWER(difficulty)=LOWER($'+values.length+')');}
  const whereSql=where.length?' WHERE '+where.join(' AND '):'';
  values.push(Math.min(1000,Math.max(1,Number(limit)||100)));
  const limitParam='$'+values.length;
  const result=await leaderboardPool.query(
    'SELECT id,name,score,level,kills,mode,difficulty,duration,seed,modifier,challenge,weapon,character,extracted,date,updated_at AS "updatedAt",NULL AS badge FROM outlast_leaderboard'+
    whereSql+' ORDER BY score DESC, updated_at DESC LIMIT '+limitParam,
    values
  );
  return result.rows.map(x=>({...x,score:Number(x.score||0),kills:Number(x.kills||0),level:Number(x.level||1),updatedAt:Number(x.updatedAt||0)}));
}
function normalizeLeaderboard(list){const byName=new Map();for(const raw of Array.isArray(list)?list:[]){const name=clean(raw?.name,18)||'Player';if(!/^[A-Za-z0-9 _-]{2,18}$/.test(name))continue;const score=Math.max(0,Math.floor(Number(raw?.score)||0)),level=Math.max(1,Math.floor(Number(raw?.level)||1)),kills=Math.max(0,Math.floor(Number(raw?.kills)||0));const candidate={id:String(raw?.id||name.toLowerCase().replace(/[^a-z0-9_-]+/g,'-')).slice(0,40),name,score,level,kills,mode:clean(raw?.mode,30)||'Classic',difficulty:clean(raw?.difficulty,30)||'Normal',duration:Math.max(0,Math.floor(Number(raw?.duration)||0)),seed:clean(raw?.seed,48),modifier:clean(raw?.modifier,40)||'None',challenge:clean(raw?.challenge,40)||'None',weapon:clean(raw?.weapon,40),character:clean(raw?.character,40),extracted:Boolean(raw?.extracted),date:clean(raw?.date,40)||new Date().toLocaleDateString(),updatedAt:Number(raw?.updatedAt)||0,badge:clean(raw?.badge,20)};const key=name.toLowerCase()+'|'+candidate.mode.toLowerCase()+'|'+candidate.difficulty.toLowerCase(),existing=byName.get(key);if(!existing||candidate.score>existing.score||candidate.updatedAt>existing.updatedAt)byName.set(key,candidate);}return [...byName.values()].sort((a,b)=>Number(b.score||0)-Number(a.score||0)||Number(b.updatedAt||0)-Number(a.updatedAt||0)).slice(0,1000);}

function normalizePlayerKey(username){
  return String(username||'')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g,' ')
    .toLowerCase();
}
function validPlayerUsername(username){ return /^[A-Za-z0-9 _-]{2,18}$/.test(String(username||'')); }
function saveBannedPlayers(){
  const tmp=BANNED_PLAYERS_FILE+'.tmp';
  fs.writeFileSync(tmp, JSON.stringify(bannedPlayers,null,2),'utf8');
  fs.renameSync(tmp,BANNED_PLAYERS_FILE);
}
async function initBanDatabase(){
  if(!leaderboardPool) return false;
  await leaderboardPool.query(
    `CREATE TABLE IF NOT EXISTS outlast_player_bans (
      username_key TEXT PRIMARY KEY,
      ban_id TEXT NOT NULL UNIQUE,
      username TEXT NOT NULL,
      reason TEXT NOT NULL DEFAULT 'Owner moderation',
      banned_by TEXT NOT NULL DEFAULT 'Owner',
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL,
      active BOOLEAN NOT NULL DEFAULT TRUE
    )`
  );
  // Import legacy JSON bans once, while Postgres remains the long-term authority.
  for(const [key,record] of Object.entries(bannedPlayers||{})){
    if(!record?.username)continue;
    const banId=clean(record.banId,80)||('ban_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,10));
    const at=Number(record.at)||Date.now();
    await leaderboardPool.query(
      `INSERT INTO outlast_player_bans
        (username_key,ban_id,username,reason,banned_by,created_at,updated_at,active)
       VALUES($1,$2,$3,$4,$5,$6,$6,TRUE)
       ON CONFLICT(username_key) DO UPDATE SET
        ban_id=EXCLUDED.ban_id,username=EXCLUDED.username,reason=EXCLUDED.reason,
        banned_by=EXCLUDED.banned_by,created_at=EXCLUDED.created_at,updated_at=EXCLUDED.updated_at,active=TRUE
       WHERE outlast_player_bans.updated_at <= EXCLUDED.updated_at`,
      [key,banId,clean(record.username,18),clean(record.reason,160)||'Owner moderation',clean(record.by,18)||'Owner',at]
    );
  }
  const rows=await leaderboardPool.query(
    'SELECT username_key,ban_id,username,reason,banned_by,created_at FROM outlast_player_bans WHERE active=TRUE'
  );
  const fromDb={};
  for(const row of rows.rows){
    fromDb[row.username_key]={
      username:clean(row.username,18),
      reason:clean(row.reason,160)||'Owner moderation',
      at:Number(row.created_at)||Date.now(),
      by:clean(row.banned_by,18)||'Owner',
      banId:clean(row.ban_id,80)||'',
      version:3,
      source:'postgres'
    };
  }
  bannedPlayers=fromDb;
  saveBannedPlayers();
  banDbReady=true;
  return true;
}
async function persistBanRecord(record,active=true){
  if(!leaderboardPool||!banDbReady||!record?.username)return;
  const key=normalizePlayerKey(record.username);
  const now=Date.now();
  if(active){
    const banId=clean(record.banId,80)||('ban_'+now.toString(36)+'_'+Math.random().toString(36).slice(2,10));
    record.banId=banId;
    await leaderboardPool.query(
      `INSERT INTO outlast_player_bans
        (username_key,ban_id,username,reason,banned_by,created_at,updated_at,active)
       VALUES($1,$2,$3,$4,$5,$6,$7,TRUE)
       ON CONFLICT(username_key) DO UPDATE SET
        ban_id=EXCLUDED.ban_id,username=EXCLUDED.username,reason=EXCLUDED.reason,
        banned_by=EXCLUDED.banned_by,created_at=EXCLUDED.created_at,updated_at=EXCLUDED.updated_at,active=TRUE`,
      [key,banId,clean(record.username,18),clean(record.reason,160)||'Owner moderation',clean(record.by,18)||'Owner',Number(record.at)||now,now]
    );
  }else{
    await leaderboardPool.query(
      'UPDATE outlast_player_bans SET active=FALSE,updated_at=$2 WHERE username_key=$1',
      [key,now]
    );
  }
}
function bannedPlayerRecord(username){
  const key=normalizePlayerKey(username);
  if(!key)return null;
  const record=bannedPlayers[key];
  return record||null;
}
function isOwnerAccount(username){
  const key=normalizePlayerKey(username);
  return OWNER_USERNAMES.some(name=>normalizePlayerKey(name)===key);
}
function isBannedPlayer(username){ return !!bannedPlayerRecord(username); }
function banPlayer(username,reason,by){
  const cleanName=clean(username,18);
  if(!validPlayerUsername(cleanName))return {ok:false,error:'Invalid player username',status:400};
  if(isOwnerAccount(cleanName))return {ok:false,error:'Owner accounts cannot be banned',status:400};
  const key=normalizePlayerKey(cleanName);
  const record={username:cleanName,reason:clean(reason,160)||'Owner moderation',at:Date.now(),by:clean(by,18)||'Owner',version:3,banId:'ban_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,10)};
  const already=bannedPlayers[key];
  bannedPlayers[key]=record;
  saveBannedPlayers();
  let disconnected=0;
  for(const socket of wss.clients){
    const player=socket.__outlastPlayer;
    if(player&&normalizePlayerKey(player.username)===key){
      disconnected++;
      send(socket,{type:'access_revoked',message:'Access unavailable for this username.'});
      try{socket.close(4003,'Access unavailable');}catch(_){}
    }
  }
  return {ok:true,username:record.username,banned:true,record,disconnected,alreadyBanned:!!already};
}
function unbanPlayer(username){
  const cleanName=clean(username,18);
  if(!validPlayerUsername(cleanName))return {ok:false,error:'Invalid player username',status:400};
  const key=normalizePlayerKey(cleanName);
  const existed=!!bannedPlayers[key];
  if(existed)delete bannedPlayers[key];
  saveBannedPlayers();
  return {ok:true,username:cleanName,banned:false,existed};
}
function enforceSocketAccess(socket,player){
  if(!isBannedPlayer(player?.username))return true;
  send(socket,{type:'access_revoked',message:'Access unavailable for this username.'});
  try{socket.close(4003,'Access unavailable');}catch(_){}
  return false;
}
function saveCoinGifts(){ const tmp=COIN_GIFTS_FILE+'.tmp'; fs.writeFileSync(tmp, JSON.stringify(coinGifts,null,2),'utf8'); fs.renameSync(tmp,COIN_GIFTS_FILE); }
function saveGlobalEvent(){ const tmp=GLOBAL_EVENT_FILE+'.tmp'; fs.writeFileSync(tmp, JSON.stringify(globalEvent,null,2),'utf8'); fs.renameSync(tmp,GLOBAL_EVENT_FILE); }
if(String(globalEvent?.type||'').toLowerCase()==='october'){
  globalEvent={active:false};
  try{saveGlobalEvent();}catch(_){}
}
function expireGlobalEventIfNeeded(){
  if(!globalEvent?.active) return false;
  const endsAt=Number(globalEvent.endsAt||0);
  if(!Number.isFinite(endsAt) || endsAt<=0 || Date.now()<endsAt) return false;
  globalEvent={active:false};
  saveGlobalEvent();
  broadcastGlobal({type:'owner_global_event',active:false});
  return true;
}
function broadcastGlobal(payload){ for(const socket of wss.clients) send(socket,payload); }
function addChatMessage(username,message){
  const cleanUsername=clean(username,18)||'Player';
  const owner=CHAT_OWNER_USERNAMES.some(name=>name.toLowerCase()===cleanUsername.toLowerCase());
  const tester=CHAT_TESTER_USERNAMES.some(name=>name.toLowerCase()===cleanUsername.toLowerCase());
  const role=owner?'owner':(tester?'tester':'player');
  const entry={id:Date.now().toString(36)+Math.random().toString(36).slice(2,7),username:cleanUsername,message:clean(message,CHAT_MESSAGE_MAX),at:Date.now(),role};
  if(!entry.message)return null;
  chatHistory.push(entry);
  if(chatHistory.length>CHAT_MAX_HISTORY)chatHistory=chatHistory.slice(-CHAT_MAX_HISTORY);
  saveChatHistory();
  return entry;
}
function addAnnouncement(message,from){
  const entry={id:Date.now().toString(36)+Math.random().toString(36).slice(2,7),message:clean(message,ANNOUNCEMENT_MAX_MESSAGE),from:clean(from,18)||'Owner',at:Date.now()};
  if(!entry.message)return null;
  announcementHistory.push(entry);
  if(announcementHistory.length>ANNOUNCEMENT_MAX_HISTORY)announcementHistory=announcementHistory.slice(-ANNOUNCEMENT_MAX_HISTORY);
  saveAnnouncements();
  return entry;
}
const GLOBAL_EVENT_LABELS={double_coins:'🪙 Double Coins',double_xp:'⭐ Double XP',chaos:'⚡ Global Chaos',blackout:'🌑 Global Blackout',boss_rush:'👹 Boss Rush'};
const ABUSE_LABELS={boss:'👹 Boss Spawn',blackout:'🌑 Blackout',speed:'💨 Enemy Speed Surge',chaos:'⚡ Chaos',powerup:'✨ Power-Up Rain',waves:'🧟 Rapid Waves',meteor:'☄️ Meteor Shower',swarm:'🧟 Mega Swarm',lootstorm:'💎 Loot Storm',frenzy:'🔥 Enemy Frenzy',stop:'■ Admin Abuse Stopped'};
function saveKnownPlayers(){ const tmp=PLAYERS_FILE+'.tmp'; fs.writeFileSync(tmp, JSON.stringify(knownPlayers,null,2),'utf8'); fs.renameSync(tmp,PLAYERS_FILE); }

function usernameFilterReason(username){
  const value=String(username||'').trim().toLowerCase().replace(/[._-]+/g,' ');
  if(!value) return 'Username is required';
  // Keep the list server-side so the client cannot bypass the safety check.
  const blockedPatterns=[
    /(?:^|\\s)(?:nigg|n1gg|fagg|f4gg|kys)(?:er|a|ot)?(?:$|\\s)/i,
    /(?:^|\\s)(?:fuck|fuk|fck|shit|bitch|asshole|cunt|whore|slut)(?:$|\\s)/i,
    /(?:^|\\s)(?:porn|porno|xxx|sex|hentai)(?:$|\\s)/i,
    /(?:^|\\s)(?:rape|rapist|molest|pedophile|pedo)(?:$|\\s)/i
  ];
  if(blockedPatterns.some(re=>re.test(value))) return 'That username is not available';
  if(/(?:^|\\s)(?:admin|administrator|moderator|mod|owner|official|system|support)(?:$|\\s)/i.test(value)) return 'That username is reserved';
  return '';
}
function normalizeChatForFilter(message){
  return String(message||'')
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g,'')
    .toLowerCase()
    .replace(/[0@]/g,'o')
    .replace(/[1!|]/g,'i')
    .replace(/3/g,'e')
    .replace(/4/g,'a')
    .replace(/5/g,'s')
    .replace(/7/g,'t')
    .replace(/8/g,'b')
    .replace(/[^a-z0-9]+/g,'');
}
function chatFilterMessage(message){
  let value=String(message||'').slice(0,CHAT_MESSAGE_MAX);
  const scan=normalizeChatForFilter(value);
  const blocked=[
    /fuck|fuk|fck|shit|bitch|asshole|cunt|whore|slut/,
    /porn|porno|xxx|hentai|sex/,
    /rape|rapist|molest|pedophile|pedo/,
    /nigg(?:er|a)?|fagg(?:ot)?/,
    /kys/
  ];
  let changed=false;
  if(blocked.some(re=>re.test(scan))){
    value=value.replace(/\S+/g,token=>{
      const tokenScan=normalizeChatForFilter(token);
      if(blocked.some(re=>re.test(tokenScan))){changed=true;return '*'.repeat(Math.min(token.length,12));}
      return token;
    });
    if(blocked.some(re=>re.test(normalizeChatForFilter(value)))){
      changed=true;value='[message filtered]';
    }
  }
  return {message:value,changed};
}
function deletePlayerIdentity(username){
  const key=String(username||'').trim().toLowerCase();
  if(!key) return false;
  knownPlayers=knownPlayers.filter(p=>String(p?.username||'').trim().toLowerCase()!==key);
  betaPlayers=betaPlayers.filter(p=>String(p||'').trim().toLowerCase()!==key);
  delete bannedPlayers[key];
  delete coinGifts[key];
  leaderboard=leaderboard.filter(x=>String(x?.name||'').trim().toLowerCase()!==key);
  saveKnownPlayers();
  saveBannedPlayers();
  saveJson(BETA_PLAYERS_FILE,betaPlayers);
  saveCoinGifts();
  saveEventPlayers();
  saveJson(LEADERBOARD_FILE,leaderboard);
  for(const socket of wss.clients){
    const player=socket.__outlastPlayer;
    if(player&&String(player.username||'').trim().toLowerCase()===key){
      send(socket,{type:'access_revoked',message:'Access unavailable for this username.'});
      try{socket.close(4004,'Access unavailable');}catch(_){}
    }
  }
  return true;
}

function coinGiftKey(username){ return clean(username,18).toLowerCase(); }
const rooms = new Map();
const leaderboardRate = new Map();
const chatRate = new Map();
const chatHttpRate = new Map();
const eventContributionRate = new Map();
const CHAT_MAX_HISTORY = 200;
const CHAT_MESSAGE_MAX = 180;
const ANNOUNCEMENT_MAX_HISTORY = 100;
const ANNOUNCEMENT_MAX_MESSAGE = 240;
let chatHistory = [];
let announcementHistory = [];
chatHistory = loadChatHistory();
announcementHistory = loadAnnouncements();

function challengeForDate(dateKey){
  const key=String(dateKey||'').slice(0,10) || new Date().toISOString().slice(0,10);
  let h=2166136261; for(const ch of 'OUTLAST:'+key){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);} h>>>=0;
  const list=[['Blackout Protocol','Visibility is reduced during blackout events.'],['Elite Surge','Elite encounters appear more frequently.'],['Rapid Waves','Wave pacing is increased.'],['Fragile Run','Healing is less effective; pickups remain unchanged.'],['Treasure Hunt','Extra pickup opportunities appear.'],['Endurance','The goal is to survive as long as possible.']];
  const m=list[h%list.length]; return {date:key,seed:h,modifier:m[0],description:m[1],version:'3.8.0'};
}
const MAX_ROOM_PLAYERS = 4;

function saveFeedback(){ const tmp=FEEDBACK_FILE+'.tmp'; fs.writeFileSync(tmp, JSON.stringify(feedback,null,2),'utf8'); fs.renameSync(tmp,FEEDBACK_FILE); }
function clean(value,max){ return String(value ?? '').trim().slice(0,max); }
function roomCode(){ const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let code=''; do{code='';for(let i=0;i<4;i++)code+=chars[Math.floor(Math.random()*chars.length)];}while(rooms.has(code));return code; }
function roomSnapshot(room){ return {code:room.code,started:room.started,players:[...room.players.values()].map(p=>({id:p.id,username:p.username,x:p.x,y:p.y,skinColor:p.skinColor,characterVisual:p.characterVisual,level:p.level}))}; }
function send(socket,payload){ if(socket.readyState===WebSocket.OPEN) socket.send(JSON.stringify(payload)); }
function broadcastRoom(room,payload,exceptId=null){ for(const player of room.players.values()) if(player.id!==exceptId) send(player.socket,payload); }

function isOwnerRequest(req){
  const owner=clean(req.body?.ownerUsername || req.query?.ownerUsername,18);
  /* v3.28.2: owner permission is tied to the recognized owner account name.
     The separate owner-password gate is intentionally removed; normal player login is unaffected. */
  return OWNER_USERNAMES.some(name=>owner.toLowerCase()===name.toLowerCase());
}
function ownerPlayerList(){
  const onlineByName=new Map();
  for(const socket of wss.clients){
    const player=socket.__outlastPlayer;
    if(player){
      const key=clean(player.username,18).toLowerCase();
      if(key && key!=='player') onlineByName.set(key,player);
    }
  }
  const names=new Map();
  for(const p of knownPlayers) if(p?.username) names.set(normalizePlayerKey(p.username),p);
  for(const entry of leaderboard) if(entry?.name) names.set(normalizePlayerKey(entry.name),{username:clean(entry.name,18),lastSeen:0});
  for(const [key,p] of onlineByName) names.set(key,{username:p.username,lastSeen:Date.now()});
  for(const [key,record] of Object.entries(bannedPlayers)) if(record?.username) names.set(key,{username:clean(record.username,18),lastSeen:0});
  return [...names.values()].map(p=>({
    username:clean(p.username,18),
    online:onlineByName.has(clean(p.username,18).toLowerCase()),
    createdAt:Number(p.createdAt)||0,
    lastSeen:Number(p.lastSeen)||0,
    banned:isBannedPlayer(p.username),
    banReason:bannedPlayerRecord(p.username)?.reason||'',
    bannedAt:Number(bannedPlayerRecord(p.username)?.at||0),
    bannedBy:bannedPlayerRecord(p.username)?.by||''
  })).sort((a,b)=>Number(b.online)-Number(a.online)||a.username.localeCompare(b.username));
}

app.use(cors({origin:true}));
// Multiplayer health endpoints.
app.get('/health',(_req,res)=>res.status(200).json({ok:true,service:'outlast-server',version:SERVER_VERSION,players:wss.clients.size}));
app.get('/api/health',(req,res)=>{expireGlobalEventIfNeeded();res.status(200).json({ok:true,service:'outlast-server',version:SERVER_VERSION,players:wss.clients.size,globalEvent});});

app.use(express.json({limit:'32kb'}));

app.get('/',(req,res)=>{expireGlobalEventIfNeeded();const onlinePlayers=connectedPlayerSnapshot();res.json({status:'online',game:'OUTLAST',version:SERVER_VERSION,players:onlinePlayers.length,connections:wss.clients.size,onlinePlayers,feedback:feedback.length,rooms:rooms.size,globalEvent:globalEvent});});
app.get('/api/challenge/today',(req,res)=>res.json(challengeForDate(new Date().toISOString().slice(0,10))));
app.post('/api/players/register',(req,res)=>{
  const username=clean(req.body?.username,18);
  if(!/^[A-Za-z0-9 _-]{2,18}$/.test(username)) return res.status(400).json({ok:false,error:'Invalid username'});
  const usernameProblem=usernameFilterReason(username); if(usernameProblem) return res.status(400).json({ok:false,error:usernameProblem});
  if(isBannedPlayer(username)) return res.status(403).json({ok:false,error:'Access unavailable for this username.'});
  const key=username.toLowerCase();
  const existing=knownPlayers.find(p=>String(p.username||'').toLowerCase()===key);
  if(existing){
    existing.username=username;
    existing.lastSeen=Date.now();
    existing.createdAt=Number(existing.createdAt)||Date.now();
  }else{
    knownPlayers.push({username,lastSeen:Date.now(),createdAt:Date.now()});
  }
  saveKnownPlayers();
  res.set('Cache-Control','no-store');
  res.json({ok:true,username,totalPlayers:knownPlayers.length});
});

app.get('/api/owner/chat',(req,res)=>{
  if(!isOwnerRequest(req)) return res.status(403).json({ok:false,error:'Owner authorization required'});
  res.set('Cache-Control','no-store');
  res.json({ok:true,messages:chatHistory.slice(-CHAT_MAX_HISTORY)});
});

app.get('/api/chat',(req,res)=>{
  const limit=Math.min(CHAT_MAX_HISTORY,Math.max(1,Math.floor(Number(req.query?.limit)||80)));
  res.set({'Cache-Control':'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0','Pragma':'no-cache','Expires':'0'});
  res.json({ok:true,serverVersion:SERVER_VERSION,messages:chatHistory.slice(-limit)});
});
app.post('/api/chat',(req,res)=>{
  const ip=String(req.headers['x-forwarded-for']||req.socket.remoteAddress||'unknown').split(',')[0].trim();
  const now=Date.now(),recent=(chatHttpRate.get(ip)||[]).filter(t=>now-t<10000);
  if(recent.length>=6)return res.status(429).json({ok:false,error:'You are sending messages too quickly.'});
  const username=clean(req.body?.username,18)||'Player';
  const usernameProblem=usernameFilterReason(username);
  if(usernameProblem)return res.status(400).json({ok:false,error:usernameProblem});
  if(isBannedPlayer(username))return res.status(403).json({ok:false,error:'Access unavailable for this username.'});
  const message=clean(req.body?.message,CHAT_MESSAGE_MAX);
  if(!message)return res.status(400).json({ok:false,error:'Message is required'});
  const filtered=chatFilterMessage(message);
  recent.push(now);chatHttpRate.set(ip,recent);
  const entry=addChatMessage(username,filtered.message);
  if(!entry)return res.status(400).json({ok:false,error:'Message is required'});
  broadcastGlobal({type:'chat_message',...entry});
  res.set('Cache-Control','no-store');
  res.json({ok:true,entry});
});


app.get('/api/owner/global-event',(req,res)=>{expireGlobalEventIfNeeded();res.set('Cache-Control','no-store');res.json({ok:true,...globalEvent});});
app.post('/api/owner/global-event',(req,res)=>{
  if(!isOwnerRequest(req)) return res.status(403).json({ok:false,error:'Owner authorization required'});
  const action=String(req.body?.action||''); if(action==='stop'){globalEvent={active:false};saveGlobalEvent();broadcastGlobal({type:'owner_global_event',active:false});return res.json({ok:true,event:globalEvent});}
  const eventType=String(req.body?.eventType||'double_coins'); if(!GLOBAL_EVENT_LABELS[eventType]) return res.status(400).json({ok:false,error:'Unknown event'});
  const minutes=Math.max(1,Math.min(1440,Math.floor(Number(req.body?.durationMinutes)||30)));
  globalEvent={active:true,type:eventType,label:GLOBAL_EVENT_LABELS[eventType],startedAt:Date.now(),endsAt:Date.now()+minutes*60000,startedBy:clean(req.body?.ownerUsername,18)};
  saveGlobalEvent();broadcastGlobal({type:'owner_global_event',...globalEvent});res.json({ok:true,event:globalEvent});
});
app.get('/api/owner/admin-abuse',(req,res)=>{
  if(!isOwnerRequest(req)) return res.status(403).json({ok:false,error:'Owner authorization required'});
  if(adminAbuse.active&&Date.now()>=Number(adminAbuse.endsAt||0)){
    adminAbuse={active:false,action:'',label:'',startedAt:0,endsAt:0,startedBy:''};
  }
  res.set('Cache-Control','no-store');
  res.json({ok:true,...adminAbuse});
});
app.post('/api/owner/admin-abuse',(req,res)=>{
  if(!isOwnerRequest(req)) return res.status(403).json({ok:false,error:'Owner authorization required'});
  const action=String(req.body?.action||'');
  if(action==='stop'){
    adminAbuse={active:false,action:'',label:'',startedAt:0,endsAt:0,startedBy:''};
    const payload={type:'owner_admin_abuse',action:'stop',label:ABUSE_LABELS.stop,active:false,endsAt:0};
    broadcastGlobal(payload);
    return res.json({ok:true,...payload});
  }
  if(!ABUSE_LABELS[action]) return res.status(400).json({ok:false,error:'Unknown admin-abuse action'});
  const minutes=Math.max(1,Math.min(60,Math.floor(Number(req.body?.durationMinutes)||5)));
  adminAbuse={active:true,action,label:ABUSE_LABELS[action],startedAt:Date.now(),endsAt:Date.now()+minutes*60000,startedBy:clean(req.body?.ownerUsername,18)};
  broadcastGlobal({type:'owner_admin_abuse',...adminAbuse});
  res.json({ok:true,...adminAbuse});
});
app.post('/api/owner/global-reward',(req,res)=>{
  if(!isOwnerRequest(req)) return res.status(403).json({ok:false,error:'Owner authorization required'});
  const amount=Math.floor(Number(req.body?.amount)); if(!Number.isSafeInteger(amount)||amount<1||amount>100000)return res.status(400).json({ok:false,error:'Reward must be 1 to 100,000 coins'});
  const players=ownerPlayerList().filter(p=>p.username);
  for(const p of players){const key=coinGiftKey(p.username),existing=coinGifts[key]||{username:p.username,pending:0};existing.username=p.username;existing.pending=Math.min(1000000000,Number(existing.pending)||0)+amount;existing.updatedAt=Date.now();coinGifts[key]=existing;}
  saveCoinGifts();res.json({ok:true,players:players.length,amount});
});
app.get('/api/announcements',(req,res)=>{
  const limit=Math.min(ANNOUNCEMENT_MAX_HISTORY,Math.max(1,Math.floor(Number(req.query?.limit)||50)));
  res.set({'Cache-Control':'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0','Pragma':'no-cache','Expires':'0'});
  res.json({ok:true,serverVersion:SERVER_VERSION,announcements:announcementHistory.slice(-limit)});
});
app.post('/api/owner/announcement',(req,res)=>{
  if(!isOwnerRequest(req)) return res.status(403).json({ok:false,error:'Owner authorization required'});
  const message=clean(req.body?.message,ANNOUNCEMENT_MAX_MESSAGE); if(!message)return res.status(400).json({ok:false,error:'Announcement is required'});
  const entry=addAnnouncement(message,req.body?.ownerUsername);
  if(!entry)return res.status(400).json({ok:false,error:'Announcement is required'});
  broadcastGlobal({type:'owner_announcement',...entry});
  res.set('Cache-Control','no-store');
  res.json({ok:true,entry});
});

app.post('/api/owner/gift-coins',(req,res)=>{
  if(!isOwnerRequest(req)) return res.status(403).json({ok:false,error:'Owner authorization required'});
  const owner=clean(req.body?.ownerUsername || req.query?.ownerUsername,18);
  const target=clean(req.body?.targetUsername,18), amount=Math.floor(Number(req.body?.amount));
  const targetIsOwner=OWNER_USERNAMES.some(name=>target.toLowerCase()===name.toLowerCase());
  const ownerTargetsSelf=targetIsOwner && target.toLowerCase()===owner.toLowerCase();
  if(targetIsOwner&&!ownerTargetsSelf) return res.status(400).json({ok:false,error:'You can only gift an owner account to yourself'});
  if(!/^[A-Za-z0-9 _-]{2,18}$/.test(target)) return res.status(400).json({ok:false,error:'Invalid player username'});
  if(!Number.isSafeInteger(amount)||amount<1||amount>10000000) return res.status(400).json({ok:false,error:'Coin amount must be a whole number from 1 to 10,000,000'});
  const key=coinGiftKey(target), existing=coinGifts[key]||{username:target,pending:0};
  existing.username=target; existing.pending=Math.min(1000000000,Number(existing.pending)||0)+amount; existing.updatedAt=Date.now(); coinGifts[key]=existing; saveCoinGifts();
  res.json({ok:true,username:existing.username,pending:existing.pending,amount});
});

app.post('/api/coins/claim',(req,res)=>{
  const username=clean(req.body?.username,18);
  if(!validPlayerUsername(username)) return res.status(400).json({ok:false,error:'Invalid username'});
  if(isBannedPlayer(username)) return res.status(403).json({ok:false,error:'Access unavailable for this username.'});
  const key=coinGiftKey(username), gift=coinGifts[key], amount=Math.max(0,Math.floor(Number(gift?.pending)||0));
  if(amount>0){ delete coinGifts[key]; saveCoinGifts(); }
  res.json({ok:true,username,coins:amount});
});

app.post('/api/owner/verify',(req,res)=>{
  if(!isOwnerRequest(req)) return res.status(403).json({ok:false,error:'Owner authorization required'});
  res.set('Cache-Control','no-store');
  res.json({ok:true,owner:clean(req.body?.ownerUsername || req.query?.ownerUsername,18),verified:true});
});

app.get('/api/owner/players',(req,res)=>{
  if(!isOwnerRequest(req)) return res.status(403).json({ok:false,error:'Owner authorization required'});
  res.json({ok:true,players:ownerPlayerList()});
});
app.post('/api/owner/players/ban',async(req,res)=>{
  if(!isOwnerRequest(req)) return res.status(403).json({ok:false,error:'Owner authorization required'});
  const result=banPlayer(req.body?.username,req.body?.reason,req.body?.ownerUsername);
  if(!result.ok)return res.status(result.status||400).json({ok:false,error:result.error});
  try{await persistBanRecord(result.record,true);}
  catch(err){
    unbanPlayer(result.username);
    console.error('Ban persistence failed:',err.message);
    return res.status(503).json({ok:false,error:'Ban could not be saved. Please retry.'});
  }
  res.set('Cache-Control','no-store');
  res.json({...result,storage:banDbReady?'postgres':'server-cache'});
});
app.post('/api/owner/players/unban',async(req,res)=>{
  if(!isOwnerRequest(req)) return res.status(403).json({ok:false,error:'Owner authorization required'});
  const username=clean(req.body?.username,18),previous=bannedPlayerRecord(username);
  const result=unbanPlayer(username);
  if(!result.ok)return res.status(result.status||400).json({ok:false,error:result.error});
  try{await persistBanRecord(previous||{username},false);}
  catch(err){
    if(previous)bannedPlayers[normalizePlayerKey(previous.username)]=previous;
    saveBannedPlayers();
    console.error('Unban persistence failed:',err.message);
    return res.status(503).json({ok:false,error:'Ban status could not be saved. Please retry.'});
  }
  res.set('Cache-Control','no-store');
  res.json({...result,storage:banDbReady?'postgres':'server-cache'});
});
app.post('/api/owner/players/delete',async(req,res)=>{
  if(!isOwnerRequest(req)) return res.status(403).json({ok:false,error:'Owner authorization required'});

  const owner=clean(req.body?.ownerUsername,18);
  const username=clean(req.body?.username,18);
  if(!/^[A-Za-z0-9 _-]{2,18}$/.test(username)) return res.status(400).json({ok:false,error:'Invalid player username'});

  const key=normalizePlayerKey(username);
  const ownerKey=normalizePlayerKey(owner);

  /* Owner identities are never deletable, and an owner cannot delete itself. */
  if(isOwnerAccount(username) || (ownerKey && key===ownerKey)){
    return res.status(400).json({ok:false,error:'Protected owner account'});
  }

  const connected=wss.clients.size;
  const hasKnown=knownPlayers.some(p=>normalizePlayerKey(p?.username)===key);
  const hasLeaderboard=leaderboard.some(x=>normalizePlayerKey(x?.name)===key);
  const hasBan=Object.prototype.hasOwnProperty.call(bannedPlayers,key);
  const hasGift=Object.prototype.hasOwnProperty.call(coinGifts,key);
  const hasConnection=[...wss.clients].some(socket=>normalizePlayerKey(socket.__outlastPlayer?.username)===key);

  if(!hasKnown&&!hasLeaderboard&&!hasBan&&!hasGift&&!hasConnection){
    return res.status(404).json({ok:false,error:'Username not found'});
  }

  /* Remove the JSON/server identity first so subsequent lookups stop returning it. */
  deletePlayerIdentity(username);

  let dbDeleted=0;
  try{
    if(leaderboardPool&&leaderboardDbReady){
      const result=await leaderboardPool.query(
        'DELETE FROM outlast_leaderboard WHERE LOWER(name)=LOWER($1)',
        [username]
      );
      dbDeleted=Number(result.rowCount||0);
    }
  }catch(err){
    console.error('Owner account leaderboard delete failed:',err.message);
    return res.status(503).json({
      ok:false,
      error:'Account was removed from server cache, but persistent leaderboard cleanup failed. Retry the deletion.'
    });
  }

  /* Remove feedback authored by the deleted player from the server queue. */
  let feedbackDeleted=0;
  const beforeFeedback=feedback.length;
  feedback=feedback.filter(entry=>normalizePlayerKey(entry?.user||entry?.username)!==key);
  feedbackDeleted=beforeFeedback-feedback.length;
  if(feedbackDeleted)saveFeedback();

  res.set('Cache-Control','no-store');
  res.json({
    ok:true,
    username,
    deleted:true,
    deletedRecords:{
      knownPlayer:hasKnown?1:0,
      leaderboard:hasLeaderboard?1:0,
      leaderboardDb:dbDeleted,
      ban:hasBan?1:0,
      event:hasEvent?1:0,
      coinGift:hasGift?1:0,
      feedback:feedbackDeleted,
      connection:hasConnection?1:0
    },
    connectedPlayers:connected
  });
});
app.get('/api/leaderboard',async(req,res)=>{
 const mode=clean(req.query?.mode,30);
 const difficulty=clean(req.query?.difficulty,30);
 const limit=Math.min(100,Math.max(1,Number(req.query?.limit)||100));
 try{
   let entries=await readLeaderboardDb(mode,difficulty,limit);
   if(entries===null){
     entries=normalizeLeaderboard(leaderboard);
     if(mode)entries=entries.filter(x=>String(x.mode||'Classic').toLowerCase()===String(mode).toLowerCase());
     if(difficulty)entries=entries.filter(x=>String(x.difficulty||'Normal').toLowerCase()===String(difficulty).toLowerCase());
     entries=entries.slice(0,limit);
   }
   res.set('Cache-Control','no-store');
   res.json({ok:true,version:SERVER_VERSION,mapSystemVersion:MAP_SYSTEM_VERSION,mode:mode||'',difficulty:difficulty||'',entries});
 }catch(err){
   console.error('Leaderboard read failed:',err.message);
   let entries=normalizeLeaderboard(leaderboard);
   if(mode)entries=entries.filter(x=>String(x.mode||'Classic').toLowerCase()===String(mode).toLowerCase());
   if(difficulty)entries=entries.filter(x=>String(x.difficulty||'Normal').toLowerCase()===String(difficulty).toLowerCase());
   res.set('Cache-Control','no-store');
   res.json({ok:true,version:SERVER_VERSION,mapSystemVersion:MAP_SYSTEM_VERSION,mode:mode||'',difficulty:difficulty||'',entries:entries.slice(0,limit),storage:'json-fallback'});
 }
});
app.post('/api/leaderboard',async(req,res)=>{
 const ip=String(req.headers['x-forwarded-for']||req.socket.remoteAddress||'unknown').split(',')[0].trim();
 const now=Date.now(),recent=leaderboardRate.get(ip)||[],windowed=recent.filter(t=>now-t<10*60*1000);
 if(windowed.length>=30)return res.status(429).json({ok:false,error:'Too many leaderboard submissions'});
 windowed.push(now);leaderboardRate.set(ip,windowed);

 const name=clean(req.body?.name,18)||'Player';
 if(!/^[A-Za-z0-9 _-]{2,18}$/.test(name))return res.status(400).json({ok:false,error:'Invalid player name'});
 const score=Math.max(0,Math.floor(Number(req.body?.score)||0));
 const level=Math.max(1,Math.floor(Number(req.body?.level)||1));
 const kills=Math.max(0,Math.floor(Number(req.body?.kills)||0));
 const mode=clean(req.body?.mode,30)||'Classic';
 const difficulty=clean(req.body?.difficulty,30)||'Normal';
 const duration=Math.max(0,Math.floor(Number(req.body?.duration)||0));
 const seed=clean(req.body?.seed,48);
 const modifier=clean(req.body?.modifier,40)||'None';
 const challenge=clean(req.body?.challenge,40)||'None';
 const weapon=clean(req.body?.weapon,40);
 const character=clean(req.body?.character,40);
 const extracted=Boolean(req.body?.extracted);
 if(isBannedPlayer(name))return res.status(403).json({ok:false,error:'Access unavailable for this username.'});
 if(/1v1|pvp/i.test(mode))return res.status(400).json({ok:false,error:'PvP leaderboard records are no longer supported'});
 if(level>10000||kills>5000000||score>1000000000)return res.status(400).json({ok:false,error:'Impossible leaderboard values'});
 if(duration>0&&duration<5&&score>1000000)return res.status(400).json({ok:false,error:'Run metadata failed validation'});

 const key=name.toLowerCase();
 const recordKey=key+'|'+mode.toLowerCase()+'|'+difficulty.toLowerCase();
 leaderboard=normalizeLeaderboard(leaderboard);
 const existing=leaderboard.find(x=>String(x.name||'').toLowerCase()+'|'+String(x.mode||'Classic').toLowerCase()+'|'+String(x.difficulty||'Normal').toLowerCase()===recordKey);
 if(existing&&score<=Number(existing.score||0)){
   return res.json({ok:true,updated:false,serverRecord:existing,totalPlayers:leaderboard.length});
 }

 let badge=String(existing?.badge||'');
 if(key==='bestgamer')badge='OWNER';
 const excluded=['tester','admin','administrator'].includes(key);
 if(!badge&&!excluded&&!betaPlayers.some(x=>String(x).toLowerCase()===key)&&betaPlayers.length<BETA_BADGE_LIMIT){
   betaPlayers.push(name);saveJson(BETA_PLAYERS_FILE,betaPlayers);badge='BETA';
 }

 const incoming={
   id:String(existing?.id||key.replace(/[^a-z0-9_-]+/g,'-')).slice(0,40),
   name,score,level,kills,mode,difficulty,duration,seed,modifier,challenge,weapon,character,extracted,
   date:new Date().toLocaleDateString(),updatedAt:now,badge
 };
 const next=leaderboard.filter(x=>String(x.name||'').toLowerCase()+'|'+String(x.mode||'Classic').toLowerCase()+'|'+String(x.difficulty||'Normal').toLowerCase()!==recordKey);
 next.push(incoming);
 leaderboard=normalizeLeaderboard(next);
 try{
   if(leaderboardDbReady) await upsertLeaderboardDb(incoming);
   saveJson(LEADERBOARD_FILE,leaderboard);
   if(leaderboardDbReady) await normalizeLeaderboardDb();
 }catch(err){console.error('Leaderboard database write failed:',err.message);return res.status(503).json({ok:false,error:'Leaderboard storage unavailable'});}
 const saved=leaderboard.find(x=>String(x.name||'').toLowerCase()+'|'+String(x.mode||'Classic').toLowerCase()+'|'+String(x.difficulty||'Normal').toLowerCase()===recordKey)||incoming;
 res.json({ok:true,updated:true,entry:saved,serverRecord:saved,totalPlayers:leaderboard.length});
});

app.get('/api/health',(req,res)=>{expireGlobalEventIfNeeded();const onlinePlayers=connectedPlayerSnapshot();res.json({status:'online',game:'OUTLAST',version:SERVER_VERSION,players:onlinePlayers.length,connections:wss.clients.size,onlinePlayers,rooms:rooms.size,feedback:feedback.length,globalEvent});});
app.get('/api/coop/status',(req,res)=>{expireGlobalEventIfNeeded();const onlinePlayers=connectedPlayerSnapshot();res.json({version:SERVER_VERSION,rooms:rooms.size,players:onlinePlayers.length,connections:wss.clients.size,onlinePlayers,maxPlayers:MAX_ROOM_PLAYERS,globalEvent:globalEvent});});
function feedbackLooksAbusive(entry){
  const text=String((entry?.title||'')+' '+(entry?.body||'')).toLowerCase();
  return /(?:\bf+u+c+k+\b|\bshit\b|\basshole\b|\bbitch\b|\bkill yourself\b|\bslut\b|\bwhore\b|\bporn\b|\bsex\b)/i.test(text);
}
function sanitizeFeedbackQueue(){
  let changed=false;
  for(const entry of feedback){
    if(!entry||entry.status==='Hidden'||entry.status==='Rejected')continue;
    if(feedbackLooksAbusive(entry)){entry.status='Hidden';entry.moderation='Automatic content filter';entry.moderatedAt=Date.now();changed=true;}
  }
  if(changed)saveFeedback();
}
app.get('/api/feedback',(req,res)=>{
  sanitizeFeedbackQueue();
  res.json({entries:feedback.filter(x=>x.status!=='Hidden'&&x.status!=='Rejected').slice().sort((a,b)=>Number(b.date)-Number(a.date))});
});
app.get('/api/owner/feedback',(req,res)=>{
  if(!isOwnerRequest(req))return res.status(403).json({ok:false,error:'Owner access required'});
  sanitizeFeedbackQueue();
  const entries=feedback.slice().sort((a,b)=>Number(b.date)-Number(a.date));
  res.json({ok:true,entries,counts:{
    total:entries.length,
    pending:entries.filter(x=>String(x.status||'Pending')==='Pending').length,
    hidden:entries.filter(x=>String(x.status)==='Hidden').length,
    resolved:entries.filter(x=>String(x.status)==='Resolved').length
  }});
});
app.post('/api/owner/feedback',(req,res)=>{
  if(!isOwnerRequest(req))return res.status(403).json({ok:false,error:'Owner access required'});
  const id=clean(req.body?.id,80), action=String(req.body?.action||'').toLowerCase();
  const entry=feedback.find(x=>String(x.id)===id);
  if(!entry)return res.status(404).json({ok:false,error:'Submission not found'});
  if(action==='hide'||action==='reject'){
    entry.status='Hidden';entry.moderation='Owner moderation';entry.moderatedAt=Date.now();
  }else if(action==='restore'){
    entry.status='Pending';delete entry.moderation;delete entry.moderatedAt;
  }else if(action==='resolve'){
    entry.status='Resolved';entry.moderatedAt=Date.now();
  }else return res.status(400).json({ok:false,error:'Unknown moderation action'});
  saveFeedback();
  res.json({ok:true,entry});
});
app.post('/api/feedback',(req,res)=>{
  const clientId=clean(req.body?.clientId,120), user=clean(req.body?.user,18)||'Player', type=req.body?.type==='idea'?'idea':'bug', title=clean(req.body?.title,80), body=clean(req.body?.body,1000), date=Number(req.body?.date)||Date.now();
  if(isBannedPlayer(user))return res.status(403).json({ok:false,error:'Access unavailable for this username.'});
  if(title.length<3||body.length<5)return res.status(400).json({ok:false,error:'Title/body too short'});
  if(clientId){const existing=feedback.find(x=>x.clientId===clientId);if(existing)return res.json({ok:true,duplicate:true,entry:existing});}
  const duplicate=feedback.find(x=>x.user.toLowerCase()===user.toLowerCase()&&x.type===type&&x.title.toLowerCase()===title.toLowerCase()); if(duplicate)return res.json({ok:true,duplicate:true,entry:duplicate});
  const entry={id:Date.now().toString(36)+Math.random().toString(36).slice(2,8),clientId,user,type,title,body,status:'Pending',reward:0,date}; feedback.push(entry); saveFeedback(); res.status(201).json({ok:true,duplicate:false,entry});
});

function detachFromRoom(player){
  if(!player || !player.roomCode) return;
  const room=rooms.get(player.roomCode);
  const oldCode=player.roomCode;
  player.roomCode='';
  if(!room) return;
  room.players.delete(player.id);
  if(room.players.size===0){
    rooms.delete(oldCode);
    return;
  }
  if(room.started && room.players.size>0) room.started=false;
  broadcastRoom(room,{type:'room_state',...roomSnapshot(room)});
}

// WebSocket heartbeat keeps live multiplayer sessions from being dropped by idle infrastructure.
const WS_HEARTBEAT_MS=25000;
const wsHeartbeat=setInterval(()=>{
  for(const socket of wss.clients){
    if(socket.__outlastAlive===false){try{socket.terminate();}catch(_){}continue;}
    socket.__outlastAlive=false;
    try{socket.ping();}catch(_){try{socket.terminate();}catch(__){}}
  }
},WS_HEARTBEAT_MS);
wss.on('close',()=>clearInterval(wsHeartbeat));

wss.on('connection',socket=>{
  socket.__outlastAlive=true;
  socket.on('pong',()=>{socket.__outlastAlive=true;});
  const player={id:Math.random().toString(36).slice(2)+Date.now().toString(36),socket,username:'Player',authorized:false,roomCode:'',x:1600,y:1200,skinColor:'#ff9d5c',characterVisual:{body:'#ff9d5c',style:'survivor'},level:1};
  socket.__outlastPlayer=player;
  send(socket,{type:'welcome',message:'Connected to the OUTLAST server!',id:player.id,version:SERVER_VERSION});
  send(socket,{type:'chat_history',messages:chatHistory.slice(-CHAT_MAX_HISTORY)});
  broadcastPlayerCount();
  socket.on('message',raw=>{
    let msg; try{msg=JSON.parse(raw.toString());}catch(_){return;}
    if(!enforceSocketAccess(socket,player))return;
    const type=msg?.type;
    if(type!=='player_join'&&type!=='player_ping'&&!player.authorized){
      send(socket,{type:'access_required',message:'Join the OUTLAST server before using multiplayer features.'});
      return;
    }
    if(player.authorized&&!enforceSocketAccess(socket,player))return;
    if(type==='chat_message'){
      const now=Date.now(), key=player.id;
      const recent=(chatRate.get(key)||[]).filter(t=>now-t<10000);
      if(recent.length>=6){ send(socket,{type:'chat_error',error:'You are sending messages too quickly.'}); return; }
      const message=clean(msg.message,CHAT_MESSAGE_MAX);
      if(!message)return;
      const filtered=chatFilterMessage(message);
      recent.push(now);chatRate.set(key,recent);
      const entry=addChatMessage(player.username,filtered.message);
      if(entry) broadcastGlobal({type:'chat_message',...entry});
      return;
    }
    if(type==='player_join'||type==='player_ping'){
      const requestedUsername=clean(msg.username,18)||player.username;
      const usernameProblem=usernameFilterReason(requestedUsername);
      if(usernameProblem){send(socket,{type:'access_revoked',message:usernameProblem});try{socket.close(4005,'Invalid username');}catch(_){}return;}
      if(isBannedPlayer(requestedUsername)){send(socket,{type:'access_revoked',message:'Access unavailable for this username.'});try{socket.close(4003,'Access unavailable');}catch(_){}return;}
      player.username=requestedUsername;
      player.authorized=true;
      if(player.username!=='Player'){
        const key=player.username.toLowerCase(), existing=knownPlayers.find(p=>String(p.username).toLowerCase()===key);
        if(existing){existing.username=player.username;existing.lastSeen=Date.now();existing.createdAt=Number(existing.createdAt)||Date.now();}else knownPlayers.push({username:player.username,lastSeen:Date.now(),createdAt:Date.now()});
        saveKnownPlayers();
      }
      broadcastPlayerCount();
      return;
    }
    if(type==='create_room'){detachFromRoom(player);const code=roomCode();const room={code,started:false,players:new Map()};rooms.set(code,room);const requestedUsername=clean(msg.username,18)||player.username;const usernameProblem=usernameFilterReason(requestedUsername);if(usernameProblem)return send(socket,{type:'room_error',error:usernameProblem});if(isBannedPlayer(requestedUsername))return send(socket,{type:'room_error',error:'Access unavailable for this username.'});player.roomCode=code;player.username=requestedUsername;room.players.set(player.id,player);send(socket,{type:'room_created',...roomSnapshot(room),selfId:player.id});return;}
    if(type==='join_room'){detachFromRoom(player);const code=clean(msg.code,4).toUpperCase(),room=rooms.get(code);if(!room)return send(socket,{type:'room_error',error:'Room not found.'});if(room.players.size>=MAX_ROOM_PLAYERS)return send(socket,{type:'room_error',error:'That room is full.'});const requestedUsername=clean(msg.username,18)||player.username;const usernameProblem=usernameFilterReason(requestedUsername);if(usernameProblem)return send(socket,{type:'room_error',error:usernameProblem});if(isBannedPlayer(requestedUsername))return send(socket,{type:'room_error',error:'Access unavailable for this username.'});player.roomCode=code;player.username=requestedUsername;room.players.set(player.id,player);broadcastRoom(room,{type:'room_state',...roomSnapshot(room)});send(socket,{type:'room_joined',...roomSnapshot(room),selfId:player.id});return;}
    if(type==='leave_room'){detachFromRoom(player);return;}
    if(type==='start_run'){const room=rooms.get(player.roomCode);if(!room)return send(socket,{type:'room_error',error:'Join a room first.'});room.started=true;broadcastRoom(room,{type:'room_game_start'});broadcastRoom(room,{type:'room_state',...roomSnapshot(room)});return;}
    if(type==='player_state'){const room=rooms.get(player.roomCode);if(!room)return;const requestedUsername=clean(msg.username,18)||player.username;const usernameProblem=usernameFilterReason(requestedUsername);if(usernameProblem){send(socket,{type:'access_revoked',message:usernameProblem});try{socket.close(4005,'Invalid username');}catch(_){}return;}if(isBannedPlayer(requestedUsername)){send(socket,{type:'access_revoked',message:'Access unavailable for this username.'});try{socket.close(4003,'Access unavailable');}catch(_){}return;}player.username=requestedUsername;player.x=Number.isFinite(Number(msg.x))?Math.max(0,Math.min(3200,Number(msg.x))):player.x;player.y=Number.isFinite(Number(msg.y))?Math.max(0,Math.min(2400,Number(msg.y))):player.y;player.skinColor=clean(msg.skinColor,24)||player.skinColor;player.characterVisual=msg.characterVisual&&typeof msg.characterVisual==='object'?msg.characterVisual:player.characterVisual;player.level=Math.max(1,Math.min(999,Number(msg.level)||1));broadcastRoom(room,{type:'player_state',id:player.id,username:player.username,x:player.x,y:player.y,skinColor:player.skinColor,characterVisual:player.characterVisual,level:player.level},player.id);return;}
  });
  socket.on('close',()=>{chatRate.delete(player.id);detachFromRoom(player);if(player.username&&player.username!=='Player'){const existing=knownPlayers.find(p=>String(p.username).toLowerCase()===player.username.toLowerCase());if(existing){existing.lastSeen=Date.now();saveKnownPlayers();}}broadcastPlayerCount();});
});

function connectedPlayerSnapshot(){
  const byName=new Map();
  for(const socket of wss.clients){
    const player=socket.__outlastPlayer;
    const username=clean(player?.username,18);
    if(!username||username==='Player')continue;
    const key=username.toLowerCase();
    if(!byName.has(key))byName.set(key,{username});
  }
  return [...byName.values()].sort((a,b)=>a.username.localeCompare(b.username));
}
function broadcastPlayerCount(){
  const onlinePlayers=connectedPlayerSnapshot();
  const payload={type:'player_count',players:onlinePlayers.length,connections:wss.clients.size,onlinePlayers};
  for(const socket of wss.clients)send(socket,payload);
}
initDiscord({app,dataDir:DATA_DIR,inviteUrl:'https://discord.gg/bCMdZfggQ'});
Promise.all([
  initLeaderboardDatabase().then(()=>console.log(`Leaderboard storage: ${leaderboardDbReady?'Postgres':'JSON fallback'}`)).catch(err=>console.error('Leaderboard database initialization failed:',err.message)),
  initBanDatabase().then(()=>console.log(`Ban storage: ${banDbReady?'Postgres':'JSON fallback'}`)).catch(err=>console.error('Ban database initialization failed:',err.message))
]).finally(()=>{
  server.listen(PORT,'0.0.0.0',()=>console.log(`OUTLAST server running on port ${PORT}`));
});