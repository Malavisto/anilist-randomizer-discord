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


    
    async handleRandomAnimeCommand(interaction) {
        try {
            // Immediately defer the reply to prevent timeout
            await interaction.deferReply({ ephemeral: false });
    
            const username = interaction.options.getString('username');
            
            // Early validation with quick response
            if (!username) {
                await interaction.editReply({
                    content: "❌ Please provide a valid AniList username.",
                    ephemeral: true
                });
                return;
            }
    
            try {
                const accessToken = await this.getAccessToken();
                const randomAnime = await this.fetchRandomAnime(accessToken, username);
                
                const embed = this.createAnimeEmbed(randomAnime);
                
                await interaction.editReply({ 
                    embeds: [embed],
                    ephemeral: false
                });
    
            } catch (fetchError) {
                logger.error('Anime command processing error', { 
                    username, 
                    errorMessage: fetchError.message,
                    errorStack: fetchError.stack
                });
    
                // Guaranteed response to prevent "thinking" state
                await interaction.editReply({
                    content: `❌ Error fetching anime for ${username}. Possible reasons:
        - Invalid AniList username
        - Empty anime list
        - AniList API temporarily unavailable
        - Network connectivity issues`,
                    ephemeral: true
                });
            }
    
        } catch (globalError) {
            // Last-resort error handling
            logger.error('Critical error in anime command', {
                errorMessage: globalError.message,
                errorStack: globalError.stack
            });
    
            try {
                // Final attempt to respond to interaction
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({
                        content: "❌ An unexpected error occurred. Please try again later.",
                        ephemeral: true
                    });
                } else if (interaction.deferred) {
                    await interaction.editReply({
                        content: "❌ An unexpected error occurred. Please try again later.",
                        ephemeral: true
                    });
                }
            } catch (replyError) {
                // If all else fails, log the error
                logger.error('Failed to send final error message', {
                    originalError: globalError,
                    replyError
                });
            }
        }
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
        
            if (interaction.commandName === 'randomanime') {
                await this.handleRandomAnimeCommand(interaction);
            } else if (interaction.commandName === 'animestats') {
                await this.handleAnimeStatsCommand(interaction);
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

        try {
            // Register both commands for the specific guild
            await guild.commands.create(randomAnimeCommand.toJSON());
            await guild.commands.create(animeStatsCommand.toJSON());
            console.log(`Registered slash commands for guild ${guild.id}`);
        } catch (error) {
            console.error(`Failed to register slash commands for guild ${guild.id}:`, error);
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
         // Normalize the username to lowercase
        const normalizedUsername = username.toLowerCase();

        const query = `
        query ($username: String) {
            User(name: $username) {
                id  # Validate user exists first
            }
            MediaListCollection(userName: $username, type: ANIME) {
                lists {
                    entries {
                        media {
                            id
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

            if (!response.data.data.User) {
                throw new Error(`User ${username} not found on AniList`);
            }

            const allEntries = response.data.data.MediaListCollection.lists
                .flatMap(list => list.entries);

            if (allEntries.length === 0) {
                throw new Error(`No anime found in ${username}'s list`);
            }

            const randomAnime = allEntries[Math.floor(Math.random() * allEntries.length)];

           
        return {
            id: randomAnime.media.id,
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
            logger.error('Anime fetch failed', { 
                username, 
                errorMessage: error.message, 
                errorStack: error.stack 
            });
            throw error;
        }
    }

    createAnimeEmbed(anime) {
        // Clean up description 
        const cleanDescription = anime.description
            ? anime.description
                .replace(/<\/?[^>]+(>|$)/g, '')  // Remove HTML tags
                .replace(/\s+/g, ' ')  // Replace multiple whitespaces with single space
                .trim()
            : 'No description available';
    
        // Direct link to the specific anime page using its ID
        const animeDirectLink = `https://anilist.co/anime/${anime.id}`;
    
        // Emoji mapping for different statuses and formats
        const statusEmojis = {
            'FINISHED': '✅',
            'RELEASING': '🔴',
            'NOT_YET_RELEASED': '⏳',
            'CANCELLED': '❌'
        };
    
        const formatEmojis = {
            'TV': '📺',
            'MOVIE': '🎬',
            'OVA': '💿',
            'SPECIAL': '⭐',
            'MUSIC': '🎵',
            'ONA': '💻',
            'MANGA': '📖'
        };
    
        const embedBuilder = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle(`🌟 ${anime.title}`)
            .setURL(animeDirectLink)
            .setDescription(
                `📝 ${cleanDescription.length > 200 
                    ? cleanDescription.substring(0, 200) + '...' 
                    : cleanDescription}`
            )
            .addFields(
                { 
                    name: '📡 Status', 
                    value: `${statusEmojis[anime.status] || '❓'} ${anime.status}`, 
                    inline: true
                },
                { 
                    name: '🎞️ Episodes', 
                    value: `🔢 ${anime.episodes.toString()}`, 
                    inline: true 
                },
                { 
                    name: '🎭 Format', 
                    value: `${formatEmojis[anime.format] || '🎴'} ${anime.format}`, 
                    inline: true 
                },
                { 
                    name: '📅 Year', 
                    value: `🗓️ ${anime.year?.toString() || 'Unknown'}`, 
                    inline: true 
                },
                { 
                    name: '🏷️ Genres', 
                    value: anime.genres.length > 0 
                        ? anime.genres.map(genre => `#${genre}`).join(' ') 
                        : 'No genres', 
                    inline: false 
                },
                { 
                    name: '⭐ Your Score', 
                    value: `📊 ${anime.userScore?.toString() || 'Not rated'}`, 
                    inline: true 
                },
                { 
                    name: '📈 Average Score', 
                    value: `🌈 ${anime.averageScore || 'N/A'}%`, 
                    inline: true 
                }
            )
            .setFooter({ 
                text: '🔗 Click title to view on AniList' 
            });
    
        // Add thumbnail only if a valid image URL exists
        if (anime.coverImage && isValidHttpUrl(anime.coverImage)) {
            embedBuilder.setImage(anime.coverImage);
        }
    
        return embedBuilder;
    }

        createAnimeStatsEmbed(username, stats) {
        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle(`📊 Anime Stats for ${username}`)
            .addFields(
                { 
                    name: '📈 Total Anime', 
                    value: `🌟 ${stats.totalAnime}`, 
                    inline: true 
                },
                { 
                    name: '✅ Completed', 
                    value: `🏆 ${stats.completedAnime}`, 
                    inline: true 
                },
                { 
                    name: '📺 Currently Watching', 
                    value: `🔴 ${stats.watchingAnime}`, 
                    inline: true 
                },
                { 
                    name: '⏸️ Paused', 
                    value: `⏳ ${stats.pausedAnime}`, 
                    inline: true 
                },
                { 
                    name: '❌ Dropped', 
                    value: `🗑️ ${stats.droppedAnime}`, 
                    inline: true 
                },
                { 
                    name: '📅 Planning to Watch', 
                    value: `📝 ${stats.planningAnime}`, 
                    inline: true 
                },
                { 
                    name: '⭐ Average Score', 
                    value: `🌈 ${stats.averageScore || 'N/A'}`, 
                    inline: true 
                }
            )
            .setFooter({ 
                text: 'Stats fetched from AniList' 
            });
    
        return embed;
    }

    async fetchUserAnimeStats(accessToken, username) {
        const query = `
        query ($username: String) {
            User(name: $username) {
                id
                name
            }
            MediaListCollection(userName: $username, type: ANIME) {
                lists {
                    name
                    entries {
                        status
                        media {
                            averageScore
                        }
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
    
            if (!response.data.data.User) {
                throw new Error(`User ${username} not found on AniList`);
            }
    
            const lists = response.data.data.MediaListCollection.lists;
    
            // Define status categories
            const statusCategories = {
                'Completed': lists.find(list => list.name === 'Completed')?.entries || [],
                'Watching': lists.find(list => list.name === 'Watching')?.entries || [],
                'Paused': lists.find(list => list.name === 'Paused')?.entries || [],
                'Dropped': lists.find(list => list.name === 'Dropped')?.entries || [],
                'Planning': lists.find(list => list.name === 'Planning')?.entries || []
            };
    
            // Calculate statistics
            const stats = {
                totalAnime: 0,
                completedAnime: statusCategories['Completed'].length,
                watchingAnime: statusCategories['Watching'].length,
                pausedAnime: statusCategories['Paused'].length,
                droppedAnime: statusCategories['Dropped'].length,
                planningAnime: statusCategories['Planning'].length,
                averageScore: 0,
                highestRatedAnime: null,
                lowestRatedAnime: null
            };
    
            // Collect all anime entries for scoring
            const allEntries = Object.values(statusCategories).flat();
            stats.totalAnime = allEntries.length;
    
            // Calculate average score and find highest/lowest rated
            const validScores = allEntries
                .map(entry => entry.media.averageScore)
                .filter(score => score !== null);
    
            if (validScores.length > 0) {
                stats.averageScore = (validScores.reduce((a, b) => a + b, 0) / validScores.length).toFixed(2);
                
                const highestRatedEntry = allEntries.reduce((highest, current) => 
                    (current.media.averageScore > (highest.media.averageScore || 0)) ? current : highest
                );
                
                const lowestRatedEntry = allEntries.reduce((lowest, current) => 
                    (current.media.averageScore < (lowest.media.averageScore || 100)) ? current : lowest
                );
            }
    
            return stats;
        } catch (error) {
            logger.error('Anime stats fetch failed', { 
                username, 
                errorMessage: error.message, 
                errorStack: error.stack 
            });
            throw error;
        }
    }
    
    async handleAnimeStatsCommand(interaction) {
        try {
            // Immediately defer the reply to prevent timeout
            await interaction.deferReply({ ephemeral: false });
    
            const username = interaction.options.getString('username');
            
            // Early validation with quick response
            if (!username) {
                await interaction.editReply({
                    content: "❌ Please provide a valid AniList username.",
                    ephemeral: true
                });
                return;
            }
    
            try {
                const accessToken = await this.getAccessToken();
                const stats = await this.fetchUserAnimeStats(accessToken, username);
                
                const statsEmbed = this.createAnimeStatsEmbed(username, stats);
                
                await interaction.editReply({ 
                    embeds: [statsEmbed],
                    ephemeral: false
                });
    
            } catch (fetchError) {
                logger.error('Anime stats command processing error', { 
                    username, 
                    errorMessage: fetchError.message,
                    errorStack: fetchError.stack
                });
    
                // Guaranteed response to prevent "thinking" state
                await interaction.editReply({
                    content: `❌ Error fetching anime stats for ${username}. Possible reasons:
        - Invalid AniList username
        - Empty anime list
        - AniList API temporarily unavailable
        - Network connectivity issues`,
                    ephemeral: true
                });
            }
    
        } catch (globalError) {
            // Last-resort error handling
            logger.error('Critical error in anime stats command', {
                errorMessage: globalError.message,
                errorStack: globalError.stack
            });
    
            try {
                // Final attempt to respond to interaction
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({
                        content: "❌ An unexpected error occurred. Please try again later.",
                        ephemeral: true
                    });
                } else if (interaction.deferred) {
                    await interaction.editReply({
                        content: "❌ An unexpected error occurred. Please try again later.",
                        ephemeral: true
                    });
                }
            } catch (replyError) {
                // If all else fails, log the error
                logger.error('Failed to send final error message', {
                    originalError: globalError,
                    replyError
                });
            }
        }
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