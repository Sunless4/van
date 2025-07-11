const WebSocket = require('ws');
const VanityClaimer = require('./claimer');
const { log, sendWebhook } = require('./utils');

class VanityMonitor {
  constructor() {
    this.listenerToken = process.env.LISTENER_TOKEN;
    this.targetGuildIds = process.env.GUILD_IDS ? 
      process.env.GUILD_IDS.split(',').map(id => id.trim()) : [];
    this.claimer = new VanityClaimer();
    this.guildStates = new Map();
    this.allGuilds = [];
    this.isConnected = false;
    this.ws = null;
    this.heartbeatInterval = null;
    this.sequence = null;
    this.sessionId = null;
  }

  async start() {
    log('🔌 Starting Discord vanity monitor...');
    this.connect();
  }

  stop() {
    log('🛑 Stopping vanity monitor...');
    this.isConnected = false;
    
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  connect() {
    if (this.isConnected) {
      log('⚠️ Already connected, skipping duplicate connection attempt');
      return;
    }

    this.ws = new WebSocket('wss://gateway.discord.gg/?v=10&encoding=json');
    this.setupWebSocketHandlers();
  }

  setupWebSocketHandlers() {
    this.ws.on('open', () => {
      log('📡 Connected to Discord Gateway');
      this.isConnected = true;
      this.identify();
    });

    this.ws.on('message', (data) => {
      this.handleMessage(JSON.parse(data));
    });

    this.ws.on('close', (code, reason) => {
      log(`🔌 WebSocket closed: ${code} - ${reason}`);
      this.isConnected = false;
      this.cleanup();
      
      // Reconnect after delay
      setTimeout(() => {
        if (!this.isConnected) {
          log('🔄 Attempting to reconnect...');
          this.connect();
        }
      }, 5000);
    });

    this.ws.on('error', (error) => {
      log(`❌ WebSocket error: ${error.message}`);
    });
  }

  identify() {
    const payload = {
      op: 2,
      d: {
        token: this.listenerToken,
        intents: (1 << 0) | (1 << 5), // GUILDS + GUILD_UPDATES
        properties: {
          os: 'linux',
          browser: 'discord.js',
          device: 'discord.js'
        }
      }
    };

    if (this.sessionId && this.sequence) {
      // Resume instead of identify
      payload.op = 6;
      payload.d = {
        token: this.listenerToken,
        session_id: this.sessionId,
        seq: this.sequence
      };
      log('🔄 Resuming session...');
    }

    this.ws.send(JSON.stringify(payload));
  }

  async handleMessage(msg) {
    if (msg.s) {
      this.sequence = msg.s;
    }

    switch (msg.op) {
      case 10: // Hello
        this.setupHeartbeat(msg.d.heartbeat_interval);
        break;

      case 11: // Heartbeat ACK
        // log('💓 Heartbeat acknowledged');
        break;

      case 0: // Dispatch
        await this.handleDispatch(msg.t, msg.d);
        break;

      case 7: // Reconnect
        log('🔄 Discord requested reconnect');
        this.reconnect();
        break;

      case 9: // Invalid Session
        log('❌ Invalid session, reconnecting...');
        this.sessionId = null;
        this.sequence = null;
        setTimeout(() => this.reconnect(), 2000);
        break;

      default:
        // log(`📨 Unhandled opcode: ${msg.op}`);
        break;
    }
  }

  setupHeartbeat(interval) {
    log(`💓 Setting up heartbeat every ${interval}ms`);
    
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.heartbeatInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ op: 1, d: this.sequence }));
      }
    }, interval);
  }

  async handleDispatch(eventType, data) {
    switch (eventType) {
      case 'READY':
        this.sessionId = data.session_id;
        this.allGuilds = data.guilds;
        log(`✅ Ready! Monitoring ${data.guilds.length} guilds`);
        await this.initializeGuildStates();
        break;

      case 'GUILD_CREATE':
        this.allGuilds.push(data);
        await this.updateGuildState(data);
        log(`🏰 Guild joined: ${data.name} (${data.id})`);
        break;

      case 'GUILD_UPDATE':
        await this.handleGuildUpdate(data);
        break;

      case 'GUILD_DELETE':
        this.allGuilds = this.allGuilds.filter(g => g.id !== data.id);
        this.guildStates.delete(data.id);
        log(`👋 Guild left: ${data.id}`);
        break;
    }
  }

  async initializeGuildStates() {
    for (const guild of this.allGuilds) {
      await this.updateGuildState(guild);
    }
    log(`📊 Initialized ${this.guildStates.size} guild states`);
  }

  async updateGuildState(guild) {
    const oldState = this.guildStates.get(guild.id);
    this.guildStates.set(guild.id, {
      name: guild.name,
      vanityUrl: guild.vanity_url_code || null,
      lastUpdated: Date.now()
    });

    // Check for vanity changes if we had a previous state
    if (oldState) {
      await this.checkVanityChange(guild.id, oldState.vanityUrl, guild.vanity_url_code);
    }
  }

  async handleGuildUpdate(guild) {
    const oldState = this.guildStates.get(guild.id);
    
    if (oldState) {
      const oldVanity = oldState.vanityUrl;
      const newVanity = guild.vanity_url_code || null;
      
      await this.checkVanityChange(guild.id, oldVanity, newVanity);
    }
    
    await this.updateGuildState(guild);
  }

  async checkVanityChange(guildId, oldVanity, newVanity) {
    if (oldVanity === newVanity) {
      return; // No change
    }

    const detectionTime = Date.now();
    const guildName = this.guildStates.get(guildId)?.name || guildId;
    
    if (oldVanity && !newVanity) {
      // Vanity was dropped - immediate claiming attempt
      log(`🕳️ Vanity '${oldVanity}' dropped in guild ${guildName} (${guildId})`);
      // Start claiming immediately, send webhook in parallel
      const claimPromise = this.attemptClaimDroppedVanity(oldVanity, guildId, detectionTime);
      const webhookPromise = sendWebhook('Vanity Dropped', 
        `Guild **${guildName}** (${guildId}) dropped vanity: **${oldVanity}**\n🕐 **Detected at:** <t:${Math.floor(detectionTime/1000)}:T>`);
      await claimPromise; // Wait for claim, webhook can finish async
      
    } else if (!oldVanity && newVanity) {
      // New vanity was set
      log(`✨ New vanity '${newVanity}' set in guild ${guildName} (${guildId})`);
      await sendWebhook('New Vanity Set', 
        `Guild **${guildName}** (${guildId}) set new vanity: **${newVanity}**\n🕐 **Detected at:** <t:${Math.floor(detectionTime/1000)}:T>`);
      
    } else if (oldVanity && newVanity && oldVanity !== newVanity) {
      // Vanity was changed - immediate claiming attempt
      log(`🔄 Vanity changed from '${oldVanity}' to '${newVanity}' in guild ${guildName} (${guildId})`);
      // Start claiming immediately, send webhook in parallel
      const claimPromise = this.attemptClaimDroppedVanity(oldVanity, guildId, detectionTime);
      const webhookPromise = sendWebhook('Vanity Changed', 
        `Guild **${guildName}** (${guildId}) changed vanity from **${oldVanity}** to **${newVanity}**\n🕐 **Detected at:** <t:${Math.floor(detectionTime/1000)}:T>`);
      await claimPromise; // Wait for claim, webhook can finish async
    }
  }

  async attemptClaimDroppedVanity(vanityCode, sourceGuildId, dropDetectionTime) {
    // Determine which guilds to try claiming on
    let targetGuilds = [];
    
    if (this.targetGuildIds.length > 0) {
      // Use specified target guilds
      if (this.targetGuildIds.length === 1 && this.targetGuildIds[0] === sourceGuildId) {
        // Special case: if we only have one target guild and it's the same as source, allow reclaiming
        targetGuilds = this.targetGuildIds;
        log(`🔄 Reclaiming vanity on the same guild (${sourceGuildId}) as configured`);
      } else {
        // Normal case: exclude source guild
        targetGuilds = this.targetGuildIds.filter(id => id !== sourceGuildId);
      }
    } else {
      // Use all accessible guilds except the source
      targetGuilds = this.allGuilds
        .map(g => g.id)
        .filter(id => id !== sourceGuildId);
    }

    if (targetGuilds.length === 0) {
      log(`⚠️ No target guilds available for claiming ${vanityCode}`);
      return;
    }

    const claimStartTime = Date.now();
    const detectionSpeed = claimStartTime - dropDetectionTime;
    log(`🎯 Attempting to claim '${vanityCode}' on ${targetGuilds.length} guild(s) (detected in ${detectionSpeed}ms)`);
    
    // Try claiming on target guilds
    const success = await this.claimer.claimOnGuilds(vanityCode, targetGuilds, dropDetectionTime);
    
    if (!success) {
      const totalTime = Date.now() - dropDetectionTime;
      log(`😔 Failed to claim '${vanityCode}' on any target guild (total time: ${totalTime}ms)`);
    }
  }

  reconnect() {
    this.cleanup();
    setTimeout(() => {
      log('🔄 Reconnecting to Discord Gateway...');
      this.connect();
    }, 1000);
  }

  cleanup() {
    this.isConnected = false;
    
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws = null;
    }
  }
}

module.exports = VanityMonitor;
