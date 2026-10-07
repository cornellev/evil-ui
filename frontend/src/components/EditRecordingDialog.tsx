import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
} from "@mui/material";
import {
  CATEGORIES,
  updateRecording,
  type Category,
  type NamedLocation,
  type RecordingEdit,
  type RecordingSummary,
} from "../api";

const AUTO = "__auto__";

interface Props {
  recording: RecordingSummary | null;
  locations: NamedLocation[];
  onClose: () => void;
  onSaved: (updated: RecordingSummary) => void;
}

/** Edit a stored recording's label, category, car, event, notes and location. A category or location
 * you pick is locked (manual); "(automatic)" hands it back to the GPS-based label. */
export default function EditRecordingDialog({ recording, locations, onClose, onSaved }: Props) {
  const [label, setLabel] = useState("");
  const [notes, setNotes] = useState("");
  const [car, setCar] = useState("");
  const [event, setEvent] = useState("");
  const [category, setCategory] = useState<string>(AUTO);
  const [locationId, setLocationId] = useState<string>(AUTO);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!recording) return;
    setLabel(recording.label ?? "");
    setNotes(recording.notes ?? "");
    setCar(recording.car ?? "");
    setEvent(recording.event ?? "");
    setCategory(recording.category_method === "manual" && recording.category ? recording.category : AUTO);
    setLocationId(recording.location_method === "manual" && recording.location_id !== null ? String(recording.location_id) : AUTO);
    setError(null);
  }, [recording]);

  if (!recording) return null;

  async function save() {
    if (!recording) return;
    const changes: RecordingEdit = {};
    const text = (value: string) => (value.trim() === "" ? null : value.trim());
    if (text(label) !== recording.label) changes.label = text(label);
    if (text(notes) !== recording.notes) changes.notes = text(notes);
    if (text(car) !== recording.car) changes.car = text(car);
    if (text(event) !== recording.event) changes.event = text(event);
    const wasManualCategory = recording.category_method === "manual" ? recording.category : null;
    const nextCategory = category === AUTO ? null : (category as Category);
    if (nextCategory !== wasManualCategory) changes.category = nextCategory;
    const wasManualLocation = recording.location_method === "manual" ? recording.location_id : null;
    const nextLocation = locationId === AUTO ? null : Number(locationId);
    if (nextLocation !== wasManualLocation) changes.location_id = nextLocation;
    if (Object.keys(changes).length === 0) {
      onClose();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      onSaved(await updateRecording(recording.recording_id, changes));
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onClose={saving ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>Edit recording</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField label="Label" value={label} onChange={(e) => setLabel(e.target.value)} size="small" disabled={saving} />
          <Stack direction="row" spacing={2}>
            <TextField
              select
              label="Category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              size="small"
              sx={{ minWidth: 180 }}
              disabled={saving}
              helperText={category === AUTO ? "Set from the location when it has a default" : "Locked: never changed automatically"}
            >
              <MenuItem value={AUTO}>(automatic)</MenuItem>
              {CATEGORIES.map((c) => (
                <MenuItem key={c} value={c}>
                  {c}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label="Location"
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              size="small"
              sx={{ minWidth: 180 }}
              disabled={saving}
              helperText={locationId === AUTO ? "Matched from the recording's GPS" : "Locked: never changed automatically"}
            >
              <MenuItem value={AUTO}>(automatic from GPS)</MenuItem>
              {locations.map((l) => (
                <MenuItem key={l.location_id} value={String(l.location_id)}>
                  {l.name}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
          <Stack direction="row" spacing={2}>
            <TextField label="Car" value={car} onChange={(e) => setCar(e.target.value)} size="small" disabled={saving} />
            <TextField label="Event" value={event} onChange={(e) => setEvent(e.target.value)} size="small" disabled={saving} />
          </Stack>
          <TextField
            label="Notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            size="small"
            multiline
            minRows={2}
            disabled={saving}
          />
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving} color="inherit">
          Cancel
        </Button>
        <Button onClick={save} disabled={saving} variant="contained">
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}
