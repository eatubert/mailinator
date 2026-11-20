// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./.sst/platform/config.d.ts" />

/**
 * WAF (AWS WAFv2 web ACL) for the Mailinator CloudFront distribution.
 *
 * Default action: BLOCK. A request is served only if an Allow rule matches.
 * Rules are evaluated in ascending priority order; the first terminating
 * match wins.
 *
 *   0  AllowE2EBypass   (only if WAF_BYPASS_TOKEN is set) Allow requests that
 *                       send the secret `x-waf-bypass` header. Skips every
 *                       rule below, including the geoblock, so automated
 *                       tests can run from anywhere.
 *   1  GeoBlockNonMX    Block requests whose origin country is not Mexico (MX).
 *   2  RateLimitPerIp   Block IPs over RATE_LIMIT requests per
 *                       RATE_LIMIT_WINDOW_SEC to "/" and "/api/*" (the paths
 *                       that hit the server Lambda). Static files are not counted.
 *   3  BlockPostRoot    Block `POST /` (drops server-action probes).
 *   4  AllowKnownPaths  Allow GET/etc. only to the exact paths in
 *                       ALLOWED_EXACT_PATHS and prefixes in ALLOWED_PATH_PREFIXES.
 *   -  Default          Block everything else.
 *
 * Allowed and blocked requests are logged to the CloudWatch log group
 * `aws-waf-logs-mailinator-<stage>` (us-east-1, 30 days); the bypass header
 * is redacted.
 *
 * AGENT INSTRUCTIONS: whenever you add, remove, reorder, or change a rule,
 * priority, allowed path, limit, or country in this file, update this comment
 * in the same change so it matches the code. Also update the WAF mentions in
 * README.md if they are affected.
 */

export function createWebAcl() {
  // Max page/API requests per IP per minute. 10 is the AWS minimum; a
  // visit uses ~2 plus 1 per auto-refresh and 1 per email opened.
  const RATE_LIMIT = 10;
  const RATE_LIMIT_WINDOW_SEC = 60;
  const BYPASS_TOKEN = process.env.WAF_BYPASS_TOKEN;

  const ALLOWED_EXACT_PATHS = [
    "/",
    "/api/emails",
    "/api/email",
    "/manifest.json",
    "/favicon.ico",
    "/icon0.svg",
    "/icon1.png",
    "/apple-icon.png",
    "/web-app-manifest-192x192.png",
    "/web-app-manifest-512x512.png",
  ];
  const ALLOWED_PATH_PREFIXES = ["/_next/static/"];

  const pathMatch = (
    searchString: string,
    positionalConstraint: "EXACTLY" | "STARTS_WITH",
  ) => ({
    byteMatchStatement: {
      searchString,
      positionalConstraint,
      fieldToMatch: { uriPath: {} },
      textTransformations: [{ priority: 0, type: "NONE" }],
    },
  });

  const visibilityConfig = (metricName: string) => ({
    cloudwatchMetricsEnabled: true,
    metricName,
    sampledRequestsEnabled: true,
  });

  const methodMatch = (
    method: "GET" | "HEAD" | "POST" | "PUT" | "DELETE" | "PATCH",
  ) => ({
    byteMatchStatement: {
      searchString: method,
      positionalConstraint: "EXACTLY" as const,
      fieldToMatch: { method: {} },
      textTransformations: [{ priority: 0, type: "NONE" }],
    },
  });

  // CLOUDFRONT-scoped web ACLs must be created in us-east-1
  const usEast1 = new aws.Provider("WafProvider", { region: "us-east-1" });

  const webAcl = new aws.wafv2.WebAcl(
    "MailinatorWaf",
    {
      scope: "CLOUDFRONT",
      defaultAction: { block: {} },
      rules: [
        // Lets automated tests skip the geoblock and rate limit by sending
        // the secret x-waf-bypass header
        ...(BYPASS_TOKEN
          ? [
              {
                name: "AllowE2EBypass",
                priority: 0,
                action: { allow: {} },
                statement: {
                  byteMatchStatement: {
                    searchString: BYPASS_TOKEN,
                    positionalConstraint: "EXACTLY",
                    fieldToMatch: { singleHeader: { name: "x-waf-bypass" } },
                    textTransformations: [{ priority: 0, type: "NONE" }],
                  },
                },
                visibilityConfig: visibilityConfig("AllowE2EBypass"),
              },
            ]
          : []),
        {
          // Only Mexico may reach the site
          name: "GeoBlockNonMX",
          priority: 1,
          action: { block: {} },
          statement: {
            notStatement: {
              statement: {
                geoMatchStatement: { countryCodes: ["MX"] },
              },
            },
          },
          visibilityConfig: visibilityConfig("GeoBlockNonMX"),
        },
        {
          name: "RateLimitPerIp",
          priority: 2,
          action: { block: {} },
          statement: {
            rateBasedStatement: {
              limit: RATE_LIMIT,
              aggregateKeyType: "IP",
              evaluationWindowSec: RATE_LIMIT_WINDOW_SEC,
              // Only count requests that hit the server Lambda; a cold
              // page load fetches ~15 static files that would trip it
              scopeDownStatement: {
                orStatement: {
                  statements: [
                    pathMatch("/", "EXACTLY"),
                    pathMatch("/api/", "STARTS_WITH"),
                  ],
                },
              },
            },
          },
          visibilityConfig: visibilityConfig("RateLimitPerIp"),
        },
        {
          // The UI never POSTs to "/": search is a client-side GET to
          // /api/emails and there are no forms or server actions. Block
          // POST / to drop server-action probes (e.g. the bogus
          // "cachefn" server reference) at the edge.
          name: "BlockPostRoot",
          priority: 3,
          action: { block: {} },
          statement: {
            andStatement: {
              statements: [pathMatch("/", "EXACTLY"), methodMatch("POST")],
            },
          },
          visibilityConfig: visibilityConfig("BlockPostRoot"),
        },
        {
          name: "AllowKnownPaths",
          priority: 4,
          action: { allow: {} },
          statement: {
            orStatement: {
              statements: [
                ...ALLOWED_EXACT_PATHS.map((p) => pathMatch(p, "EXACTLY")),
                ...ALLOWED_PATH_PREFIXES.map((p) =>
                  pathMatch(p, "STARTS_WITH"),
                ),
              ],
            },
          },
          visibilityConfig: visibilityConfig("AllowKnownPaths"),
        },
      ],
      visibilityConfig: visibilityConfig("MailinatorWaf"),
    },
    { provider: usEast1 },
  );

  // Log blocked and allowed requests. WAF requires the "aws-waf-logs-" prefix.
  const wafLogGroup = new aws.cloudwatch.LogGroup(
    "MailinatorWafLogs",
    {
      name: `aws-waf-logs-mailinator-${$app.stage}`,
      retentionInDays: 30,
    },
    { provider: usEast1 },
  );

  new aws.wafv2.WebAclLoggingConfiguration(
    "MailinatorWafLogging",
    {
      resourceArn: webAcl.arn,
      logDestinationConfigs: [wafLogGroup.arn],
      // Allowed requests are logged now, so keep the bypass token out
      redactedFields: [{ singleHeader: { name: "x-waf-bypass" } }],
      loggingFilter: {
        defaultBehavior: "DROP",
        filters: [
          {
            behavior: "KEEP",
            requirement: "MEETS_ANY",
            conditions: [
              { actionCondition: { action: "BLOCK" } },
              { actionCondition: { action: "ALLOW" } },
            ],
          },
        ],
      },
    },
    { provider: usEast1 },
  );

  return webAcl;
}
