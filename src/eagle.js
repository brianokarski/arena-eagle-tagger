export class EagleClient {
  constructor(baseUrl = "http://localhost:41595") {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  async request(path, { method = "GET", body, params } = {}) {
    const url = new URL(this.baseUrl + path);
    for (const [key, value] of Object.entries(params ?? {})) {
      url.searchParams.set(key, String(value));
    }
    let res;
    try {
      res = await fetch(url, {
        method,
        headers: body ? { "Content-Type": "application/json" } : {},
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new Error(
        `Could not reach Eagle at ${this.baseUrl}. Start the Eagle app and re-run (its local API only runs while the app is open).`
      );
    }
    const data = await res.json();
    if (data.status !== "success") {
      throw new Error(`Eagle API error on ${path}: ${JSON.stringify(data)}`);
    }
    return data.data;
  }

  async ping() {
    return this.request("/api/application/info");
  }

  async listFolders() {
    return this.request("/api/folder/list");
  }

  async createFolder(folderName, parentId) {
    const body = { folderName };
    if (parentId) body.parent = parentId;
    return this.request("/api/folder/create", { method: "POST", body });
  }

  // items: [{url, name, website, tags, annotation}]
  async addFromURLs(items, folderId) {
    return this.request("/api/item/addFromURLs", {
      method: "POST",
      body: { items, folderId },
    });
  }

  async listItems(params) {
    return this.request("/api/item/list", { params });
  }

  async updateItem({ id, tags, annotation, url, star }) {
    const body = { id };
    if (tags !== undefined) body.tags = tags;
    if (annotation !== undefined) body.annotation = annotation;
    if (url !== undefined) body.url = url;
    if (star !== undefined) body.star = star;
    return this.request("/api/item/update", { method: "POST", body });
  }

  // Returns the local filesystem path of the item's thumbnail.
  async thumbnailPath(id) {
    return this.request("/api/item/thumbnail", { params: { id } });
  }
}
