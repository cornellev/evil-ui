import { useEffect, useState } from "react";
import {
  Alert,
  Chip,
  LinearProgress,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from "@mui/material";
import { getSystemStatus, type JobRow, type SystemStatus } from "../api";

const POLL_MS = 3000;

function formatBytes(n: number | null | undefined): string {
  if (n === null || n === undefined) return "n/a";
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(0)} MB`;
  return `${(n / 1024 ** 3).toFixed(1)} GB`;
}

const STATUS_COLOR: Record<JobRow["status"], "default" | "info" | "success" | "error"> = {
  pending: "default",
  running: "info",
  done: "success",
  failed: "error",
};

/** Job queue plus NUC CPU / memory / disk, polled every few seconds. Meant for
 * a software-literate team debugging uploads: failed jobs show their error. */
export default function StatusPanel() {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const next = await getSystemStatus();
        if (!cancelled) {
          setStatus(next);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    }
    poll();
    const timer = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  if (error && !status) return <Alert severity="warning">Status unavailable: {error}</Alert>;
  if (!status) return null;

  const { jobs, system } = status;
  const memUsed =
    system.mem_total_bytes !== null && system.mem_available_bytes !== null
      ? system.mem_total_bytes - system.mem_available_bytes
      : null;
  const memPct = memUsed !== null && system.mem_total_bytes ? (memUsed / system.mem_total_bytes) * 100 : null;
  const diskUsedPct =
    system.disk.total_bytes && system.disk.free_bytes !== null
      ? ((system.disk.total_bytes - system.disk.free_bytes) / system.disk.total_bytes) * 100
      : null;

  return (
    <Paper variant="outlined" sx={{ p: 2, mt: 2, maxWidth: 560 }} data-testid="status-panel">
      <Typography variant="subtitle1" gutterBottom>
        Processing queue
      </Typography>
      <Stack direction="row" sx={{ mb: 1, flexWrap: "wrap", gap: 1 }}>
        <Chip size="small" label={`${jobs.counts.pending} queued`} />
        <Chip size="small" color="info" label={`${jobs.counts.running} running`} />
        <Chip size="small" color="success" label={`${jobs.counts.done} done`} />
        <Chip size="small" color={jobs.counts.failed ? "error" : "default"} label={`${jobs.counts.failed} failed`} />
        {error && <Chip size="small" color="warning" label="status stale" />}
      </Stack>

      <TableContainer sx={{ maxHeight: 260 }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell>Recording</TableCell>
              <TableCell>Job</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="right">Size</TableCell>
              <TableCell align="right">Tries</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {jobs.queue.map((job) => (
              <TableRow key={job.job_id}>
                <TableCell>{job.name}</TableCell>
                <TableCell>{job.kind}</TableCell>
                <TableCell sx={{ minWidth: 110 }}>
                  <Tooltip title={job.error ?? ""} disableHoverListener={!job.error}>
                    <Chip size="small" color={STATUS_COLOR[job.status]} label={job.status} />
                  </Tooltip>
                  {job.status === "running" && job.progress !== null && (
                    <LinearProgress variant="determinate" value={job.progress * 100} sx={{ mt: 0.5 }} />
                  )}
                  {job.error && (
                    <Typography variant="caption" color="error" sx={{ display: "block" }}>
                      {job.error}
                    </Typography>
                  )}
                </TableCell>
                <TableCell align="right">{formatBytes(job.size_bytes)}</TableCell>
                <TableCell align="right">
                  {job.attempts}/{job.max_attempts}
                </TableCell>
              </TableRow>
            ))}
            {jobs.queue.length === 0 && (
              <TableRow>
                <TableCell colSpan={5}>
                  <Typography color="text.secondary">Nothing queued.</Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <Typography variant="subtitle1" sx={{ mt: 2 }} gutterBottom>
        NUC
      </Typography>
      <Stack spacing={1}>
        <Typography variant="body2">
          CPU load {system.load_avg[0]?.toFixed(2) ?? "n/a"} (1 min) on {system.cpu_count ?? "?"} cores
        </Typography>
        <div>
          <Typography variant="body2">
            Memory {formatBytes(memUsed)} of {formatBytes(system.mem_total_bytes)}
          </Typography>
          {memPct !== null && <LinearProgress variant="determinate" value={memPct} />}
        </div>
        <div>
          <Typography variant="body2">
            Disk {formatBytes(system.disk.free_bytes)} free of {formatBytes(system.disk.total_bytes)}; recordings{" "}
            {formatBytes(system.recordings_bytes)}
          </Typography>
          {diskUsedPct !== null && (
            <LinearProgress variant="determinate" value={diskUsedPct} color={diskUsedPct > 90 ? "error" : "primary"} />
          )}
        </div>
      </Stack>
    </Paper>
  );
}
