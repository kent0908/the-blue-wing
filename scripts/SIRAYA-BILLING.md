# SIRAYA Console billing reconciliation

- Entry: `/crm/billing`, restricted by `requireAdmin` on every API request.
- Production configuration: `SIRAYA_CONSOLE_TOKEN` (Secret) and `SIRAYA_CONSOLE_ACCOUNT_ID` (the account ID, not its display name or inference key label).
- Reads only `/extapi/v1/accounts`, `/usage`, and `/usage/{request_id}`. Does not call generation or transfer endpoints.
- The live accounts endpoint returns `data.data`, while the documentation example shows a direct `data` array. Both explicitly validated shapes are supported.
- Vendor `cost` is already discounted. It is stored as `numeric(18,6)` and summed with SQL decimals. Never apply the platform discount again. Group currencies separately.
- Scan all pages until `has_more=false`. Never silently accept duplicated pages, invalid costs, missing prior records, or offset truncation. Failed scans do not add coverage.
- A single Request ID lookup does not establish full-period coverage. Date filters use Taipei days; API windows use UTC start-inclusive/end-exclusive seconds.
- Match a bill to a charge only by a captured upstream Request ID. Missing historical IDs remain unmatched; do not infer ownership from time or model.
- Separate billed retry attempts for one charge are summed. A local credit refund does not erase vendor spend. Conflicting Request IDs remain ambiguous.
- Repeated imports are idempotent by scope/account/request ID. Cost or currency changes create immutable revision records.
- Hourly cron rechecks the preceding seven days to catch delayed postings. Older periods need manual sync. A complete scan is a timestamped snapshot, not a promise that the vendor has finalized its invoice.
- Existing finance estimates remain distinct from vendor bills. Unknown costs are not zero, and invoice-only expenses are not covered by request-level logs.

Verification scripts:
`test-siraya-billing.cjs`, `test-billing-context.cjs`, `test-billing-route.cjs`, `test-billing-report.cjs`.
The SQL fixture tests use temporary tables in a transaction that is rolled back.
