// Query keys shared by more than one route. Client-safe: no server imports.

/** Billing status; the budgets page invalidates it because billing counts budgets. */
export const BILLING_QUERY_KEY = ["billing"] as const;
