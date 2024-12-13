const axios = require('axios');
const { EmbedBuilder } = require('discord.js');
const logger = require('../logger');
const metricsService = require('../metrics');

// Caching Service
class CacheService {
    constructor(ttl = 300000) { // 5 minutes default TTL
        this.cache = new Map();
        this.ttl = ttl;
    }

    set(key, value) {
        const entry = {
            value,
            timestamp: Date.now()
        };
        this.cache.set(key, entry);
        return value;
    }

    get(key) {
        const entry = this.cache.get(key);
        if (!entry) return null;

        // Check if entry is expired
        if (Date.now() - entry.timestamp > this.ttl) {
            this.cache.delete(key);
            return null;
        }

        return entry.value;
    }

    clear(key) {
        this.cache.delete(key);
    }
}

// Main Logic
class AnimeRecommendationService {
    constructor(accessTokenFn) {
        this.getAccessToken = accessTokenFn;
        this.cache = new CacheService();
    }

    async fetchAnimeRecommendation(username) {
        try {

            // Existing cache check
            const cachedRecommendation = this.cache.get(`recommendation_${username}`);
            if (cachedRecommendation) {
                metricsService.trackCacheHit('anime_recommendation');
                return cachedRecommendation;
            }

            const accessToken = await this.getAccessToken();
            const query = `
            query ($username: String) {
                MediaListCollection(userName: $username, type: ANIME) {
                    lists {
                        entries {
                            mediaId
                            status
                            score
                            media {
                                id
                                title {
                                    english
                                    romaji
                                }
                                genres
                            }
                        }
                    }
                }
            }
            `;

            // Fetch user's media list
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

            // Get user's anime list and find highest-rated anime
            const lists = response.data.data.MediaListCollection.lists;
            const allEntries = lists.flatMap(list => list.entries);
            
            // Sort entries by score, get highest-rated anime
            const highestRatedEntries = allEntries
                .filter(entry => entry.score > 0)
                .sort((a, b) => b.score - a.score)
                .slice(0, 3);  // Take top 3 highest-rated anime

            if (highestRatedEntries.length === 0) {
                throw new Error('No rated anime found in list');
            }

            // Use genres from highest-rated anime to find similar recommendations
            const genresOfInterest = highestRatedEntries
            .flatMap(entry => entry.media.genres)
            .filter((genre, index, self) => self.indexOf(genre) === index)
            .slice(0, 3); // Limit to top 3 genres

            // Second query to find recommendations based on genres
            const recommendationQuery = `
            query ($genres: [String]) {
                Page(page: 1, perPage: 5) {
                    media(
                        genre_in: $genres,
                        type: ANIME,
                        sort: POPULARITY_DESC
                    ) {
                        id
                        title {
                            english
                            romaji
                        }
                        description
                        episodes
                        format
                        status
                        genres
                        averageScore
                        seasonYear
                        coverImage {
                            extraLarge
                            large
                        }
                    }
                }
            }
            `;

            const recommendationResponse = await axios.post('https://graphql.anilist.co', 
                { 
                    query: recommendationQuery, 
                    variables: { genres: genresOfInterest }
                },
                {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    }
                }
            );

            const recommendedAnimes = recommendationResponse.data.data.Page.media;

            // Filter out anime that are already in the user's list
            const uniqueRecommendations = recommendedAnimes.filter(
                recommended => !allEntries.some(entry => entry.media.id === recommended.id)
            ).slice(0, 5); // Limit to 5 unique recommendations

            if (uniqueRecommendations.length === 0) {
                throw new Error('No unique recommendations found');
            }

            // Select a random recommendation from the available range
            const randomIndex = Math.floor(Math.random() * uniqueRecommendations.length);
            const recommendedAnime = uniqueRecommendations[randomIndex];

            return {
                id: recommendedAnime.id,
                title: recommendedAnime.title.english || recommendedAnime.title.romaji,
                description: recommendedAnime.description,
                episodes: recommendedAnime.episodes || 'Unknown',
                format: recommendedAnime.format,
                status: recommendedAnime.status,
                genres: recommendedAnime.genres,
                year: recommendedAnime.seasonYear,
                averageScore: recommendedAnime.averageScore,
                coverImage: recommendedAnime.coverImage.extraLarge || recommendedAnime.coverImage.large,
                matchedGenres: genresOfInterest.filter(genre => 
                    recommendedAnime.genres.includes(genre)
                )
            };

        } catch (error) {
            metricsService.trackError('recommendation_failure', 'anime_recommend');
            logger.error('Anime recommendation fetch failed', { 
                username, 
                errorMessage: error.message, 
                errorStack: error.stack 
            });
            throw error;
        }
    }

    createAnimeRecommendationEmbed(username, anime) {
        const cleanDescription = anime.description
            ? anime.description
                .replace(/<\/?[^>]+(>|$)/g, '')
                .replace(/\s+/g, ' ')
                .trim()
            : 'No description available';

        const animeDirectLink = `https://anilist.co/anime/${anime.id}`;

        const embed = new EmbedBuilder()
            .setColor('#00ff00')  // Green color for recommendations
            .setTitle(`🌟 Recommended Anime for ${username}`)
            .setURL(animeDirectLink)
            .setDescription(
                `📝 ${cleanDescription.length > 200 
                    ? cleanDescription.substring(0, 200) + '...' 
                    : cleanDescription}`
            )
            .addFields(
                { 
                    name: '🎬 Title', 
                    value: anime.title, 
                    inline: false 
                },
                { 
                    name: '📡 Show Status', 
                    value: anime.status, 
                    inline: true 
                },
                { 
                    name: '🎞️ Episodes', 
                    value: anime.episodes.toString(), 
                    inline: true 
                },
                { 
                    name: '🎭 Format', 
                    value: anime.format, 
                    inline: true 
                },
                { 
                    name: '📅 Year', 
                    value: anime.year?.toString() || 'Unknown', 
                    inline: true 
                },
                { 
                    name: '🏷️ Matched Genres', 
                    value: anime.matchedGenres.length > 0 
                        ? anime.matchedGenres.map(genre => `#${genre}`).join(' ') 
                        : 'No genre matches', 
                    inline: false 
                },
                { 
                    name: '📈 Average Score', 
                    value: `${anime.averageScore || 'N/A'}%`, 
                    inline: true 
                }
            )
            .setFooter({ 
                text: '🔗 Click title to view on AniList' 
            });

        // Validate and set image if URL is valid
        const isValidHttpUrl = (string) => {
            try {
                const url = new URL(string);
                return url.protocol === "http:" || url.protocol === "https:";
            } catch (_) {
                return false;  
            }
        };

        if (anime.coverImage && isValidHttpUrl(anime.coverImage)) {
            embed.setImage(anime.coverImage);
        }

        return embed;
    }

    async handleAnimeRecommendCommand(interaction) {
        try {
            await interaction.deferReply({ ephemeral: false });

            const username = interaction.options.getString('username');
            
            if (!username) {
                await interaction.editReply({
                    content: "❌ Please provide a valid AniList username.",
                    ephemeral: true
                });
                return;
            }

            try {
                const recommendedAnime = await this.fetchAnimeRecommendation(username);
                
                const recommendationEmbed = this.createAnimeRecommendationEmbed(username, recommendedAnime);
                
                await interaction.editReply({ 
                    embeds: [recommendationEmbed],
                    ephemeral: false
                });

            } catch (fetchError) {
                logger.error('Anime recommendation command processing error', { 
                    username, 
                    errorMessage: fetchError.message,
                    errorStack: fetchError.stack
                });

                await interaction.editReply({
                    content: `❌ Error fetching anime recommendation for ${username}. Possible reasons:
        - Invalid AniList username
        - No rated anime in list
        - Unable to generate recommendations
        - AniList API temporarily unavailable`,
                    ephemeral: true
                });
            }

        } catch (globalError) {
            logger.error('Critical error in anime recommendation command', {
                errorMessage: globalError.message,
                errorStack: globalError.stack
            });

            try {
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
                logger.error('Failed to send final error message', {
                    originalError: globalError,
                    replyError
                });
            }
        }
    }
}

module.exports = AnimeRecommendationService;