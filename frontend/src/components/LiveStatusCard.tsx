import { Chip, Paper, Stack, Typography } from "@mui/material";
import type { LiveStatus } from "../api";

const MPS_TO_MPH = 2.23694;

const fmt = (v: number | null | undefined, digits = 1) => (v === null || v === undefined ? "-" : v.toFixed(digits));

/** The car's live feed in one line: alive?, recording?, and the latest numbers of the recording run. */
export default function LiveStatusCard({ status, compact = false }: { status: LiveStatus | null; compact?: boolean }) {
  if (status === null) return null;
  const feed = status.feed_alive ? (
    <Chip size="small" color="success" label={`feed live${status.msgs_per_s ? `, ${status.msgs_per_s.toFixed(0)} msg/s` : ""}`} />
  ) : (
    <Chip
      size="small"
      variant="outlined"
      label={
        status.live_tier
          ? "live tier not set up"
          : status.last_message_age_s != null
            ? `no live data for ${Math.round(status.last_message_age_s)} s`
            : "no live data"
      }
    />
  );
  return (
    <Paper variant="outlined" sx={{ p: 1.5, mb: 2 }} data-testid="live-status">
      <Stack direction="row" sx={{ flexWrap: "wrap", gap: 1, alignItems: "center" }}>
        {status.recording ? (
          <Chip size="small" color="error" label="● Recording" data-testid="live-recording" />
        ) : (
          <Chip size="small" variant="outlined" label="Not recording" data-testid="live-not-recording" />
        )}
        {feed}
        {status.session_mode && <Chip size="small" variant="outlined" label={status.session_mode === "bag" ? "record button" : "gap mode"} />}
        {status.compiler && <Chip size="small" color="warning" label={status.compiler} />}
        {status.recording && (
          <Typography variant="body2" data-testid="live-numbers">
            {status.run_id} · lap {status.current_lap?.lap_number ?? "-"}
            {status.current_lap?.elapsed_s != null ? ` (${status.current_lap.elapsed_s.toFixed(0)} s)` : ""} ·{" "}
            {status.current_segment ?? "-"} · {fmt(status.latest?.speed != null ? status.latest.speed * MPS_TO_MPH : null)} mph ·{" "}
            {fmt(status.latest?.power_w, 0)} W
            {!compact && status.so_far
              ? ` · ${status.laps_completed ?? 0} laps done · ${fmt(status.so_far.energy_wh)} Wh · ${fmt(status.so_far.efficiency_mi_per_kwh)} mi/kWh so far`
              : ""}
          </Typography>
        )}
      </Stack>
      {status.recording && !compact && (
        <Typography variant="caption" color="text.secondary">
          Live numbers are approximate until the full recording is uploaded.
        </Typography>
      )}
    </Paper>
  );
}
