import { render } from '@testing-library/svelte';
import AlbumCover from '$lib/components/album-page/AlbumCover.svelte';
import { getAssetMediaUrl } from '$lib/utils';
import { albumFactory } from '@test-data/factories/album-factory';
import { AssetMediaSize } from '@immich/sdk';

vi.mock('$lib/utils');

describe('AlbumCover component', () => {
  it('renders an image when the album has a thumbnail', () => {
    vi.mocked(getAssetMediaUrl).mockReturnValue('/asdf');
    const component = render(AlbumCover, {
      album: albumFactory.build({
        albumName: 'someName',
        albumThumbnailAssetId: '123',
      }),
      preload: true,
      class: 'text',
    });
    const img = component.getByTestId('album-image') as HTMLImageElement;
    expect(img.alt).toBe('someName');
    expect(img.getAttribute('loading')).toBe('eager');
    expect(img.className).toBe('size-full rounded-xl object-cover aspect-square text');
    expect(img.getAttribute('src')).toBe('/asdf');
    expect(getAssetMediaUrl).toHaveBeenCalledWith({ id: '123', size: AssetMediaSize.Original });
  });

  it('renders an image when the album has no thumbnail', () => {
    const component = render(AlbumCover, {
      album: albumFactory.build({
        albumName: '',
        albumThumbnailAssetId: null,
      }),
      preload: true,
      class: 'asdf',
    });
    const img = component.getByTestId('album-image') as HTMLImageElement;
    expect(img.alt).toBe('unnamed_album');
    expect(img.getAttribute('loading')).toBe('eager');
    expect(img.className).toBe('size-full rounded-xl object-cover aspect-square asdf');
    expect(img.getAttribute('src')).toStrictEqual(expect.any(String));
  });

  it('renders a video cover from the original file', () => {
    vi.mocked(getAssetMediaUrl).mockReturnValue('/video-original');
    const album = {
      ...albumFactory.build({
        albumName: 'video album',
        albumThumbnailAssetId: '456',
      }),
      albumThumbnailAssetType: 'video' as const,
    };

    const component = render(AlbumCover, { album, preload: true });
    const video = component.getByTestId('album-video') as HTMLVideoElement;

    expect(video.getAttribute('src')).toBe('/video-original');
    expect(video.getAttribute('preload')).toBe('metadata');
    expect(getAssetMediaUrl).toHaveBeenCalledWith({ id: '456', size: AssetMediaSize.Original });
  });
});
