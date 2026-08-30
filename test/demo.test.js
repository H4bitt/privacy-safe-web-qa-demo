const assert = require('node:assert/strict');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  classifyFailure,
  redact,
  runApiMonitor,
  runBrowserMonitor,
} = require('../src/monitor');

let server;
let baseUrl;

test.before(async () => {
  server = http.createServer((request, response) => {
    if (request.url === '/api/course') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ course: 'piano', bookable: true }));
      return;
    }
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end(`<!doctype html>
      <html lang="en">
        <head><title>Course booking</title></head>
        <body>
          <main>
            <h1>Online music course</h1>
            <button type="button" onclick="document.querySelector('form').hidden=false">Book a Free Demo</button>
            <form hidden><label>Phone <input aria-label="Phone" /></label></form>
          </main>
        </body>
      </html>`);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

test('API monitor validates content and latency', async () => {
  const result = await runApiMonitor({
    name: 'course-api',
    url: `${baseUrl}/api/course`,
    expectedStatuses: [200],
    maxLatencyMs: 1000,
    jsonEquals: { bookable: true },
  });
  assert.equal(result.passed, true);
  assert.equal(result.assertions.every((item) => item.passed), true);
});

test('browser monitor verifies the critical CTA without submitting personal data', async () => {
  const result = await runBrowserMonitor({
    name: 'booking-journey',
    url: baseUrl,
    steps: [
      { name: 'cta_visible', action: 'visible', role: 'button', accessibleName: 'Book a Free Demo' },
      { name: 'open_form', action: 'click', role: 'button', accessibleName: 'Book a Free Demo' },
      { name: 'phone_visible', action: 'visible', role: 'textbox', accessibleName: 'Phone' },
    ],
  }, { artifactsDir: path.join(os.tmpdir(), 'privacy-safe-web-qa-demo-artifacts') });
  assert.equal(result.passed, true);
  assert.equal(result.currentStep, 'phone_visible');
});

test('evidence is privacy-masked and failures are classified', () => {
  const output = redact('Parent +1 202 555 0199 used 839201 and parent@example.com');
  assert.equal(output.includes('parent@example.com'), false);
  assert.equal(output.includes('839201'), false);
  assert.equal(classifyFailure({ status: 503 }), 'api_or_backend');
  assert.equal(classifyFailure({ error: 'OTP provider timeout' }), 'latency_or_dependency');
  assert.equal(classifyFailure({ step: 'crm_handoff' }), 'crm_handoff');
});
