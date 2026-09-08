# ATLAS Readiness Checklist

Use this checklist to collect evidence for a real deployment. Checking a box
does not establish that a system is secure or prevents attacks.

- [ ] Each consequential action has an owner, domain, target, and permitted scope.
- [ ] Source identity, confidence, integrity, and actor type are recorded.
- [ ] Protected financial and telecom actions have an explicit narrow block rule.
- [ ] Unknown or insufficiently evidenced input defaults to quarantine.
- [ ] Quarantine release requires a named human reviewer and recorded decision.
- [ ] Block release is technically impossible in the enforcement boundary.
- [ ] Traces omit raw sensitive source content and hidden reasoning by default.
- [ ] Synthetic tests cover safe and malicious cases for every protected domain.
- [ ] Operational owners have reviewed retention, access, and incident procedures.
- [ ] Evidence has been tested against representative local workflows.

ATLAS v0.1 is a reference-policy demonstration. It is not proven prevention of
real attacks, fraud, or telecom incidents.
