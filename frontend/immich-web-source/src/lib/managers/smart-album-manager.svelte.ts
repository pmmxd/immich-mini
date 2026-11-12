import { addAssetsToAlbum, createAlbum, searchAssets } from '@immich/sdk';
import { browser } from '$app/environment';
import { buildMediaSearchDto, parseMediaFilters } from '$lib/utils/media-filters';
import { parseMediaWorkspace } from '$lib/utils/media-workspace';

export interface SmartAlbum {
  id: string;
  albumId: string;
  name: string;
  query: string;
  updatedAt: string;
}

const storageKey = 'media-workspace-smart-albums';

class SmartAlbumManager {
  albums = $state<SmartAlbum[]>([]);
  loaded = $state(false);

  load() {
    if (!browser) {
      return;
    }
    try {
      this.albums = JSON.parse(localStorage.getItem(storageKey) ?? '[]') as SmartAlbum[];
    } catch {
      this.albums = [];
    }
    this.loaded = true;
  }

  save() {
    if (browser) {
      localStorage.setItem(storageKey, JSON.stringify(this.albums));
    }
  }

  async create(name: string, query: string) {
    const album = await createAlbum({ createAlbumDto: { albumName: name } });
    const smartAlbum: SmartAlbum = {
      id: crypto.randomUUID(),
      albumId: album.id,
      name,
      query,
      updatedAt: new Date().toISOString(),
    };
    this.albums = [smartAlbum, ...this.albums];
    this.save();
    await this.sync(smartAlbum);
    return smartAlbum;
  }

  async sync(smartAlbum: SmartAlbum) {
    const searchParams = new URLSearchParams(smartAlbum.query);
    const workspace = parseMediaWorkspace(searchParams);
    const filter = parseMediaFilters(searchParams);
    const ids: string[] = [];
    let cursor: string | undefined;

    do {
      const response = await searchAssets({
        metadataSearchDto: buildMediaSearchDto(filter, workspace.mediaType, cursor, 1000),
      });
      ids.push(...response.assets.items.map((asset) => asset.id));
      cursor = response.assets.nextCursor ?? undefined;
    } while (cursor);

    for (let index = 0; index < ids.length; index += 500) {
      await addAssetsToAlbum({
        id: smartAlbum.albumId,
        bulkIdsDto: { ids: ids.slice(index, index + 500) },
      });
    }

    this.albums = this.albums.map((album) =>
      album.id === smartAlbum.id ? { ...album, updatedAt: new Date().toISOString() } : album,
    );
    this.save();
  }
}

export const smartAlbumManager = new SmartAlbumManager();
