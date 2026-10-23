"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import PageHeader from "@/components/PageHeader";
import { newRoomId, parseRoomInput } from "@/lib/codeshare";

export default function CodesharePage() {
  const router = useRouter();
  const [join, setJoin] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="max-w-3xl px-4 py-6 sm:px-7">
      <PageHeader title="Live Codeshare">
        Edit code together in real time. Share the room link, see everyone&apos;s cursor, pick a language and run it.
        Rooms live only in server memory and disappear a minute after the last person leaves. Nothing is saved.
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2">
        <section className="card">
          <h2 className="font-medium">Start a room</h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">You get a link to send to others.</p>
          <button className="btn-primary mt-4" onClick={() => router.push(`/codeshare/${newRoomId()}`)}>
            New room
          </button>
        </section>

        <section className="card">
          <h2 className="font-medium">Join a room</h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Paste a room code or link.</p>
          <form
            className="mt-4 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const id = parseRoomInput(join);
              if (id) router.push(`/codeshare/${id}`);
              else setError("That isn't a room code. It looks like abc-d3fg.");
            }}
          >
            <input
              value={join}
              onChange={(e) => {
                setJoin(e.target.value);
                setError(null);
              }}
              placeholder="abc-d3fg"
              className="input min-w-0 flex-1 font-mono"
              aria-label="Room code or link"
            />
            <button className="btn-secondary">Join</button>
          </form>
          {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
        </section>
      </div>
    </div>
  );
}
