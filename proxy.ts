import type { NextRequest } from 'next/server';

import { updateSession } from '@/lib/database/proxy';

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|api(?:/|$)|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};

export async function proxy(request: NextRequest) {
  return updateSession(request);
}
