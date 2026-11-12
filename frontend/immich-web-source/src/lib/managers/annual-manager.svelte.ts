import { addAssetsToAlbum, createAlbum, getAllAlbums, type AlbumResponseDto } from '@immich/sdk';
import { authManager } from '$lib/managers/auth-manager.svelte';

const annualPrefix = '年度精选 ';

class AnnualManager {
  years = $state<Array<{ year: number; album: AlbumResponseDto }>>([]);
  loaded = $state(false);

  async load() {
    const albums = await getAllAlbums({});
    this.years = albums
      .filter(
        (album) => album.albumUsers[0]?.user.id === authManager.user.id && album.albumName.startsWith(annualPrefix),
      )
      .map((album) => ({ year: Number(album.albumName.slice(annualPrefix.length)), album }))
      .filter(({ year }) => Number.isSafeInteger(year))
      .sort((a, b) => b.year - a.year);
    this.loaded = true;
  }

  async addAssets(year: number, assetIds: string[]) {
    if (!this.loaded) {
      await this.load();
    }
    const current = this.years.find((item) => item.year === year);
    const album =
      current?.album ??
      (await createAlbum({
        createAlbumDto: { albumName: `${annualPrefix}${year}` },
      }));
    await addAssetsToAlbum({ id: album.id, bulkIdsDto: { ids: assetIds } });
    await this.load();
  }
}

export const annualManager = new AnnualManager();
