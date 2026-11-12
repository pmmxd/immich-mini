<script lang="ts">
  import { cleanClass } from '$lib';
  import BrokenAsset from '$lib/components/assets/BrokenAsset.svelte';
  import { onDestroy } from 'svelte';

  interface Props {
    alt?: string;
    preload?: boolean;
    src: string;
    class?: string;
    kind?: 'image' | 'video';
  }

  let { alt, preload = false, src, class: className, kind = 'image' }: Props = $props();

  let isBroken = $state(false);
  let container = $state<HTMLDivElement>();
  let inView = $state(preload);
  let image = $state<HTMLImageElement>();
  let video = $state<HTMLVideoElement>();
  const TRANSPARENT_PIXEL = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';

  $effect(() => {
    if (!container || preload) {
      inView = true;
      return;
    }
    if (!('IntersectionObserver' in window)) {
      inView = true;
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        inView = Boolean(entry?.isIntersecting);
      },
      { rootMargin: '300px' },
    );
    observer.observe(container);
    return () => observer.disconnect();
  });

  $effect(() => {
    if (!inView && video) {
      video.pause();
      video.removeAttribute('src');
      video.load();
    }
  });

  const showFirstFrame = () => {
    if (video && video.duration > 0) {
      video.currentTime = Math.min(0.1, video.duration / 2);
    }
  };

  onDestroy(() => {
    if (video) {
      video.pause();
      video.removeAttribute('src');
      video.load();
    }
    if (image) {
      image.removeAttribute('srcset');
      image.src = TRANSPARENT_PIXEL;
    }
  });
</script>

<div bind:this={container} class="size-full">
  {#if isBroken}
    <BrokenAsset hideMessage class="aspect-square rounded-xl" />
  {:else if kind === 'video'}
    <video
      bind:this={video}
      class={cleanClass('size-full rounded-xl object-cover aspect-square', className)}
      data-testid="album-video"
      draggable="false"
      muted
      playsinline
      preload="metadata"
      src={inView ? src : undefined}
      onloadedmetadata={showFirstFrame}
      onerror={() => (isBroken = true)}
    ></video>
  {:else}
    <img
      bind:this={image}
      {alt}
      onerror={() => (isBroken = true)}
      class={cleanClass('size-full rounded-xl object-cover aspect-square', className)}
      data-testid="album-image"
      decoding="async"
      draggable="false"
      loading={preload ? 'eager' : 'lazy'}
      src={inView ? src : TRANSPARENT_PIXEL}
    />
  {/if}
</div>
