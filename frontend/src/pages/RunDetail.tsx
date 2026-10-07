import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  Tabs,
  Tab,
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  CircularProgress,
  Alert,
} from "@mui/material";
import { listTurns, listLaps, listStraights, type Turn, type Lap, type Straight } from "../api";

type TabKey = "turns" | "laps" | "straights";

const fmt1 = (value: number | null | undefined) =>
  value === null || value === undefined ? "-" : value.toFixed(1);

function fmt(value: number | null): string {
  return value === null || value === undefined ? "-" : value.toFixed(2);
}

export default function RunDetail() {
  const { runId = "" } = useParams<{ runId: string }>();
  const [tab, setTab] = useState<TabKey>("turns");
  const [turns, setTurns] = useState<Turn[] | null>(null);
  const [laps, setLaps] = useState<Lap[] | null>(null);
  const [straights, setStraights] = useState<Straight[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    if (tab === "turns" && turns === null) {
      listTurns(runId)
        .then((page) => setTurns(page.turns))
        .catch((err) => setError(String(err)));
    } else if (tab === "laps" && laps === null) {
      listLaps(runId)
        .then((page) => setLaps(page.laps))
        .catch((err) => setError(String(err)));
    } else if (tab === "straights" && straights === null) {
      listStraights(runId)
        .then((page) => setStraights(page.straights))
        .catch((err) => setError(String(err)));
    }
  }, [tab, runId, turns, laps, straights]);

  return (
    <>
      <Typography variant="h5" gutterBottom>
        Run: {runId}
      </Typography>

      <Tabs value={tab} onChange={(_, value) => setTab(value)} sx={{ mb: 2 }}>
        <Tab label="Turns" value="turns" />
        <Tab label="Laps" value="laps" />
        <Tab label="Straights" value="straights" />
      </Tabs>

      {error && <Alert severity="error">{error}</Alert>}

      {tab === "turns" && (
        <TableContainer component={Paper} variant="outlined">
          {turns === null ? (
            <Box sx={{ p: 2 }}>
              <CircularProgress size={24} />
            </Box>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Turn</TableCell>
                  <TableCell align="right">Start</TableCell>
                  <TableCell align="right">End</TableCell>
                  <TableCell align="right">Entry speed</TableCell>
                  <TableCell align="right">Exit speed</TableCell>
                  <TableCell align="right">Duration (s)</TableCell>
                  <TableCell align="right">Distance (m)</TableCell>
                  <TableCell align="right">Energy (Wh)</TableCell>
                  <TableCell align="right">Efficiency (mi/kWh)</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {turns.map((t) => (
                  <TableRow key={t.turn_id}>
                    <TableCell>{t.name ?? t.turn_name}</TableCell>
                    <TableCell align="right">{t.start_ts.toFixed(1)}s</TableCell>
                    <TableCell align="right">{t.end_ts.toFixed(1)}s</TableCell>
                    <TableCell align="right">{fmt(t.entry_speed)}</TableCell>
                    <TableCell align="right">{fmt(t.exit_speed)}</TableCell>
                    <TableCell align="right">{fmt1(t.duration_s)}</TableCell>
                    <TableCell align="right">{fmt1(t.distance_m)}</TableCell>
                    <TableCell align="right">{fmt(t.energy_wh)}</TableCell>
                    <TableCell align="right">{fmt1(t.efficiency_mi_per_kwh)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TableContainer>
      )}

      {tab === "laps" && (
        <TableContainer component={Paper} variant="outlined">
          {laps === null ? (
            <Box sx={{ p: 2 }}>
              <CircularProgress size={24} />
            </Box>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Lap</TableCell>
                  <TableCell align="right">Start</TableCell>
                  <TableCell align="right">End</TableCell>
                  <TableCell align="right">Turns</TableCell>
                  <TableCell align="right">Avg speed</TableCell>
                  <TableCell align="right">Duration (s)</TableCell>
                  <TableCell align="right">Distance (m)</TableCell>
                  <TableCell align="right">Energy (Wh)</TableCell>
                  <TableCell align="right">Efficiency (mi/kWh)</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {laps.map((l) => (
                  <TableRow key={l.lap_id}>
                    <TableCell>{l.lap_number}</TableCell>
                    <TableCell align="right">{l.start_ts.toFixed(1)}s</TableCell>
                    <TableCell align="right">{l.end_ts.toFixed(1)}s</TableCell>
                    <TableCell align="right">{l.turn_count}</TableCell>
                    <TableCell align="right">{fmt(l.avg_speed)}</TableCell>
                    <TableCell align="right">{fmt1(l.duration_s)}</TableCell>
                    <TableCell align="right">{fmt1(l.distance_m)}</TableCell>
                    <TableCell align="right">{fmt(l.energy_wh)}</TableCell>
                    <TableCell align="right">{fmt1(l.efficiency_mi_per_kwh)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TableContainer>
      )}

      {tab === "straights" && (
        <TableContainer component={Paper} variant="outlined">
          {straights === null ? (
            <Box sx={{ p: 2 }}>
              <CircularProgress size={24} />
            </Box>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Straight</TableCell>
                  <TableCell align="right">Start</TableCell>
                  <TableCell align="right">End</TableCell>
                  <TableCell align="right">Entry speed</TableCell>
                  <TableCell align="right">Exit speed</TableCell>
                  <TableCell align="right">Avg speed</TableCell>
                  <TableCell align="right">Duration (s)</TableCell>
                  <TableCell align="right">Distance (m)</TableCell>
                  <TableCell align="right">Energy (Wh)</TableCell>
                  <TableCell align="right">Efficiency (mi/kWh)</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {straights.map((s) => (
                  <TableRow key={s.straight_id}>
                    <TableCell>{s.name}</TableCell>
                    <TableCell align="right">{s.start_ts.toFixed(1)}s</TableCell>
                    <TableCell align="right">{s.end_ts.toFixed(1)}s</TableCell>
                    <TableCell align="right">{fmt(s.entry_speed)}</TableCell>
                    <TableCell align="right">{fmt(s.exit_speed)}</TableCell>
                    <TableCell align="right">{fmt(s.avg_speed)}</TableCell>
                    <TableCell align="right">{fmt1(s.duration_s)}</TableCell>
                    <TableCell align="right">{fmt1(s.distance_m)}</TableCell>
                    <TableCell align="right">{fmt(s.energy_wh)}</TableCell>
                    <TableCell align="right">{fmt1(s.efficiency_mi_per_kwh)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TableContainer>
      )}
    </>
  );
}
