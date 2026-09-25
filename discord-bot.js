const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const {
  Client,
  GatewayIntentBits,
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder,
} = require("discord.js");

const REWARDS = [
  { invites: 1, type: "coins", amount: 500, label: "500 Coins" },
  { invites: 3, type: "coins", amount: 1500, label: "1,500 Coins" },
  { invites: 5, type: "skin", id: "discord-scout", label: "Discord Scout Skin" },
  { invites: 10, type: "coins", amount: 5000, label: "5,000 Coins" },
  { invites: 15, type: "title", id: "discord-inviter", label: "Discord Inviter Title" },
  { invites: 25, type: "skin", id: "discord-champion", label: "Discord Champion Skin" },
  { invites: 50, type: "title", id: "discord-champion", label: "Discord Champion Title" },
];

function clean(value, max = 40) {
  return String(value ?? "").trim().slice(0, max);
}

function randomCode(prefix = "") {
  return prefix + crypto.randomBytes(5).toString("hex").toUpperCase();
}

function loadStore(file) {
  try {
    const value = JSON.parse(fs.readFileSync(file, "utf8"));
    if (value && typeof value === "object" && !Array.isArray(value)) return value;
  } catch (_) {}
  return { linkCodes: {}, players: {}, invites: {} };
}

function saveStore(file, value) {
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), "utf8");
  fs.renameSync(tmp, file);
}

function findCategory(guild, name) {
  return guild.channels.cache.find(
    c => c.type === ChannelType.GuildCategory && c.name.toLowerCase() === name.toLowerCase()
  );
}

function findTextChannel(guild, name, parentId) {
  return guild.channels.cache.find(
    c =>
      c.type === ChannelType.GuildText &&
      c.name.toLowerCase() === name.toLowerCase() &&
      (!parentId || c.parentId === parentId)
  );
}

async function setupOutlast(guild) {
  let category = findCategory(guild, "OUTLAST");
  if (!category) {
    category = await guild.channels.create({ name: "OUTLAST", type: ChannelType.GuildCategory });
  }

  const channels = [
    ["outlast-news", "Official OUTLAST updates and announcements."],
    ["bug-reports", "Report OUTLAST bugs here."],
    ["ideas", "Suggest ideas for OUTLAST."],
    ["outlast-chat", "General OUTLAST discussion."],
  ];

  for (const [name, topic] of channels) {
    let channel = findTextChannel(guild, name, category.id);
    if (!channel) {
      channel = await guild.channels.create({
        name,
        type: ChannelType.GuildText,
        parent: category.id,
        topic,
      });
    } else if (channel.parentId !== category.id) {
      await channel.setParent(category.id);
    }
  }

  return category;
}

function initDiscord({ app, dataDir, inviteUrl }) {
  const token = (process.env.DISCORD_BOT_TOKEN || process.env.DISCORD_TOKEN || "").trim();
  const guildId = (process.env.DISCORD_GUILD_ID || "").trim();

  const storeFile = path.join(dataDir, "discord-rewards.json");
  const store = loadStore(storeFile);
  store.linkCodes ||= {};
  store.players ||= {};
  store.invites ||= {};

  const persist = () => saveStore(storeFile, store);

  function rewardsFor(username) {
    const name = clean(username, 18);
    const player = store.players[name.toLowerCase()];
    const invites = Number(player?.invites || 0);
    const claimed = Array.isArray(player?.claimed) ? player.claimed : [];

    return {
      ok: true,
      username: name,
      linked: Boolean(player?.discordId),
      discordTag: player?.discordTag || "",
      invites,
      inviteUrl,
      milestones: REWARDS.map(r => ({
        invites: r.invites,
        label: r.label,
        unlocked: invites >= r.invites,
        claimed: claimed.includes(String(r.invites)),
      })),
    };
  }

  app.post("/api/discord/link-code", (req, res) => {
    const username = clean(req.body?.username, 18);
    if (username.length < 2) {
      return res.status(400).json({ ok: false, error: "Valid username required." });
    }

    const code = randomCode("OL-");
    store.linkCodes[code] = {
      username,
      createdAt: Date.now(),
      expiresAt: Date.now() + 10 * 60 * 1000,
    };
    persist();

    res.json({ ok: true, code, expiresInSeconds: 600, command: "/link", inviteUrl });
  });

  app.get("/api/discord/rewards", (req, res) => {
    const username = clean(req.query?.username, 18);
    if (!username) return res.status(400).json({ ok: false, error: "Username required." });
    res.json(rewardsFor(username));
  });

  app.post("/api/discord/rewards/claim", (req, res) => {
    const username = clean(req.body?.username, 18);
    const milestone = String(Math.floor(Number(req.body?.invites) || 0));
    const player = store.players[username.toLowerCase()];
    const reward = REWARDS.find(r => String(r.invites) === milestone);

    if (!player?.discordId) {
      return res.status(403).json({ ok: false, error: "Link your Discord account first." });
    }
    if (!reward) return res.status(400).json({ ok: false, error: "Unknown reward." });
    if (Number(player.invites || 0) < reward.invites) {
      return res.status(403).json({ ok: false, error: "Reward is not unlocked yet." });
    }

    player.claimed ||= [];
    if (player.claimed.includes(milestone)) {
      return res.json({ ok: true, alreadyClaimed: true, reward, rewards: rewardsFor(username) });
    }

    player.claimed.push(milestone);
    player.pending ||= [];
    player.pending.push({
      id: randomCode("R-"),
      type: reward.type,
      amount: reward.amount || 0,
      rewardId: reward.id || "",
      label: reward.label,
      claimedAt: Date.now(),
    });
    persist();

    res.json({ ok: true, alreadyClaimed: false, reward, rewards: rewardsFor(username) });
  });

  app.post("/api/discord/redeem-pending", (req, res) => {
    const username = clean(req.body?.username, 18);
    const player = store.players[username.toLowerCase()];
    if (!player?.discordId) {
      return res.status(403).json({ ok: false, error: "Discord is not linked." });
    }

    const pending = Array.isArray(player.pending) ? player.pending.splice(0) : [];
    persist();
    res.json({ ok: true, rewards: pending });
  });

  if (!token || !guildId) {
    console.log("[Discord] Bot disabled: DISCORD_BOT_TOKEN and DISCORD_GUILD_ID are required.");
    return null;
  }

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
    ],
  });

  let inviteUses = new Map();

  async function cacheInvites(guild) {
    try {
      const invites = await guild.invites.fetch();
      inviteUses = new Map(
        [...invites.values()].map(invite => [
          invite.code,
          {
            uses: Number(invite.uses || 0),
            inviterId: invite.inviter?.id || null,
          },
        ])
      );
      for (const [code, info] of inviteUses) store.invites[code] = info;
      persist();
      return invites;
    } catch (error) {
      console.error("[Discord] Could not fetch invites:", error.message);
      return null;
    }
  }

  const commands = [
    new SlashCommandBuilder()
      .setName("link")
      .setDescription("Link your Discord account to an OUTLAST username.")
      .addStringOption(o =>
        o.setName("code").setDescription("OUTLAST linking code").setRequired(true)
      ),
    new SlashCommandBuilder()
      .setName("rewards")
      .setDescription("Show your OUTLAST Discord invite rewards."),
    new SlashCommandBuilder()
      .setName("ping")
      .setDescription("Check that the OUTLAST bot is online."),
    new SlashCommandBuilder()
      .setName("outlast")
      .setDescription("Manage the OUTLAST Discord server.")
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addSubcommand(s => s.setName("setup").setDescription("Create the standard OUTLAST channels."))
      .addSubcommand(s =>
        s.setName("announce")
          .setDescription("Post an OUTLAST announcement.")
          .addStringOption(o => o.setName("message").setDescription("Announcement text").setRequired(true))
      ),
  ].map(c => c.toJSON());

  let discordReady = false;

  client.once("ready", async () => {
    discordReady = true;
    console.log("[Discord] Logged in as " + client.user.tag);

    const guild = await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) {
      console.error("[Discord] Could not find DISCORD_GUILD_ID=" + guildId);
      return;
    }

    await cacheInvites(guild);
    setInterval(() => pollInviteUses(guild), 30000);
    await guild.commands.set(commands);
    await client.application.commands.set(commands);
    console.log("[Discord] OUTLAST commands registered for guild " + guild.id + " and globally.");
  });

  client.on("inviteCreate", invite => {
    inviteUses.set(invite.code, {
      uses: Number(invite.uses || 0),
      inviterId: invite.inviter?.id || null,
    });
  });

  client.on("inviteDelete", invite => {
    inviteUses.delete(invite.code);
  });

  async function pollInviteUses(guild) {
    try {
      const invites = await guild.invites.fetch();
      const next = new Map(
        [...invites.values()].map(invite => [
          invite.code,
          {
            uses: Number(invite.uses || 0),
            inviterId: invite.inviter?.id || null,
          },
        ])
      );

      for (const [code, after] of next) {
        const before = Number(inviteUses.get(code)?.uses || 0);
        const increase = Math.max(0, after.uses - before);
        if (!increase || !after.inviterId) continue;

        const player = Object.values(store.players).find(p => p.discordId === after.inviterId);
        if (!player) continue;

        player.invites = Number(player.invites || 0) + increase;
        player.lastInviteAt = Date.now();
        console.log("[Discord] Verified " + increase + " invite(s) for " + player.username + ": " + player.invites);
      }

      inviteUses = next;
      for (const [code, info] of next) store.invites[code] = info;
      persist();
    } catch (error) {
      console.error("[Discord] Invite tracking error:", error.message);
    }
  }

  client.on("interactionCreate", async interaction => {
    if (!interaction.isChatInputCommand()) return;

    try {
      if (interaction.commandName === "ping") {
        return interaction.reply({ content: "🏓 OUTLAST Bot is online and connected.", ephemeral: true });
      }

      if (interaction.commandName === "link") {
        const code = clean(interaction.options.getString("code"), 32).toUpperCase();
        const link = store.linkCodes[code];

        if (!link || link.expiresAt < Date.now()) {
          return interaction.reply({
            content: "That OUTLAST link code is invalid or expired. Generate a new one in the game.",
            ephemeral: true,
          });
        }

        const alreadyLinked = Object.values(store.players).find(
          p => p.discordId === interaction.user.id &&
               p.username.toLowerCase() !== link.username.toLowerCase()
        );
        if (alreadyLinked) {
          return interaction.reply({
            content: "This Discord account is already linked to another OUTLAST username.",
            ephemeral: true,
          });
        }

        const key = link.username.toLowerCase();
        const old = store.players[key];
        if (old?.discordId && old.discordId !== interaction.user.id) {
          return interaction.reply({
            content: "That OUTLAST username is already linked to another Discord account.",
            ephemeral: true,
          });
        }

        store.players[key] = {
          username: link.username,
          discordId: interaction.user.id,
          discordTag: interaction.user.tag,
          invites: Number(old?.invites || 0),
          claimed: Array.isArray(old?.claimed) ? old.claimed : [],
          pending: Array.isArray(old?.pending) ? old.pending : [],
          linkedAt: Date.now(),
        };
        delete store.linkCodes[code];
        persist();

        return interaction.reply({
          content: "OUTLAST account linked! Future verified invites will count toward your in-game rewards.",
          ephemeral: true,
        });
      }

      if (interaction.commandName === "rewards") {
        const player = Object.values(store.players).find(p => p.discordId === interaction.user.id);
        if (!player) {
          return interaction.reply({
            content: "Your Discord account is not linked yet. Generate a link code in OUTLAST first.",
            ephemeral: true,
          });
        }

        const rewards = rewardsFor(player.username);
        const unlocked = rewards.milestones
          .filter(r => r.unlocked && !r.claimed)
          .map(r => r.label);

        return interaction.reply({
          content: [
            "**OUTLAST Discord Rewards**",
            "Verified invites: **" + rewards.invites + "**",
            unlocked.length ? "Unlocked: " + unlocked.join(", ") : "No new rewards unlocked yet.",
            "Claim unlocked rewards from OUTLAST.",
          ].join("\n"),
          ephemeral: true,
        });
      }

      if (interaction.commandName === "outlast") {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
          return interaction.reply({
            content: "You need Manage Server permission to use this command.",
            ephemeral: true,
          });
        }

        const sub = interaction.options.getSubcommand();
        if (sub === "setup") {
          const category = await setupOutlast(interaction.guild);
          return interaction.reply("OUTLAST server setup is ready in **" + category.name + "**.");
        }

        if (sub === "announce") {
          const message = interaction.options.getString("message", true);
          let channel = findTextChannel(interaction.guild, "outlast-news");
          if (!channel) {
            await setupOutlast(interaction.guild);
            channel = findTextChannel(interaction.guild, "outlast-news");
          }
          await channel.send({ content: message });
          return interaction.reply({ content: "Announcement posted.", ephemeral: true });
        }
      }
    } catch (error) {
      console.error("[Discord] Interaction error:", error);
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: "The bot hit an error.", ephemeral: true });
      } else {
        await interaction.reply({ content: "The bot hit an error.", ephemeral: true });
      }
    }
  });

  client.on("error", error => console.error("[Discord] Client error:", error));
  client.on("warn", message => console.warn("[Discord] Warning:", message));
  client.on("shardError", error => console.error("[Discord] Shard error:", error.message));
  client.on("shardDisconnect", (event, shardId) => console.error("[Discord] Shard disconnected:", shardId, event?.code, event?.reason || ""));
  client.on("shardReconnecting", shardId => console.log("[Discord] Shard reconnecting:", shardId));
  console.log("[Discord] Token present:", Boolean(token), "Guild ID:", guildId, "Token length:", token.length);
  client.login(token).then(() => {
    console.log("[Discord] Login request accepted; waiting for READY event...");
  }).catch(error => {
    console.error("[Discord] Bot login failed:", error?.name || "Error", error?.message || String(error));
  });
  setTimeout(() => {
    if (!discordReady) console.error("[Discord] Bot has not reached READY after 30 seconds.");
  }, 30000);

  return client;
}

module.exports = { initDiscord };
