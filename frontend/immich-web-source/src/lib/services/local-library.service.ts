export interface LocalLibrary {
  id: number;
  path: string;
  createdAt: string;
  assetCount: number;
}

export interface LibraryAutomationSettings {
  watchEnabled: boolean;
  scanEnabled: boolean;
  scanIntervalMinutes: number;
}

async function readResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => undefined)) as
    | { error?: string }
    | undefined;
  if (!response.ok) {
    throw new Error(payload?.error || `Request failed (${response.status})`);
  }
  return payload as T;
}

export async function getLocalLibraries(): Promise<LocalLibrary[]> {
  return readResponse<LocalLibrary[]>(await fetch('/api/local/libraries'));
}

export async function addLocalLibrary(path: string): Promise<{
  library: LocalLibrary;
  job: { id: number; status: string };
}> {
  return readResponse(
    await fetch('/api/local/libraries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    }),
  );
}

export async function getLibraryAutomationSettings(): Promise<LibraryAutomationSettings> {
  return readResponse<LibraryAutomationSettings>(
    await fetch('/api/local/libraries/settings'),
  );
}

export async function saveLibraryAutomationSettings(
  settings: LibraryAutomationSettings,
): Promise<LibraryAutomationSettings> {
  return readResponse(
    await fetch('/api/local/libraries/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    }),
  );
}

export async function scanLocalLibrary(id: number): Promise<{ job: { id: number; status: string } }> {
  return readResponse(
    await fetch(`/api/local/libraries/${id}/scan`, { method: 'POST' }),
  );
}

export async function removeLocalLibrary(id: number): Promise<{ removedAssetCount: number }> {
  return readResponse(
    await fetch(`/api/local/libraries/${id}`, { method: 'DELETE' }),
  );
}
