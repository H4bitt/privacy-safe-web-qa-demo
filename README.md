# Privacy-safe web QA demo

A small, reproducible proof of work for manual web QA, browser journey checks, API assertions, privacy-safe evidence, and useful failure classification.

This repository runs only against local fixtures. It does not test a production service, transmit personal information, create an account, place an order, connect a wallet, or perform any financial action.

## What it demonstrates

- Verifies a critical browser call to action without submitting personal data.
- Checks an API response for status, latency, and expected business content.
- Masks email addresses, phone-like values, and numeric codes in evidence.
- Classifies common availability, authentication, latency, browser, and handoff failures.
- Keeps the test environment and assertions small enough for another person to reproduce.

## Run locally

Requirements: Node.js 20+ and a Chromium-based browser.

```powershell
npm install
npx playwright install chromium
npm test
```

If Playwright Chromium is unavailable but a compatible browser is installed, set `PLAYWRIGHT_EXECUTABLE_PATH` to that browser before running the tests.

## Example result

```text
✔ API monitor validates content and latency
✔ browser monitor verifies the critical CTA without submitting personal data
✔ evidence is privacy-masked and failures are classified
tests 3
pass 3
fail 0
```

## Report format

Every finding should include:

- Environment and preconditions.
- Exact reproduction steps.
- Expected and actual behavior.
- Severity, confidence, and user impact.
- Sanitized evidence.
- Reproduction rate and retest status.
- Blocked or explicitly untested paths.

## Safety boundary

- Test public or explicitly authorized targets only.
- Never request seed phrases, private keys, passwords, two-factor codes, real card details, or unnecessary personal information.
- Never perform financial, destructive, wallet-signing, trading, or production actions without a written scope and exact limits.
- Send security-sensitive findings privately to the authorized owner.

## Availability

Small fixed-price QA and Spanish UX/localization reviews are available. Initial contact can be made through the GitHub profile associated with this repository. Payment details are exchanged privately only after the target, client identity, scope, and price are verified.
