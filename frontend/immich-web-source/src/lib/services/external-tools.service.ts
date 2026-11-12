export interface ExternalToolSettings {
  videoEditorPath: string;
  imageEditorPath: string;
  frameEditorPath: string;
}

async function readResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => undefined)) as { error?: string } | undefined;
  if (!response.ok) {
    throw new Error(payload?.error || `Request failed (${response.status})`);
  }
  return payload as T;
}

export async function getExternalToolSettings(): Promise<ExternalToolSettings> {
  return readResponse(await fetch('/api/local/tools/settings'));
}

export async function saveExternalToolSettings(settings: ExternalToolSettings): Promise<ExternalToolSettings> {
  return readResponse(
    await fetch('/api/local/tools/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    }),
  );
}

export async function chooseExternalTool(title: string): Promise<{ cancelled: boolean; path?: string }> {
  return readResponse(
    await fetch('/api/local/tools/choose', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    }),
  );
}
