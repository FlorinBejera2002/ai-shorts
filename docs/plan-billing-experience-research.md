# Plan & billing experience research

Date: 2026-09-11

## Product direction

The authenticated billing page should behave like a calm financial control room, not a second marketing pricing page. Its first screen must answer four questions without interpretation:

1. Which plan is active?
2. How many credits remain and what can they produce?
3. When does the subscription renew or end?
4. Where can payment details, cancellation, and invoices be managed?

The visual hierarchy therefore puts the current commercial state first, plan comparison second, billing rules third, and invoice history last.

## Patterns reviewed

- [Anyhive](https://github.com/anyhive/anyhive) treats pricing, metering, entitlements, checkout, and the customer portal as one product surface. The useful pattern for Sneep Cut is to place quota context next to plan management rather than hiding it in a separate analytics page.
- [LastSaaS](https://github.com/jonradoff/lastsaas) exposes subscription plans, credit bundles, a dual credit balance, customer portal access, invoice history, and webhook-driven lifecycle events. It is a useful completeness checklist, not a visual template.
- [Stripe Supabase Subscription Kit](https://github.com/suleymansurucu/stripe-supabase-subscription-kit) reinforces that Stripe should remain the billing source of truth and the application should render a synchronized read model.
- [SaaS Interface billing gallery](https://saasinterface.com/pages/billing-plan/) and [Nicelydone billing gallery](https://nicelydone.club/pages/billing) show a consistent information order: current plan and next charge first, usage or allowance nearby, then plan changes and invoices.
- Public X/Twitter search was attempted directly and through indexed results. Direct search required authentication and indexed results did not provide decision-grade billing examples. No design decision relies on an unverifiable social screenshot.

## Stripe implementation requirements

Stripe's customer portal already covers payment methods, billing details, invoice access, cancellation, and plan changes. Sneep Cut should keep one explicit portal action rather than duplicating sensitive payment forms inside the app. See [Stripe customer portal](https://docs.stripe.com/customer-management) and [portal configuration](https://docs.stripe.com/customer-management/configure-portal).

Plan changes can create prorations. If Sneep Cut later moves plan switching into its own UI, it must preview the amount and effective date before confirmation and use pending updates so access changes only after successful payment. See [changing subscription prices](https://docs.stripe.com/billing/subscriptions/change-price) and [prorations](https://docs.stripe.com/billing/subscriptions/prorations).

Webhook synchronization remains mandatory for `customer.subscription.updated`, invoice payment events, cancellations, and customer billing-detail changes. See [customer portal integration](https://docs.stripe.com/customer-management/integrate-customer-portal).

## Implemented in this iteration

- Current plan, lifecycle status, renewal/end date, and portal action are grouped into one primary summary.
- Credit balance is translated into an approximate clip runway using the real 10-credit-per-requested-clip rule.
- The interface states that unused credits remain in the balance, matching the current product copy and webhook behavior.
- Plan cards include audience-oriented descriptions, clearer status badges, less cramped responsive breakpoints, and real Stripe catalog prices.
- A concise billing guide explains the unit cost, rollover policy, and the boundary between Sneep Cut and Stripe.
- Existing loading, checkout result, provider unavailable, empty invoice, responsive invoice, and unsafe-link states remain intact.

## Follow-up capabilities that require backend or product work

These should not be represented in the UI until their contracts exist:

- A credit transaction ledger with grant, spend, refund, top-up, and adjustment entries.
- A first-class credit-pack catalog and authenticated one-time checkout endpoint. The backend currently recognizes configured pack purchases in webhooks but does not expose a user-facing catalog or checkout flow.
- A billing-cycle usage endpoint if the product needs period consumption, forecasts, or threshold alerts. The current balance can roll over, so it must not be mislabeled as monthly usage.
- An in-app plan-change preview with proration, taxes, effective date, and payment-failure handling. Until then, changes belong in the Stripe portal.
- Billing analytics events for checkout opened/completed/cancelled, portal opened, and upgrade intent.
- Explicit dunning communication and recovery paths for `past_due`, `unpaid`, and `incomplete` subscriptions.

