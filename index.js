/**
 * ad-generator · cloudflare worker
 * ==================================================
 * week 1: scaffolding · health, templates, generate (stub)
 * week 2: actual generation pipeline plugged into /api/generate
 *
 * security defaults:
 *   - all API keys live in env (wrangler secret put …)
 *   - CORS locked to ALLOWED_ORIGINS only
 *   - body size & content-type validated server-side
 *   - SQL via prepared statements (D1)
 *   - error messages never leak internals
 * ==================================================
 */

// ============================================================
// CONFIG
// ============================================================

const ALLOWED_ORIGINS = [
  // production · update once GitHub Pages URL is finalized
  'https://vs041.github.io',
  // local dev
  'http://localhost:8000',
  'http://127.0.0.1:8000',
  'http://localhost:5500'
];

const TEMPLATES = [
  { id: 'festival',    name: 'Festival Sale',    icon: '🪔', desc: 'Diwali, Holi, Eid drops' },
  { id: 'launch',      name: 'Product Launch',   icon: '🚀', desc: 'New product reveal' },
  { id: 'discount',    name: 'Discount',         icon: '🏷️', desc: 'Flat-off, BOGO offers' },
  { id: 'arrival',     name: 'New Arrival',      icon: '✨', desc: 'Just-dropped collection' },
  { id: 'testimonial', name: 'Testimonial',      icon: '💬', desc: 'Customer review highlight' }
];

const SUPPORTED_LANGUAGES = ['en', 'hi'];
const MAX_BODY_SIZE = 6 * 1024 * 1024; // 6 MB · slightly above 5 MB image limit

// ============================================================
// MAIN HANDLER
// ============================================================

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return handleCors(origin);
    }

    // always attach CORS headers to response
    try {
      let response;
      switch (url.pathname) {
        case '/api/health':
          response = await handleHealth(request, env);
          break;
        case '/api/templates':
          response = await handleTemplates(request, env);
          break;
        case '/api/generate':
          response = await handleGenerate(request, env, ctx);
          break;
        default:
          response = jsonResponse({ error: 'not_found' }, 404);
      }
      return withCors(response, origin);
    } catch (err) {
      // never leak error internals to client
      console.error('[worker error]', err.message, err.stack);
      return withCors(jsonResponse({ error: 'internal_error' }, 500), origin);
    }
  }
};

// ============================================================
// ROUTES
// ============================================================

/**
 * GET /api/health
 * basic liveness check
 */
async function handleHealth(request, env) {
  if (request.method !== 'GET') {
    return jsonResponse({ error: 'method_not_allowed' }, 405);
  }
  return jsonResponse({
    status: 'ok',
    version: 'w1-scaffold',
    timestamp: new Date().toISOString()
  });
}

/**
 * GET /api/templates
 * returns the 5 ad templates
 */
async function handleTemplates(request, env) {
  if (request.method !== 'GET') {
    return jsonResponse({ error: 'method_not_allowed' }, 405);
  }
  return jsonResponse({ templates: TEMPLATES });
}

/**
 * POST /api/generate
 * ----------------------------------------------------
 * WEEK 1: stub · validates input, returns "not_implemented"
 * WEEK 2: full pipeline · bg-removal → AI bg → AI copy
 *
 * expected body (multipart/form-data):
 *   - product_photo: file (jpg/png, max 5 MB)
 *   - template: 'festival' | 'launch' | 'discount' | 'arrival' | 'testimonial'
 *   - language: 'en' | 'hi'
 *   - headline: string (optional, max 80 chars)
 *   - cta: string (max 30 chars)
 */
async function handleGenerate(request, env, ctx) {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'method_not_allowed' }, 405);
  }

  // body size guard · server-side hard limit
  const contentLength = parseInt(request.headers.get('Content-Length') || '0', 10);
  if (contentLength > MAX_BODY_SIZE) {
    return jsonResponse({ error: 'payload_too_large' }, 413);
  }

  // parse multipart form
  let form;
  try {
    form = await request.formData();
  } catch (err) {
    return jsonResponse({ error: 'invalid_form_data' }, 400);
  }

  // ---- validate fields ----
  const file = form.get('product_photo');
  const template = form.get('template');
  const language = form.get('language');
  const headline = (form.get('headline') || '').toString().trim();
  const cta = (form.get('cta') || '').toString().trim();

  if (!file || !(file instanceof File)) {
    return jsonResponse({ error: 'missing_product_photo' }, 400);
  }
  if (file.size > 5 * 1024 * 1024) {
    return jsonResponse({ error: 'file_too_large' }, 413);
  }
  if (!['image/jpeg', 'image/png'].includes(file.type)) {
    return jsonResponse({ error: 'invalid_file_type' }, 400);
  }

  // magic-byte server-side validation (defense in depth)
  const ok = await verifyImageMagicBytes(file);
  if (!ok) {
    return jsonResponse({ error: 'invalid_image_signature' }, 400);
  }

  if (!TEMPLATES.find((t) => t.id === template)) {
    return jsonResponse({ error: 'invalid_template' }, 400);
  }
  if (!SUPPORTED_LANGUAGES.includes(language)) {
    return jsonResponse({ error: 'invalid_language' }, 400);
  }
  if (headline.length > 80) {
    return jsonResponse({ error: 'headline_too_long' }, 400);
  }
  if (cta.length > 30) {
    return jsonResponse({ error: 'cta_too_long' }, 400);
  }

  // ---- prompt sanitization ----
  // user-controlled text gets stripped of suspicious patterns before
  // ever being fed to fal.ai or claude. blocks NSFW + injection attempts.
  if (containsBannedTokens(headline) || containsBannedTokens(cta)) {
    return jsonResponse({ error: 'content_policy' }, 400);
  }

  // ---- log generation attempt (D1) ----
  // even at week 1, log every attempt to track usage / spot anomalies
  const fingerprint = await fingerprintRequest(request);
  try {
    await env.DB.prepare(
      `INSERT INTO generations
       (fingerprint, template, language, file_size, file_type, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        fingerprint,
        template,
        language,
        file.size,
        file.type,
        'pending',
        new Date().toISOString()
      )
      .run();
  } catch (err) {
    // log failure shouldn't block · DB might not be set up yet in dev
    console.warn('[d1 log skipped]', err.message);
  }

  // ---- WEEK 1 STUB ----
  // pipeline arrives in week 2
  return jsonResponse(
    {
      status: 'not_implemented',
      message: 'Generation pipeline arrives in week 2.',
      received: {
        template,
        language,
        headline_provided: !!headline,
        cta,
        file_size: file.size,
        file_type: file.type
      }
    },
    501
  );
}

// ============================================================
// SECURITY HELPERS
// ============================================================

/**
 * verify the file actually starts with JPEG/PNG magic bytes
 * (don't trust the .type header — anyone can spoof it)
 */
async function verifyImageMagicBytes(file) {
  const head = await file.slice(0, 8).arrayBuffer();
  const arr = new Uint8Array(head);
  const isJpeg = arr[0] === 0xff && arr[1] === 0xd8 && arr[2] === 0xff;
  const isPng =
    arr[0] === 0x89 && arr[1] === 0x50 && arr[2] === 0x4e && arr[3] === 0x47 &&
    arr[4] === 0x0d && arr[5] === 0x0a && arr[6] === 0x1a && arr[7] === 0x0a;
  return isJpeg || isPng;
}

/**
 * extremely basic banned-token check
 * for week 2, replace with a proper moderation pass via Claude
 * (prompt: "is this ad copy safe-for-work and on-brand?")
 */
const BANNED_TOKENS = [
  'ignore previous', 'ignore the above', 'system prompt', 'assistant:',
  'naked', 'nude', 'nsfw', 'porn',
  'modi ', 'modi.', 'rahul gandhi', // public figures · avoid
];
function containsBannedTokens(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  return BANNED_TOKENS.some((t) => lower.includes(t));
}

/**
 * stable-ish anonymous fingerprint per request
 * cf-connecting-ip + user-agent, sha-256
 */
async function fingerprintRequest(request) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const ua = request.headers.get('User-Agent') || 'unknown';
  const raw = `${ip}::${ua}`;
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  return [...new Uint8Array(buf)]
    .slice(0, 16)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ============================================================
// CORS
// ============================================================

function handleCors(origin) {
  if (!origin || !ALLOWED_ORIGINS.includes(origin)) {
    return new Response(null, { status: 403 });
  }
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400'
    }
  });
}

function withCors(response, origin) {
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Vary', 'Origin');
  }
  return response;
}

// ============================================================
// JSON HELPER
// ============================================================

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}
