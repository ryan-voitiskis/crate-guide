# Security Policy

Crate Guide is a personal, non-commercial proof of concept maintained on a
best-effort basis. Responsible security reports are welcome.

## Reporting a vulnerability

Please report suspected vulnerabilities privately by emailing
[ryanvoitiskis@protonmail.com](mailto:ryanvoitiskis@protonmail.com). Do not put
exploitable details, secrets, personal data, or proof-of-concept code in a
public GitHub issue.

Include, where possible:

- the affected page, API, Edge Function, migration, or commit;
- the impact and the conditions needed to reproduce it;
- minimal, non-destructive reproduction steps;
- relevant logs or screenshots with secrets and personal data removed; and
- a safe way to contact you for follow-up.

The maintainer aims to acknowledge a useful report within 7 days and provide a
status update within 30 days. These are goals, not an SLA. There is no bug
bounty or guaranteed response or remediation timeline.

## Supported versions

There is no formal release or backport support policy. Reports should target
the current default branch or the official `crate.guide` deployment. Older
forks and self-hosted instances are maintained by their respective operators.

## Good-faith research

Keep testing proportionate and limited to accounts and data you control. Use
the smallest proof needed to demonstrate an issue, stop if you encounter other
people's data, and allow time for a fix before publishing details.

Do not:

- access, modify, retain, or disclose data that is not yours;
- degrade availability, perform denial-of-service testing, or generate
  high-volume automated traffic;
- use social engineering, phishing, physical attacks, or attacks on project
  providers and other third parties; or
- leave persistent access, upload malware, or exploit an issue beyond what is
  necessary to confirm it.

The maintainer does not intend to pursue action solely for good-faith research
that follows this guidance. This is not legal advice or a promise of immunity,
and it cannot authorize testing of third-party systems or waive applicable law.

For non-security bugs and feature requests, use the project's public GitHub
issues instead.
