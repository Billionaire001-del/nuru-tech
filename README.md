# WhatsApp Business Chatbot — Nuru Tech Executive Group

A configurable Node.js 20, Express and PostgreSQL starter for the **official WhatsApp Business Platform Cloud API**. Business profile defaults supplied so far: **Nuru Tech Executive Group**, **Tech and Automations**. The provided language value `Python` is preserved as configuration, but Python is a programming language—not a WhatsApp locale. Set `BUSINESS_LANGUAGES` to actual customer-facing languages (for example `en,sw`) before launch. The requested Node.js stack is retained.

This is an application scaffold, not a Meta-approved business account or a turnkey guarantee of compliance. You must supply credentials, finish Meta business verification/configuration, approve message templates, choose privacy terms, and validate flows against your own policies before production.

## Features

- Official Graph API send helpers for text, image, document, interactive reply buttons, interactive lists, approved templates, and read receipts.
- GET webhook challenge verification and POST HMAC-SHA256 signature verification against the exact raw request body.
- Incoming message persistence, message-ID deduplication, stateful menu/FAQ/lead/booking/order/human handoff flows.
- Optional conversational responses to arbitrary free-text questions through a configurable OpenAI-compatible provider; deterministic menu/form intents remain local.
- PostgreSQL-backed outbound outbox with `FOR UPDATE SKIP LOCKED`, bounded exponential retries, structured logs, and delivery tracking.
- Bearer-key protected admin APIs for leads, bookings, orders, conversations, analytics, status updates, and CSV export.
- Helmet, request limits, parameterized SQL, input validation, secrets from environment, health endpoint, Docker, CI tests.

## Architecture / structure

```text
src/
  config/index.js             validated env configuration
  db/pool.js, migrate.js      PostgreSQL pool and SQL migration runner
  middleware/metaWebhook.js   Meta challenge and HMAC verification
  routes/webhook.js           signed inbound webhook endpoint
  routes/admin.js             authenticated admin JSON/CSV APIs
  services/whatsapp.js        official Cloud API transport/payloads
  services/chatbot.js         business flow and conversation state
  services/aiResponder.js     optional free-text conversational replies
  services/outbox.js          retryable outbound send worker
  utils/logger.js             structured, redaction-aware logger
migrations/                   ordered PostgreSQL schema migrations
 tests/                       core unit tests
```

## Requirements and local setup

- Node.js 20+, npm, Docker Compose (or PostgreSQL 14+).
- A Meta developer app with WhatsApp product, an enabled phone number, a permanent/system-user access token, app secret, phone-number ID, and a public HTTPS webhook URL.

```bash
cp .env.example .env
# Edit .env with real values. Never commit it.
npm install
# For Compose: POSTGRES_PASSWORD=local-dev-only docker compose up --build
```

For running Node directly, start PostgreSQL and set `DATABASE_URL`, then:

```bash
npm run db:migrate
npm run dev
curl http://localhost:3000/health
```

The Compose application automatically runs migrations at startup. Set a strong `POSTGRES_PASSWORD`; the Compose default is for local development only. To expose local testing to Meta, use a controlled HTTPS tunnel and register its HTTPS callback URL; do not expose an unauthenticated development machine long-term.

## Environment variables

See `.env.example`. Required secrets are `META_APP_SECRET`, `META_VERIFY_TOKEN`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, and `ADMIN_API_KEY` (minimum 32 characters). Also configure `DATABASE_URL` and `DATABASE_SSL=true` for hosted PostgreSQL where required. Keep Meta tokens in the host's secret manager, never in GitHub source, image layers, or logs. `WHATSAPP_GRAPH_API_VERSION` should be set to a Graph API version supported by your Meta app at deployment time. Template language codes must match the language/locale of the approved template.

### Open-ended text responses

To let the bot answer arbitrary customer text, configure `AI_API_KEY`, `AI_MODEL`, and (if needed) `AI_BASE_URL` for a compatible chat-completions provider. Without both key and model, free-text fallback remains a short menu prompt and FAQ answers stay conservative. Set `BUSINESS_KNOWLEDGE` with verified facts (hours, products/services, location, policies); the assistant is instructed not to invent missing facts and to direct booking/order intent into deterministic flows. Only the latest free-text message (up to 1,000 characters) and configured business facts are sent to the provider; prior messages and sender phone numbers are not included. This third-party processing is opt-in, requires you to assess provider retention, privacy terms, lawful basis/consent and regional requirements, and must be disclosed appropriately to customers. If the provider fails, the bot falls back to the menu rather than blocking webhook processing.

`BUSINESS_TIMEZONE` defaults to UTC because no business location/timezone was supplied; set it to the business's actual IANA timezone. Booking examples accept ISO-8601 timestamps with an explicit offset, and the app stores UTC timestamps. Define your actual service hours, location, pricing, and policies in `src/services/chatbot.js` or move them to database-backed business settings before launch.

## Meta Cloud API configuration

1. In Meta for Developers, create/select a business app and add the WhatsApp product. Complete business verification and phone registration as Meta requires.
2. Create a least-privilege System User token with the WhatsApp permissions required for the phone number. Configure the value as `WHATSAPP_ACCESS_TOKEN`; protect/rotate it through your secrets manager.
3. In WhatsApp > Configuration, set the callback URL to `https://YOUR_HOST/webhooks/whatsapp` and the verify token to exactly `META_VERIFY_TOKEN`. Subscribe to the `messages` webhook field. Meta verifies the URL using `GET`; this service returns the challenge only for the matching token.
4. Configure the app's App Secret as `META_APP_SECRET`. The endpoint checks `X-Hub-Signature-256` using HMAC-SHA256 over the exact raw request bytes. Do not put JSON parsing middleware in front of this route.
5. Subscribe the app to the WhatsApp Business Account/phone number and send a real inbound test message. Check logs, `messages`, `conversations`, and the outbox.
6. Create and submit approved WhatsApp templates in WhatsApp Manager. The code provides `wa.template(to, name, language, components)` for sending approved templates. Replace any values with the exact approved template name, locale, and component parameters. Free-form replies are generally only allowed inside the customer-service window; use approved templates outside that window.

The service includes example payload builders but does not automatically send templates: template names and parameter schemas are business-specific and must exactly match templates approved by Meta. Booking requests and order requests are recorded as `requested`; an operator must verify availability/fulfillment and send a confirmation (preferably using an approved template). Order updates/reminders/follow-ups should likewise be sent only with the corresponding approved template outside the customer-service window.

## Bot conversation sample

```text
Customer: Hi
Bot: Welcome to Nuru Tech Executive Group. How can we help? [View options]
Customer: Request information
Bot: What is your full name?
Bot: What is your phone number?
Bot: What is your email address? (or type skip)
Bot: What city or area are you in?
Bot: Please describe what you need.
Bot: Thank you. Your request has been recorded and our team will follow up soon.
```

The menu has Request information, Book an appointment, Place an order, FAQs, and Talk to a person. FAQ answers are placeholders; adapt hours, location, pricing, and service details. The human handoff flags the conversation and responds that staff will follow up, but does not integrate with a live agent inbox. Build/assign that workflow operationally before claiming real-time handoff.

Order collection is a separate menu flow that records a product/service description, quantity (1–99), name, and follow-up phone number. It creates a requested order for staff review; inventory, pricing, tax, payment, fulfillment, and order-confirmation templates must be integrated for transactional use.

## Admin API

All routes below require `Authorization: Bearer $ADMIN_API_KEY`. Restrict access further using an identity-aware proxy/VPN and rotate the key. Responses contain personal information; do not expose these endpoints to browsers without adding proper user authentication, authorization, CSRF protections where applicable, and audit logging.

- `GET /admin/leads?limit=100`
- `PATCH /admin/leads/:id` with JSON `{"status":"contacted"}`; allowed: `new`, `contacted`, `qualified`, `converted`, `closed`.
- `GET /admin/bookings?limit=100`
- `PATCH /admin/bookings/:id` with JSON `{"status":"confirmed"}`; allowed: `requested`, `confirmed`, `cancelled`, `completed`.
- `GET /admin/orders?limit=100`
- `PATCH /admin/orders/:id` with JSON `{"status":"confirmed"}`; allowed: `requested`, `confirmed`, `fulfilled`, `cancelled`.
- `POST /admin/send-template` queues an already-approved template for a customer. Example body: `{"to":"15551234567","name":"booking_confirmation","language":"en_US","components":[]}`. Set `components` to exactly match the approved template schema; use templates for order updates, booking confirmations/reminders, and follow-ups as appropriate.
- `GET /admin/conversations?limit=100`
- `GET /admin/analytics` — message counts, active users (30 days), current-month leads/bookings/orders, repeated inbound text.
- `GET /admin/export/leads`, `/admin/export/bookings`, or `/admin/export/orders` — CSV download.

There is no web dashboard in this backend starter. Admin API key authentication is suitable only for trusted server-to-server use, not end-user dashboard sessions.

## Tests and quality

```bash
npm ci
npm run lint
npm test
```

Unit tests exercise raw-body signature checks, GET verification, Cloud API payloads, and simulated chatbot state transitions without calling Meta. The PostgreSQL integration test exercises lead, booking, and order persistence against a real database when `TEST_DATABASE_URL` is set; GitHub Actions starts a disposable PostgreSQL service for it. Locally, set `TEST_DATABASE_URL` to a dedicated disposable test database to enable that test. The app does not send live Meta requests during tests. Do not use production customer data in CI.

## Deployment (generic container host)

1. Provision a managed PostgreSQL instance with automated backups, TLS, restricted network access, and a dedicated database/user.
2. Build/deploy the Dockerfile from this repository to a container host (Render, Fly.io, Railway, AWS/GCP/Azure, etc.). Set secrets in the provider console, configure port 3000 or `PORT`, and expose `/health` for health checks.
3. Set `DATABASE_SSL=true` where your managed database requires TLS. The app pool uses certificate verification; install/configure your provider CA if needed.
4. Configure a stable HTTPS domain, then complete the Meta webhook steps above. Ensure inbound requests reach `/webhooks/whatsapp` without request-body mutation.
5. Set log retention/access controls, DB backups, alerting for repeated API failures and oldest pending outbox age. Test graceful deploys and DB restore procedures.
6. Run an end-to-end staging test: receive a message, exercise each flow, confirm outbound delivery status webhooks if you add them, verify admin access, and verify template sends outside the 24-hour window.

For production, split the outbox worker into a separate process if desired and add a dead-letter/replay admin process, WhatsApp delivery-status webhook handling, explicit consent/opt-out (`STOP`) handling, operational staff notifications, access audit trail, and template-backed confirmations. Ensure your chosen hosting provider supports persistent outbound HTTPS access to Graph API. Do not log full message content or expose PII in analytics.

## Privacy and data retention

This sample stores WhatsApp sender IDs, chat text for inbound messages, lead contact details, booking/order details, and basic timestamps. Collect only information needed to respond; add an appropriate privacy notice and lawful basis/consent where required. Configure `RETENTION_DAYS` to your approved policy. The setting documents intent but does **not** automatically delete records: implement and schedule a reviewed retention purge (including backups and logs) before launch. Add a verified access/deletion request process. Consider minimizing message bodies, encrypting database storage, limiting staff access, and defining deletion/backup expiry periods. Never send sensitive data in templates or logs.

## GitHub: initialize, create repo, push

Run from this project directory. Replace `YOUR_GITHUB_USER` with your account/organization. Create the empty GitHub repository first (for example with `gh repo create` below); ensure `gh auth login` is completed.

```bash
cd /home/ubuntu/whatsapp-business-chatbot
git init
git add .
git commit -m "Build WhatsApp Business Cloud API chatbot"
git branch -M main
gh repo create YOUR_GITHUB_USER/nuru-tech --public --source=. --remote=origin --push
```

If you created the empty repository in GitHub's web interface instead, use:

```bash
git remote add origin https://github.com/YOUR_GITHUB_USER/nuru-tech.git
git push -u origin main
```

Verify `.env` is ignored (`git status --short --ignored`) and never push credentials. Add GitHub Actions secrets only if future CI integration tests need them; current unit tests use dummy values.

## License

MIT; see `LICENSE`.
