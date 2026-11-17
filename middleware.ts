import { NextResponse } from 'next/server';
import NextAuth from 'next-auth';
import { authConfig } from './auth.config';

const { auth } = NextAuth(authConfig);

const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const SUPER_ONLY = ['/admin/admins', '/admin/elections/new'];
const PUBLIC_AUTH_PAGES = new Set(['/admin/login', '/admin/forgot', '/admin/reset']);

/**
 * First line of defence for /admin and /api/admin. Every server action and
 * route handler ALSO re-checks the session and the caller's rights (lib/authz.ts).
 */
export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isApi = pathname.startsWith('/api/');

  // CSRF: state-changing requests must be same-origin (cookies are also SameSite=Lax).
  if (UNSAFE.has(req.method)) {
    const origin = req.headers.get('origin');
    if (!origin || origin !== req.nextUrl.origin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  const user = req.auth?.user;

  if (PUBLIC_AUTH_PAGES.has(pathname)) {
    // `expired` means the cookie survived but the database rejected it (password
    // or role change, deactivation). Without this exemption the login -> dashboard
    // and dashboard -> login redirects would loop.
    if (user && pathname === '/admin/login' && !req.nextUrl.searchParams.has('expired')) {
      return NextResponse.redirect(new URL('/admin', req.nextUrl));
    }
    return NextResponse.next();
  }

  if (!user) {
    if (isApi) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    return NextResponse.redirect(new URL('/', req.nextUrl));
  }

  if (SUPER_ONLY.some((p) => pathname === p || pathname.startsWith(`${p}/`)) && user.role !== 'super_admin') {
    return NextResponse.redirect(new URL('/admin', req.nextUrl));
  }

  return NextResponse.next();
});

export const config = { matcher: ['/admin/:path*', '/api/admin/:path*'] };
