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

export type Category = "competition" | "testing" | "bench" | "sim" | "b_lot" | "other";
export const CATEGORIES: Category[] = ["competition", "testing", "bench", "sim", "b_lot", "other"];

export interface RecordingSummary {
  recording_id: string;
  run_id: string | null;
  rows_ingested: number | null;
  rows_duplicate: number | null;
  rows_rejected: number | null;
  label: string | null;
  notes: string | null;
  category: Category | null;
  category_method: "manual" | "auto" | null;
  location_id: number | null;
  location_method: string | null;
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

/** Splits a selection into recordings. Loose CSV files are each their own recording (the parser reads
 * only one CSV per recording, so a second would be stored but never parsed). Anything else, such as a
 * rosbag2 folder or a multi-part .db3 set, stays together as one recording. */
export function groupUploads(items: UploadItem[]): UploadItem[][] {
  const isCsv = (i: UploadItem) => i.path.toLowerCase().endsWith(".csv");
  const csvs = items.filter(isCsv);
  const rest = items.filter((i) => !isCsv(i));
  if (csvs.length <= 1) return [items];
  const groups = csvs.map((c) => [c]);
  if (rest.length > 0) groups.push(rest);
  return groups;
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

export interface NamedLocation {
  location_id: number;
  name: string;
  center_lat: number;
  center_lon: number;
  radius_m: number;
  default_category: Category | null;
}

export async function listLocations(): Promise<NamedLocation[]> {
  const response = await fetch(`${API_BASE_URL}/locations`);
  if (!response.ok) {
    throw new Error(`locations failed: ${response.status} ${await response.text()}`);
  }
  return response.json() as Promise<NamedLocation[]>;
}

/** Edit a stored recording's human-entered fields. A category or location you set is locked as manual;
 * send null to unlock it and let the GPS-based automatic label decide again. */
export interface RecordingEdit {
  label?: string | null;
  notes?: string | null;
  category?: Category | null;
  car?: string | null;
  event?: string | null;
  location_id?: number | null;
}

export async function updateRecording(recordingId: string, changes: RecordingEdit): Promise<RecordingSummary> {
  const response = await fetch(`${API_BASE_URL}/recordings/${encodeURIComponent(recordingId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(changes),
  });
  if (!response.ok) {
    let detail = await response.text();
    try {
      detail = JSON.parse(detail).detail ?? detail;
    } catch {
      /* keep raw text */
    }
    throw new Error(`update failed: ${response.status} ${detail}`);
  }
  return response.json() as Promise<RecordingSummary>;
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
