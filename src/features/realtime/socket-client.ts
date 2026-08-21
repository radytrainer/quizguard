"use client";

import { io, type Socket } from "socket.io-client";

// One connection per browser tab, reused across every component that needs it (the exam page's
// presence join, a teacher's live monitor) — matching the singleton pattern already used for
// the server-side db/redis clients, for the same reason: avoid opening a second connection on
// every re-render or hot-reload.
let socket: Socket | null = null;

export function getRealtimeSocket(): Socket {
  if (!socket) {
    // Unset in production (Phase 13, docs/ARCHITECTURE.md — Section 16): Nginx path-routes
    // `/socket.io/` to the realtime service, so the browser reaches it same-origin and
    // `io()` with no URL connects to `window.location.origin` on its own — no public domain
    // needs to be baked into the client bundle at Docker build time. Local dev still sets
    // this explicitly (.env.local) since the realtime server runs on its own port (4001)
    // with no reverse proxy in front of it there.
    const url = process.env.NEXT_PUBLIC_REALTIME_URL;
    socket = url
      ? io(url, { withCredentials: true })
      : io({ withCredentials: true });
  }
  return socket;
}
