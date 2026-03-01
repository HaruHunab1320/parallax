import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasAuth = request.cookies.get('parallax_auth')?.value === '1';

  // Authenticated user visiting /login → redirect to dashboard
  if (pathname === '/login' && hasAuth) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  // Unauthenticated user → redirect to /login
  if (!hasAuth) {
    const loginUrl = new URL('/login', request.url);
    if (pathname !== '/' && pathname !== '') {
      loginUrl.searchParams.set('redirect', pathname);
    }
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - /login (handled above explicitly)
     * - /_next (Next.js internals)
     * - /favicon.ico, /icons, /images (static assets)
     */
    '/((?!_next|login|favicon\\.ico|icons|images).*)',
  ],
};
