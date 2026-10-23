"use client";

import type { Extension } from "@codemirror/state";
import { useEffect, useRef, useState } from "react";
import { yCollab } from "y-codemirror.next";
import { WebsocketProvider } from "y-websocket";
import * as Y from "yjs";
import { COLORS, loadName, saveName } from "@/lib/codeshare";
import { findLanguage, LANGUAGES } from "@/lib/languages";
import CodeEditor from "./CodeEditor";
import LanguageSelect from "./LanguageSelect";
import RunPanel from "./RunPanel";

interface Person {
  id: number;
  name: string;
  color: string;
  me: boolean;
}

type Status = "connecting" | "connected" | "disconnected";

export default function CodeshareRoom({ room }: { room: string }) {
  const [collab, setCollab] = useState<Extension | null>(null);
  const [status, setStatus] = useState<Status>("connecting");
  const [people, setPeople] = useState<Person[]>([]);
  const [langId, setLangId] = useState("python");
  const [name, setName] = useState("");
  const [copied, setCopied] = useState(false);
  const shared = useRef<{ doc: Y.Doc; provider: WebsocketProvider } | null>(null);
  const color = useRef(COLORS[0]);
  const nameShown = useRef(false);

  useEffect(() => {
    const doc = new Y.Doc();
    const url = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`;
    // Connect only after the listeners are attached, so the first status event is not missed.
    const provider = new WebsocketProvider(url, room, doc, { connect: false });
    shared.current = { doc, provider };
    const text = doc.getText("code");
    const meta = doc.getMap<string>("meta");

    color.current = COLORS[Math.floor(Math.random() * COLORS.length)];
    const myName = loadName() || `Guest ${Math.floor(100 + Math.random() * 900)}`;
    provider.awareness.setLocalStateField("user", { name: myName, color: color.current, colorLight: color.current + "33" });

    const binding = yCollab(text, provider.awareness, { undoManager: new Y.UndoManager(text) });
    provider.on("status", ({ status: s }: { status: Status }) => {
      setStatus(s);
      setCollab((current) => current ?? binding);
    });
    provider.on("sync", (synced: boolean) => {
      // The first person in an empty room seeds it with a sample.
      if (synced && text.length === 0 && !meta.get("language")) {
        doc.transact(() => {
          meta.set("language", "python");
          text.insert(0, findLanguage("python")!.sample);
        });
      }
    });

    const onMeta = () => setLangId(meta.get("language") ?? "python");
    meta.observe(onMeta);
    onMeta();

    const onAwareness = () => {
      const list: Person[] = [];
      provider.awareness.getStates().forEach((state, id) => {
        const user = state.user as { name?: string; color?: string } | undefined;
        if (!user?.name) return;
        const me = id === doc.clientID;
        if (me && !nameShown.current) {
          nameShown.current = true;
          setName(user.name);
        }
        list.push({ id, name: user.name, color: user.color ?? "#888", me });
      });
      setPeople(list.sort((a, b) => Number(b.me) - Number(a.me)));
    };
    provider.awareness.on("change", onAwareness);
    onAwareness();

    provider.connect();

    return () => {
      provider.awareness.off("change", onAwareness);
      meta.unobserve(onMeta);
      provider.destroy();
      doc.destroy();
      shared.current = null;
      setCollab(null);
    };
  }, [room]);

  function changeLanguage(id: string) {
    const s = shared.current;
    if (!s) return;
    const text = s.doc.getText("code");
    const sample = findLanguage(id)?.sample ?? "";
    s.doc.transact(() => {
      s.doc.getMap<string>("meta").set("language", id);
      // Swap in the new sample only if the code is still an untouched sample.
      if (LANGUAGES.some((l) => l.sample === text.toString())) {
        text.delete(0, text.length);
        text.insert(0, sample);
      }
    });
  }

  function rename(next: string) {
    setName(next);
    saveName(next);
    shared.current?.provider.awareness.setLocalStateField("user", { name: next || "Guest", color: color.current, colorLight: color.current + "33" });
  }

  async function copyLink() {
    await navigator.clipboard.writeText(location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const language = findLanguage(langId) ?? LANGUAGES[0];

  return (
    <div className="flex h-full flex-col px-4 py-5 sm:px-7">
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Room <span className="font-mono">{room}</span>
          </h1>
          <p className="text-xs text-zinc-500">
            <span
              className={`mr-1.5 inline-block size-[7px] rounded-full ${
                status === "connected" ? "bg-green-500" : status === "connecting" ? "bg-amber-500" : "bg-red-500"
              }`}
            />
            {status === "connected"
              ? "Live. Edits sync instantly."
              : status === "connecting"
                ? "Connecting..."
                : "Disconnected. Reconnecting..."}
          </p>
        </div>
        <div className="flex items-center" aria-label={`${people.length} people in the room`}>
          {people.slice(0, 6).map((p) => (
            <span
              key={p.id}
              title={p.me ? `${p.name} (you)` : p.name}
              className="-ml-1.5 grid size-7 place-items-center rounded-full border-2 border-white text-[11px] font-semibold text-black first:ml-0 dark:border-zinc-950"
              style={{ background: p.color }}
            >
              {p.name.slice(0, 1).toUpperCase()}
            </span>
          ))}
          {people.length > 6 && <span className="ml-1.5 text-xs text-zinc-500">+{people.length - 6}</span>}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <input
            value={name}
            onChange={(e) => rename(e.target.value)}
            className="input w-36 py-1.5"
            aria-label="Your name"
            placeholder="Your name"
          />
          <LanguageSelect value={langId} onChange={changeLanguage} />
          <button className="btn-secondary py-1.5" onClick={copyLink}>
            {copied ? "Link copied" : "Copy link"}
          </button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[3fr_2fr]">
        {collab ? (
          <CodeEditor language={langId} collab={collab} className="h-[55vh] xl:h-auto" />
        ) : (
          <div className="h-[55vh] animate-pulse rounded-lg bg-zinc-100 xl:h-auto dark:bg-zinc-900" />
        )}
        <RunPanel language={language} getCode={() => shared.current?.doc.getText("code").toString() ?? ""} />
      </div>
    </div>
  );
}
