import { NextResponse } from 'next/server';

import { readQueuedGenerationInputFileAssets } from '@/app/dashboard/studio/_lib/generation-job';
import { isOwnerEmail } from '@/lib/auth/owner';
import { getUser } from '@/lib/database/server-actions';
import { resolveStoredAssetUrl } from '@/lib/storage';

export const dynamic = 'force-dynamic';

type RouteContext = {
  params: Promise<{ assetIndex: string; generationId: string }>;
};

const PREVIEW_REDIRECT_HEADERS = {
  'cache-control': 'private, max-age=60, stale-while-revalidate=300',
  'referrer-policy': 'no-referrer',
  vary: 'Cookie',
};
const COPY_URL_HEADERS = {
  'cache-control': 'no-store',
  vary: 'Cookie',
};

export async function GET(request: Request, context: RouteContext) {
  const wantsJson = new URL(request.url).searchParams.get('format') === 'json';
  const { assetIndex, generationId } = await context.params;
  const parsedAssetIndex = Number(assetIndex);

  if (!Number.isInteger(parsedAssetIndex) || parsedAssetIndex < 0) {
    return imageUnavailableResponse(
      404,
      wantsJson,
      'Reference image not found.',
    );
  }

  const { supabase, user } = await getUser();

  if (!user) {
    return imageUnavailableResponse(
      401,
      wantsJson,
      'Sign in to copy this image URL.',
    );
  }

  if (!isOwnerEmail(user.email)) {
    return imageUnavailableResponse(
      404,
      wantsJson,
      'Reference image not found.',
    );
  }

  const { data: generation, error } = await supabase
    .from('generations')
    .select('metadata')
    .eq('id', generationId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (error || !generation) {
    return imageUnavailableResponse(
      404,
      wantsJson,
      'Reference image not found.',
    );
  }

  const asset = readQueuedGenerationInputFileAssets(generation.metadata)[
    parsedAssetIndex
  ];

  if (!asset) {
    return imageUnavailableResponse(
      404,
      wantsJson,
      'Reference image not found.',
    );
  }

  try {
    const previewUrl = await resolveStoredAssetUrl({
      publicUrl: asset.publicUrl,
      storagePath: asset.storagePath,
      storageProvider: asset.storageProvider,
    });

    if (!previewUrl) {
      return imageUnavailableResponse(
        404,
        wantsJson,
        'Stored reference image URL is unavailable.',
      );
    }

    if (wantsJson) {
      return NextResponse.json(
        { url: previewUrl },
        { headers: COPY_URL_HEADERS },
      );
    }

    return NextResponse.redirect(previewUrl, {
      headers: PREVIEW_REDIRECT_HEADERS,
      status: 307,
    });
  } catch {
    return imageUnavailableResponse(
      404,
      wantsJson,
      'Storage could not resolve this image URL.',
    );
  }
}

function imageUnavailableResponse(
  status: 401 | 404,
  wantsJson = false,
  message = 'Reference image is unavailable.',
) {
  if (wantsJson) {
    return NextResponse.json(
      { error: message },
      { headers: COPY_URL_HEADERS, status },
    );
  }

  return new Response(null, {
    headers: { 'cache-control': 'no-store', vary: 'Cookie' },
    status,
  });
}
