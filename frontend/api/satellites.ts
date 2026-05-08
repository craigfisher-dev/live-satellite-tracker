import { put, get } from '@vercel/blob';

export const config = {
  runtime: 'edge',
}

async function compress(data: string): Promise<ArrayBuffer> {
  const stream = new CompressionStream('gzip');
  const writer = stream.writable.getWriter();
  writer.write(new TextEncoder().encode(data));
  writer.close();
  return new Response(stream.readable).arrayBuffer();
}

export default async function handler() {
  const start = Date.now();

  try {
    // Try Blob first
    console.log('[satellites] Checking Blob cache...');
    const cached = await get('satellites-cache.gz', {
      access: 'private',
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });

    if (cached) {
      console.log(`[satellites] SOURCE: Blob cache hit (${Date.now() - start}ms)`);
      return new Response(cached.stream, {
        headers: {
          'Content-Type': 'application/json',
          'Content-Encoding': 'gzip',
          'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=86400',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    // Blob miss — fetch from CelesTrak
    console.log('[satellites] SOURCE: Blob miss, fetching from CelesTrak...');
    const fetchStart = Date.now();
    const res = await fetch(
      'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=JSON'
    );
    console.log(`[satellites] CelesTrak fetch: ${Date.now() - fetchStart}ms, status: ${res.status}`);

    if (!res.ok) {
      console.error(`[satellites] CelesTrak error: ${res.status}`);
      return new Response('Failed to fetch satellite data', { status: 502 });
    }

    const fullData = await res.json();
    console.log(`[satellites] Fetched ${fullData.length} satellites from CelesTrak`);

    const trimmedData = fullData.map((sat: any) => ({
      OBJECT_NAME: sat.OBJECT_NAME,
      OBJECT_ID: sat.OBJECT_ID,
      EPOCH: sat.EPOCH,
      MEAN_MOTION: sat.MEAN_MOTION,
      ECCENTRICITY: sat.ECCENTRICITY,
      INCLINATION: sat.INCLINATION,
      RA_OF_ASC_NODE: sat.RA_OF_ASC_NODE,
      ARG_OF_PERICENTER: sat.ARG_OF_PERICENTER,
      MEAN_ANOMALY: sat.MEAN_ANOMALY,
      EPHEMERIS_TYPE: sat.EPHEMERIS_TYPE,
      CLASSIFICATION_TYPE: sat.CLASSIFICATION_TYPE,
      NORAD_CAT_ID: sat.NORAD_CAT_ID,
      ELEMENT_SET_NO: sat.ELEMENT_SET_NO,
      REV_AT_EPOCH: sat.REV_AT_EPOCH,
      BSTAR: sat.BSTAR,
      MEAN_MOTION_DOT: sat.MEAN_MOTION_DOT,
      MEAN_MOTION_DDOT: sat.MEAN_MOTION_DDOT,
    }));

    const body = JSON.stringify(trimmedData);
    console.log(`[satellites] Uncompressed size: ${(body.length / 1024 / 1024).toFixed(2)}MB`);

    // Compress with gzip
    const compressStart = Date.now();
    const compressed = await compress(body);
    console.log(`[satellites] Compressed size: ${(compressed.byteLength / 1024 / 1024).toFixed(2)}MB (${Date.now() - compressStart}ms)`);

    // Store compressed in Blob
    console.log('[satellites] Storing in Blob...');
    const blobStart = Date.now();
    await put('satellites-cache.gz', compressed, {
      access: 'private',
      allowOverwrite: true,
      contentType: 'application/octet-stream',
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    console.log(`[satellites] Blob stored (${Date.now() - blobStart}ms)`);

    console.log(`[satellites] Total: ${Date.now() - start}ms`);
    return new Response(compressed, {
      headers: {
        'Content-Type': 'application/json',
        'Content-Encoding': 'gzip',
        'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=86400',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    console.error(`[satellites] Error: ${error} (${Date.now() - start}ms)`);
    return new Response('Error fetching satellite data', { status: 500 });
  }
}