import { NextResponse } from 'next/server';

import { isOwnerEmail } from '@/lib/auth/owner';
import { getUser } from '@/lib/database/server-actions';
import { resolveAssetUrl } from '@/lib/storage/asset-url';

export const dynamic = 'force-dynamic';

type RouteContext = {
  params: Promise<{ generationId: string }>;
};

const PREVIEW_REDIRECT_HEADERS = {
  'cache-control': 'private, max-age=60, stale-while-revalidate=300',
  'referrer-policy': 'no-referrer',
  vary: 'Cookie',
};

export async function GET(_request: Request, context: RouteContext) {
  const { generationId } = await context.params;
  const { supabase, user } = await getUser();

  if (!user) {
    return imageUnavailableResponse(401);
  }

  if (!isOwnerEmail(user.email)) {
    return imageUnavailableResponse(404);
  }

  const { data: generation, error } = await supabase
    .from('generations')
    .select('metadata,storage_provider')
    .eq('id', generationId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (error || !generation) {
    return imageUnavailableResponse(404);
  }

  const previewUrl = await resolveAssetUrl(generation);

  if (!previewUrl) {
    return imageUnavailableResponse(404);
  }

  return NextResponse.redirect(previewUrl, {
    headers: PREVIEW_REDIRECT_HEADERS,
    status: 307,
  });
}

function imageUnavailableResponse(status: 401 | 404) {
  return new Response(null, {
    headers: { 'cache-control': 'no-store', vary: 'Cookie' },
    status,
  });
}
