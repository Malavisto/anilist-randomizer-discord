const axios = require('axios');
const { EmbedBuilder } = require('discord.js');
const logger = require('../logger');

class AnimeStatsService {
    constructor(getAccessTokenFn) {
        this.getAccessToken = getAccessTokenFn;
    }

    async fetchUserAnimeStats(username) {
        try {
            const accessToken = await this.getAccessToken();
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
                averageScore: 0
            };
    
            // Collect all anime entries for scoring
            const allEntries = Object.values(statusCategories).flat();
            stats.totalAnime = allEntries.length;
    
            // Calculate average score
            const validScores = allEntries
                .map(entry => entry.media.averageScore)
                .filter(score => score !== null);
    
            if (validScores.length > 0) {
                stats.averageScore = (validScores.reduce((a, b) => a + b, 0) / validScores.length).toFixed(2);
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
                const stats = await this.fetchUserAnimeStats(username);
                
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

module.exports = AnimeStatsService;