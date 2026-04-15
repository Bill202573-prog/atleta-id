
## Plan: Audit and Sync April Payments

### Goal
Verify Asaas payment status for all 12 "a_vencer" charges and cross-check the 8 manual payments against Asaas to detect any payments that entered Asaas without being reflected in the app.

### Steps

1. **Create an audit edge function** (`audit-mensalidade-payments`)
   - Accepts an `escolinha_id` and `mes_referencia`
   - Fetches the school's `asaas_api_key` from `escola_cadastro_bancario`
   - For each mensalidade with an `asaas_payment_id`, calls the Asaas API to get the real status
   - Returns a comparison report: local status vs Asaas status, flagging mismatches
   - Automatically updates any mensalidade that shows as RECEIVED/CONFIRMED in Asaas but is still "a_vencer" locally

2. **Check the 8 manual-paid entries**
   - For the 8 athletes marked "pago" via manual, query Asaas to see if their original `asaas_payment_id` was also paid
   - If so, flag as "double entry" (paid in Asaas AND manually confirmed)

3. **Generate missing April mensalidades**
   - For the 7 athletes without April records, investigate why `generate-student-billing-asaas` skipped them
   - Create the missing records and generate PIX charges if appropriate

4. **Add a "Sync with Asaas" button** on the school financial page
   - Allows the admin to trigger a bulk verification of all pending payments against Asaas
   - Shows results inline with which ones were auto-confirmed

### Technical Details
- Edge function uses the school's sub-account API key (already fixed in `check-mensalidade-payment`)
- The Asaas payments list endpoint (`/v3/payments?customer=...`) can also be used to find payments not tracked in the system
- Files to modify: new edge function, `SchoolFinanceiroPage.tsx`, `useSchoolData.ts` or new hook

### Why this matters
- Prevents the admin from having to manually check each payment
- Catches any payments that went to Asaas but were never confirmed in the app
- Ensures financial reports are accurate
