import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
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
  FormControlLabel,
  Switch,
  Tooltip,
} from "@mui/material";
import { listRuns, type RunSummary } from "../api";
import LiveStatusCard from "../components/LiveStatusCard";
import { useLiveStatus } from "../hooks/useLiveStatus";

const REFRESH_WHILE_RECORDING_MS = 5000;

function RunBadge({ run }: { run: RunSummary }) {
  if (run.status === "recording") {
    return <Chip size="small" color="error" label="● Recording" sx={{ ml: 1 }} data-testid="run-recording" />;
  }
  if (run.tier === "live") {
    return (
      <Tooltip title={run.linked_run_id ? `Full recording: ${run.linked_run_id}` : "Only the live copy exists (no upload yet)"}>
        <Chip size="small" variant="outlined" color="warning" label="Live capture" sx={{ ml: 1 }} data-testid="run-live" />
      </Tooltip>
    );
  }
  return null;
}

export default function RunsList() {
  const [runs, setRuns] = useState<RunSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showTwins, setShowTwins] = useState(false);
  const navigate = useNavigate();
  const live = useLiveStatus();
  const recording = runs?.some((r) => r.status === "recording") || live?.recording;

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      listRuns(showTwins)
        .then((rows) => !cancelled && setRuns(rows))
        .catch((err) => !cancelled && setError(err instanceof Error ? err.message : String(err)));
    load();
    // a run being recorded grows (laps, energy): refresh while one is
    const timer = recording ? setInterval(load, REFRESH_WHILE_RECORDING_MS) : undefined;
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [showTwins, recording]);

  if (error) return <Alert severity="error">{error}</Alert>;
  if (runs === null) return <CircularProgress />;

  return (
    <>
      <Typography variant="h5" gutterBottom>
        Runs
      </Typography>
      <LiveStatusCard status={live} compact />
      <FormControlLabel
        control={<Switch size="small" checked={showTwins} onChange={(e) => setShowTwins(e.target.checked)} />}
        label="Also show live captures that have a full upload"
        sx={{ mb: 1 }}
      />
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Run ID</TableCell>
              <TableCell align="right">Laps</TableCell>
              <TableCell align="right">Samples</TableCell>
              <TableCell align="right">Start</TableCell>
              <TableCell align="right">End</TableCell>
              <TableCell align="right">Distance (km)</TableCell>
              <TableCell align="right">Energy (Wh)</TableCell>
              <TableCell align="right">Efficiency (mi/kWh)</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {runs.map((run) => (
              <TableRow
                key={run.run_id}
                hover
                sx={{ cursor: "pointer" }}
                onClick={() => navigate(`/runs/${encodeURIComponent(run.run_id)}`)}
              >
                <TableCell>
                  <span>{run.run_id}</span>
                  <RunBadge run={run} />
                </TableCell>
                <TableCell align="right">{run.lap_count ?? "-"}</TableCell>
                <TableCell align="right">{run.sample_count}</TableCell>
                <TableCell align="right">{run.start_ts.toFixed(1)}s</TableCell>
                <TableCell align="right">{run.end_ts.toFixed(1)}s</TableCell>
                <TableCell align="right">{run.distance_m == null ? "-" : (run.distance_m / 1000).toFixed(2)}</TableCell>
                <TableCell align="right">{run.energy_wh == null ? "-" : run.energy_wh.toFixed(1)}</TableCell>
                <TableCell align="right">{run.efficiency_mi_per_kwh == null ? "-" : run.efficiency_mi_per_kwh.toFixed(1)}</TableCell>
              </TableRow>
            ))}
            {runs.length === 0 && (
              <TableRow>
                <TableCell colSpan={8}>
                  <Typography color="text.secondary">No runs yet.</Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </>
  );
}
