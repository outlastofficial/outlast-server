const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 10000;

app.get("/", (req, res) => {
  res.json({
    status: "online",
    game: "OUTLAST",
    players: wss.clients.size
  });
});

wss.on("connection", (socket) => {
  console.log("Player connected");

  socket.send(JSON.stringify({
    type: "welcome",
    message: "Connected to the OUTLAST server!"
  }));

  socket.on("message", (message) => {
    // Send the message to the other connected players
    for (const player of wss.clients) {
      if (player !== socket && player.readyState === WebSocket.OPEN) {
        player.send(message.toString());
      }
    }
  });

  socket.on("close", () => {
    console.log("Player disconnected");
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`OUTLAST server running on port ${PORT}`);
});
