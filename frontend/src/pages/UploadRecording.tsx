import { useRef, useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import {
  Typography,
  Paper,
  TextField,
  Button,
  Stack,
  Alert,
  LinearProgress,
  MenuItem,
  List,
  ListItem,
  ListItemText,
} from "@mui/material";
import {
  CATEGORIES,
  groupUploads,
  itemsFromFileList,
  uploadRecordings,
  type RecordingUploadResult,
  type UploadItem,
} from "../api";
import StatusPanel from "../components/StatusPanel";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

export default function UploadRecording() {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [category, setCategory] = useState("");
  const [car, setCar] = useState("");
  const [event, setEvent] = useState("");
  const [label, setLabel] = useState("");
  const [notes, setNotes] = useState("");
  const [progress, setProgress] = useState<{ loaded: number; total: number } | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RecordingUploadResult | null>(null);
  const [results, setResults] = useState<RecordingUploadResult[]>([]);
  const abortRef = useRef<(() => void) | null>(null);

  const totalBytes = items.reduce((sum, i) => sum + i.file.size, 0);

  function pick(files: FileList | null) {
    if (!files || files.length === 0) return;
    setItems(itemsFromFileList(files));
    setResult(null);
    setResults([]);
    setError(null);
  }

  async function handleUpload() {
    if (items.length === 0 || pending) return;
    setPending(true);
    setError(null);
    setResult(null);
    setResults([]);
    setProgress({ loaded: 0, total: totalBytes });
    const groups = groupUploads(items);
    const stored: RecordingUploadResult[] = [];
    let done = 0;
    try {
      for (const group of groups) {
        const groupBytes = group.reduce((sum, i) => sum + i.file.size, 0);
        // several CSVs become several recordings: keep a typed label unique by appending the file name
        const groupLabel = groups.length > 1 && label ? `${label} (${group[0].path})` : label;
        const { promise, abort } = uploadRecordings(
          group,
          { category: category as never, car, event, label: groupLabel, notes },
          (loaded) => setProgress({ loaded: done + Math.min(loaded, groupBytes), total: totalBytes }),
        );
        abortRef.current = abort;
        stored.push(await promise);
        done += groupBytes;
      }
      setResults(stored);
      setResult(stored[stored.length - 1]);
      setItems([]);
    } catch (err) {
      const note = stored.length > 0 ? ` (${stored.length} of ${groups.length} recordings were stored before this)` : "";
      setError((err instanceof Error ? err.message : String(err)) + note);
    } finally {
      abortRef.current = null;
      setPending(false);
      setProgress(null);
    }
  }

  const pct = progress && progress.total > 0 ? Math.min(100, (progress.loaded / progress.total) * 100) : 0;

  return (
    <>
      <Typography variant="h5" gutterBottom>
        Upload a recording
      </Typography>
      <Paper variant="outlined" sx={{ p: 3, maxWidth: 560 }}>
        <Stack spacing={2}>
          <Typography variant="body2" color="text.secondary">
            Upload any recording: a rosbag2 folder (<code>.db3</code> + <code>metadata.yaml</code>), a CSV
            export, or anything else. Files are stored as-is, even if they cannot be read. Keep this tab
            open until the upload finishes; an interrupted upload stores nothing. The recording is then read into
            EVIL's tables in the background (see the queue below).
          </Typography>

          <Stack direction="row" spacing={1}>
            <Button variant="outlined" component="label" disabled={pending}>
              Choose files
              <input type="file" hidden multiple onChange={(e) => pick(e.target.files)} />
            </Button>
            <Button variant="outlined" component="label" disabled={pending}>
              Choose folder
              <input
                type="file"
                hidden
                multiple
                // @ts-expect-error webkitdirectory is a non-standard but universally supported attribute
                webkitdirectory=""
                onChange={(e) => pick(e.target.files)}
              />
            </Button>
          </Stack>

          {items.length > 0 && (
            <>
              <Typography variant="body2">
                {items.length} file{items.length === 1 ? "" : "s"}, {formatBytes(totalBytes)}
              </Typography>
              {groupUploads(items).length > 1 && (
                <Alert severity="info">
                  This will be stored as {groupUploads(items).length} separate recordings (one per CSV), each
                  parsed into its own run.
                </Alert>
              )}
              <List dense disablePadding sx={{ maxHeight: 140, overflow: "auto" }}>
                {items.slice(0, 50).map((i) => (
                  <ListItem key={i.path} disableGutters sx={{ py: 0 }}>
                    <ListItemText primary={i.path} secondary={formatBytes(i.file.size)} />
                  </ListItem>
                ))}
                {items.length > 50 && <ListItem disableGutters>…and {items.length - 50} more</ListItem>}
              </List>
            </>
          )}

          <Stack direction="row" spacing={2}>
            <TextField
              select
              label="Category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              size="small"
              sx={{ minWidth: 150 }}
              disabled={pending}
            >
              <MenuItem value="">(none)</MenuItem>
              {CATEGORIES.map((c) => (
                <MenuItem key={c} value={c}>
                  {c}
                </MenuItem>
              ))}
            </TextField>
            <TextField label="Car" value={car} onChange={(e) => setCar(e.target.value)} size="small" disabled={pending} />
            <TextField label="Event" value={event} onChange={(e) => setEvent(e.target.value)} size="small" disabled={pending} />
          </Stack>
          <TextField label="Label" value={label} onChange={(e) => setLabel(e.target.value)} size="small" disabled={pending} />
          <TextField
            label="Notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            size="small"
            multiline
            minRows={2}
            disabled={pending}
          />

          {pending && progress && (
            <Stack spacing={0.5}>
              <LinearProgress variant="determinate" value={pct} />
              <Typography variant="caption" color="text.secondary">
                {formatBytes(progress.loaded)} of {formatBytes(progress.total)} ({pct.toFixed(0)}%)
                {pct >= 100 ? " — storing…" : ""}
              </Typography>
            </Stack>
          )}

          <Stack direction="row" spacing={1}>
            <Button variant="contained" onClick={handleUpload} disabled={pending || items.length === 0}>
              Upload
            </Button>
            {pending && (
              <Button color="inherit" onClick={() => abortRef.current?.()}>
                Cancel
              </Button>
            )}
          </Stack>

          {error && <Alert severity="error">{error}</Alert>}

          {result && (
            <Alert
              severity="success"
              action={
                <Button color="inherit" size="small" component={RouterLink} to="/recordings">
                  View recordings
                </Button>
              }
            >
              {results.length > 1
                ? `Stored ${results.filter((r) => !r.deduplicated).length} new recordings; ${results.filter((r) => r.deduplicated).length} already stored.`
                : result.deduplicated
                ? `Already stored (recording ${result.recording_id}); nothing new was added.`
                : `Stored ${result.files} file${result.files === 1 ? "" : "s"} (${formatBytes(result.total_bytes)}) as recording ${result.recording_id}. Status: ${result.parse_status}.`}
            </Alert>
          )}
        </Stack>
      </Paper>
      <StatusPanel />
    </>
  );
}
