const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

function redact(value) {
  if (typeof value === 'string') {
    return value
      .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[REDACTED_EMAIL]')
      .replace(/\+?\d[\d\s()-]{7,}\d/g, '[REDACTED_PHONE]')
      .replace(/\b\d{4,8}\b/g, '[REDACTED_CODE]');
  }
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redact(item)]));
  }
  return value;
}

function classifyFailure({ status, error, step }) {
  const message = `${error || ''}`.toLowerCase();
  if (status && status >= 500) return 'api_or_backend';
  if (status && status >= 400) return 'request_or_authentication';
  if (message.includes('timeout')) return 'latency_or_dependency';
  if (message.includes('otp')) return 'otp_provider_or_flow';
  if (message.includes('crm') || step === 'crm_handoff') return 'crm_handoff';
  if (message.includes('locator') || message.includes('visible')) return 'frontend_or_rendering';
  return 'unknown_requires_triage';
}

async function runApiMonitor(config) {
  const startedAt = Date.now();
  try {
    const response = await fetch(config.url, {
      method: config.method || 'GET',
      headers: config.headers || {},
      signal: AbortSignal.timeout(config.timeoutMs || 5000),
    });
    const latencyMs = Date.now() - startedAt;
    const contentType = response.headers.get('content-type') || '';
    const body = contentType.includes('application/json')
      ? await response.json()
      : await response.text();
    const assertions = [
      {
        name: 'status',
        passed: (config.expectedStatuses || [200]).includes(response.status),
        actual: response.status,
      },
      {
        name: 'latency',
        passed: latencyMs <= (config.maxLatencyMs || 2000),
        actual: latencyMs,
      },
    ];
    for (const [field, expected] of Object.entries(config.jsonEquals || {})) {
      assertions.push({
        name: `json.${field}`,
        passed: body && body[field] === expected,
        actual: body && body[field],
      });
    }
    const passed = assertions.every((assertion) => assertion.passed);
    return redact({
      name: config.name,
      type: 'api',
      passed,
      latencyMs,
      assertions,
      classification: passed ? null : classifyFailure({ status: response.status }),
    });
  } catch (error) {
    return redact({
      name: config.name,
      type: 'api',
      passed: false,
      latencyMs: Date.now() - startedAt,
      error: error.message,
      classification: classifyFailure({ error: error.message }),
    });
  }
}

async function runBrowserMonitor(config, options = {}) {
  const artifactsDir = options.artifactsDir || path.resolve('artifacts');
  await fs.mkdir(artifactsDir, { recursive: true });
  const executablePath = options.executablePath || process.env.PLAYWRIGHT_EXECUTABLE_PATH;
  const browser = await chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
  });
  const page = await browser.newPage();
  const consoleErrors = [];
  const failedRequests = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(redact(message.text()));
  });
  page.on('requestfailed', (request) => {
    failedRequests.push(redact({ url: request.url(), error: request.failure()?.errorText }));
  });
  const startedAt = Date.now();
  let currentStep = 'navigation';
  try {
    await page.goto(config.url, {
      waitUntil: 'domcontentloaded',
      timeout: config.timeoutMs || 10000,
    });
    for (const step of config.steps || []) {
      currentStep = step.name;
      if (step.action === 'visible') {
        await page.getByRole(step.role, { name: step.accessibleName }).waitFor({ state: 'visible' });
      } else if (step.action === 'click') {
        await page.getByRole(step.role, { name: step.accessibleName }).click();
      } else if (step.action === 'text') {
        await page.getByText(step.value, { exact: step.exact ?? false }).waitFor({ state: 'visible' });
      }
    }
    const screenshot = path.join(artifactsDir, `${config.name}-success.png`);
    await page.screenshot({ path: screenshot, fullPage: true });
    return redact({
      name: config.name,
      type: 'browser',
      passed: true,
      latencyMs: Date.now() - startedAt,
      currentStep,
      screenshot,
      consoleErrors,
      failedRequests,
    });
  } catch (error) {
    const screenshot = path.join(artifactsDir, `${config.name}-failure.png`);
    await page.screenshot({ path: screenshot, fullPage: true }).catch(() => {});
    return redact({
      name: config.name,
      type: 'browser',
      passed: false,
      latencyMs: Date.now() - startedAt,
      currentStep,
      error: error.message,
      classification: classifyFailure({ error: error.message, step: currentStep }),
      screenshot,
      consoleErrors,
      failedRequests,
    });
  } finally {
    await browser.close();
  }
}

module.exports = {
  classifyFailure,
  redact,
  runApiMonitor,
  runBrowserMonitor,
};
