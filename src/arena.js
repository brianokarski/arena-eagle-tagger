const API_BASE = "https://api.are.na/v2";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class ArenaClient {
  constructor(token) {
    this.token = token;
  }

  async request(path, params = {}) {
    const url = new URL(API_BASE + path);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, String(value));
    }
    for (let attempt = 0; ; attempt++) {
      let res;
      try {
        res = await fetch(url, {
          headers: this.token ? { Authorization: `Bearer ${this.token}` } : {},
        });
      } catch (err) {
        if (attempt < 3) {
          await sleep(1000 * 2 ** attempt);
          continue;
        }
        throw new Error(`Could not reach the Are.na API (${err.message}). Check your internet connection.`);
      }
      if (res.status === 401) {
        throw new Error(
          'Are.na rejected the token (401). Create a personal access token at https://dev.are.na/oauth/applications and put it in config.json as "arenaToken".'
        );
      }
      if ((res.status === 429 || res.status >= 500) && attempt < 3) {
        await sleep(1000 * 2 ** attempt);
        continue;
      }
      if (!res.ok) throw new Error(`Are.na API returned ${res.status} for ${path}`);
      return res.json();
    }
  }

  async me() {
    return this.request("/me");
  }

  // All channels belonging to a user, paginated.
  async userChannels(userId) {
    const channels = [];
    const per = 50;
    for (let page = 1; ; page++) {
      const data = await this.request(`/users/${userId}/channels`, { per, page });
      const batch = data.channels ?? [];
      channels.push(...batch);
      if (batch.length < per) break;
    }
    return channels;
  }

  // Every block in a channel, paginated. Channels are modest in size, so we
  // always walk the full list and let the caller skip already-synced blocks.
  async channelContents(slug) {
    const blocks = [];
    const per = 100;
    for (let page = 1; ; page++) {
      const data = await this.request(`/channels/${encodeURIComponent(slug)}/contents`, { per, page });
      const batch = data.contents ?? [];
      blocks.push(...batch);
      if (batch.length < per) break;
    }
    return blocks;
  }
}
