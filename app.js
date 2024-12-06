const { Client, GatewayIntentBits, SlashCommandBuilder } = require('discord.js');
const axios = require('axios');

// Import modular services
const AnimeRecommendationService = require('./modules/animeRecommendation');
const RandomAnimeService = require('./modules/RandomAnimeService');
const AnimeStatsService = require('./modules/AnimeStatsService');

const logger = require('./logger');  
require('dotenv').config();

const dis_token = process.env.DISCORD_TOKEN;
const ani_secret = process.env.CLIENT_SECRET;
const ani_id = process.env.CLIENT_ID;

class AniListDiscordBot {
    constructor(token) {
        // Discord bot configuration with required intents
        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages
            ]
        });
        logger.info('AniListDiscordBot initialized');

        // AniList API credentials
        this.CLIENT_ID = ani_id;
        this.CLIENT_SECRET = ani_secret;

        // Discord bot token
        this.TOKEN = dis_token;

        // Initialize services
        this.recommendationService = new AnimeRecommendationService(() => this.getAccessToken());
        this.randomAnimeService = new RandomAnimeService(() => this.getAccessToken());
        this.animeStatsService = new AnimeStatsService(() => this.getAccessToken());

        this.setupEventListeners();
    }

    setupEventListeners() {
        // Bot is ready - register slash commands
        this.client.once('ready', async () => {
            logger.info(`Logged in as ${this.client.user.tag}`);
            
            // Get all guilds the bot is in and register commands
            const guilds = this.client.guilds.cache;
            guilds.forEach(async (guild) => {
                try {
                    await this.registerSlashCommands(guild);
                    logger.info(`Registered commands for guild ${guild.id}`);
                } catch (error) {
                    logger.error(`Failed to register commands for guild ${guild.id}:`, error);
                }
            });
        });

        // Error handling
        this.client.on('error', (error) => {
            logger.error('Discord client error', { error });
        });
        
        // Interaction create event (handles slash commands)
        this.client.on('interactionCreate', async (interaction) => {
            if (!interaction.isChatInputCommand()) return;
        
            switch(interaction.commandName) {
                case 'randomanime':
                    await this.randomAnimeService.handleRandomAnimeCommand(interaction);
                    break;
                case 'animestats':
                    await this.animeStatsService.handleAnimeStatsCommand(interaction);
                    break;
                case 'animerecommend':
                    await this.recommendationService.handleAnimeRecommendCommand(interaction);
                    break;
            }
        });

        // Login to Discord
        this.client.login(this.TOKEN);
    }

    async registerSlashCommands(guild) {
        // Random anime command
        const randomAnimeCommand = new SlashCommandBuilder()
            .setName('randomanime')
            .setDescription('Get a random anime from a user\'s AniList')
            .addStringOption(option => 
                option.setName('username')
                    .setDescription('AniList username to fetch anime from')
                    .setRequired(true)
            );

        // Anime stats command
        const animeStatsCommand = new SlashCommandBuilder()
            .setName('animestats')
            .setDescription('Get anime stats for an AniList user')
            .addStringOption(option => 
                option.setName('username')
                    .setDescription('AniList username to fetch stats from')
                    .setRequired(true)
            );

        // Anime recommendation command
        const animeRecommendCommand = new SlashCommandBuilder()
            .setName('animerecommend')
            .setDescription('Get an anime recommendation based on your list')
            .addStringOption(option => 
                option.setName('username')
                    .setDescription('AniList username to generate recommendation from')
                    .setRequired(true)
            );

        try {
            // Register commands for the specific guild
            await guild.commands.create(randomAnimeCommand.toJSON());
            await guild.commands.create(animeStatsCommand.toJSON());
            await guild.commands.create(animeRecommendCommand.toJSON());
            console.log(`Registered slash commands for guild ${guild.id}`);
        } catch (error) {
            console.error(`Failed to register slash commands for guild ${guild.id}:`, error);
        }
    }

    async getAccessToken() {
        try {
            const response = await axios.post('https://anilist.co/api/v2/oauth/token', {
                grant_type: 'client_credentials',
                client_id: this.CLIENT_ID,
                client_secret: this.CLIENT_SECRET
            });
            
            return response.data.access_token;
        } catch (error) {
            console.error('Access token retrieval failed:', error);
            throw error;
        }
    }
}

// Usage
function initializeBot() {
    const bot = new AniListDiscordBot(dis_token);
}

initializeBot();