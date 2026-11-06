import { useEffect, useRef, useState } from "react";
import { Box, Button, Chip, IconButton, InputBase, Paper, Stack, Typography } from "@mui/material";
import { askTern, stepHint, stepLabel } from "../ternStream";
import type { TernEvent } from "../ternStream";

// Starting points for the team (Tern answers evil-ui with EVIL data plus general knowledge).
const SUGGESTIONS = [
  "Lap times for the latest run",
  "Compare the last two laps",
  "Which run had the best efficiency?",
  "Slowest turn in the latest run",
  "What is the car doing right now?",
  "How does regen braking work?",
];

type Step = { tool: string; hint: string; state: "running" | "ok" | "error"; summary?: string };

type Exchange = {
  id: number;
  question: string;
  steps: Step[];
  status: "queued" | "thinking" | "done" | "error";
  queuePosition?: number;
  answer?: string;
  startedAt: number;
  endedAt?: number;
};

const MUTED = "rgba(255,255,255,0.5)";
const FAINT = "rgba(255,255,255,0.35)";

export default function ChatPanel() {
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [draft, setDraft] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const pending = exchanges.some((e) => e.status === "queued" || e.status === "thinking");
  const threadRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(1);

  useEffect(() => {
    if (!pending) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [pending]);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" });
  }, [exchanges]);

  const apply = (id: number, event: TernEvent) =>
    setExchanges((prev) =>
      prev.map((e) => {
        if (e.id !== id) return e;
        switch (event.type) {
          case "queued":
            return { ...e, status: "queued", queuePosition: event.position };
          case "started":
          case "thinking":
            return { ...e, status: "thinking" };
          case "tool":
            return {
              ...e,
              status: "thinking",
              steps: [...e.steps, { tool: event.name, hint: stepHint(event.args), state: "running" }],
            };
          case "tool_done": {
            const steps = [...e.steps];
            const i = steps.map((s) => s.tool).lastIndexOf(event.name);
            if (i !== -1) steps[i] = { ...steps[i], state: event.ok ? "ok" : "error", summary: event.summary };
            return { ...e, steps };
          }
          case "answer":
            return { ...e, status: "done", answer: event.text, endedAt: Date.now() };
          case "error":
            return { ...e, status: "error", answer: event.detail, endedAt: Date.now() };
          default:
            return e;
        }
      }),
    );

  async function ask(text: string) {
    const question = text.trim();
    if (!question || pending) return;
    const id = nextId.current++;
    setDraft("");
    setExchanges((prev) => [...prev, { id, question, steps: [], status: "thinking", startedAt: Date.now() }]);
    let finished = false;
    await askTern(question, (event) => {
      if (event.type === "answer" || event.type === "error") finished = true;
      apply(id, event);
    });
    if (!finished) apply(id, { type: "error", detail: "Tern stopped without an answer" });
  }

  return (
    <Paper
      variant="outlined"
      sx={{ p: 2, display: "flex", flexDirection: "column", height: "100%", gap: 1.5 }}
      data-testid="chat-panel"
    >
      <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between" }}>
        <Box>
          <Typography variant="h6" sx={{ lineHeight: 1.2 }}>
            Ask Tern
          </Typography>
          <Typography variant="caption" sx={{ color: FAINT }}>
            answers from EVIL's data
          </Typography>
        </Box>
        {exchanges.length > 0 && !pending && (
          <Button size="small" color="inherit" sx={{ color: MUTED }} onClick={() => setExchanges([])}>
            Clear
          </Button>
        )}
      </Stack>

      <Box ref={threadRef} sx={{ flexGrow: 1, overflowY: "auto", minHeight: 0 }} data-testid="chat-thread">
        {exchanges.length === 0 ? (
          <Stack spacing={2} sx={{ height: "100%", justifyContent: "center", px: 1 }} data-testid="chat-empty">
            <Typography variant="body2" sx={{ color: MUTED, textAlign: "center" }}>
              Ask about any run, lap or turn, or something general.
            </Typography>
            <Stack direction="row" useFlexGap spacing={1} sx={{ flexWrap: "wrap", justifyContent: "center" }}>
              {SUGGESTIONS.map((s) => (
                <Chip key={s} label={s} variant="outlined" onClick={() => ask(s)} data-testid="chat-suggestion" />
              ))}
            </Stack>
          </Stack>
        ) : (
          <Stack spacing={2.5}>
            {exchanges.map((e) => (
              <ExchangeView key={e.id} exchange={e} now={now} />
            ))}
          </Stack>
        )}
      </Box>

      {exchanges.length > 0 && (
        <Stack direction="row" spacing={1} sx={{ overflowX: "auto", pb: 0.5, scrollbarWidth: "none" }}>
          {SUGGESTIONS.slice(0, 4).map((s) => (
            <Chip
              key={s}
              label={s}
              size="small"
              variant="outlined"
              disabled={pending}
              onClick={() => ask(s)}
              data-testid="chat-suggestion"
            />
          ))}
        </Stack>
      )}

      <Paper
        component="form"
        variant="outlined"
        onSubmit={(ev) => {
          ev.preventDefault();
          void ask(draft);
        }}
        sx={{ display: "flex", alignItems: "flex-end", gap: 1, p: 0.75, pl: 1.5, borderRadius: 3 }}
      >
        <InputBase
          fullWidth
          multiline
          maxRows={5}
          value={draft}
          onChange={(ev) => setDraft(ev.target.value)}
          onKeyDown={(ev) => {
            if (ev.key === "Enter" && !ev.shiftKey) {
              ev.preventDefault();
              void ask(draft);
            }
          }}
          placeholder={pending ? "Tern is answering..." : "Ask a question..."}
          sx={{ py: 0.75, fontSize: 14 }}
          inputProps={{ "data-testid": "chat-input" }}
        />
        <IconButton
          type="submit"
          color="primary"
          disabled={pending || !draft.trim()}
          aria-label="Ask"
          sx={{ bgcolor: "primary.main", color: "#fff", "&:hover": { bgcolor: "primary.dark" }, "&.Mui-disabled": { bgcolor: "rgba(255,255,255,0.08)" } }}
          size="small"
          data-testid="chat-ask"
        >
          {pending ? <Spinner /> : <Box component="span" sx={{ fontSize: 16, lineHeight: 1, px: 0.25 }}>&#8593;</Box>}
        </IconButton>
      </Paper>
    </Paper>
  );
}

function ExchangeView({ exchange: e, now }: { exchange: Exchange; now: number }) {
  const [showSteps, setShowSteps] = useState(false);
  const working = e.status === "thinking" || e.status === "queued";
  const seconds = (((e.endedAt ?? now) - e.startedAt) / 1000).toFixed(1);

  return (
    <Stack spacing={1} data-testid="chat-exchange">
      <Box
        sx={{
          alignSelf: "flex-end",
          ml: 4,
          px: 1.5,
          py: 1,
          borderRadius: "16px 16px 4px 16px",
          bgcolor: "rgba(255,255,255,0.08)",
          fontSize: 14,
        }}
      >
        {e.question}
      </Box>

      {working ? (
        <Stack spacing={0.5}>
          {e.steps.map((s, i) => (
            <StepRow key={i} step={s} />
          ))}
          <Stack direction="row" spacing={1} sx={{ alignItems: "center", fontSize: 12, color: MUTED }} data-testid="chat-thinking">
            <Spinner />
            <span>
              {e.status === "queued"
                ? `Waiting for Tern${e.queuePosition ? ` (${e.queuePosition} ahead)` : ""}`
                : "Thinking"}
            </span>
            <Box component="span" sx={{ color: FAINT, fontVariantNumeric: "tabular-nums" }}>
              {seconds}s
            </Box>
          </Stack>
        </Stack>
      ) : (
        <Stack spacing={0.75}>
          {e.steps.length > 0 ? (
            <Box
              component="button"
              type="button"
              onClick={() => setShowSteps((v) => !v)}
              sx={{
                alignSelf: "flex-start",
                background: "none",
                border: 0,
                p: 0,
                cursor: "pointer",
                fontSize: 11,
                color: FAINT,
                "&:hover": { color: MUTED },
              }}
              data-testid="chat-steps-toggle"
            >
              <Box component="span" sx={{ display: "inline-block", mr: 0.5, transition: "transform .15s", transform: showSteps ? "rotate(90deg)" : "none" }}>
                &#9656;
              </Box>
              {e.steps.length} {e.steps.length === 1 ? "step" : "steps"} · {seconds}s
            </Box>
          ) : (
            <Typography sx={{ fontSize: 11, color: FAINT }}>{seconds}s</Typography>
          )}
          {showSteps && e.steps.map((s, i) => <StepRow key={i} step={s} />)}
          <Box
            data-testid="chat-answer"
            sx={{
              whiteSpace: "pre-wrap",
              px: 1.5,
              py: 1.25,
              borderRadius: "16px 16px 16px 4px",
              border: "1px solid rgba(255,255,255,0.08)",
              bgcolor: "rgba(0,0,0,0.18)",
              fontSize: 14,
              color: e.status === "error" ? "error.main" : "text.primary",
            }}
          >
            {e.answer}
          </Box>
        </Stack>
      )}
    </Stack>
  );
}

function StepRow({ step }: { step: Step }) {
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: "center", fontSize: 12, color: MUTED, minWidth: 0 }} data-testid="chat-step">
      <Box sx={{ width: 12, display: "flex", justifyContent: "center" }}>
        {step.state === "running" ? (
          <Spinner />
        ) : step.state === "ok" ? (
          <Box component="span" sx={{ color: "success.light" }}>&#10003;</Box>
        ) : (
          <Box component="span" sx={{ color: "error.main" }}>&#10005;</Box>
        )}
      </Box>
      <Box component="span" sx={{ color: "rgba(255,255,255,0.75)", whiteSpace: "nowrap" }}>
        {stepLabel(step.tool)}
      </Box>
      {step.hint && (
        <Box component="span" sx={{ color: FAINT, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {step.hint}
        </Box>
      )}
      {step.summary && (
        <Box component="span" sx={{ color: FAINT, ml: "auto !important", whiteSpace: "nowrap" }}>
          {step.summary}
        </Box>
      )}
    </Stack>
  );
}

function Spinner() {
  return (
    <Box
      component="span"
      sx={{
        display: "inline-block",
        width: 10,
        height: 10,
        borderRadius: "50%",
        border: "1.5px solid rgba(255,255,255,0.2)",
        borderTopColor: "rgba(255,255,255,0.85)",
        animation: "tern-spin 0.8s linear infinite",
        "@keyframes tern-spin": { to: { transform: "rotate(360deg)" } },
      }}
    />
  );
}
