## Anilist Randomizer for Discord

A Discord bot that connects with [AniList](https://anilist.co/) to randomly select anime from a user's AniList profile. This bot makes it easy to pick your next watch by fetching detailed information about a random anime from your lists.

**This bot is not affiliated with [Anilist](https://anilist.co) nor [Discord](https://discord.com)**

## Features

- Fetches a random anime from an AniList account.
- Provides details such as:
  - Anime title
  - Description
  - Number of episodes
  - Format and status
  - Genres and scores (user and average)
  - Release year and cover image
- Interactive slash commands with error handling for invalid usernames or empty lists.
- AniList and Discord API integration with OAuth2 and robust logging.

## Setup Instructions

### Prerequisites

1. [Node.js](https://nodejs.org/) version 16 or later installed.
2. A Discord bot token. Create one on the [Discord Developer Portal](https://discord.com/developers/applications).
3. AniList API credentials. Register a client at [AniList API](https://anilist.co/settings/developer/).
4. Install dependencies:
   ```
   npm install
   ```

### Configuration

1. Create a `.env` file in the root of your project with the following variables:
   ```
   DISCORD_TOKEN=your_discord_token
   CLIENT_ID=your_anilist_client_id
   CLIENT_SECRET=your_anilist_client_secret
   ```

2. Make sure your bot has the required Discord permissions:
   - Slash commands
   - Read and send messages in the target channels.

### Running the Bot

Start the bot by running:

```
node start
```

The bot will log in and register the `/randomanime` command in all the servers it's added to.

## Usage

1. Use the `/randomanime` command in Discord and provide your AniList username.
2. The bot will fetch a random anime from your AniList and display its details in an embed.

## Development Notes

- The project uses:
  - [discord.js](https://discord.js.org) for Discord integration.
  - [Axios](https://axios-http.com/) for AniList API requests.
  - Slash commands for an interactive experience.
- Errors and logging are handled with a custom logger for better debugging.

### Key Files

- **app.js**: Main application logic.
- **.env**: Stores sensitive configuration variables.

## Contributions

Contributions are welcome! Feel free to open issues or submit pull requests.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
