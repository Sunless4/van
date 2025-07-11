const tls = require('tls');
const fetch = require('node-fetch');
const MFA = require('./mfa');
const { log, sendWebhook } = require('./utils');

class VanityClaimer {
  constructor() {
    this.token = process.env.CLAIMER_TOKEN;
    this.superProperties = 'eyJvcyI6IldpbmRvd3MiLCJicm93c2VyIjoiQ2hyb21lIiwiZGV2aWNlIjoiIiwic3lzdGVtX2xvY2FsZSI6ImVuLVVTIiwiYnJvd3Nlcl91c2VyX2FnZW50IjoiTW96aWxsYS81LjAgKFdpbmRvd3MgTlQgMTAuMDsgV2luNjQ7IHg2NCkgQXBwbGVXZWJLaXQvNTM3LjM2IChLSFRNTCwgbGlrZSBHZWNrbykgQ2hyb21lLzEyOC4wLjY2MTMuMTg2IFNhZmFyaS81MzcuMzYiLCJicm93c2VyX3ZlcnNpb24iOiIxMjguMC42NjEzLjE4NiIsIm9zX3ZlcnNpb24iOiIxMCIsInJlZmVycmVyIjoiIiwicmVmZXJyaW5nX2RvbWFpbiI6IiIsInJlZmVycmVyX2N1cnJlbnQiOiIiLCJyZWZlcnJpbmdfZG9tYWluX2N1cnJlbnQiOiIiLCJyZWxlYXNlX2NoYW5uZWwiOiJzdGFibGUiLCJjbGllbnRfYnVpbGRfbnVtYmVyIjoyOTk1MDIsImNsaWVudF9ldmVudF9zb3VyY2UiOm51bGx9';
    this.mfa = new MFA(this.token, this.superProperties);
  }

  // Raw TLS request to Discord
  tlsPatch(path, body) {
    return new Promise((resolve, reject) => {
      const data = JSON.stringify(body);
      const request = [
        `PATCH ${path} HTTP/1.1`,
        `Host: discord.com`,
        `Authorization: ${this.token}`,
        `Content-Type: application/json`,
        `Content-Length: ${Buffer.byteLength(data)}`,
        `User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36`,
        `X-Super-Properties: ${this.superProperties}`,
        '',
        data
      ].join('\r\n');

      const socket = tls.connect(443, 'discord.com', { 
        servername: 'discord.com',
        timeout: 1000
      }, () => {
        socket.write(request);
      });

      let response = '';
      socket.on('data', chunk => response += chunk);
      socket.on('end', () => resolve(response));
      socket.on('error', reject);
      socket.on('timeout', () => {
        socket.destroy();
        reject(new Error('TLS connection timeout'));
      });
    });
  }

  // Attempt to claim vanity with automatic MFA handling
  async attemptClaim(guildId, code, retries = 3, dropDetectionTime = null) {
    const startTime = Date.now();
    const detectionDelay = dropDetectionTime ? startTime - dropDetectionTime : 0;
    log(`🚀 Attempting to claim vanity: ${code} on guild ${guildId}${dropDetectionTime ? ` (detection delay: ${detectionDelay}ms)` : ''}`);

    const path = `/api/v9/guilds/${guildId}/vanity-url`;
    
    for (let i = 1; i <= retries; i++) {
      try {
        // Use HTTP primarily for faster response, TLS as backup
        let response;
        let usedMethod = 'HTTP';
        
        try {
          // Start with HTTP for speed
          const httpResponse = await fetch(`https://discord.com${path}`, {
            method: 'PATCH',
            headers: {
              'Authorization': this.token,
              'Content-Type': 'application/json',
              'X-Super-Properties': this.superProperties,
              'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) discord/0.0.330 Chrome/128.0.6613.186 Electron/32.2.7 Safari/537.36'
            },
            body: JSON.stringify({ code })
          });
          
          response = `HTTP/1.1 ${httpResponse.status} ${httpResponse.statusText}\r\n\r\n${JSON.stringify(await httpResponse.json())}`;
        } catch (httpError) {
          // Fallback to TLS only if HTTP fails
          log(`⚡ HTTP failed, trying TLS for attempt ${i}`);
          response = await this.tlsPatch(path, { code });
          usedMethod = 'TLS';
        }
        
        let statusLine = response.split('\r\n')[0];
        
        // Check if successful
        if (response.includes('200 OK') || response.includes('HTTP/1.1 200')) {
          const claimTime = Date.now() - startTime;
          const totalTime = dropDetectionTime ? Date.now() - dropDetectionTime : claimTime;
          log(`✅ Successfully claimed vanity ${code} on guild ${guildId} (attempt ${i}) in ${claimTime}ms via ${usedMethod}`);
          
          let speedInfo = `⚡ **Claim Speed:** ${claimTime}ms`;
          if (dropDetectionTime) {
            const detectionDelay = startTime - dropDetectionTime;
            speedInfo += `\n🔍 **Detection to Start:** ${detectionDelay}ms\n⏱️ **Total Time:** ${totalTime}ms`;
          }
          
          await sendWebhook('🎉 Vanity Claimed Successfully', 
            `**Code:** \`${code}\`\n**Guild:** ${guildId}\n**Attempt:** ${i}/${retries}\n**Method:** ${usedMethod}\n${speedInfo}`);
          return true;
        }
        
        // Check if MFA is required
        if (response.includes('60003') || response.includes('MFA') || response.includes('"mfa"') || response.includes('Two-factor')) {
          log(`🔐 MFA required for claiming ${code} on guild ${guildId}`);
          
          if (!process.env.CLAIMER_PASSWORD) {
            log(`❌ No MFA password available - cannot claim ${code}`);
            await sendWebhook('MFA Required', 
              `Cannot claim **${code}** on guild ${guildId} - MFA password needed`);
            return false;
          }

          try {
            // Check if we have a cached valid token first
            let mfaToken = this.mfa.getCachedToken();
            
            if (!mfaToken) {
              // Authenticate with MFA to get new token
              mfaToken = await this.mfa.authenticateForVanity(guildId, code);
            } else {
              log(`🔄 Using cached MFA token`);
            }
            
            // Attempt claim with MFA token
            const mfaResult = await this.mfa.setVanityWithMFA(guildId, code, mfaToken);
            
            if (mfaResult && (!mfaResult.code || mfaResult.code === code)) {
              const claimTime = Date.now() - startTime;
              const totalTime = dropDetectionTime ? Date.now() - dropDetectionTime : claimTime;
              log(`✅ Successfully claimed vanity ${code} with MFA on guild ${guildId} in ${claimTime}ms`);
              
              let speedInfo = `⚡ **Claim Speed:** ${claimTime}ms`;
              if (dropDetectionTime) {
                const detectionDelay = startTime - dropDetectionTime;
                speedInfo += `\n🔍 **Detection to Start:** ${detectionDelay}ms\n⏱️ **Total Time:** ${totalTime}ms`;
              }
              
              await sendWebhook('🎉 Vanity Claimed Successfully', 
                `**Code:** \`${code}\`\n**Guild:** ${guildId}\n**Attempt:** ${i}/${retries}\n**Method:** MFA Authentication\n${speedInfo}`);
              return true;
            } else {
              log(`❌ MFA claim failed for ${code}: ${JSON.stringify(mfaResult)}`);
              // Clear cache if MFA failed
              this.mfa.clearCache();
            }
          } catch (mfaError) {
            log(`❌ MFA authentication failed: ${mfaError.message}`);
            // Clear cache on error
            this.mfa.clearCache();
          }
        }
        
        // Handle other status codes
        if (response.includes('400 Bad Request')) {
          log(`❌ Bad request for ${code} - code may be invalid or already taken`);
          break;
        } else if (response.includes('401 Unauthorized')) {
          log(`❌ Unauthorized - check CLAIMER_TOKEN`);
          break;
        } else if (response.includes('403 Forbidden')) {
          log(`❌ Forbidden - insufficient permissions for guild ${guildId}`);
          break;
        } else if (response.includes('429 Too Many Requests')) {
          log(`⏱️ Rate limited - waiting before retry`);
          await new Promise(resolve => setTimeout(resolve, 2000));
        } else {
          log(`❌ Attempt ${i} failed: ${statusLine}`);
        }
        
      } catch (error) {
        log(`⚠️ Claim error (attempt ${i}): ${error.message}`);
      }
      
      // Wait before retry
      if (i < retries) {
        await new Promise(resolve => setTimeout(resolve, 750));
      }
    }
    
    log(`❌ Failed to claim ${code} on guild ${guildId} after ${retries} attempts`);
    await sendWebhook('Vanity Claim Failed', 
      `**Code:** ${code}\n**Guild:** ${guildId}\n**Attempts:** ${retries}`);
    return false;
  }

  // Claim vanity on multiple guilds
  async claimOnGuilds(code, guildIds, dropDetectionTime = null) {
    const promises = guildIds.map(guildId => this.attemptClaim(guildId, code, 3, dropDetectionTime));
    const results = await Promise.allSettled(promises);
    
    const successful = results.filter(result => result.status === 'fulfilled' && result.value === true).length;
    const total = results.length;
    
    const totalTime = dropDetectionTime ? Date.now() - dropDetectionTime : 0;
    log(`📊 Claim summary for ${code}: ${successful}/${total} successful${dropDetectionTime ? ` (total time: ${totalTime}ms)` : ''}`);
    return successful > 0;
  }
}

module.exports = VanityClaimer;
