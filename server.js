const express = require("express");
const http = require("http");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const WebSocket = require("ws");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const PORT = process.env.PORT || 10000;

const DATA_DIR = path.join(__dirname, "data");
const FEEDBACK_FILE = path.join(DATA_DIR, "feedback.json");
fs.mkdirSync(DATA_DIR, { recursive: true });

function loadFeedback() {
  try {
    const parsed = JSON.parse(fs.readFileSync(FEEDBACK_FILE, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

let feedback = loadFeedback();

function saveFeedback() {
  const temp = FEEDBACK_FILE + ".tmp";
  fs.writeFileSync(temp, JSON.stringify(feedback, null, 2), "utf8");
  fs.renameSync(temp, FEEDBACK_FILE);
}

app.use(cors({ origin: true }));
app.use(express.json({ limit: "32kb" }));

app.get("/", (req, res) => {
  res.json({
    status: "online",
    game: "OUTLAST",
    version: "2.6.0",
    players: wss.clients.size,
    feedback: feedback.length
  });
});

app.get("/api/feedback", (req, res) => {
  res.json({
    entries: feedback.slice().sort((a, b) => Number(b.date) - Number(a.date))
  });
});

app.post("/api/feedback", (req, res) => {
  const clientId = String(req.body?.clientId || "").slice(0, 120);
  const user = String(req.body?.user || "Player").trim().slice(0, 18) || "Player";
  const type = req.body?.type === "idea" ? "idea" : "bug";
  const title = String(req.body?.title || "").trim().slice(0, 80);
  const body = String(req.body?.body || "").trim().slice(0, 1000);
  const date = Number(req.body?.date) || Date.now();

  if (title.length < 3 || body.length < 5) {
    return res.status(400).json({ ok: false, error: "Title/body too short" });
  }

  if (clientId) {
    const existing = feedback.find(x => x.clientId === clientId);
    if (existing) return res.json({ ok: true, duplicate: true, entry: existing });
  }

  const duplicate = feedback.find(x =>
    x.user.toLowerCase() === user.toLowerCase() &&
    x.type === type &&
    x.title.toLowerCase() === title.toLowerCase()
  );

  if (duplicate) {
    return res.json({ ok: true, duplicate: true, entry: duplicate });
  }

  const entry = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    clientId,
    user,
    type,
    title,
    body,
    status: "Pending",
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

wss.on("connection", socket => {
  console.log("Player connected");

  socket.send(JSON.stringify({
    type: "welcome",
    message: "Connected to the OUTLAST server!"
  }));

  const broadcastCount = () => {
    const message = JSON.stringify({
      type: "player_count",
      players: wss.clients.size
    });

    for (const player of wss.clients) {
      if (player.readyState === WebSocket.OPEN) {
        player.send(message);
      }
    }
  };

  socket.on("message", message => {
    for (const player of wss.clients) {
      if (player !== socket && player.readyState === WebSocket.OPEN) {
        player.send(message.toString());
      }
    }
  });

  socket.on("close", () => {
    console.log("Player disconnected");
    broadcastCount();
  });

  broadcastCount();
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`OUTLAST server running on port ${PORT}`);
});
