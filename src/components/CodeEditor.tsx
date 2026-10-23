"use client";

import { indentWithTab } from "@codemirror/commands";
import { Compartment, EditorState, type Extension } from "@codemirror/state";
import { oneDark } from "@codemirror/theme-one-dark";
import { EditorView, keymap, placeholder as placeholderExt } from "@codemirror/view";
import { basicSetup } from "codemirror";
import { useEffect, useRef } from "react";
import { highlighter } from "@/lib/languages";

interface Props {
  language: string;
  /** Uncontrolled: the initial text. Ignored when `collab` is set (the shared document wins). */
  value?: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  placeholder?: string;
  /** Live collaboration binding from y-codemirror.next (yCollab(...)). */
  collab?: Extension;
  /** Forces the editor content, e.g. when output is streamed in. */
  externalValue?: string;
  className?: string;
}

const baseTheme = EditorView.theme({
  "&": { height: "100%", fontSize: "13px" },
  ".cm-scroller": { fontFamily: "var(--font-geist-mono), ui-monospace, monospace", lineHeight: "1.6" },
  "&.cm-focused": { outline: "none" },
});

const prefersDark = () => typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;

export default function CodeEditor({
  language,
  value = "",
  onChange,
  readOnly,
  placeholder,
  collab,
  externalValue,
  className,
}: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const langSlot = useRef(new Compartment());
  const themeSlot = useRef(new Compartment());
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Create the editor once per collaboration binding.
  useEffect(() => {
    if (!host.current) return;
    const v = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: collab ? undefined : value,
        extensions: [
          basicSetup,
          keymap.of([indentWithTab]),
          baseTheme,
          langSlot.current.of([]),
          themeSlot.current.of(prefersDark() ? oneDark : []),
          EditorState.readOnly.of(Boolean(readOnly)),
          EditorView.editable.of(!readOnly),
          placeholder ? placeholderExt(placeholder) : [],
          collab ?? [],
          EditorView.updateListener.of((u) => {
            if (u.docChanged) onChangeRef.current?.(u.state.doc.toString());
          }),
        ],
      }),
    });
    view.current = v;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onTheme = () => v.dispatch({ effects: themeSlot.current.reconfigure(media.matches ? oneDark : []) });
    media.addEventListener("change", onTheme);
    return () => {
      media.removeEventListener("change", onTheme);
      v.destroy();
      view.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collab, readOnly]);

  useEffect(() => {
    let cancelled = false;
    highlighter(language)().then((ext) => {
      if (!cancelled) view.current?.dispatch({ effects: langSlot.current.reconfigure(ext) });
    });
    return () => {
      cancelled = true;
    };
  }, [language, collab, readOnly]);

  useEffect(() => {
    const v = view.current;
    if (!v || externalValue === undefined || externalValue === v.state.doc.toString()) return;
    v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: externalValue } });
  }, [externalValue]);

  return (
    <div
      ref={host}
      className={`min-h-0 overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-[#282c34] ${className ?? ""}`}
    />
  );
}
