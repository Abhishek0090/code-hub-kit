"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import { logout } from "@/app/login/actions";
import { CLOUD_CHANGED } from "@/lib/cloud/client";
import { realtimeEndpoints } from "@/lib/codeshare";

interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
  badge?: "live" | "ai" | "cloud";
}

const icon = (path: ReactNode) => (
  <svg viewBox="0 0 24 24" className="size-[18px] shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {path}
  </svg>
);

export const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: "Transfer",
    items: [
      { href: "/", label: "Project to Script", icon: icon(<path d="M4 7h16M4 12h10M4 17h7M17 14l3 3-3 3" />) },
      {
        href: "/upload",
        label: "Upload Files",
        icon: icon(<path d="M12 16V4M7 9l5-5 5 5M5 20h14" />),
      },
      {
        href: "/scripts",
        label: "Uploaded Files",
        badge: "cloud",
        icon: icon(<path d="M7 18h10.5a4.5 4.5 0 0 0 .5-8.97A6 6 0 0 0 6.5 10.03 4 4 0 0 0 7 18zM12 15v-5M9.5 12.5 12 10l2.5 2.5" />),
      },
    ],
  },
  {
    group: "Collaborate",
    items: [
      { href: "/codeshare", label: "Live Codeshare", badge: "live", icon: icon(<path d="M8 9l-4 3 4 3M16 9l4 3-4 3M13 6l-2 12" />) },
      { href: "/run", label: "Run Code", icon: icon(<path d="M7 5l12 7-12 7z" />) },
    ],
  },
  {
    group: "Convert",
    items: [
      {
        href: "/convert/ai",
        label: "AI Code Convert",
        badge: "ai",
        icon: icon(<path d="M12 3l2.5 5.5L20 11l-5.5 2.5L12 19l-2.5-5.5L4 11l5.5-2.5z" />),
      },
      { href: "/convert/format", label: "Format Convert", icon: icon(<path d="M4 7h11l-3-3M20 17H9l3 3" />) },
      {
        href: "/convert/image",
        label: "PNG / SVG Convert",
        icon: icon(
          <>
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <path d="M3 16l5-5 4 4 3-3 6 6" />
          </>,
        ),
      },
    ],
  },
];

const isActive = (pathname: string, href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

/** Polls the realtime server for how many codeshare rooms are open. */
function useLiveRooms(): number | null {
  const [rooms, setRooms] = useState<number | null>(null);
  useEffect(() => {
    let stop = false;
    const load = () =>
      fetch(realtimeEndpoints().stats)
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { rooms: number } | null) => !stop && setRooms(d ? d.rooms : null))
        .catch(() => !stop && setRooms(null));
    load();
    const t = setInterval(load, 15_000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, []);
  return rooms;
}

/** How many uploads are waiting in the cloud. Null when cloud upload is off or unreachable. */
function useCloudCount(): number | null {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    let stop = false;
    const load = () =>
      fetch("/api/scripts", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { uploads: unknown[] } | null) => !stop && setCount(d ? d.uploads.length : null))
        .catch(() => !stop && setCount(null));
    load();
    const t = setInterval(load, 60_000);
    window.addEventListener(CLOUD_CHANGED, load);
    return () => {
      stop = true;
      clearInterval(t);
      window.removeEventListener(CLOUD_CHANGED, load);
    };
  }, []);
  return count;
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const liveRooms = useLiveRooms();
  const cloudCount = useCloudCount();
  return (
    <nav className="flex h-full flex-col px-3.5 py-4">
      <Link href="/" onClick={onNavigate} className="flex items-center gap-2.5 px-2 pb-5">
        <span className="grid size-8 place-items-center rounded-lg bg-gradient-to-br from-blue-600 to-violet-600 text-sm font-bold text-white">
          {"{ }"}
        </span>
        <span>
          <b className="block leading-tight">Code Hub</b>
          <span className="text-xs text-zinc-500">Tools for developers</span>
        </span>
      </Link>
      {NAV.map(({ group, items }) => (
        <div key={group}>
          <p className="px-2.5 pb-1.5 pt-4 text-[11px] font-medium uppercase tracking-wider text-zinc-500">{group}</p>
          {items.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors ${
                  active
                    ? "bg-blue-50 text-blue-700 shadow-[inset_2px_0_0_var(--color-blue-500)] dark:bg-slate-800 dark:text-white"
                    : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-100"
                }`}
              >
                {item.icon}
                {item.label}
                {item.badge === "live" && liveRooms !== null && liveRooms > 0 && (
                  <span className="ml-auto rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] text-green-700 dark:bg-green-950 dark:text-green-300">
                    {liveRooms} live
                  </span>
                )}
                {item.badge === "cloud" && cloudCount !== null && cloudCount > 0 && (
                  <span className="ml-auto rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] text-blue-700 tabular-nums dark:bg-blue-950 dark:text-blue-300">
                    {cloudCount}
                  </span>
                )}
                {item.badge === "ai" && (
                  <span className="ml-auto rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] text-violet-700 dark:bg-violet-950 dark:text-violet-300">
                    AI
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      ))}
      <div className="mt-auto border-t border-zinc-200 px-2.5 pt-3.5 text-xs leading-relaxed text-zinc-500 dark:border-zinc-800">
        <p>
          <span
            className={`mr-1.5 inline-block size-[7px] rounded-full ${liveRooms === null ? "bg-zinc-400" : "bg-green-500"}`}
          />
          {liveRooms === null ? "Realtime server offline" : "Realtime server connected"}
        </p>
        <p className="mt-1">Rooms are never stored and vanish when everyone leaves.</p>
        <form action={logout} className="mt-3">
          <button
            type="submit"
            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 -mx-2 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-100"
          >
            {icon(<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l-5-5 5-5M5 12h11" />)}
            Sign out
          </button>
        </form>
      </div>
    </nav>
  );
}

/** Reads the URL, so it sits behind Suspense: dynamic routes (codeshare rooms) can still prerender their shell. */
function Breadcrumb() {
  const pathname = usePathname();
  const current = NAV.flatMap((g) => g.items).find((i) => isActive(pathname, i.href));
  return <span className="font-medium text-zinc-900 dark:text-zinc-100">{current?.label ?? "Tools"}</span>;
}

const sidebar = (onNavigate?: () => void) => (
  <Suspense fallback={null}>
    <Sidebar onNavigate={onNavigate} />
  </Suspense>
);

export default function DashboardShell({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="flex h-dvh overflow-hidden">
      <aside className="hidden w-[248px] shrink-0 border-r border-zinc-200 bg-zinc-50 lg:block dark:border-zinc-800 dark:bg-[#111113]">
        {sidebar()}
      </aside>

      {menuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal>
          <button className="absolute inset-0 bg-black/40" aria-label="Close menu" onClick={() => setMenuOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-[260px] border-r border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-[#111113]">
            {sidebar(() => setMenuOpen(false))}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-zinc-200 px-4 sm:px-7 dark:border-zinc-800">
          <button
            className="-ml-1 rounded-lg p-1.5 text-zinc-600 hover:bg-zinc-100 lg:hidden dark:text-zinc-300 dark:hover:bg-zinc-800"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
          >
            {icon(<path d="M4 7h16M4 12h16M4 17h16" />)}
          </button>
          <p className="text-sm text-zinc-500">
            Code Hub /{" "}
            <Suspense fallback={null}>
              <Breadcrumb />
            </Suspense>
          </p>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
