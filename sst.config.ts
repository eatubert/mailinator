// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./.sst/platform/config.d.ts" />

const RUNTIME = "nodejs22.x";

export default $config({
  app(input) {
    return {
      name: "mailinator",
      removal: input?.stage === "production" ? "retain" : "remove",
      protect: ["production"].includes(input?.stage),
      home: "aws",
    };
  },
  async run() {
    const { config } = await import("dotenv");
    config();

    const DOMAIN_NAME = process.env.DOMAIN_NAME;
    if (!DOMAIN_NAME) {
      throw new Error("DOMAIN_NAME environment variable is not set");
    }
    console.log(`Using DOMAIN_NAME: ${DOMAIN_NAME}`);

    // Default to 1 day if not set
    const S3_DAYS_TO_LIVE = process.env.S3_DAYS_TO_LIVE
      ? parseInt(process.env.S3_DAYS_TO_LIVE)
      : 1;
    if (isNaN(S3_DAYS_TO_LIVE) || S3_DAYS_TO_LIVE < 1) {
      throw new Error("S3_DAYS_TO_LIVE must be a positive integer");
    }

    const domain =
      $app.stage == "production" ? DOMAIN_NAME : `${$app.stage}.${DOMAIN_NAME}`;

    const resourceName = "mailcheff-emails";

    $transform(sst.aws.Function, (args) => {
      args.runtime = RUNTIME;
    });

    const mailBucket =
      $app.stage === "production"
        ? new sst.aws.Bucket("MailBucket", {
            policy: [
              {
                actions: ["s3:PutObject"],
                principals: [
                  { type: "service", identifiers: ["ses.amazonaws.com"] },
                ],
              },
            ],
            transform: {
              bucket: {
                bucketPrefix: undefined,
                bucket: resourceName,
              },
            },
          })
        : sst.aws.Bucket.get("MailBucket", resourceName);

    const mailTable =
      $app.stage === "production"
        ? new sst.aws.Dynamo("MailTable", {
            fields: {
              destination: "string",
              timestamp: "string",
            },
            primaryIndex: { hashKey: "destination", rangeKey: "timestamp" },
            ttl: "expiresAt",
            transform: {
              table: {
                name: "mailcheff-emails",
              },
            },
          })
        : sst.aws.Dynamo.get("MailTable", "mailcheff-emails");

    if ($app.stage === "production") {
      // Add lifecycle rule to delete objects after 1 day
      new aws.s3.BucketLifecycleConfiguration("MailBucketLifecycle", {
        bucket: mailBucket.name,
        rules: [
          {
            id: "delete-objects-after-days",
            status: "Enabled",
            expiration: {
              days: S3_DAYS_TO_LIVE,
            },
          },
        ],
      });

      new sst.aws.Email("Email", {
        sender: domain,
        dmarc: "v=DMARC1; p=reject; adkim=s; aspf=s;",
      });

      // Add MX record for inbound email
      const hostedZone = aws.route53.getZoneOutput({
        name: `${DOMAIN_NAME}.`,
      });

      const region = aws.getRegionOutput().region;

      new aws.route53.Record("MxRecord", {
        zoneId: hostedZone.zoneId,
        name: domain,
        type: "MX",
        ttl: 300,
        records: [$interpolate`10 inbound-smtp.${region}.amazonaws.com`],
      });

      // Lambda function to process incoming emails
      const emailProcessor = new sst.aws.Function("EmailProcessor", {
        handler: "src/email-processor.handler",
        link: [mailBucket, mailTable],
        environment: {
          DOMAIN_NAME: domain,
          DYNAMO_HOURS_TO_LIVE: process.env.DYNAMO_HOURS_TO_LIVE || "",
        },
      });

      // Grant SES permission to invoke the Lambda
      new aws.lambda.Permission("SesInvokeLambda", {
        action: "lambda:InvokeFunction",
        function: emailProcessor.arn,
        principal: "ses.amazonaws.com",
      });

      // Create SES Receipt Rule Set
      const ruleSet = new aws.ses.ReceiptRuleSet("MailReceiptRuleSet", {
        ruleSetName: `mailinator-${$app.stage}`,
      });

      // Activate the rule set
      new aws.ses.ActiveReceiptRuleSet("ActiveRuleSet", {
        ruleSetName: ruleSet.ruleSetName,
      });

      // Create Receipt Rule to store in S3 then trigger Lambda
      new aws.ses.ReceiptRule("IncomingEmailRule", {
        ruleSetName: ruleSet.ruleSetName,
        recipients: [domain],
        enabled: true,
        scanEnabled: true,
        s3Actions: [
          {
            bucketName: mailBucket.name,
            objectKeyPrefix: "raw-emails/",
            position: 1,
          },
        ],
        lambdaActions: [
          {
            functionArn: emailProcessor.arn,
            invocationType: "Event",
            position: 2,
          },
        ],
        stopActions: [
          {
            scope: "RuleSet",
            position: 3,
          },
        ],
      });
    }

    // WAF for the CloudFront distribution: rate limit per IP, then allow only
    // the paths the app actually serves and block everything else.
    const webAcl = $dev ? undefined : createWebAcl();

    new sst.aws.Nextjs("Mailinator", {
      domain,
      link: [mailBucket, mailTable],
      transform: {
        cdn: (args) => {
          if (!webAcl) return;
          args.transform = {
            ...args.transform,
            distribution: (distArgs) => {
              distArgs.webAclId = webAcl.arn;
            },
          };
        },
      },
    });

    function createWebAcl() {
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
        positionalConstraint: "EXACTLY" | "STARTS_WITH"
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
        method: "GET" | "HEAD" | "POST" | "PUT" | "DELETE" | "PATCH"
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
            // Lets automated tests skip the rate limit by sending the secret
            // x-waf-bypass header
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
              name: "RateLimitPerIp",
              priority: 1,
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
              priority: 2,
              action: { block: {} },
              statement: {
                andStatement: {
                  statements: [
                    pathMatch("/", "EXACTLY"),
                    methodMatch("POST"),
                  ],
                },
              },
              visibilityConfig: visibilityConfig("BlockPostRoot"),
            },
            {
              name: "AllowKnownPaths",
              priority: 3,
              action: { allow: {} },
              statement: {
                orStatement: {
                  statements: [
                    ...ALLOWED_EXACT_PATHS.map((p) => pathMatch(p, "EXACTLY")),
                    ...ALLOWED_PATH_PREFIXES.map((p) =>
                      pathMatch(p, "STARTS_WITH")
                    ),
                  ],
                },
              },
              visibilityConfig: visibilityConfig("AllowKnownPaths"),
            },
          ],
          visibilityConfig: visibilityConfig("MailinatorWaf"),
        },
        { provider: usEast1 }
      );

      // Log blocked requests only. WAF requires the "aws-waf-logs-" prefix.
      const wafLogGroup = new aws.cloudwatch.LogGroup(
        "MailinatorWafLogs",
        {
          name: `aws-waf-logs-mailinator-${$app.stage}`,
          retentionInDays: 30,
        },
        { provider: usEast1 }
      );

      new aws.wafv2.WebAclLoggingConfiguration(
        "MailinatorWafLogging",
        {
          resourceArn: webAcl.arn,
          logDestinationConfigs: [wafLogGroup.arn],
          loggingFilter: {
            defaultBehavior: "DROP",
            filters: [
              {
                behavior: "KEEP",
                requirement: "MEETS_ANY",
                conditions: [{ actionCondition: { action: "BLOCK" } }],
              },
            ],
          },
        },
        { provider: usEast1 }
      );

      return webAcl;
    }
  },
});
