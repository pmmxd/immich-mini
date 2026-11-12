import type { MapMarkerResponseDto } from '@immich/sdk';
import { browser } from '$app/environment';

const DATABASE_NAME = 'immich-map-marker-cache';
const STORE_NAME = 'markers';
const DATABASE_VERSION = 1;

export const MAP_MARKER_CACHE_TTL = 24 * 60 * 60 * 1000;

export type CachedMapMarkers = {
  cachedAt: number;
  markers: MapMarkerResponseDto[];
};

let databasePromise: Promise<IDBDatabase> | undefined;

const requestResult = <T>(request: IDBRequest<T>): Promise<T> => {
  const { promise, resolve, reject } = Promise.withResolvers<T>();
  request.addEventListener('success', () => resolve(request.result));
  request.addEventListener('error', () => reject(request.error));
  return promise;
};

const openDatabase = () => {
  if (!databasePromise) {
    const { promise, resolve, reject } = Promise.withResolvers<IDBDatabase>();
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
    request.addEventListener('success', () => resolve(request.result));
    request.addEventListener('error', () => reject(request.error));

    databasePromise = promise.catch((error) => {
      databasePromise = undefined;
      throw error;
    });
  }

  return databasePromise;
};

export const createMapMarkerCacheKey = (identity: string, scope: Record<string, unknown>) =>
  `map-markers:v2:${identity}:${JSON.stringify(scope)}`;

export const isMapMarkerCacheFresh = (cachedAt: number, now = Date.now()) => {
  const age = now - cachedAt;
  return age >= 0 && age < MAP_MARKER_CACHE_TTL;
};

const supportsMapMarkerCache = () => browser && !!globalThis.indexedDB && typeof Promise.withResolvers === 'function';

export const getCachedMapMarkers = async (key: string): Promise<CachedMapMarkers | undefined> => {
  if (!supportsMapMarkerCache()) {
    return;
  }

  try {
    const database = await openDatabase();
    const transaction = database.transaction(STORE_NAME, 'readonly');
    const entry = await requestResult(transaction.objectStore(STORE_NAME).get(key));
    return entry && typeof entry.cachedAt === 'number' && Array.isArray(entry.markers) ? entry : undefined;
  } catch {
    return;
  }
};

export const setCachedMapMarkers = async (key: string, markers: MapMarkerResponseDto[]) => {
  if (!supportsMapMarkerCache()) {
    return;
  }

  try {
    const database = await openDatabase();
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    await requestResult(transaction.objectStore(STORE_NAME).put({ cachedAt: Date.now(), markers }, key));
  } catch {
    // Cache failures must not block the map from loading.
  }
};
