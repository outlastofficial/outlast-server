const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const PORT = process.env.PORT || 10000;

const DATA_DIR = path.join(__dirname, 'data');
const FEEDBACK_FILE = path.join(DATA_DIR, 'feedback.json');
const LEADERBOARD_FILE = path.join(DATA_DIR, 'leaderboard.json');
const BETA_PLAYERS_FILE = path.join(DATA_DIR, 'beta-players.json');
const BETA_BADGE_LIMIT = 25;
fs.mkdirSync(DATA_DIR, { recursive: true });

function loadFeedback() {
  try {
    const parsed = JSON.parse(fs.readFileSync(FEEDBACK_FILE, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function loadJson(file, fallback) { try { const parsed=JSON.parse(fs.readFileSync(file,'utf8')); return parsed; } catch (_) { return fallback; } }
function saveJson(file, value) { const tmp=file+'.tmp'; fs.writeFileSync(tmp, JSON.stringify(value,null,2),'utf8'); fs.renameSync(tmp,file); }
let feedback = loadFeedback();
let leaderboard = loadJson(LEADERBOARD_FILE, []);
let betaPlayers = loadJson(BETA_PLAYERS_FILE, []);
if(!Array.isArray(betaPlayers)) betaPlayers=[];
if(!Array.isArray(leaderboard)) leaderboard=[];
const rooms = new Map();
const MAX_ROOM_PLAYERS = 4;

function saveFeedback() {
  const tmp = FEEDBACK_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(feedback, null, 2), 'utf8');
  fs.renameSync(tmp, FEEDBACK_FILE);
}

function clean(value, max) {
  return String(value ?? '').trim().slice(0, max);
}

function roomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  do {
    code = '';
    for (let i = 0; i < 4; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
  } while (rooms.has(code));
  return code;
}

function roomSnapshot(room) {
  return {
    code: room.code,
    started: room.started,
    players: [...room.players.values()].map(p => ({
      id: p.id,
      username: p.username,
      x: p.x,
      y: p.y,
      skinColor: p.skinColor,
      characterVisual: p.characterVisual,
      level: p.level
    }))
  };
}

function send(socket, payload) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
}

function broadcastRoom(room, payload, exceptId = null) {
  for (const player of room.players.values()) {
    if (player.id !== exceptId) {
      send(player.socket, payload);
    }
  }
}

function detachFromRoom(player) {
  if (!player.roomCode) return;

  const room = rooms.get(player.roomCode);

  if (!room) {
    player.roomCode = '';
    return;
  }

  room.players.delete(player.id);

  broadcastRoom(room, {
    type: 'player_left',
    id: player.id
  });

  if (room.players.size === 0) {
    rooms.delete(room.code);
  } else {
    broadcastRoom(room, {
      type: 'room_state',
      ...roomSnapshot(room)
    });
  }

  player.roomCode = '';
}

app.use(cors({ origin: true }));
app.use(express.json({ limit: '32kb' }));

app.get('/', (req, res) => {
  res.json({
    status: 'online',
    game: 'OUTLAST',
    version: '3.1.2',
    players: wss.clients.size,
    feedback: feedback.length,
    rooms: rooms.size
  });
});

app.get('/api/leaderboard', (req,res)=>{ res.json({entries: leaderboard.slice().sort((a,b)=>Number(b.score||0)-Number(a.score||0)).slice(0,100)}); });

app.post('/api/leaderboard',(req,res)=>{
 const name=clean(req.body?.name,18)||'Player'; const score=Math.max(0,Math.floor(Number(req.body?.score)||0)); const level=Math.max(1,Math.floor(Number(req.body?.level)||1)); const kills=Math.max(0,Math.floor(Number(req.body?.kills)||0)); const mode=clean(req.body?.mode,30)||'Classic'; const difficulty=clean(req.body?.difficulty,30)||'Normal';
 const key=name.toLowerCase();
 const existing=leaderboard.find(x=>String(x.name||'').toLowerCase()===key);
 let badge=String(existing?.badge||'');
 if(key==='bestgamer') badge='OWNER';
 const excluded=['tester','admin','administrator'].includes(key);
 if(!badge && !excluded && !betaPlayers.some(x=>String(x).toLowerCase()===key) && betaPlayers.length<BETA_BADGE_LIMIT){
   betaPlayers.push(name); saveJson(BETA_PLAYERS_FILE,betaPlayers); badge='BETA';
 }
 const incoming={name,score,level,kills,mode,difficulty,date:new Date().toLocaleDateString(),badge};
 const i=leaderboard.findIndex(x=>String(x.name||'').toLowerCase()===key);
 if(i>=0){ if(score>Number(leaderboard[i].score||0)) leaderboard[i]={...leaderboard[i],...incoming}; else return res.json({ok:true,updated:false,entry:leaderboard[i]}); }
 else { leaderboard.push(incoming); }
 leaderboard.sort((a,b)=>Number(b.score||0)-Number(a.score||0)); leaderboard=leaderboard.slice(0,100); saveJson(LEADERBOARD_FILE,leaderboard); res.json({ok:true,updated:true,entry:incoming});
});

app.get('/api/feedback', (req, res) => {
  res.json({
    entries: feedback
      .slice()
      .sort((a, b) => Number(b.date) - Number(a.date))
  });
});

app.post('/api/feedback', (req, res) => {
  const clientId = clean(req.body?.clientId, 120);
  const user = clean(req.body?.user, 18) || 'Player';
  const type = req.body?.type === 'idea' ? 'idea' : 'bug';
  const title = clean(req.body?.title, 80);
  const body = clean(req.body?.body, 1000);
  const date = Number(req.body?.date) || Date.now();

  if (title.length < 3 || body.length < 5) {
    return res.status(400).json({
      ok: false,
      error: 'Title/body too short'
    });
  }

  if (clientId) {
    const existing = feedback.find(x => x.clientId === clientId);

    if (existing) {
      return res.json({
        ok: true,
        duplicate: true,
        entry: existing
      });
    }
  }

  const duplicate = feedback.find(x =>
    x.user.toLowerCase() === user.toLowerCase() &&
    x.type === type &&
    x.title.toLowerCase() === title.toLowerCase()
  );

  if (duplicate) {
    return res.json({
      ok: true,
      duplicate: true,
      entry: duplicate
    });
  }

  const entry = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    clientId,
    user,
    type,
    title,
    body,
    status: 'Pending',
    reward: 0,
    date
  };

  feedback.push(entry);
  saveFeedback();

  res.status(201).json({
    ok: true,
    duplicate: false,
    entry
  });
});

wss.on('connection', socket => {
  const player = {
    id:
      Math.random().toString(36).slice(2) +
      Date.now().toString(36),

    socket,
    username: 'Player',
    roomCode: '',
    x: 1600,
    y: 1200,
    skinColor: '#ff9d5c',
    characterVisual: {
      body: '#ff9d5c',
      style: 'survivor'
    },
    level: 1
  };

  send(socket, {
    type: 'welcome',
    message: 'Connected to the OUTLAST server!',
    id: player.id
  });

  broadcastPlayerCount();

  socket.on('message', raw => {
    let msg;

    try {
      msg = JSON.parse(raw.toString());
    } catch (_) {
      return;
    }

    const type = msg?.type;

    if (type === 'player_join' || type === 'player_ping') {
      player.username =
        clean(msg.username, 18) || player.username;
      return;
    }

    if (type === 'create_room') {
      detachFromRoom(player);

      const code = roomCode();

      const room = {
        code,
        started: false,
        players: new Map()
      };

      rooms.set(code, room);

      player.roomCode = code;
      player.username =
        clean(msg.username, 18) || player.username;

      room.players.set(player.id, player);

      send(socket, {
        type: 'room_created',
        ...roomSnapshot(room),
        selfId: player.id
      });

      return;
    }

    if (type === 'join_room') {
      detachFromRoom(player);

      const code = clean(msg.code, 4).toUpperCase();
      const room = rooms.get(code);

      if (!room) {
        return send(socket, {
          type: 'room_error',
          error: 'Room not found.'
        });
      }

      if (room.players.size >= MAX_ROOM_PLAYERS) {
        return send(socket, {
          type: 'room_error',
          error: 'That room is full.'
        });
      }

      player.roomCode = code;
      player.username =
        clean(msg.username, 18) || player.username;

      room.players.set(player.id, player);

      broadcastRoom(room, {
        type: 'room_state',
        ...roomSnapshot(room)
      });

      send(socket, {
        type: 'room_joined',
        ...roomSnapshot(room),
        selfId: player.id
      });

      return;
    }

    if (type === 'leave_room') {
      detachFromRoom(player);
      return;
    }

    if (type === 'start_run') {
      const room = rooms.get(player.roomCode);

      if (!room) {
        return send(socket, {
          type: 'room_error',
          error: 'Join a room first.'
        });
      }

      room.started = true;

      broadcastRoom(room, {
        type: 'room_game_start'
      });

      broadcastRoom(room, {
        type: 'room_state',
        ...roomSnapshot(room)
      });

      return;
    }

    if (type === 'player_state') {
      const room = rooms.get(player.roomCode);

      if (!room) return;

      player.username =
        clean(msg.username, 18) || player.username;

      player.x = Number.isFinite(Number(msg.x))
        ? Math.max(0, Math.min(3200, Number(msg.x)))
        : player.x;

      player.y = Number.isFinite(Number(msg.y))
        ? Math.max(0, Math.min(2400, Number(msg.y)))
        : player.y;

      player.skinColor =
        clean(msg.skinColor, 24) || player.skinColor;

      player.characterVisual =
        msg.characterVisual &&
        typeof msg.characterVisual === 'object'
          ? msg.characterVisual
          : player.characterVisual;

      player.level = Math.max(
        1,
        Math.min(999, Number(msg.level) || 1)
      );

      broadcastRoom(
        room,
        {
          type: 'player_state',
          id: player.id,
          username: player.username,
          x: player.x,
          y: player.y,
          skinColor: player.skinColor,
          characterVisual: player.characterVisual,
          level: player.level
        },
        player.id
      );

      return;
    }
  });

  socket.on('close', () => {
    detachFromRoom(player);
    broadcastPlayerCount();
  });
});

function broadcastPlayerCount() {
  const payload = {
    type: 'player_count',
    players: wss.clients.size
  };

  for (const socket of wss.clients) {
    send(socket, payload);
  }
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`OUTLAST server running on port ${PORT}`);
});
