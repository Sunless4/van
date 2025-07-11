# Discord Vanity URL Monitor and Claimer

A comprehensive Node.js application that monitors Discord guilds for vanity URL changes and automatically attempts to claim dropped vanity URLs with MFA authentication support.

## Features

- **Real-time Monitoring**: WebSocket connection to Discord Gateway for instant vanity URL change detection
- **Automatic Claiming**: Attempts to claim dropped vanity URLs on target guilds
- **MFA Authentication**: Full support for Multi-Factor Authentication using password or backup codes
- **Webhook Notifications**: Discord webhook integration for real-time notifications
- **Smart Targeting**: Configure specific guilds for claiming or use all accessible guilds
- **Robust Error Handling**: Comprehensive error handling and automatic reconnection
- **Rate Limiting**: Built-in rate limiting compliance with Discord's API constraints

## Prerequisites

- Node.js 14 or higher
- npm or yarn package manager
- Discord bot token (for monitoring)
- Discord user token (for claiming)
- 2FA password or backup codes (for MFA authentication)

## Installation

1. Clone or download the application files

2. Install dependencies:
```bash
npm install ws node-fetch dotenv
