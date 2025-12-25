import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { SESEvent } from "aws-lambda";
import { Resource } from "sst/resource";

const dynamoClient = new DynamoDBClient({});

export async function handler(event: SESEvent) {
  const DOMAIN_NAME = process.env.DOMAIN_NAME;
  if (!DOMAIN_NAME) {
    throw new Error("DOMAIN_NAME environment variable is required");
  }

  // Default to 1 hour if not set
  const hoursToLive = parseInt(process.env.DYNAMO_HOURS_TO_LIVE || "1", 10);
  const DYNAMO_HOURS_TO_LIVE = isNaN(hoursToLive) ? 1 : hoursToLive;

  console.log("Received SES event:", JSON.stringify(event, null, 2));

  for (const record of event.Records) {
    const sesMessage = record.ses;
    const messageId = sesMessage.mail.messageId;
    const timestamp = sesMessage.mail.timestamp;
    const source = sesMessage.mail.source;
    const subject = sesMessage.mail.commonHeaders?.subject || "No Subject";
    const sender = sesMessage.mail.commonHeaders?.from
      ? sesMessage.mail.commonHeaders.from.join(", ")
      : "Unknown Sender";
    const destinations = sesMessage.mail.destination;
    const s3Key = `raw-emails/${messageId}`;

    // Calculate expiration time (1 hour from now)
    const expiresAt =
      Math.floor(Date.now() / 1000) + DYNAMO_HOURS_TO_LIVE * 3600; // Current time in seconds + DYNAMO_HOURS_TO_LIVE hours

    console.log(
      `Storing email ${messageId} in DynamoDB for destinations:`,
      destinations
    );

    await Promise.all(
      destinations
        .filter((dest) => dest.endsWith(`@${DOMAIN_NAME}`))
        .map((dest) => dest.split("@")[0])
        .map(async (dest) => {
          console.log("Storing for destination:", dest);

          try {
            await dynamoClient.send(
              new PutItemCommand({
                TableName: Resource.MailTable.name,
                Item: {
                  messageId: { S: messageId },
                  timestamp: { S: timestamp },
                  sender: { S: sender },
                  destination: { S: dest },
                  source: { S: source },
                  s3Key: { S: s3Key },
                  subject: {
                    S: subject,
                  },
                  expiresAt: { N: expiresAt.toString() },
                },
              })
            );

            console.log(
              `Stored email ${messageId} in DynamoDB for ${dest} ${timestamp}`
            );
          } catch (error) {
            console.error(
              `Error storing email ${messageId} in DynamoDB for ${dest} ${timestamp}:`,
              error
            );
            throw error;
          }
        })
    );
  }

  return {
    disposition: "CONTINUE",
  };
}
