import type { Metadata } from "next";
import { login } from "./actions";

export const metadata: Metadata = { title: "Sign in · Job Radar" };

export default async function LoginPage({
  searchParams,
}: PageProps<"/login">) {
  const sp = await searchParams;
  const error = sp.error === "1";
  const next = typeof sp.next === "string" ? sp.next : "/";

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-screen-md flex-col justify-center px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Job Radar</h1>
      <form action={login} className="flex flex-col gap-3">
        <input type="hidden" name="next" value={next} />
        <label htmlFor="passcode" className="text-sm font-medium">
          Passcode
        </label>
        <input
          id="passcode"
          name="passcode"
          type="password"
          autoComplete="current-password"
          autoFocus
          required
          className="min-h-11 rounded-md border border-neutral-300 bg-white px-3 text-base outline-none focus:border-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:focus:border-neutral-200"
        />
        {error ? (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            Wrong passcode.
          </p>
        ) : null}
        <button
          type="submit"
          className="min-h-11 rounded-md bg-neutral-900 px-4 text-base font-medium text-white hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
        >
          Sign in
        </button>
      </form>
    </main>
  );
}
