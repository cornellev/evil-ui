const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8080";

/** One line of /ask/stream (Tern's progress, passed through by evil-ui's backend). */
export type TernEvent =
  | { type: "queued"; position: number }
  | { type: "started"; queue_wait_ms?: number }
  | { type: "thinking"; turn: number }
  | { type: "tool"; name: string; args?: Record<string, unknown> }
  | { type: "tool_done"; name: string; ok: boolean; summary?: string }
  | { type: "answer"; text: string; outcome?: string; trace_id?: string | null }
  | { type: "error"; status?: number; detail: string };

/** Ask Tern; onEvent gets every progress event as it arrives. Never throws: a failed
 * request becomes one error event. */
export async function askTern(question: string, onEvent: (event: TernEvent) => void): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/ask/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
    });
  } catch {
    onEvent({ type: "error", detail: "Can't reach the evil-ui backend" });
    return;
  }
  if (!response.ok || !response.body) {
    onEvent({ type: "error", status: response.status, detail: `Request failed (HTTP ${response.status})` });
    return;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const emit = (line: string) => {
    if (!line.trim()) return;
    try {
      const event = JSON.parse(line) as TernEvent;
      if (event && typeof event === "object" && "type" in event) onEvent(event);
    } catch {
      /* partial or foreign line */
    }
  };
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl = buffer.indexOf("\n");
      while (nl !== -1) {
        emit(buffer.slice(0, nl));
        buffer = buffer.slice(nl + 1);
        nl = buffer.indexOf("\n");
      }
    }
    emit(buffer);
  } catch {
    onEvent({ type: "error", detail: "Lost the connection to Tern" });
  }
}

const STEP_LABELS: Record<string, string> = {
  list_runs: "Finding runs",
  list_laps: "Reading lap times",
  compare_laps: "Comparing laps",
  list_turns: "Reading turns",
  get_turn: "Reading a turn",
  compare_turn_instances: "Comparing turns",
  list_straights: "Reading straights",
  get_straight: "Reading a straight",
  list_track_segments: "Reading the track map",
  get_live_status: "Checking the live feed",
  get_live_window: "Reading recent telemetry",
  list_recordings: "Looking through recordings",
  describe_recording: "Reading a recording",
  read_only_sql: "Querying the data",
  find_nas_files: "Searching the NAS",
};

export function stepLabel(tool: string): string {
  return STEP_LABELS[tool] ?? tool.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

export function stepHint(args: Record<string, unknown> | undefined): string {
  if (!args) return "";
  const parts: string[] = [];
  if (typeof args.lap_number === "number") parts.push(`lap ${args.lap_number}`);
  if (Array.isArray(args.lap_numbers)) parts.push(`laps ${args.lap_numbers.join(", ")}`);
  if (typeof args.turn_number === "number") parts.push(`turn ${args.turn_number}`);
  if (typeof args.run_id === "string") parts.push(args.run_id);
  return parts.join(" · ");
}
