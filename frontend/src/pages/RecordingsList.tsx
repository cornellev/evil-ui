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
} from "@mui/material";
import { listRecordings, type RecordingSummary } from "../api";

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

  useEffect(() => {
    listRecordings({ limit: 200 })
      .then(setRecordings)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

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
              <TableCell>Car</TableCell>
              <TableCell>Format</TableCell>
              <TableCell align="right">Size</TableCell>
              <TableCell>Status</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {recordings.map((r) => (
              <TableRow key={r.recording_id}>
                <TableCell>{new Date(r.uploaded_at * 1000).toLocaleString()}</TableCell>
                <TableCell>{r.label ?? r.original_name ?? r.recording_id}</TableCell>
                <TableCell>{r.category ?? ""}</TableCell>
                <TableCell>{r.car ?? ""}</TableCell>
                <TableCell>{r.container}</TableCell>
                <TableCell align="right">{formatBytes(r.total_bytes)}</TableCell>
                <TableCell>
                  <Chip size="small" label={r.parse_status} color={STATUS_COLOR[r.parse_status]} />
                </TableCell>
              </TableRow>
            ))}
            {recordings.length === 0 && (
              <TableRow>
                <TableCell colSpan={7}>
                  <Typography color="text.secondary">No recordings yet.</Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </>
  );
}
