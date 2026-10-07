const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8080";

export interface RunSummary {
  run_id: string;
  sample_count: number;
  start_ts: number;
  end_ts: number;
  distance_m: number | null;
  energy_wh: number | null;
  efficiency_mi_per_kwh: number | null;
}

export interface Turn {
  turn_id: number;
  run_id: string;
  turn_name: string;
  name: string;
  start_ts: number;
  end_ts: number;
  entry_speed: number | null;
  exit_speed: number | null;
  avg_speed: number | null;
  duration_s: number | null;
  distance_m: number | null;
  energy_wh: number | null;
  efficiency_mi_per_kwh: number | null;
}

export interface Lap {
  lap_id: number;
  run_id: string;
  lap_number: number;
  start_ts: number;
  end_ts: number;
  turn_count: number;
  avg_speed: number | null;
  duration_s: number | null;
  distance_m: number | null;
  energy_wh: number | null;
  efficiency_mi_per_kwh: number | null;
}

export interface Straight {
  straight_id: number;
  run_id: string;
  name: string;
  start_ts: number;
  end_ts: number;
  entry_speed: number | null;
  exit_speed: number | null;
  avg_speed: number | null;
  duration_s: number | null;
  distance_m: number | null;
  energy_wh: number | null;
  efficiency_mi_per_kwh: number | null;
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

/** Legacy single-file upload that parses straight into evil.db. Superseded by
 * uploadRecordings(); kept until parsing moves behind the catalog. */
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

export type Category = "competition" | "testing" | "bench" | "sim" | "other";
export const CATEGORIES: Category[] = ["competition", "testing", "bench", "sim", "other"];

export interface RecordingSummary {
  recording_id: string;
  run_id: string | null;
  rows_ingested: number | null;
  rows_duplicate: number | null;
  rows_rejected: number | null;
  label: string | null;
  notes: string | null;
  category: Category | null;
  car: string | null;
  event: string | null;
  container: string;
  original_name: string | null;
  uploaded_at: number;
  total_bytes: number | null;
  parse_status: "pending" | "running" | "parsed" | "skipped" | "failed";
  parse_error: string | null;
}

export interface RecordingUploadResult {
  recording_id: string;
  deduplicated: boolean;
  files: number;
  total_bytes: number;
  parse_status: string;
}

export interface RecordingMetadata {
  category?: Category | "";
  car?: string;
  event?: string;
  label?: string;
  notes?: string;
}

/** A file plus the path it should be stored under (folder uploads keep their
 * relative path; plain files use their own name). */
export interface UploadItem {
  file: File;
  path: string;
}

export function itemsFromFileList(files: FileList | File[]): UploadItem[] {
  return Array.from(files).map((file) => ({
    file,
    path: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name,
  }));
}

/** Uploads one recording (one or more files) and resolves only when evil has
 * stored and cataloged it. XMLHttpRequest rather than fetch for upload
 * progress. Aborting (or closing the tab) stores nothing. */
export function uploadRecordings(
  items: UploadItem[],
  metadata: RecordingMetadata,
  onProgress?: (loaded: number, total: number) => void,
): { promise: Promise<RecordingUploadResult>; abort: () => void } {
  const xhr = new XMLHttpRequest();
  const promise = new Promise<RecordingUploadResult>((resolve, reject) => {
    const form = new FormData();
    for (const [key, value] of Object.entries(metadata)) {
      if (value) form.append(key, value);
    }
    for (const { file, path } of items) form.append("files", file, path);

    xhr.open("POST", `${API_BASE_URL}/recordings`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded, e.total);
    };
    xhr.onload = () => {
      if (xhr.status === 200 || xhr.status === 201) {
        resolve(JSON.parse(xhr.responseText) as RecordingUploadResult);
      } else {
        let detail = xhr.responseText;
        try {
          detail = JSON.parse(xhr.responseText).detail ?? detail;
        } catch {
          /* keep raw text */
        }
        reject(new Error(`upload failed: ${xhr.status} ${detail}`));
      }
    };
    xhr.onerror = () => reject(new Error("upload failed: network error"));
    xhr.onabort = () => reject(new Error("upload cancelled"));
    xhr.send(form);
  });
  return { promise, abort: () => xhr.abort() };
}

export interface JobRow {
  job_id: number;
  recording_id: string;
  kind: "scan" | "parse" | "cache_build" | "repair";
  lane: "fast" | "deep";
  status: "pending" | "running" | "done" | "failed";
  attempts: number;
  max_attempts: number;
  progress: number | null;
  error: string | null;
  created_at: number;
  started_at: number | null;
  finished_at: number | null;
  name: string;
  size_bytes: number | null;
}

export interface SystemStatus {
  jobs: {
    counts: Record<"pending" | "running" | "done" | "failed", number>;
    oldest_pending_age_sec: number | null;
    queue: JobRow[];
  };
  system: {
    cpu_count: number | null;
    load_avg: (number | null)[];
    mem_total_bytes: number | null;
    mem_available_bytes: number | null;
    disk: { total_bytes: number | null; free_bytes: number | null };
    recordings_bytes: number;
  };
  time: number;
}

export async function getSystemStatus(): Promise<SystemStatus> {
  const response = await fetch(`${API_BASE_URL}/system/status`);
  if (!response.ok) {
    throw new Error(`status failed: ${response.status} ${await response.text()}`);
  }
  return response.json() as Promise<SystemStatus>;
}

export async function reparseRecording(recordingId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/recordings/${encodeURIComponent(recordingId)}/reparse`, {
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(`reparse failed: ${response.status} ${await response.text()}`);
  }
}

export async function listRecordings(params: { category?: string; limit?: number } = {}): Promise<RecordingSummary[]> {
  const query = new URLSearchParams();
  if (params.category) query.set("category", params.category);
  if (params.limit) query.set("limit", String(params.limit));
  const response = await fetch(`${API_BASE_URL}/recordings?${query}`);
  if (!response.ok) {
    throw new Error(`recordings failed: ${response.status} ${await response.text()}`);
  }
  return response.json() as Promise<RecordingSummary[]>;
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
