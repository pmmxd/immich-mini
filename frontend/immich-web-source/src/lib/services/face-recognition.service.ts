export interface FaceRecognitionSettings {
  detectionThreshold: number;
  clusterThreshold: number;
  queued: number;
  running: number;
  succeeded: number;
  failed: number;
}

export interface FaceReprocessResult {
  queued: number;
  removedFaces: number;
  removedPeople: number;
  anchors: number;
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

export async function getFaceRecognitionSettings(): Promise<FaceRecognitionSettings> {
  return readResponse(await fetch('/api/local/faces/settings'));
}

export async function saveFaceRecognitionSettings(
  settings: Pick<FaceRecognitionSettings, 'detectionThreshold' | 'clusterThreshold'>,
): Promise<FaceRecognitionSettings> {
  return readResponse(
    await fetch('/api/local/faces/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    }),
  );
}

export async function reprocessFaces(): Promise<FaceReprocessResult> {
  return readResponse(
    await fetch('/api/local/faces/reprocess', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    }),
  );
}
