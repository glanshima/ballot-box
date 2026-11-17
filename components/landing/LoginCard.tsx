'use client';

import Link from 'next/link';
import { startTransition, useActionState, useEffect, useState, type FormEvent } from 'react';
import { login } from '@/lib/actions/login';
import { BrandMark } from './BrandMark';
import { ArrowRightIcon, EyeIcon, EyeOffIcon, LockIcon, ShieldCheckIcon, UserIcon } from './icons';

/** Only the email is kept on this device — never the password. */
const REMEMBER_KEY = 'ballotbox:admin-email';

export type LoginNotice = 'expired' | 'changed' | null;

const NOTICES: Record<Exclude<LoginNotice, null>, { text: string; tone: 'info' | 'success' }> = {
  expired: { text: 'Your session has ended. Please sign in again.', tone: 'info' },
  changed: { text: 'Password changed. Sign in again with your new password.', tone: 'success' },
};

const fieldClass =
  'login-field w-full rounded-xl border border-slate-200 bg-white pl-12 pr-4 text-base text-slate-900 shadow-[0_1px_2px_rgba(10,42,102,0.05)] transition-[border-color,box-shadow] duration-200 ease-out placeholder:text-slate-400 focus:border-brand-azure focus:outline-none focus:ring-4 focus:ring-brand-azure/15 motion-reduce:transition-none';

export function LoginCard({ notice }: { notice: LoginNotice }) {
  const [state, formAction, pending] = useActionState(login, null);
  const [email, setEmail] = useState('');
  const [remember, setRemember] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [errorHidden, setErrorHidden] = useState(false);
  const [noticeHidden, setNoticeHidden] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(REMEMBER_KEY);
      if (saved) {
        setEmail(saved);
        setRemember(true);
      }
    } catch {
      // Storage can be unavailable in private or locked-down browsers.
    }
  }, []);

  useEffect(() => setErrorHidden(false), [state]);
  useEffect(() => setNoticeHidden(false), [notice]);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;

    const data = new FormData(e.currentTarget);
    try {
      if (remember) window.localStorage.setItem(REMEMBER_KEY, String(data.get('email') ?? '').trim());
      else window.localStorage.removeItem(REMEMBER_KEY);
    } catch {
      // Remembering the email is a convenience: never block sign-in for it.
    }

    setErrorHidden(false);
    startTransition(() => formAction(data));
  }

  const alert = state && !state.ok ? state.error : null;
  const noticeCopy = notice ? NOTICES[notice] : null;

  return (
    <section
      aria-labelledby="login-heading"
      className="login-card w-full max-w-[29rem] rounded-[1.75rem] bg-white shadow-card ring-1 ring-white/70 xl:flex xl:flex-col xl:justify-center"
    >
      <div className="login-badge mx-auto grid place-items-center rounded-full bg-gradient-to-b from-[#f2f7ff] to-[#dbe8ff] ring-1 ring-brand-sky">
        <BrandMark className="h-10 w-10" />
      </div>

      <h2 id="login-heading" className="text-center font-display text-[1.6rem] font-extrabold tracking-[-0.02em] text-brand-navy">
        Login to BallotBox
      </h2>
      <p className="mx-auto mt-2 max-w-[19rem] text-center text-[0.9rem] font-medium leading-relaxed text-slate-700">
        Sign in to create polls, view results and manage your polls.
      </p>

      {noticeCopy && !noticeHidden && (
        <div
          role="status"
          className={`mt-5 flex items-start gap-2 rounded-xl border px-3 py-2.5 text-[0.82rem] ${
            noticeCopy.tone === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : 'border-amber-200 bg-amber-50 text-amber-900'
          }`}
        >
          <p className="flex-1">{noticeCopy.text}</p>
          <button
            type="button"
            onClick={() => setNoticeHidden(true)}
            aria-label="Dismiss message"
            className="-mr-1 -mt-0.5 grid h-6 w-6 place-items-center rounded-full opacity-70 transition-[background-color,opacity] duration-200 ease-out hover:bg-black/5 hover:opacity-100 motion-reduce:transition-none"
          >
            <span aria-hidden="true" className="text-base leading-none">×</span>
          </button>
        </div>
      )}

      {alert && !errorHidden && (
        <div role="alert" className="mt-5 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-[0.82rem] text-red-800">
          <p className="flex-1">{alert}</p>
          <button
            type="button"
            onClick={() => setErrorHidden(true)}
            aria-label="Dismiss error"
            className="-mr-1 -mt-0.5 grid h-6 w-6 place-items-center rounded-full text-red-800/70 transition-colors duration-200 ease-out hover:bg-red-100 hover:text-red-900 motion-reduce:transition-none"
          >
            <span aria-hidden="true" className="text-base leading-none">×</span>
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} method="post" aria-busy={pending} className="login-form">
        <div className="login-fields">
          <div className="relative">
            <label htmlFor="admin-email" className="sr-only">Email Address</label>
            <UserIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-brand-royal/60" />
            <input
              id="admin-email"
              name="email"
              type="email"
              required
              maxLength={254}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email Address"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              className={fieldClass}
            />
          </div>

          <div className="relative">
            <label htmlFor="admin-password" className="sr-only">Password</label>
            <LockIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-brand-royal/60" />
            <input
              id="admin-password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              required
              maxLength={200}
              placeholder="Password"
              autoComplete="current-password"
              className={`${fieldClass} pr-14`}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              aria-pressed={showPassword}
              aria-controls="admin-password"
              className="absolute right-1.5 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full text-slate-500 transition-colors duration-200 ease-out hover:bg-brand-sky hover:text-brand-royal focus-visible:outline-brand-royal motion-reduce:transition-none"
            >
              {showPassword ? <EyeOffIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
            </button>
          </div>
        </div>

        <div className="login-remember flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <label htmlFor="remember-me" className="flex cursor-pointer select-none items-center gap-2 text-[0.85rem] font-medium text-slate-700">
            <input
              id="remember-me"
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="h-[1.15rem] w-[1.15rem] cursor-pointer rounded-[0.3rem] border-slate-300 accent-[#1B4DD8] focus-visible:outline-brand-royal"
            />
            Remember me
          </label>
          <Link
            href="/admin/forgot"
            className="rounded text-[0.85rem] font-semibold text-brand-royal transition-colors duration-200 ease-out hover:text-brand-navy hover:underline focus-visible:outline-brand-royal motion-reduce:transition-none"
          >
            Forgot Password?
          </Link>
        </div>

        <button
          type="submit"
          disabled={pending}
          className="login-submit group inline-flex w-full items-center justify-center gap-3 rounded-full bg-brand-royal text-[1rem] font-semibold text-white shadow-[0_18px_32px_-18px_rgba(27,77,216,0.85)] transition-[background-color,box-shadow,opacity] duration-300 ease-out hover:bg-[#153fb8] focus-visible:outline-brand-navy disabled:cursor-not-allowed disabled:opacity-70 motion-reduce:transition-none"
        >
          {pending ? (
            <>
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/40 border-t-white motion-reduce:animate-none" aria-hidden="true" />
              Signing in…
            </>
          ) : (
            <>
              Login
              <ArrowRightIcon className="h-5 w-5 transition-transform duration-300 ease-out group-hover:translate-x-0.5 motion-reduce:transition-none" />
            </>
          )}
        </button>
      </form>

      <div className="login-note border-t border-slate-100">
        <p className="flex items-start justify-center gap-2 text-center text-[0.76rem] font-medium leading-relaxed text-slate-600">
          <ShieldCheckIcon className="mt-px h-4 w-4 shrink-0 text-brand-azure" />
          <span>Voting? Open the personal link sent to you by your organiser.</span>
        </p>
      </div>
    </section>
  );
}
