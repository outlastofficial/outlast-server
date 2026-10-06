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
const SERVER_VERSION = '3.29.1';
const MAP_SYSTEM_VERSION = '3.29.1';
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