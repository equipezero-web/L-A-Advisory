
# Security Policy

## Supported Versions

L&A Royal Advisory prioritizes security fixes for the version currently deployed.

| Version | Supported |
| ------- | --------- |
| Current deployed version | :white_check_mark: |
| Older versions | :x: |

Security fixes may be applied to older versions when necessary to address a significant vulnerability.

## Reporting a Vulnerability

We take the security of L&A Royal Advisory seriously, especially the protection of customer information, affiliate data, commissions, authentication credentials, and payment integrations.

### How to Report

Please report suspected vulnerabilities privately.

If private vulnerability reporting is enabled for this GitHub repository, use GitHub's private vulnerability reporting feature. Otherwise, contact the project maintainer through an established private communication channel.

Do not disclose vulnerabilities publicly before the maintainer has had a reasonable opportunity to investigate and address them.

### What to Include

When reporting a vulnerability, please provide:

- A clear description of the suspected vulnerability.
- The affected feature, endpoint, or component.
- Steps to reproduce the issue, if possible.
- The potential security impact.
- Supporting evidence that does not expose personal information, credentials, or confidential data.

Please do not include passwords, access tokens, Supabase secret keys, payment credentials, or unredacted customer records.

### Response and Resolution

The maintainer will make reasonable efforts to:

1. Acknowledge the report within 7 calendar days.
2. Assess the report's validity, severity, and potential impact.
3. Provide updates when meaningful progress is made.
4. Prioritize remediation according to the risk and complexity of the issue.

These response targets are intended as guidelines and are not a guaranteed service-level agreement.

If a report is accepted, the maintainer will evaluate and implement an appropriate fix. If it is declined, the reporter will be informed of the reasoning when reasonably possible.

### Scope

Security reports may concern, but are not limited to:

- Authentication and authorization failures.
- Unauthorized access to administrative functionality.
- Exposure of private affiliate information, including phone numbers, tax identifiers, and payment details.
- Incorrect affiliate commission calculations or unauthorized commission changes.
- Supabase Row Level Security (RLS) policies and database permissions.
- Insecure API endpoints, server-side functions, or webhook validation.
- Mercado Pago payment and webhook integration security.
- Exposure of API keys, tokens, or other secrets.
- Cross-site scripting, injection, and other vulnerabilities affecting the application.

### Responsible Disclosure

Please act in good faith, avoid accessing or modifying data that does not belong to you, and do not disrupt services or perform destructive testing.

Do not publish sensitive technical details or personal data in public issues or pull requests.

## Security Principles

L&A Royal Advisory aims to follow these security principles:

- Apply least-privilege access to administrative and affiliate operations.
- Enforce appropriate database permissions and Row Level Security (RLS).
- Keep Supabase service-role keys and other privileged credentials out of client-side code.
- Validate payment notifications and webhook authenticity before processing events.
- Verify authorization before accessing or modifying private affiliate, order, and commission records.
- Avoid exposing sensitive information in logs, error messages, or public responses.
- Review security implications before deploying changes.
- Preserve data integrity during updates, migrations, and maintenance.

## Acknowledgments

We appreciate responsible reports that help improve the security and reliability of L&A Royal Advisory.

