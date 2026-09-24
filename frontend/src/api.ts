const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8080";

export interface RunSummary {
  run_id: string;
  sample_count: number;
  start_ts: number;
  end_ts: number;
}

export interface Turn {
  turn_id: number;
  run_id: string;
  turn_name: string;
  start_ts: number;
  end_ts: number;
  entry_speed: number | null;
  exit_speed: number | null;
}

export interface Lap {
  lap_id: number;
  run_id: string;
  lap_number: number;
  start_ts: number;
  end_ts: number;
  turn_count: number;
  energy_wh: number | null;
  avg_speed: number | null;
}

export interface Straight {
  straight_id: number;
  run_id: string;
  start_ts: number;
  end_ts: number;
  entry_speed: number | null;
  exit_speed: number | null;
  avg_speed: number | null;
  energy_wh: number | null;
}

interface TurnsPage {
  total: number;
  turns: Turn[];
}
interface LapsPage {
  total: number;
  laps: Lap[];
}
interface StraightsPage {
  total: number;
  straights: Straight[];
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`);
  if (!response.ok) {
    throw new Error(`${path} failed: ${response.status} ${await response.text()}`);
  }
  return response.json() as Promise<T>;
}

export function listRuns(): Promise<RunSummary[]> {
  return getJson<RunSummary[]>("/runs");
}

export function listTurns(runId: string, limit = 50, offset = 0): Promise<TurnsPage> {
  return getJson<TurnsPage>(`/runs/${encodeURIComponent(runId)}/turns?limit=${limit}&offset=${offset}`);
}

export function listLaps(runId: string, limit = 50, offset = 0): Promise<LapsPage> {
  return getJson<LapsPage>(`/runs/${encodeURIComponent(runId)}/laps?limit=${limit}&offset=${offset}`);
}

export function listStraights(runId: string, limit = 50, offset = 0): Promise<StraightsPage> {
  return getJson<StraightsPage>(`/runs/${encodeURIComponent(runId)}/straights?limit=${limit}&offset=${offset}`);
}

export interface UploadResult {
  rows_ingested: number;
  classifiers_advanced_to_seq?: Record<string, number>;
}

export async function uploadRecording(runId: string, file: File): Promise<UploadResult> {
  const formData = new FormData();
  formData.append("run_id", runId);
  formData.append("file", file);

  const response = await fetch(`${API_BASE_URL}/upload`, {
    method: "POST",
    body: formData,
  });
  if (!response.ok) {
    throw new Error(`upload failed: ${response.status} ${await response.text()}`);
  }
  return response.json() as Promise<UploadResult>;
}

export async function askQuestion(question: string): Promise<string> {
  const response = await fetch(`${API_BASE_URL}/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
  });
  if (!response.ok) {
    throw new Error(`ask failed: ${response.status} ${await response.text()}`);
  }
  const data = (await response.json()) as { answer: string };
  return data.answer;
}
