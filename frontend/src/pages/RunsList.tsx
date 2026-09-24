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
} from "@mui/material";
import { listRuns, type RunSummary } from "../api";

export default function RunsList() {
  const [runs, setRuns] = useState<RunSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    listRuns()
      .then(setRuns)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  if (error) return <Alert severity="error">{error}</Alert>;
  if (runs === null) return <CircularProgress />;

  return (
    <>
      <Typography variant="h5" gutterBottom>
        Runs
      </Typography>
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Run ID</TableCell>
              <TableCell align="right">Samples</TableCell>
              <TableCell align="right">Start</TableCell>
              <TableCell align="right">End</TableCell>
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
                <TableCell>{run.run_id}</TableCell>
                <TableCell align="right">{run.sample_count}</TableCell>
                <TableCell align="right">{run.start_ts.toFixed(1)}s</TableCell>
                <TableCell align="right">{run.end_ts.toFixed(1)}s</TableCell>
              </TableRow>
            ))}
            {runs.length === 0 && (
              <TableRow>
                <TableCell colSpan={4}>
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
