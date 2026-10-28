import type { Metadata } from "next";
import { Suspense } from "react";
import LoginForm from "./LoginForm";

export const metadata: Metadata = { title: "Sign in - Code Hub" };

async function LoginFormWithNext({ searchParams }: Pick<PageProps<"/login">, "searchParams">) {
  const { next } = await searchParams;
  return <LoginForm next={typeof next === "string" ? next : undefined} />;
}

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <main className="relative flex min-h-dvh flex-1 items-center justify-center overflow-hidden bg-zinc-50 px-4 py-10 dark:bg-[#0b0b0d]">
      {/* Soft glow behind the card */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 size-[640px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-br from-blue-600/20 to-violet-600/20 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgb(127_127_127/0.07)_1px,transparent_1px),linear-gradient(to_bottom,rgb(127_127_127/0.07)_1px,transparent_1px)] bg-[size:44px_44px] [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]"
      />

      <div className="relative w-full max-w-[400px]">
        <div className="mb-7 flex flex-col items-center text-center">
          <span className="grid size-12 place-items-center rounded-xl bg-gradient-to-br from-blue-600 to-violet-600 text-lg font-bold text-white shadow-lg shadow-violet-600/30">
            {"{ }"}
          </span>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Welcome back</h1>
          <p className="mt-1 text-sm text-zinc-500">Sign in to Code Hub to continue</p>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white/80 p-6 shadow-xl shadow-black/5 backdrop-blur sm:p-7 dark:border-zinc-800 dark:bg-[#111113]/80 dark:shadow-black/40">
          <Suspense fallback={<p className="py-2 text-center text-sm text-zinc-500">Loading sign-in form...</p>}>
            <LoginFormWithNext searchParams={searchParams} />
          </Suspense>
        </div>

        <p className="mt-6 text-center text-xs text-zinc-500">Code Hub - Tools for developers</p>
      </div>
    </main>
  );
}
