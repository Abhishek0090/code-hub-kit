"use client";

import { useEffect, useState } from "react";

export interface ServerStatus {
  piston: boolean;
  ai: boolean;
  cloud: boolean;
}

let cached: Promise<ServerStatus> | null = null;

/** Which optional server features are configured (Piston, Anthropic). Fetched once per page load. */
export function useServerStatus(): ServerStatus | null {
  const [status, setStatus] = useState<ServerStatus | null>(null);
  useEffect(() => {
    cached ??= fetch("/api/status")
      .then((r) => r.json() as Promise<ServerStatus>)
      .catch(() => ({ piston: false, ai: false, cloud: false }));
    let live = true;
    cached.then((s) => live && setStatus(s));
    return () => {
      live = false;
    };
  }, []);
  return status;
}
