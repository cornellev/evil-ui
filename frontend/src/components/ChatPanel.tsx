import { useState } from "react";
import { Box, TextField, Button, Typography, Paper, CircularProgress, Stack } from "@mui/material";
import { askQuestion } from "../api";

interface ChatEntry {
  question: string;
  answer: string;
}

export default function ChatPanel() {
  const [question, setQuestion] = useState("");
  const [history, setHistory] = useState<ChatEntry[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAsk() {
    const trimmed = question.trim();
    if (!trimmed || pending) return;
    setPending(true);
    setError(null);
    try {
      const answer = await askQuestion(trimmed);
      setHistory((prev) => [...prev, { question: trimmed, answer }]);
      setQuestion("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <Paper variant="outlined" sx={{ p: 2, display: "flex", flexDirection: "column", height: "100%" }}>
      <Typography variant="h6" gutterBottom>
        Ask Tern
      </Typography>

      <Stack spacing={1.5} sx={{ flexGrow: 1, overflowY: "auto", mb: 2 }}>
        {history.map((entry, i) => (
          <Box key={i}>
            <Typography variant="subtitle2" color="primary">
              {entry.question}
            </Typography>
            <Typography variant="body2">{entry.answer}</Typography>
          </Box>
        ))}
        {history.length === 0 && (
          <Typography variant="body2" color="text.secondary">
            Ask something like "how was I in turn 3 during run-1?"
          </Typography>
        )}
      </Stack>

      {error && (
        <Typography variant="body2" color="error" sx={{ mb: 1 }}>
          {error}
        </Typography>
      )}

      <Stack direction="row" spacing={1}>
        <TextField
          fullWidth
          size="small"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAsk()}
          placeholder="Ask a question..."
          disabled={pending}
        />
        <Button variant="contained" onClick={handleAsk} disabled={pending || !question.trim()}>
          {pending ? <CircularProgress size={20} color="inherit" /> : "Ask"}
        </Button>
      </Stack>
      {pending && (
        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
          This can take up to ~90s depending on the model.
        </Typography>
      )}
    </Paper>
  );
}
