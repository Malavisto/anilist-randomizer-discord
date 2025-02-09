# Anilist Discord Bot Service

This document provides information about setting up the `anilist-discord.service` systemd service for the Anilist Discord Bot.

## Setup

1. **Clone the Repository**:
    ```sh
    git clone https://github.com/Malavisto/anilist-randomizer-discord.git
    cd discord-anilist/systemd
    ```

2. **Copy the Service File**:
    ```sh
    sudo cp anilist-discord.service /etc/systemd/system/
    ```

3. **Enable and Start the Service**:
    ```sh
    sudo systemctl enable anilist-discord.service
    sudo systemctl start anilist-discord.service
    ```

4. **Check Service Status**:
    ```sh
    sudo systemctl status anilist-discord.service
    ```

For more details, refer to the systemd documentation.
