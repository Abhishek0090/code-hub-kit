"use client";

import dynamic from "next/dynamic";

/**
 * The room only works in the browser (WebSocket, editor), so skip server rendering. This also keeps
 * a second copy of Yjs out of the server process, where server.ts already runs one for the rooms.
 */
const CodeshareRoom = dynamic(() => import("./CodeshareRoom"), {
  ssr: false,
  loading: () => <p className="px-7 py-6 text-sm text-zinc-500">Opening room...</p>,
});

export default CodeshareRoom;
