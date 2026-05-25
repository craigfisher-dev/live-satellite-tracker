import { put, get } from '@vercel/blob';
import { gzipSync } from 'zlib';

export const config = {
  runtime: 'nodejs',
}

export default async function handler(req: any, res: any) {
  const start = Date.now();

  try {
    console.log('[satellites] Checking Blob cache...');
    const cached = await get('satellites-cache.gz', {
      access: 'private',
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });

    let ageHours = '0';

    if (cached) {
      const ageMs = Date.now() - new Date(cached.blob.uploadedAt).getTime();
      ageHours = (ageMs / 1000 / 60 / 60).toFixed(1);
      const isExpired = ageMs > 24 * 60 * 60 * 1000;

      if (!isExpired) {
        console.log(`[satellites] SOURCE: Blob cache hit (${ageHours}h old, ${Date.now() - start}ms)`);
        const buffer = Buffer.from(await new Response(cached.stream).arrayBuffer());
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Encoding', 'gzip');
        res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=86400');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('x-cache-source', 'blob');
        return res.send(buffer);
      }

      console.log(`[satellites] Blob expired (${ageHours}h old), refreshing from CelesTrak...`);
    }

    console.log('[satellites] SOURCE: Fetching from CelesTrak...');
    const fetchStart = Date.now();
    const response = await fetch(
      'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=JSON'
    );
    console.log(`[satellites] CelesTrak fetch: ${Date.now() - fetchStart}ms, status: ${response.status}`);

    if (!response.ok) {
      console.error(`[satellites] CelesTrak error: ${response.status}`);
      if (cached) {
        console.log(`[satellites] SOURCE: Serving stale Blob cache (CelesTrak failed, ${ageHours}h old)`);
        const buffer = Buffer.from(await new Response(cached.stream).arrayBuffer());
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Encoding', 'gzip');
        res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=86400');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('x-cache-source', 'blob-stale');
        return res.send(buffer);
      }
      return res.status(502).send('Failed to fetch satellite data');
    }

    const fullData = await response.json();
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

    const compressStart = Date.now();
    const compressed = gzipSync(Buffer.from(body));
    console.log(`[satellites] Compressed size: ${(compressed.byteLength / 1024 / 1024).toFixed(2)}MB (${Date.now() - compressStart}ms)`);

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
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Encoding', 'gzip');
    res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=86400');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('x-cache-source', 'celestrak');
    return res.send(compressed);

  } catch (error) {
    console.error(`[satellites] Error: ${error} (${Date.now() - start}ms)`);
    return res.status(500).send('Error fetching satellite data');
  }
}