# Customer email: Gmail sender

The `customer-email` Edge Function can send customer messages from **smagnoliamoving@gmail.com** through that Gmail account's authenticated SMTP connection. It uses `smtp.gmail.com:465` with TLS. The display name is "Southern Magnolia Movers"; the actual From address is the Gmail address. Reply-To is not used as a substitute.

## Commissioning

1. The Gmail account owner enables 2-Step Verification and creates a Google app password for this integration. Enter that password directly into the Supabase project's Edge Function secrets as `GMAIL_APP_PASSWORD`. Do not commit it to Git or send it in chat. If Google does not offer app passwords for this account, use a Google OAuth implementation instead.
2. Set `CUSTOMER_EMAIL_PROVIDER=gmail` in Edge Function secrets and deploy this function. Its default remains `resend` until the setting is changed. `CUSTOMER_EMAIL_FROM` is ignored in Gmail mode.
3. Use one controlled customer record with an email address the operator can inspect. Queue a single lifecycle message or retry one failed communication, then verify the received message's From address, content, and the `communications` row's `status=sent`, `provider=gmail`, `from_address`, and `provider_message_id`.
4. Inspect failures and `processing` rows before retrying historical messages. A `processing` row means the sender may have accepted the message before the function stopped; reconcile against the Gmail Sent folder and recipient inbox before changing its status. SMTP does not offer the Resend idempotency key used by the original provider.
5. Review the existing failed queue individually. Some records have no customer email, so a provider change alone cannot deliver them. Add valid addresses where appropriate and use the existing staff retry action after the controlled test.

The scheduled `process_queue` call runs every five minutes and claims each queued row by changing its status to `processing` before sending. Overlapping runs will skip a row already claimed. The function records `sent` or `failed` after the provider operation. An uncertain `processing` row is deliberately not retried automatically.

This function sends lifecycle messages from `communications`. Supabase Auth's login/invitation mail uses a separate SMTP configuration and is not changed here. Gmail sending limits and account policies apply. The old Resend path remains available by setting `CUSTOMER_EMAIL_PROVIDER=resend`; it requires `RESEND_API_KEY` and a verified `CUSTOMER_EMAIL_FROM`.
