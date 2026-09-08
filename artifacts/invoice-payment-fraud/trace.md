# ATLAS Decision Trace

- Scenario: `invoice-payment-fraud`
- Request: `invoice-payment-fraud-request`
- Decision: `block`
- Score: `160`
- Permitted scope: `none`

## Provenance

- Source: `synthetic-external-message-001` (external_message)
- Actor: `untrusted_external`
- Confidence: `untrusted`
- Integrity: `unverified`

## Normalized Action

- Domain: `invoice`
- Intent: `update_bank_details`
- Target: `synthetic-beneficiary-account`

## Triggered rules

- `R-INSUFFICIENT-EVIDENCE`
- `R-UNTRUSTED-EXTERNAL`
- `R-OUT-OF-SCOPE`
- `R-FINANCIAL-CHANGE`
