const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
} = require("discord.js");

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const GUILD_ID = process.env.DISCORD_GUILD_ID;

if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error("Missing DISCORD_TOKEN, DISCORD_CLIENT_ID, or DISCORD_GUILD_ID.");
  process.exit(1);
}

const commands = [
  new SlashCommandBuilder()
    .setName("outlast")
    .setDescription("Manage the OUTLAST Discord server.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(s => s.setName("setup").setDescription("Create the standard OUTLAST category and channels."))
    .addSubcommand(s => s.setName("announce").setDescription("Post an OUTLAST announcement.")
      .addStringOption(o => o.setName("message").setDescription("Announcement text").setRequired(true)))
    .addSubcommand(s => s.setName("create-channel").setDescription("Create a text channel.")
      .addStringOption(o => o.setName("name").setDescription("Channel name").setRequired(true))
      .addStringOption(o => o.setName("category").setDescription("Category name").setRequired(false)))
    .addSubcommand(s => s.setName("rename-channel").setDescription("Rename the current channel.")
      .addStringOption(o => o.setName("name").setDescription("New channel name").setRequired(true)))
].map(c => c.toJSON());

const rest = new REST({ version: "10" }).setToken(TOKEN);

async function registerCommands() {
  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
  console.log("OUTLAST Discord commands registered.");
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

async function findCategory(guild, name) {
  return guild.channels.cache.find(
    c => c.type === ChannelType.GuildCategory && c.name.toLowerCase() === name.toLowerCase()
  );
}

async function findTextChannel(guild, name, parentId) {
  return guild.channels.cache.find(
    c =>
      c.type === ChannelType.GuildText &&
      c.name.toLowerCase() === name.toLowerCase() &&
      (!parentId || c.parentId === parentId)
  );
}

async function setupOutlast(guild) {
  let category = await findCategory(guild, "OUTLAST");
  if (!category) {
    category = await guild.channels.create({
      name: "OUTLAST",
      type: ChannelType.GuildCategory,
    });
  }

  const channels = [
    ["outlast-news", "Official OUTLAST updates and announcements."],
    ["bug-reports", "Report OUTLAST bugs here."],
    ["ideas", "Suggest ideas for OUTLAST."],
    ["outlast-chat", "General OUTLAST discussion."],
  ];

  for (const [name, topic] of channels) {
    let channel = await findTextChannel(guild, name, category.id);
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

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);
  await registerCommands();
});

client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand() || interaction.commandName !== "outlast") return;

  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    return interaction.reply({ content: "You need Manage Server permission to use this command.", ephemeral: true });
  }

  try {
    const sub = interaction.options.getSubcommand();

    if (sub === "setup") {
      const category = await setupOutlast(interaction.guild);
      return interaction.reply(`OUTLAST server setup is ready in **${category.name}**.`);
    }

    if (sub === "announce") {
      const message = interaction.options.getString("message", true);
      let channel = await findTextChannel(interaction.guild, "outlast-news");
      if (!channel) {
        await setupOutlast(interaction.guild);
        channel = await findTextChannel(interaction.guild, "outlast-news");
      }
      await channel.send({ content: message });
      return interaction.reply({ content: "Announcement posted.", ephemeral: true });
    }

    if (sub === "create-channel") {
      const name = interaction.options.getString("name", true)
        .toLowerCase().replace(/[^a-z0-9-_]/g, "-").replace(/-+/g, "-").slice(0, 90);
      const categoryName = interaction.options.getString("category");
      const category = categoryName ? await findCategory(interaction.guild, categoryName) : null;
      const existing = await findTextChannel(interaction.guild, name, category?.id);
      if (existing) return interaction.reply({ content: `#${name} already exists.`, ephemeral: true });

      await interaction.guild.channels.create({
        name,
        type: ChannelType.GuildText,
        parent: category?.id,
      });
      return interaction.reply({ content: `Created #${name}.`, ephemeral: true });
    }

    if (sub === "rename-channel") {
      const name = interaction.options.getString("name", true)
        .toLowerCase().replace(/[^a-z0-9-_]/g, "-").replace(/-+/g, "-").slice(0, 90);
      await interaction.channel.setName(name);
      return interaction.reply({ content: `Channel renamed to #${name}.`, ephemeral: true });
    }
  } catch (error) {
    console.error(error);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: "The bot hit an error while changing the server.", ephemeral: true });
    } else {
      await interaction.reply({ content: "The bot hit an error while changing the server.", ephemeral: true });
    }
  }
});

client.login(TOKEN);
