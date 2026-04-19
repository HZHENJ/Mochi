function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function parseRetryAfterMs(error) {
  const message = error && error.message ? error.message : String(error || "");
  const match = message.match(/Please try again in\s+([0-9.]+)s/i);
  if (!match) {
    return 0;
  }

  const seconds = Number(match[1]);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return 0;
  }

  return Math.ceil(seconds * 1000);
}

function isRateLimitError(error) {
  const message = error && error.message ? error.message : String(error || "");
  return /429|rate limit/i.test(message);
}

async function withLightRetry(operation, options = {}) {
  const maxAttempts = options.maxAttempts || 2;
  let attempt = 0;
  let lastError = null;

  while (attempt < maxAttempts) {
    attempt += 1;
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const shouldRetry = isRateLimitError(error) && attempt < maxAttempts;
      if (!shouldRetry) {
        throw error;
      }

      const retryAfterMs = parseRetryAfterMs(error) || 4000;
      await sleep(retryAfterMs);
    }
  }

  throw lastError;
}

module.exports = {
  sleep,
  parseRetryAfterMs,
  isRateLimitError,
  withLightRetry,
};
