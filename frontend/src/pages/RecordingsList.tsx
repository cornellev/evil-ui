import { useEffect, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Typography,
  CircularProgress,
  Alert,
  Chip,
  Button,
  Tooltip,
} from "@mui/material";
import { Link as RouterLink } from "react-router-dom";
import { listLocations, listRecordings, reparseRecording, type NamedLocation, type RecordingSummary } from "../api";
import EditRecordingDialog from "../components/EditRecordingDialog";

function formatBytes(n: number | null): string {
  if (n === null) return "";
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

const STATUS_COLOR: Record<RecordingSummary["parse_status"], "default" | "success" | "warning" | "error" | "info"> = {
  pending: "default",
  running: "info",
  parsed: "success",
  skipped: "warning",
  failed: "error",
};

export default function RecordingsList() {
  const [recordings, setRecordings] = useState<RecordingSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [locations, setLocations] = useState<NamedLocation[]>([]);
  const [editing, setEditing] = useState<RecordingSummary | null>(null);

  useEffect(() => {
    listLocations().then(setLocations).catch(() => setLocations([]));
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      listRecordings({ limit: 200 })
        .then((rows) => !cancelled && setRecordings(rows))
        .catch((err) => !cancelled && setError(err instanceof Error ? err.message : String(err)));
    load();
    const timer = setInterval(load, 5000); // statuses move as the worker progresses
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  async function handleReparse(id: string) {
    try {
      await reparseRecording(id);
      setRecordings(await listRecordings({ limit: 200 }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  if (error) return <Alert severity="error">{error}</Alert>;
  if (recordings === null) return <CircularProgress />;

  return (
    <>
      <Typography variant="h5" gutterBottom>
        Recordings
      </Typography>
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Uploaded</TableCell>
              <TableCell>Name</TableCell>
              <TableCell>Category</TableCell>
              <TableCell>Location</TableCell>
              <TableCell>Car</TableCell>
              <TableCell>Format</TableCell>
              <TableCell align="right">Size</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Run</TableCell>
              <TableCell align="right">Rows</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {recordings.map((r) => (
              <TableRow key={r.recording_id}>
                <TableCell>{new Date(r.uploaded_at * 1000).toLocaleString()}</TableCell>
                <TableCell>{r.label ?? r.original_name ?? r.recording_id}</TableCell>
                <TableCell>
                  {r.category ?? ""}
                  {r.category && r.category_method === "auto" && (
                    <Chip size="small" variant="outlined" label="auto" sx={{ ml: 0.5 }} />
                  )}
                </TableCell>
                <TableCell>{locations.find((l) => l.location_id === r.location_id)?.name ?? ""}</TableCell>
                <TableCell>{r.car ?? ""}</TableCell>
                <TableCell>{r.container}</TableCell>
                <TableCell align="right">{formatBytes(r.total_bytes)}</TableCell>
                <TableCell>
                  <Tooltip title={r.parse_error ?? ""} disableHoverListener={!r.parse_error}>
                    <Chip size="small" label={r.parse_status} color={STATUS_COLOR[r.parse_status]} />
                  </Tooltip>
                </TableCell>
                <TableCell>
                  {r.run_id && r.parse_status === "parsed" ? (
                    <RouterLink to={`/runs/${encodeURIComponent(r.run_id)}`}>{r.run_id}</RouterLink>
                  ) : (
                    ""
                  )}
                </TableCell>
                <TableCell align="right">
                  {r.rows_ingested !== null ? `${r.rows_ingested}${r.rows_duplicate ? ` (+${r.rows_duplicate} repeats dropped)` : ""}` : ""}
                </TableCell>
                <TableCell sx={{ whiteSpace: "nowrap" }}>
                  <Button size="small" onClick={() => setEditing(r)}>
                    Edit
                  </Button>
                  <Button size="small" onClick={() => handleReparse(r.recording_id)}>
                    Reparse
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {recordings.length === 0 && (
              <TableRow>
                <TableCell colSpan={11}>
                  <Typography color="text.secondary">No recordings yet.</Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
      <EditRecordingDialog
        recording={editing}
        locations={locations}
        onClose={() => setEditing(null)}
        onSaved={(updated) =>
          setRecordings((rows) => rows && rows.map((row) => (row.recording_id === updated.recording_id ? { ...row, ...updated } : row)))
        }
      />
    </>
  );
}
