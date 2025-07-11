# Discord Vanity URL Monitor and Claimer

## Overview

This is a Node.js application that monitors Discord guilds for vanity URL changes and automatically attempts to claim dropped vanity URLs. The system uses real-time WebSocket connections to Discord's Gateway API for instant detection and includes Multi-Factor Authentication (MFA) support for secure claiming operations.

## User Preferences

Preferred communication style: Simple, everyday language.

## Recent Changes

**July 8, 2025 - Complete Node.js Integration**
- ✅ Fixed node-fetch ES module compatibility by downgrading to v2
- ✅ Enhanced MFA authentication system with improved error handling
- ✅ Added token caching and validation for better performance
- ✅ Updated API endpoints to use Discord API v9 for consistency
- ✅ Integrated Python MFA logic into Node.js MFA class
- ✅ Successfully deployed and tested - monitoring 181 guilds
- ✅ Environment variables configured and validated

**July 8, 2025 - Enhanced Speed Tracking & Webhook Integration**
- ✅ Added comprehensive speed tracking for vanity claiming
- ✅ Enhanced webhook notifications with detailed timing information
- ✅ Implemented detection delay and total time measurements
- ✅ Added Discord timestamp formatting for real-time detection
- ✅ Improved webhook embeds with color coding and better formatting
- ✅ Successfully tested speed tracking with webhook notifications

## System Architecture

The application follows a modular architecture with the following key components:

### Core Structure
- **Entry Point**: `index.js` - Handles environment validation and application initialization
- **Monitor Module**: `lib/monitor.js` - WebSocket-based real-time monitoring of Discord events
- **Claimer Module**: `lib/claimer.js` - Handles vanity URL claiming with MFA support
- **MFA Handler**: `lib/mfa.js` - Manages Multi-Factor Authentication flows
- **Utilities**: `lib/utils.js` - Shared logging and webhook notification functions

### Technology Stack
- **Runtime**: Node.js (14+)
- **WebSocket**: `ws` library for Discord Gateway connection
- **HTTP Client**: `node-fetch` for REST API requests
- **Configuration**: `dotenv` for environment variable management
- **Networking**: Native TLS module for low-level Discord API requests

## Key Components

### 1. VanityMonitor Class
- Establishes WebSocket connection to Discord Gateway
- Listens for guild update events
- Maintains guild state tracking
- Handles connection lifecycle (heartbeat, reconnection)
- Triggers claiming attempts when vanity URLs are dropped

### 2. VanityClaimer Class
- Implements claiming logic with automatic MFA handling
- Uses both standard HTTP requests and raw TLS connections for performance
- Supports retry mechanisms for failed attempts
- Integrates with MFA authentication flow

### 3. MFA Authentication System
- Handles Discord's Multi-Factor Authentication requirements
- Supports password-based MFA and backup codes
- Manages MFA tickets and authentication tokens
- Provides secure claiming capabilities

### 4. Notification System
- Discord webhook integration for real-time alerts
- Console logging with timestamps
- Status notifications for successful/failed claims
- Error reporting and monitoring alerts

## Data Flow

1. **Initialization**: Application loads environment variables and validates configuration
2. **Connection**: WebSocket connects to Discord Gateway with bot token
3. **Monitoring**: Listens for GUILD_UPDATE events containing vanity URL changes
4. **Detection**: Identifies when vanity URLs are dropped (changed or removed)
5. **Claiming**: Attempts to claim dropped vanity URLs on target guilds
6. **Authentication**: Performs MFA authentication when required
7. **Notification**: Sends webhook notifications and logs results

### Event Flow
```
Discord Event → Monitor Detection → Claim Attempt → MFA Auth → Result Notification
```

## External Dependencies

### Required Environment Variables
- `LISTENER_TOKEN`: Discord bot token for monitoring guilds
- `CLAIMER_TOKEN`: Discord user token for claiming vanity URLs

### Optional Environment Variables
- `CLAIMER_PASSWORD`: MFA password or backup codes for authentication
- `WEBHOOK_URL`: Discord webhook URL for notifications
- `GUILD_IDS`: Comma-separated list of target guild IDs for claiming

### Third-Party Services
- **Discord Gateway API**: WebSocket connection for real-time events
- **Discord REST API**: HTTP endpoints for vanity URL operations
- **Discord Webhooks**: Notification delivery system

### NPM Dependencies
- `ws`: WebSocket client for Discord Gateway
- `node-fetch`: HTTP client for API requests
- `dotenv`: Environment variable management

## Deployment Strategy

### Environment Setup
- Node.js 14+ runtime required
- Environment variables configured via `.env` file
- Discord tokens and credentials securely stored

### Execution Model
- Single-process application with event-driven architecture
- Graceful shutdown handling (SIGINT)
- Automatic reconnection for WebSocket failures
- Built-in rate limiting compliance

### Error Handling
- Comprehensive try-catch blocks throughout
- Automatic retry mechanisms for failed operations
- Connection recovery and re-establishment
- Detailed error logging and notification

### Security Considerations
- Token validation and secure storage
- MFA authentication for sensitive operations
- Rate limiting compliance with Discord's API
- Secure TLS connections for all Discord API interactions

The application is designed to run continuously, monitoring Discord guilds 24/7 and automatically responding to vanity URL opportunities with minimal latency and maximum reliability.