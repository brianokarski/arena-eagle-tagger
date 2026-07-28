// Are.na v3 API client (v2 is being wound down — https://www.are.na/developers).
const API_BASE = "https://api.are.na/v3";

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

  // Paginate a v3 list endpoint via its meta envelope.
  async paginate(path, params = {}) {
    const all = [];
    for (let page = 1; ; page++) {
      const { data, meta } = await this.request(path, { ...params, per: 100, page });
      all.push(...(data ?? []));
      if (!meta?.has_more_pages) break;
    }
    return all;
  }

  async me() {
    return this.request("/me");
  }

  // All channels the user owns or collaborates on (includes private + group channels).
  async userChannels(userId) {
    return this.paginate(`/users/${userId}/contents`, { type: "Channel" });
  }

  // Channels the user follows.
  async followingChannels(userId) {
    return this.paginate(`/users/${userId}/following`, { type: "Channel" });
  }

  // Every block in a channel. `id` may be a numeric channel id or a slug.
  async channelContents(id) {
    return this.paginate(`/channels/${encodeURIComponent(id)}/contents`);
  }
}
