import { useEffect, useState } from "react";
import { getLiveStatus, type LiveStatus } from "../api";

/** Polls EVIL's get_live_status (via the backend's /live/status). null = unavailable. */
export function useLiveStatus(pollMs = 2000): LiveStatus | null {
  const [status, setStatus] = useState<LiveStatus | null>(null);
  useEffect(() => {
    let cancelled = false;
    const poll = () =>
      getLiveStatus()
        .then((s) => !cancelled && setStatus(s))
        .catch(() => !cancelled && setStatus(null));
    poll();
    const timer = setInterval(poll, pollMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [pollMs]);
  return status;
}
