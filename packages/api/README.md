# Accounts API

The Hono Worker behind [accounts.aidenjang.com](https://accounts.aidenjang.com). It serves the
identity API and built account UI from one origin, using D1 and a rate-limiter Durable Object.

See the [repository README](../../README.md) for setup and verification,
[architecture](../../ARCHITECTURE.md) for ownership and trust boundaries,
[API reference](../../docs/API.md) for the route contract, and [deployment](DEPLOY.md) for operations.

Sessions are opaque, hashed, and revocable. Apps validate server-side through the separately
published [auth-client](../client); a service outage is distinct from a missing session. Password,
Google, and passkey flows share recent-proof and ownership checks before sensitive changes.

### Replies to account emails

Outbound account messages retain the configured `EMAIL_FROM` sender and send replies
to `hello@aidenjang.com`, the public contact address. Subjects, preview text and plain
text belong to each email template. Delivery tests stub Resend rather than sending mail.
