const fetch = require('node-fetch');
const { log } = require('./utils');

class MFA {
  constructor(token, superProperties) {
    this.token = token;
    this.superProperties = superProperties || 'eyJvcyI6IldpbmRvd3MiLCJicm93c2VyIjoiQ2hyb21lIiwiZGV2aWNlIjoiIiwic3lzdGVtX2xvY2FsZSI6ImVuLVVTIiwiYnJvd3Nlcl91c2VyX2FnZW50IjoiTW96aWxsYS81LjAgKFdpbmRvd3MgTlQgMTAuMDsgV2luNjQ7IHg2NCkgQXBwbGVXZWJLaXQvNTM3LjM2IChLSFRNTCwgbGlrZSBHZWNrbykgQ2hyb21lLzEyOC4wLjY2MTMuMTg2IFNhZmFyaS81MzcuMzYiLCJicm93c2VyX3ZlcnNpb24iOiIxMjguMC42NjEzLjE4NiIsIm9zX3ZlcnNpb24iOiIxMCIsInJlZmVycmVyIjoiIiwicmVmZXJyaW5nX2RvbWFpbiI6IiIsInJlZmVycmVyX2N1cnJlbnQiOiIiLCJyZWZlcnJpbmdfZG9tYWluX2N1cnJlbnQiOiIiLCJyZWxlYXNlX2NoYW5uZWwiOiJzdGFibGUiLCJjbGllbnRfYnVpbGRfbnVtYmVyIjoyOTk1MDIsImNsaWVudF9ldmVudF9zb3VyY2UiOm51bGx9';
    this.password = process.env.CLAIMER_PASSWORD;
    this.mfaAuth = null;
    this.cachedTicket = null;
    this.cachedToken = null;
    this.tokenExpiry = null;
  }

  async getMFATicket(guildId, vanityCode) {
    try {
      log(`🔐 Requesting MFA ticket for vanity ${vanityCode} on guild ${guildId}`);
      
      const response = await fetch(`https://discord.com/api/v9/guilds/${guildId}/vanity-url`, {
        method: 'PATCH',
        headers: {
          'Authorization': this.token,
          'Content-Type': 'application/json',
          'X-Super-Properties': this.superProperties,
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) discord/0.0.330 Chrome/128.0.6613.186 Electron/32.2.7 Safari/537.36'
        },
        body: JSON.stringify({ code: vanityCode })
      });

      const data = await response.json();
      log(`🔍 MFA ticket response: ${JSON.stringify(data)}`);
      
      if (data.mfa && data.mfa.ticket) {
        log(`✅ MFA ticket obtained: ${data.mfa.ticket.substring(0, 20)}...`);
        this.cachedTicket = data.mfa.ticket;
        return data.mfa.ticket;
      }
      
      throw new Error(`No MFA ticket in response: ${JSON.stringify(data)}`);
    } catch (error) {
      log(`❌ Failed to get MFA ticket: ${error.message}`);
      throw error;
    }
  }

  async getVanityToken(ticket) {
    if (!this.password) {
      throw new Error('No MFA password available');
    }

    try {
      log(`🔑 Authenticating MFA with ticket: ${ticket.substring(0, 20)}...`);
      
      const response = await fetch('https://discord.com/api/v9/mfa/finish', {
        method: 'POST',
        headers: {
          'Authorization': this.token,
          'Content-Type': 'application/json',
          'X-Super-Properties': this.superProperties,
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) discord/0.0.330 Chrome/128.0.6613.186 Electron/32.2.7 Safari/537.36'
        },
        body: JSON.stringify({
          data: this.password,
          mfa_type: 'password',
          ticket: ticket
        })
      });

      const data = await response.json();
      log(`🔍 MFA token response: ${JSON.stringify(data)}`);
      
      if (data.token) {
        log(`✅ MFA token obtained: ${data.token.substring(0, 20)}...`);
        this.mfaAuth = data.token;
        this.cachedToken = data.token;
        this.tokenExpiry = Date.now() + (10 * 60 * 1000); // Token valid for 10 minutes
        return data.token;
      }
      
      throw new Error(`No MFA token in response: ${JSON.stringify(data)}`);
    } catch (error) {
      log(`❌ Failed to get MFA token: ${error.message}`);
      throw error;
    }
  }

  async authenticateForVanity(guildId, vanityCode) {
    try {
      log(`🔐 Starting MFA authentication for vanity ${vanityCode} on guild ${guildId}`);
      
      const ticket = await this.getMFATicket(guildId, vanityCode);
      const token = await this.getVanityToken(ticket);
      
      return token;
    } catch (error) {
      log(`❌ MFA authentication failed: ${error.message}`);
      throw error;
    }
  }

  async setVanityWithMFA(guildId, vanityCode, mfaToken) {
    try {
      log(`🚀 Setting vanity ${vanityCode} on guild ${guildId} with MFA token`);
      
      const response = await fetch(`https://discord.com/api/v9/guilds/${guildId}/vanity-url`, {
        method: 'PATCH',
        headers: {
          'Authorization': this.token,
          'Content-Type': 'application/json',
          'X-Super-Properties': this.superProperties,
          'X-Discord-MFA-Authorization': mfaToken,
          'Cookie': `__Secure-recent_mfa=${mfaToken};`,
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) discord/0.0.330 Chrome/128.0.6613.186 Electron/32.2.7 Safari/537.36'
        },
        body: JSON.stringify({ code: vanityCode })
      });

      const data = await response.json();
      log(`🔍 Set vanity response: ${response.status} - ${JSON.stringify(data)}`);
      
      if (response.ok) {
        log(`✅ Successfully set vanity ${vanityCode} with MFA`);
      }
      
      return data;
    } catch (error) {
      log(`❌ Failed to set vanity with MFA: ${error.message}`);
      throw error;
    }
  }

  getMFAAuth() {
    return this.mfaAuth;
  }

  // Check if cached token is still valid
  isTokenValid() {
    return this.cachedToken && this.tokenExpiry && Date.now() < this.tokenExpiry;
  }

  // Get cached token if valid, otherwise return null
  getCachedToken() {
    return this.isTokenValid() ? this.cachedToken : null;
  }

  // Clear cached data
  clearCache() {
    this.cachedTicket = null;
    this.cachedToken = null;
    this.tokenExpiry = null;
    this.mfaAuth = null;
  }
}

module.exports = MFA;
