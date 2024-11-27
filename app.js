const { Client, GatewayIntentBits, SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');

// Env Files
require('dotenv').config();
const dis_token = process.env.DISCORD_TOKEN;
const ani_secret = process.env.CLIENT_SECRET;
const ani_id = process.env.CLIENT_ID;

const logger = require('./logger');  // Import the new logger

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

        this.client.on('error', (error) => {
            logger.error('Discord client error', { error });
        });
        
        // Interaction create event (handles slash commands)
        this.client.on('interactionCreate', async (interaction) => {
            if (!interaction.isChatInputCommand()) return;

            // Handle random anime command
            if (interaction.commandName === 'randomanime') {
                // Get username from command option
                const username = interaction.options.getString('username');

                try {
                    // Get access token and random anime
                    const accessToken = await this.getAccessToken();
                    const randomAnime = await this.fetchRandomAnime(accessToken, username);
                    
                    // Create and send embed
                    const embed = this.createAnimeEmbed(randomAnime);
                    await interaction.reply({ embeds: [embed] });
                } catch (error) {
                    console.error('Anime fetch error:', error);
                    await interaction.reply({
                        content: `Error fetching anime: ${error.message}`,
                        ephemeral: true // Only visible to the user who sent the command
                    });
                }
            }
        });

        // Login to Discord
        this.client.login(this.TOKEN);
    }

    async registerSlashCommands(guild) {
        // Create the random anime slash command
        const command = new SlashCommandBuilder()
            .setName('randomanime')
            .setDescription('Get a random anime from a user\'s AniList')
            .addStringOption(option => 
                option.setName('username')
                    .setDescription('AniList username to fetch anime from')
                    .setRequired(true)
            );

        try {
            // Register the command for the specific guild
            await guild.commands.create(command.toJSON());
            console.log(`Registered slash command for guild ${guild.id}`);
        } catch (error) {
            console.error(`Failed to register slash command for guild ${guild.id}:`, error);
        }
    }

    // The rest of the methods (getAccessToken, fetchRandomAnime, createAnimeEmbed) 
    // remain the same as in the previous implementation

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

    async fetchRandomAnime(accessToken, username) {
        const query = `
        query ($username: String) {
            MediaListCollection(userName: $username, type: ANIME) {
                lists {
                    entries {
                        media {
                            title {
                                english
                                romaji
                            }
                            episodes
                            format
                            status
                            genres
                            description
                            averageScore
                            seasonYear
                            coverImage {
                                large
                                extraLarge
                            }
                        }
                        status
                        score
                    }
                }
            }
        }
        `;

        try {
            const response = await axios.post('https://graphql.anilist.co', 
                { 
                    query, 
                    variables: { username } 
                },
                {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    }
                }
            );

            const allEntries = response.data.data.MediaListCollection.lists
                .flatMap(list => list.entries);

            if (allEntries.length === 0) {
                throw new Error(`No anime found in ${username}'s list`);
            }

            const randomAnime = allEntries[Math.floor(Math.random() * allEntries.length)];

           
        return {
            title: randomAnime.media.title.english || randomAnime.media.title.romaji,
            episodes: randomAnime.media.episodes || 'Unknown',
            format: randomAnime.media.format,
            status: randomAnime.status,
            userScore: randomAnime.score,
            averageScore: randomAnime.media.averageScore,
            genres: randomAnime.media.genres,
            year: randomAnime.media.seasonYear,
            description: randomAnime.media.description,
            // Prefer extraLarge, but fallback to large, then remove any potentially malformed URLs
            coverImage: randomAnime.media.coverImage.extraLarge || 
                       randomAnime.media.coverImage.large || 
                       null  // Add null fallback
            };
        } catch (error) {
            logger.error('Anime fetch failed:', error);
            throw error;
        }
    }

    createAnimeEmbed(anime) {
        // Create embed with more robust image handling
        const embedBuilder = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle(anime.title)
            .setDescription(
                anime.description 
                    ? (anime.description.length > 200 
                        ? anime.description.substring(0, 200) + '...' 
                        : anime.description)
                    : 'No description available'
            )
            .addFields(
                { name: 'Episodes', value: anime.episodes.toString(), inline: true },
                { name: 'Format', value: anime.format, inline: true },
                { name: 'Year', value: anime.year?.toString() || 'Unknown', inline: true },
                { name: 'Genres', value: anime.genres.join(', ') || 'No genres', inline: false },
                { name: 'Your Score', value: anime.userScore?.toString() || 'Not rated', inline: true },
                { name: 'Average Score', value: `${anime.averageScore || 'N/A'}%`, inline: true }
            );
    
        // Add thumbnail only if a valid image URL exists
        if (anime.coverImage && isValidHttpUrl(anime.coverImage)) {
            embedBuilder.setImage(anime.coverImage);
        }
    
        return embedBuilder;
    }
}    

// Usage
function isValidHttpUrl(string) {
    let url;
    try {
        url = new URL(string);
        return url.protocol === "http:" || url.protocol === "https:";
    } catch (_) {
        return false;  
    }
}
function initializeBot() {
    // Replace with your actual Discord bot token
    const DISCORD_BOT_TOKEN = 'dis_token';
    const bot = new AniListDiscordBot(DISCORD_BOT_TOKEN);
}

initializeBot();