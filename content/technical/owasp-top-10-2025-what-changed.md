---
title: "The OWASP Top 10:2025 Update: What Changed and Why It Matters"
description: "OWASP quietly replaced the 2021 Top 10 in November 2025. SSRF disappeared, misconfiguration jumped to #2, and supply chain got its own top-3 slot — here's the diff."
tags: ["security", "owasp", "appsec", "web-security", "supply-chain"]
date: "2026-07-02"
draft: false
lang: "en"
---

If you learned the OWASP Top 10 any time in the last four years, you learned the 2021 list. Broken Access Control at #1, Cryptographic Failures at #2, Injection at #3, SSRF tacked on at #10. That list is still everywhere — in blog posts, in security training decks, in interview questions.

It's also out of date. In November 2025, OWASP shipped the first revision since 2021. The methodology got bigger — 589 CWEs analyzed instead of 400, data from 2.8 million applications across 13 organizations — and the ranking moved in ways that aren't cosmetic. One category disappeared entirely. One jumped five spots. Two are brand new.

## The 2025 ranking, in full

1. **Broken Access Control** — a user can act outside their intended permissions: viewing another account's data, hitting an admin endpoint with no role check, editing an object they don't own just by changing an ID in the request.
2. **Security Misconfiguration** — insecure defaults left in place: an open S3 bucket, an admin console reachable from the internet, a debug endpoint that shipped to production, permissions broader than the job needs.
3. **Software Supply Chain Failures** — a compromise anywhere in how software gets built and delivered, not just a known-vulnerable library: a hijacked maintainer account, a poisoned build step, a malicious package published under a trusted name.
4. **Cryptographic Failures** — sensitive data exposed because it was never encrypted, encrypted with something weak, or encrypted correctly but with the keys mishandled.
5. **Injection** — untrusted input gets executed as code or a query instead of treated as data, because it wasn't validated or escaped — SQL injection is the classic case, but the same shape applies to OS commands, LDAP, and templates.
6. **Insecure Design** — the flaw is in the architecture, not a bug in the implementation. No amount of careful coding fixes a system that was never designed to prevent the abuse case in the first place.
7. **Authentication Failures** — weaknesses in login, session, or credential handling that let an attacker assume someone else's identity: weak password rules, session tokens that don't expire, no protection against credential stuffing.
8. **Software or Data Integrity Failures** — code or data trusted without verifying where it came from: unsigned auto-updates, a CI/CD pipeline anyone can push to, deserializing input from a source you don't control.
9. **Security Logging and Alerting Failures** — a breach happens and nobody notices, either because nothing was logged or because the logs exist and no one's watching them.
10. **Mishandling of Exceptional Conditions** — error handling that leaks internal state, or worse, logic that fails open under an unexpected condition instead of denying by default.

If you're pattern-matching against 2021, three things should stand out immediately: SSRF is gone, Security Misconfiguration moved way up, and there are two categories you won't recognize.

| 2021 rank | 2021 category | 2025 rank | 2025 category |
|---|---|---|---|
| 1 | Broken Access Control | 1 | Broken Access Control (now includes SSRF) |
| 2 | Cryptographic Failures | 2 | Security Misconfiguration ⬆ from #5 |
| 3 | Injection | 3 | Software Supply Chain Failures — new scope |
| 4 | Insecure Design | 4 | Cryptographic Failures ⬇ from #2 |
| 5 | Security Misconfiguration | 5 | Injection ⬇ from #3 |
| 6 | Vulnerable and Outdated Components | 6 | Insecure Design |
| 7 | Identification and Authentication Failures | 7 | Authentication Failures |
| 8 | Software and Data Integrity Failures | 8 | Software or Data Integrity Failures |
| 9 | Security Logging and Monitoring Failures | 9 | Security Logging and Alerting Failures |
| 10 | Server-Side Request Forgery | 10 | Mishandling of Exceptional Conditions — new |

## How the ranking is actually built

Worth pausing on this, because it explains why two brand-new categories exist. OWASP pulled data from 13 organizations — Accenture, Veracode, and Contrast Security among them — covering **2.8 million applications**, the largest data set the project has used. That maps to roughly 175,000 CVE records against 643 unique CWEs, with exploit and impact scores weighted by CVSS (both v2 and v3, since not every record has both).

That process covers **8 of the 10 categories**. The other 2 — Software Supply Chain Failures and Mishandling of Exceptional Conditions — didn't come from the CVE data at all. They were added from a **practitioner survey**, specifically because OWASP's own methodology notes the testing data lags reality: by the time a vulnerability class is common enough to show up in scan results, it's often been exploited in the wild for years already. Supply chain compromises and fail-open logic bugs rarely register as a clean CVE against a specific application, so the community vote is what actually put them on the list — not the CVE data.

That's the thing worth remembering when you read the ranking: it isn't "most common bug found by scanners." It's a blend of scanned vulnerability severity *and* what practitioners are seeing in the field that scanners haven't caught up to yet.

## What actually moved

**SSRF got absorbed, not dropped.** Server-Side Request Forgery was its own category in 2021 (#10). In 2025 it's folded into Broken Access Control. The reasoning tracks: SSRF is fundamentally a case of a server making a request it shouldn't have been allowed to make — which is an access control failure with extra steps. Splitting it out was arguably always a stretch.

**Security Misconfiguration jumped #5 → #2.** This is the biggest mover on the list, and it's the clearest signal of where real breaches happen now. As more of the stack moves to cloud-managed services — S3 buckets, IAM policies, Kubernetes RBAC, managed databases — the failure mode shifts from "we wrote vulnerable code" to "we left a default open." Misconfiguration doesn't require an attacker to find a bug; it requires them to find a setting nobody looked at.

**"Vulnerable and Outdated Components" became "Software Supply Chain Failures," and it more than doubled its rank (#6 → #3).** This isn't a rename for its own sake. The 2021 category was about using a dependency with a known CVE — something `npm audit` or Dependabot catches. The 2025 category is broader: it covers the build system and distribution infrastructure, not just the dependency list. That distinction matters, and it's the whole reason supply chain jumped into the top three. Keep reading — there's a case study below.

## The two new categories

**Software Supply Chain Failures (#3)** is new in scope even though it evolved from an existing 2021 entry. A vulnerable dependency with a CVE is a known, scannable risk. A compromised build pipeline, a hijacked maintainer account, or a malicious package published under a trusted name is not — nothing in your lockfile flags it, because nothing about the *declared* dependency changed. OWASP's data backs this up: this category has a lower incidence in testing data than most others, but the highest average exploit and impact scores of any category on the list. Rare, but when it hits, it hits everything downstream at once.

**Mishandling of Exceptional Conditions (#10)** is entirely new. It covers improper error handling, verbose error messages that leak internal state, and — the more interesting failure mode — logic that **fails open** instead of failing closed. These aren't exotic vulnerabilities; they're the kind of edge case that gets skipped in code review because "that path never happens" — until it does, usually under load or during an outage, which is exactly when an attacker is most likely to be probing.

```kotlin
// fails OPEN — a timed-out auth check silently grants access
fun isAuthorized(userId: UUID): Boolean {
  return try {
    authService.checkPermission(userId)
  } catch (e: Exception) {
    true // "auth service is flaky, don't block the user" — this is the bug
  }
}

// fails CLOSED — the safe default when the dependency is unavailable
fun isAuthorized(userId: UUID): Boolean {
  return try {
    authService.checkPermission(userId)
  } catch (e: Exception) {
    logger.warn("Auth check failed for $userId, denying by default", e)
    false
  }
}
```

The first version reads like a reasonable availability tradeoff in a design doc. In production, it means a network blip or a slow dependency call quietly turns off access control for however long the exception path is hit.

## Why supply chain earned a top-3 slot: the xz-utils backdoor

In February 2024, version 5.6.0 of `xz-utils` — a compression library baked into most Linux distributions — shipped with a backdoor. CVE-2024-3094, CVSS score 10.

The attack wasn't a rushed exploit. A contributor going by "Jia Tan" had been building credibility in the project since 2021: legitimate patches, responsive maintenance, gradually earning co-maintainer status while other accounts (likely sockpuppets) pressured the original maintainer to hand over more control. By the time the backdoor shipped, the attacker had two years of trust behind them.

The technical trick was just as deliberate. The malicious code never appeared in the public GitHub repository — it was hidden inside the release tarballs, the files most build systems actually pull from, not the source tree a human reviewer would audit. It activated selectively, targeting OpenSSH to allow pre-authentication remote code execution, and stayed dormant enough to avoid triggering obvious alarms.

It was caught by accident — a engineer at Microsoft noticed SSH logins taking slightly longer than expected and dug in. Without that, xz-utils 5.6.0 was on track to reach production Linux systems worldwide.

Nothing in a dependency scanner would have caught this. There was no known CVE to match against, because the vulnerability didn't exist in any version anyone had audited — it was introduced fresh, by a trusted identity, into the distribution artifact rather than the source. That's precisely the gap "Vulnerable and Outdated Components" didn't cover and "Software Supply Chain Failures" does.

## What to actually check for

The 2021 list still describes real risks — Injection and Cryptographic Failures didn't stop mattering, they just aren't where the *marginal* breach is happening anymore. If you're auditing a system against the current standard, the 2025 shifts point at three concrete things worth a second look:

- **Audit your cloud configs, not just your code.** IAM policies, storage bucket permissions, and default service settings deserve the same review rigor as a pull request — misconfiguration is now the #2 risk for a reason.
- **Treat your build pipeline as an attack surface.** Pinning dependency versions isn't enough if the artifact registry, CI runner, or release process itself can be compromised. Ask who can publish a release, not just who can merge a PR.
- **Decide what "failing closed" means for every trust boundary.** Auth checks, payment validation, permission gates — if the dependency they call is unavailable, does the system deny by default or proceed? If you don't know the answer, that's the gap A10 is naming.

The list changes every few years because the internet does. Worth checking which version you're actually defending against.

Sources:
- [OWASP Top 10:2025](https://owasp.org/Top10/2025/)
- [OWASP Top 10:2025 Methodology](https://owasp.org/Top10/2025/0x00_2025-Introduction/)
- [GitLab — OWASP Top 10 2025: What's changed and why it matters](https://about.gitlab.com/blog/2025-owasp-top-10-whats-changed-and-why-it-matters/)
- [Invicti — The xz-utils Backdoor: The Supply Chain RCE That Got Caught](https://www.invicti.com/blog/web-security/xz-utils-backdoor-supply-chain-rce-that-got-caught)
