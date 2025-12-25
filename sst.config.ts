// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./.sst/platform/config.d.ts" />

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
      new aws.s3.BucketLifecycleConfigurationV2("MailBucketLifecycle", {
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

      const region = aws.getRegionOutput().name;

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

    new sst.aws.Nextjs("Mailinator", {
      domain,
      link: [mailBucket, mailTable],
    });
  },
});
