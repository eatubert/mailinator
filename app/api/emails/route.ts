import { DynamoDBClient, QueryCommand } from "@aws-sdk/client-dynamodb";
import { NextResponse } from "next/server";
import { Resource } from "sst/resource";

if (process.env.AWS_PROFILE) {
  delete process.env.AWS_SECRET_ACCESS_KEY;
  delete process.env.AWS_SESSION_TOKEN;
  delete process.env.AWS_ACCESS_KEY_ID;
}
const dynamoClient = new DynamoDBClient({});

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const destination = searchParams.get("destination");

  if (!destination) {
    return NextResponse.json(
      { error: "destination parameter is required" },
      { status: 400 }
    );
  }

  try {
    const response = await dynamoClient.send(
      new QueryCommand({
        TableName: Resource.MailTable.name,
        KeyConditionExpression: "destination = :destination",
        ExpressionAttributeValues: {
          ":destination": { S: destination },
        },
        ScanIndexForward: false, // Reverse sort (newest first)
      })
    );

    const emails = (response.Items || []).map((item) => ({
      messageId: item.messageId?.S,
      timestamp: item.timestamp?.S,
      source: item.source?.S,
      sender: item.sender?.S,
      destination: item.destination?.S,
      s3Key: item.s3Key?.S,
      subject: item.subject?.S,
    }));

    return NextResponse.json(emails);
  } catch (error) {
    console.error("Error querying DynamoDB:", error);
    return NextResponse.json(
      { error: "Failed to fetch emails" },
      { status: 500 }
    );
  }
}
