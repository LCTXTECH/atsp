# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.0.x   | ✅ Yes    |

## Reporting a Vulnerability

**Do NOT open a public GitHub issue for security vulnerabilities.**

Report security issues directly to: **security@agentsentry.net**

Include:
- A description of the vulnerability and its potential impact
- Steps to reproduce the issue
- Any suggested mitigations

**Response SLA:** We will acknowledge receipt within 48 hours and provide a timeline for a fix within 7 days.

## Scope

This security policy covers:

- The `@agentsentry/atsp` npm package (`src/`)
- The ATSP v1.0 protocol specification (`SPEC.md`)
- The AgentSentry middleware implementation (`agentsentry.net`)

## Threat Model

ATSP is a client-side intent declaration library. Security considerations:

1. **intentHash integrity** — The `verifyIntentHash()` function detects post-creation tampering. Middleware MUST call this before evaluating policies. If verification fails, reject the declaration.

2. **Timestamp replay attacks** — Declarations expire after 60 seconds. Middleware MUST enforce this. Storing and replaying a valid declaration is not possible after expiry.

3. **IPI (Indirect Prompt Injection)** — The `ipiCleared` flag is self-reported by the agent. Middleware SHOULD increase risk scoring for declarations where `ipiCleared: false`. Actual IPI scanning is the agent framework's responsibility.

4. **This library does not make network calls.** It is purely a types + validation package. The network call to the AgentSentry middleware is made by the consuming application.

## Community

- Discord: https://discord.gg/aBX7vbzd
- Full spec: https://agentsentry.net/protocol/atsp
