import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Typography,
  Paper,
  TextField,
  Button,
  Stack,
  Alert,
  CircularProgress,
} from "@mui/material";
import { uploadRecording, type UploadResult } from "../api";

export default function UploadRecording() {
  const [runId, setRunId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<UploadResult | null>(null);
  const navigate = useNavigate();

  async function handleUpload() {
    if (!runId.trim() || !file || pending) return;
    setPending(true);
    setError(null);
    setResult(null);
    try {
      const res = await uploadRecording(runId.trim(), file);
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Typography variant="h5" gutterBottom>
        Upload a recording
      </Typography>
      <Paper variant="outlined" sx={{ p: 3, maxWidth: 480 }}>
        <Stack spacing={2}>
          <Typography variant="body2" color="text.secondary">
            Supports CSV exports and rosbag2 <code>.db3</code> files. This can take a
            while for large files.
          </Typography>

          <TextField
            label="Run ID"
            value={runId}
            onChange={(e) => setRunId(e.target.value)}
            size="small"
            disabled={pending}
          />

          <Button variant="outlined" component="label" disabled={pending}>
            {file ? file.name : "Choose file"}
            <input
              type="file"
              hidden
              accept=".csv,.db3"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </Button>

          <Button
            variant="contained"
            onClick={handleUpload}
            disabled={pending || !runId.trim() || !file}
          >
            {pending ? <CircularProgress size={20} color="inherit" /> : "Upload and ingest"}
          </Button>

          {error && <Alert severity="error">{error}</Alert>}

          {result && (
            <Alert
              severity="success"
              action={
                <Button color="inherit" size="small" onClick={() => navigate(`/runs/${encodeURIComponent(runId)}`)}>
                  View run
                </Button>
              }
            >
              Ingested {result.rows_ingested} row{result.rows_ingested === 1 ? "" : "s"}.
            </Alert>
          )}
        </Stack>
      </Paper>
    </>
  );
}
