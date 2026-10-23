/* eslint-disable @next/next/no-img-element -- previews of local blob/data URLs, next/image adds nothing here */
"use client";

import { useEffect, useState } from "react";
import PageHeader from "@/components/PageHeader";

type Mode = "to-svg" | "to-png";

const formatBytes = (n: number) => (n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(2)} MB`);

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  Object.assign(document.createElement("a"), { href: url, download: name }).click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("This file could not be read as an image."));
    img.src = src;
  });
}

const fileToDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });

const baseName = (name: string) => name.replace(/\.[^.]+$/, "") || "image";

/** Raster (PNG, JPG, WebP, GIF) to SVG: real vector tracing, or the exact pixels wrapped in an SVG. */
function ToSvg() {
  const [file, setFile] = useState<File | null>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [method, setMethod] = useState<"trace" | "embed">("trace");
  const [colors, setColors] = useState(16);
  const [detail, setDetail] = useState(5);
  const [smooth, setSmooth] = useState(0);
  const [maxSize, setMaxSize] = useState(800);
  const [svg, setSvg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function convert() {
    if (!src || !file) return;
    setBusy(true);
    setError(null);
    // Let the "Converting..." state paint before the tracer blocks the main thread.
    await new Promise((r) => setTimeout(r, 30));
    try {
      const img = await loadImage(src);
      if (method === "embed") {
        setSvg(
          `<svg xmlns="http://www.w3.org/2000/svg" width="${img.naturalWidth}" height="${img.naturalHeight}" viewBox="0 0 ${img.naturalWidth} ${img.naturalHeight}"><image width="${img.naturalWidth}" height="${img.naturalHeight}" href="${src}"/></svg>`,
        );
        return;
      }
      const scale = Math.min(1, maxSize / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth * scale));
      const h = Math.max(1, Math.round(img.naturalHeight * scale));
      const canvas = Object.assign(document.createElement("canvas"), { width: w, height: h });
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, w, h);
      const tracer = (await import("imagetracerjs")).default;
      // Higher detail means smaller error thresholds, so more (and smaller) path segments.
      const threshold = 1.1 - detail * 0.1;
      const out = tracer.imagedataToSVG(ctx.getImageData(0, 0, w, h), {
        numberofcolors: colors,
        ltres: threshold,
        qtres: threshold,
        pathomit: Math.round(12 - detail),
        blurradius: smooth,
        colorquantcycles: 3,
        roundcoords: 1,
        viewbox: true,
        desc: false,
      });
      setSvg(out);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
      <section className="card space-y-4">
        <FilePick
          accept="image/png,image/jpeg,image/webp,image/gif,image/bmp"
          label="PNG, JPG, WebP or GIF"
          onFile={async (f) => {
            setFile(f);
            setSvg(null);
            setSrc(await fileToDataUrl(f));
          }}
          file={file}
        />
        <fieldset>
          <legend className="label">Method</legend>
          <label className="mt-2 flex items-start gap-2 text-sm">
            <input type="radio" className="mt-1" checked={method === "trace"} onChange={() => setMethod("trace")} />
            <span>
              Trace to vectors
              <span className="block text-xs text-zinc-500">Real paths that scale cleanly. Best for logos and icons.</span>
            </span>
          </label>
          <label className="mt-2 flex items-start gap-2 text-sm">
            <input type="radio" className="mt-1" checked={method === "embed"} onChange={() => setMethod("embed")} />
            <span>
              Embed pixels
              <span className="block text-xs text-zinc-500">Exact image inside an .svg file. Doesn&apos;t make it scalable.</span>
            </span>
          </label>
        </fieldset>
        {method === "trace" && (
          <>
            <Slider label="Colors" value={colors} min={2} max={64} onChange={setColors} />
            <Slider label="Detail" value={detail} min={1} max={10} onChange={setDetail} />
            <Slider label="Smoothing (blur)" value={smooth} min={0} max={5} onChange={setSmooth} />
            <Slider label="Max size (px)" value={maxSize} min={200} max={2000} step={100} onChange={setMaxSize} />
          </>
        )}
        <button className="btn-primary w-full" disabled={!src || busy} onClick={convert}>
          {busy ? "Converting..." : "Convert to SVG"}
        </button>
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <Preview title={file ? `${file.name} · ${formatBytes(file.size)}` : "Original"}>
          {src && <img src={src} alt="Original" className="h-full max-h-[60vh] w-full object-contain [image-rendering:pixelated]" />}
        </Preview>
        <Preview
          title={svg ? `${file ? baseName(file.name) : "image"}.svg · ${formatBytes(new Blob([svg]).size)}` : "SVG"}
          actions={
            svg && (
              <>
                <button className="btn-secondary py-1 text-xs" onClick={() => navigator.clipboard.writeText(svg)}>
                  Copy code
                </button>
                <button
                  className="btn-primary py-1 text-xs"
                  onClick={() => downloadBlob(new Blob([svg], { type: "image/svg+xml" }), `${baseName(file?.name ?? "image")}.svg`)}
                >
                  Download
                </button>
              </>
            )
          }
        >
          {svg && (
            <img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`} alt="SVG result" className="h-full max-h-[60vh] w-full object-contain" />
          )}
        </Preview>
      </section>
    </div>
  );
}

/** SVG to PNG at any scale, with a transparent or solid background. */
function ToPng() {
  const [file, setFile] = useState<File | null>(null);
  const [svgText, setSvgText] = useState("");
  const [scale, setScale] = useState(2);
  const [background, setBackground] = useState<"transparent" | "white" | "black">("transparent");
  const [png, setPng] = useState<{ url: string; blob: Blob; w: number; h: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(
    () => () => {
      if (png) URL.revokeObjectURL(png.url);
    },
    [png],
  );

  async function convert() {
    setError(null);
    try {
      const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
      const root = doc.documentElement;
      if (root.nodeName !== "svg") throw new Error("This doesn't look like an SVG.");
      // Work out the intrinsic size: width/height attributes, else the viewBox, else 512.
      const vb = root.getAttribute("viewBox")?.split(/[\s,]+/).map(Number);
      let w = parseFloat(root.getAttribute("width") ?? "") || vb?.[2] || 512;
      let h = parseFloat(root.getAttribute("height") ?? "") || vb?.[3] || 512;
      if (!root.getAttribute("width") || !root.getAttribute("height")) {
        root.setAttribute("width", String(w));
        root.setAttribute("height", String(h));
      }
      if (!root.getAttribute("xmlns")) root.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      const blobUrl = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(root)], { type: "image/svg+xml" }));
      const img = await loadImage(blobUrl).finally(() => URL.revokeObjectURL(blobUrl));
      w = Math.round(w * scale);
      h = Math.round(h * scale);
      if (w * h > 64_000_000) throw new Error("That size is too large for the browser. Lower the scale.");
      const canvas = Object.assign(document.createElement("canvas"), { width: w, height: h });
      const ctx = canvas.getContext("2d")!;
      if (background !== "transparent") {
        ctx.fillStyle = background;
        ctx.fillRect(0, 0, w, h);
      }
      ctx.drawImage(img, 0, 0, w, h);
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG export failed."))), "image/png"),
      );
      setPng({ url: URL.createObjectURL(blob), blob, w, h });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
      <section className="card space-y-4">
        <FilePick
          accept=".svg,image/svg+xml"
          label="SVG file"
          file={file}
          onFile={async (f) => {
            setFile(f);
            setPng(null);
            setSvgText(await f.text());
          }}
        />
        <label className="block">
          <span className="label">...or paste SVG code</span>
          <textarea
            value={svgText}
            onChange={(e) => {
              setSvgText(e.target.value);
              setFile(null);
            }}
            placeholder='<svg xmlns="http://www.w3.org/2000/svg" ...'
            className="input mt-1 h-28 w-full resize-y font-mono text-xs"
          />
        </label>
        <fieldset>
          <legend className="label">Scale</legend>
          <div className="mt-2 flex gap-1.5">
            {[1, 2, 3, 4, 8].map((s) => (
              <button
                key={s}
                onClick={() => setScale(s)}
                className={`rounded-lg border px-2.5 py-1 text-sm ${s === scale ? "border-blue-600 bg-blue-600 text-white" : "border-zinc-300 dark:border-zinc-700"}`}
              >
                {s}x
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="label">Background</legend>
          <select value={background} onChange={(e) => setBackground(e.target.value as typeof background)} className="input mt-1 w-full py-1.5">
            <option value="transparent">Transparent</option>
            <option value="white">White</option>
            <option value="black">Black</option>
          </select>
        </fieldset>
        <button className="btn-primary w-full" disabled={!svgText.trim()} onClick={convert}>
          Convert to PNG
        </button>
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <Preview title={file ? `${file.name} · ${formatBytes(file.size)}` : "SVG"}>
          {svgText.trim().startsWith("<") && (
            <img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`} alt="SVG source" className="h-full max-h-[60vh] w-full object-contain" />
          )}
        </Preview>
        <Preview
          title={png ? `${png.w} x ${png.h} px · ${formatBytes(png.blob.size)}` : "PNG"}
          actions={
            png && (
              <button className="btn-primary py-1 text-xs" onClick={() => downloadBlob(png.blob, `${baseName(file?.name ?? "image")}.png`)}>
                Download
              </button>
            )
          }
        >
          {png && <img src={png.url} alt="PNG result" className="h-full max-h-[60vh] w-full object-contain" />}
        </Preview>
      </section>
    </div>
  );
}

function FilePick({ accept, label, file, onFile }: { accept: string; label: string; file: File | null; onFile: (f: File) => void }) {
  const [dragging, setDragging] = useState(false);
  return (
    <label
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const f = e.dataTransfer.files[0];
        if (f) onFile(f);
      }}
      className={`block cursor-pointer rounded-lg border-2 border-dashed p-4 text-center text-sm ${
        dragging ? "border-blue-500 bg-blue-50 dark:bg-blue-950/40" : "border-zinc-300 dark:border-zinc-700"
      }`}
    >
      <input
        type="file"
        accept={accept}
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />
      <span className="font-medium">{file ? file.name : "Drop or choose a file"}</span>
      <span className="mt-0.5 block text-xs text-zinc-500">{label}</span>
    </label>
  );
}

function Slider(props: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void }) {
  return (
    <label className="block text-sm">
      <span className="flex justify-between">
        <span className="label">{props.label}</span>
        <span className="tabular-nums text-zinc-500">{props.value}</span>
      </span>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step ?? 1}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
        className="mt-1 w-full accent-blue-600"
      />
    </label>
  );
}

function Preview({ title, actions, children }: { title: string; actions?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="card flex min-h-72 flex-col p-3 sm:p-4">
      <div className="mb-2 flex min-h-7 items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{title}</span>
        {actions}
      </div>
      <div className="grid flex-1 place-items-center overflow-hidden rounded-lg bg-[repeating-conic-gradient(#e4e4e7_0_25%,#fafafa_0_50%)] bg-[length:16px_16px] p-2 dark:bg-[repeating-conic-gradient(#27272a_0_25%,#18181b_0_50%)]">
        {children ?? <span className="text-xs text-zinc-500">Nothing yet</span>}
      </div>
    </div>
  );
}

export default function ImageConvertPage() {
  const [mode, setMode] = useState<Mode>("to-svg");
  return (
    <div className="px-4 py-6 sm:px-7">
      <PageHeader title="PNG / SVG Convert">
        Turn PNG, JPG or WebP images into SVG, or export SVG to PNG at any scale. Everything runs in your browser:
        images are never uploaded.
      </PageHeader>
      <div className="mb-5 inline-flex rounded-lg border border-zinc-200 p-1 dark:border-zinc-800">
        {(
          [
            ["to-svg", "PNG / JPG to SVG"],
            ["to-png", "SVG to PNG"],
          ] as const
        ).map(([m, label]) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              mode === m ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "text-zinc-600 dark:text-zinc-400"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {mode === "to-svg" ? <ToSvg /> : <ToPng />}
    </div>
  );
}
