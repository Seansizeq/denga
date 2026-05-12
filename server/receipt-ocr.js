const OCR_SPACE_ENDPOINT = 'https://api.ocr.space/parse/image';
const OCR_SPACE_TIMEOUT_MS = 22000;
const OCR_SPACE_PUBLIC_FALLBACK_KEY = 'helloworld';

const cleanProviderDetails = (raw) => {
  const txt = String(raw ?? '').trim();
  if (!txt) return '';
  if (txt.startsWith('<!DOCTYPE') || txt.startsWith('<html')) return 'Provider temporary HTML error page';
  return txt.slice(0, 240);
};

const isInvalidLanguageError = (raw) => /\bE201\b|invalid language/i.test(String(raw ?? ''));

const checkForError = (json) => {
  if (!json?.IsErroredOnProcessing) return null;
  const msg = Array.isArray(json.ErrorMessage)
    ? json.ErrorMessage.join('; ')
    : String(json.ErrorMessage ?? 'unknown OCR error');
  return { msg, details: String(json.ErrorDetails ?? '').slice(0, 240) };
};

const extractText = (json) =>
  Array.isArray(json?.ParsedResults)
    ? json.ParsedResults.map((row) => String(row?.ParsedText ?? '')).join('\n').trim()
    : '';

const callOcrSpace = async ({
  base64,
  mime,
  apiKey,
  language,
  fetchImpl = fetch,
  endpoint = OCR_SPACE_ENDPOINT,
  timeoutMs = OCR_SPACE_TIMEOUT_MS,
}) => {
  const fileMime = mime === 'jpg' ? 'jpeg' : mime;
  const fileBuffer = Buffer.from(base64, 'base64');
  const fileName = `receipt.${fileMime === 'jpeg' ? 'jpg' : fileMime}`;
  const fileBlob = new Blob([fileBuffer], { type: `image/${fileMime}` });
  const form = new FormData();
  if (language) form.append('language', language);
  form.append('OCREngine', '2');
  form.append('isOverlayRequired', 'false');
  form.append('detectOrientation', 'true');
  form.append('scale', 'true');
  form.append('isTable', 'true');
  form.append('file', fileBlob, fileName);

  const abort = new AbortController();
  const timeoutId = setTimeout(() => abort.abort(), timeoutMs);
  const res = await fetchImpl(endpoint, {
    method: 'POST',
    headers: { apikey: apiKey },
    body: form,
    signal: abort.signal,
  }).finally(() => {
    clearTimeout(timeoutId);
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw Object.assign(new Error(`HTTP ${res.status}`), {
      httpStatus: res.status,
      body: errBody,
      retryAfter: res.headers?.get?.('retry-after') ?? '',
    });
  }
  return res.json();
};

const mapProviderError = (providerError) => {
  const timedOut = /timed out/i.test(providerError.msg) || /\bE101\b/i.test(providerError.msg);
  return {
    status: timedOut ? 'timeout' : 'provider_error',
    code: timedOut ? 'OCR_TIMEOUT' : 'OCR_PROVIDER_ERROR',
    details: cleanProviderDetails(providerError.details),
    message: timedOut ? 'OCR provider timeout' : providerError.msg,
  };
};

const mapThrownError = (err) => {
  const status = typeof err?.httpStatus === 'number' ? err.httpStatus : 0;
  const details = cleanProviderDetails(err?.body || err?.message || String(err));
  if (status === 429) {
    const retryAfterMs = Math.max(1000, Number(err?.retryAfter || 0) * 1000 || 3000);
    return {
      status: 'rate_limited',
      code: 'OCR_RATE_LIMITED',
      details,
      retryAfterMs,
      message: 'OCR provider rate limited',
    };
  }
  if (err?.name === 'AbortError') {
    return {
      status: 'timeout',
      code: 'OCR_TIMEOUT',
      details,
      message: 'OCR provider timeout',
    };
  }
  return {
    status: 'unreachable',
    code: 'OCR_UNREACHABLE',
    details,
    message: 'OCR provider unreachable',
  };
};

export const scanReceiptTextWithOcrSpace = async ({
  base64,
  mime = 'jpeg',
  apiKey = process.env.OCR_SPACE_API_KEY || '',
  allowPublicFallback = process.env.ALLOW_PUBLIC_OCR_FALLBACK === '1',
  fetchImpl = fetch,
  endpoint = OCR_SPACE_ENDPOINT,
  timeoutMs = OCR_SPACE_TIMEOUT_MS,
  nowFn = () => Date.now(),
} = {}) => {
  const effectiveApiKey = apiKey || (allowPublicFallback ? OCR_SPACE_PUBLIC_FALLBACK_KEY : '');
  if (!effectiveApiKey) {
    return {
      status: 'misconfigured',
      code: 'OCR_NOT_CONFIGURED',
      details: 'OCR_SPACE_API_KEY is not configured on the server',
      message: 'Receipt OCR is not configured',
    };
  }

  const startedAt = nowFn();
  let usedFallbackLanguage = false;
  let json;
  try {
    json = await callOcrSpace({
      base64,
      mime,
      apiKey: effectiveApiKey,
      language: 'auto',
      fetchImpl,
      endpoint,
      timeoutMs,
    });
    let providerError = checkForError(json);
    if (providerError && isInvalidLanguageError(`${providerError.msg} ${providerError.details}`)) {
      usedFallbackLanguage = true;
      json = await callOcrSpace({
        base64,
        mime,
        apiKey: effectiveApiKey,
        language: '',
        fetchImpl,
        endpoint,
        timeoutMs,
      });
      providerError = checkForError(json);
    }
    if (providerError) {
      return { ...mapProviderError(providerError), meta: { usedFallbackLanguage, elapsedMs: nowFn() - startedAt } };
    }
  } catch (err) {
    const errBody = err && typeof err === 'object' && 'body' in err ? cleanProviderDetails(err.body) : '';
    if (isInvalidLanguageError(`${err instanceof Error ? err.message : String(err)} ${errBody}`)) {
      usedFallbackLanguage = true;
      try {
        json = await callOcrSpace({
          base64,
          mime,
          apiKey: effectiveApiKey,
          language: '',
          fetchImpl,
          endpoint,
          timeoutMs,
        });
        const providerError = checkForError(json);
        if (providerError) {
          return { ...mapProviderError(providerError), meta: { usedFallbackLanguage, elapsedMs: nowFn() - startedAt } };
        }
      } catch (fallbackErr) {
        return { ...mapThrownError(fallbackErr), meta: { usedFallbackLanguage, elapsedMs: nowFn() - startedAt } };
      }
    } else {
      return { ...mapThrownError(err), meta: { usedFallbackLanguage, elapsedMs: nowFn() - startedAt } };
    }
  }

  const text = extractText(json);
  if (!text) {
    return {
      status: 'no_text',
      code: 'NO_TEXT_DETECTED',
      text: '',
      meta: {
        usedFallbackLanguage,
        elapsedMs: nowFn() - startedAt,
        usedPublicFallback: !apiKey && allowPublicFallback,
      },
    };
  }

  return {
    status: 'ok',
    code: 'OK',
    text,
    meta: {
      usedFallbackLanguage,
      elapsedMs: nowFn() - startedAt,
      usedPublicFallback: !apiKey && allowPublicFallback,
    },
  };
};

export const receiptOcrConstants = {
  OCR_SPACE_ENDPOINT,
  OCR_SPACE_TIMEOUT_MS,
};
