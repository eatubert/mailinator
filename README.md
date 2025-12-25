# Mailinator Alternative

A disposable email service built with Next.js, SST, and AWS. Provides temporary email addresses for testing and development purposes.

## Features

- **Inbound Email Processing**: Receives emails via AWS SES and stores them in S3 and DynamoDB
- **Email Search**: Search for emails by destination address with URL parameter support
- **Auto-Refresh**: Automatically refreshes email list every 60 seconds
- **Email Viewer**: View email content in both raw MIME format and extracted text
- **Auto-Expiration**: Configurable TTL for emails (default: 1 hour in DynamoDB) and S3 objects (default: 1 day)

## Architecture

- **Frontend**: Next.js 16 with React 19, Client Components, and Tailwind CSS 4
- **Backend**: AWS Lambda functions triggered by SES receipt rules
- **Storage**:
  - S3 for raw email content (configurable retention via S3_DAYS_TO_LIVE)
  - DynamoDB for email metadata (configurable TTL via DYNAMO_HOURS_TO_LIVE)
- **Email**: AWS SES for receiving emails with domain-based routing
- **Infrastructure**: SST v3 for infrastructure as code with environment-based resource management

## Prerequisites

- Node.js 20+ with pnpm
- AWS account
- Existing domain correctly configured in Route53
- AWS_PROFILE environment variable configured

## Getting Started

### Installation

```bash
pnpm install
```

### Development

Configure AWS credentials in ~/.aws/credentials.

Set the AWS_PROFILE environment variable to an existing profile in ~/.aws/credentials.

Copy .env.example to .env, and fill in the values.

- **DOMAIN_NAME**: The name of a domain correctly configured in Route53
- **S3_DAYS_TO_LIVE**: Number of days to keep emails in S3 (default: 1)
- **DYNAMO_HOURS_TO_LIVE**: Number of hours to keep email metadata in DynamoDB (default: 1)

The production environment _must_ be deployed before running dev. This is necessary for email configuration in AWS.

```bash
pnpm sstprod
```

Start the SST development environment (requires AWS_PROFILE):

```bash
pnpm sstdev
```

Open [http://localhost:3000](http://localhost:3000) to view the Next.js application.

## Infrastructure

The project uses SST v3 to manage AWS infrastructure with separate configurations for production and non-production stages:

- **S3 Bucket**: Stores raw email content with configurable lifecycle rule (S3_DAYS_TO_LIVE, default: 1 day)
- **DynamoDB Table**: Stores email metadata with TTL enabled (DYNAMO_HOURS_TO_LIVE, default: 1 hour)
  - Partition key: `destination`
  - Sort key: `timestamp`
- **Lambda Function**: Processes incoming emails, filters by domain, and stores metadata
  - Environment variables: `DOMAIN_NAME`, `DYNAMO_HOURS_TO_LIVE`
- **SES Receipt Rules**: Routes incoming emails to S3, then triggers Lambda (production only)
- **Route53**: MX record for email routing (production only)

### Stage-based Resource Management

- **Production**: Creates all resources with the configured domain name
- **Non-production**: References existing production resources using `sst.aws.*.get()`

### Email Flow

1. Email arrives at SES for the configured domain
2. SES stores raw email in S3 (`raw-emails/` prefix)
3. SES triggers Lambda function (Event invocation)
4. Lambda filters destinations matching the domain and extracts metadata
5. Lambda stores metadata in DynamoDB with TTL set to `expiresAt`
6. Frontend fetches email list from DynamoDB and displays in searchable table
7. User clicks email row to fetch and view raw content from S3
8. Email metadata expires after configured hours (DynamoDB TTL removes record)
9. Raw email deleted after configured days (S3 lifecycle rule)

## Usage

1. Navigate to the application (e.g., `https://mailinator.example.com`)
2. Enter an email address prefix (e.g., `test` for `test@mailinator.example.com`)
3. Click Search or press Enter
4. View received emails in the table (auto-refreshes every 60 seconds)
5. Click on any row to expand and view email content
6. Toggle between Text View and Raw View
7. Share specific searches via URL: `?account=test`

## Project Structure

```
├── app/
│   ├── api/
│   │   ├── email/route.ts      # Fetch single email from S3
│   │   └── emails/route.ts     # Query emails from DynamoDB
│   ├── globals.css             # Global styles
│   ├── layout.tsx              # Root layout
│   ├── loading.tsx             # Loading component
│   └── page.tsx                # Email viewer interface (client component)
├── components/
│   ├── EmailDetailPanel.tsx    # Email content viewer with tabs
│   ├── EmailTable.tsx          # Email list table with expand/collapse
│   └── SearchHeader.tsx        # Search input header
├── lib/
│   └── utils.ts                # Utility functions (MIME parsing, time formatting)
├── src/
│   └── email-processor.ts      # Lambda handler for incoming emails
├── types/
│   └── email.ts                # TypeScript type definitions
├── sst.config.ts               # Infrastructure configuration
└── package.json
```

## Environment Variables

### Build Time (.env)

- `DOMAIN_NAME` - Domain configured in Route53 (required for SST deployment)
- `S3_DAYS_TO_LIVE` - Days to keep emails in S3 (default: 1)
- `DYNAMO_HOURS_TO_LIVE` - Hours to keep email metadata in DynamoDB (default: 1)

### Runtime

The following AWS resources are automatically linked via SST:

- `Resource.MailBucket` - S3 bucket for email storage
- `Resource.MailTable` - DynamoDB table for email metadata

Lambda function environment variables:

- `DOMAIN_NAME` - Passed from build time configuration
- `DYNAMO_HOURS_TO_LIVE` - Passed from build time configuration

## Deployment

Deploy to AWS using SST:

```bash
# Deploy to production (required before dev can run)
pnpm sstprod

# Run locally for development
pnpm sstdev
```

**Important**: Production must be deployed first (once) as it creates the shared resources (S3 bucket, DynamoDB table, SES configuration) that development stages reference.

## Configuration

- Domain: Configured via `DOMAIN_NAME` in `.env`
- Email retention: Configurable via `DYNAMO_HOURS_TO_LIVE` (default: 1 hour)
- S3 retention: Configurable via `S3_DAYS_TO_LIVE` (default: 1 day)
- Stage web page domains:
  - Production: `DOMAIN_NAME`
  - Other stages: `{stage}.{DOMAIN_NAME}`

## License

MIT
