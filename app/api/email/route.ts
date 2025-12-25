import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { NextResponse } from "next/server";
import { Resource } from "sst/resource";

const s3Client = new S3Client({});

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const s3Key = searchParams.get("s3Key");

  if (!s3Key) {
    return NextResponse.json(
      { error: "s3Key parameter is required" },
      { status: 400 }
    );
  }

  try {
    const response = await s3Client.send(
      new GetObjectCommand({
        Bucket: Resource.MailBucket.name,
        Key: s3Key,
      })
    );

    const emailContent = await response.Body?.transformToString();

    return NextResponse.json({ content: emailContent });
  } catch (error) {
    console.error("Error fetching email from S3:", error);
    return NextResponse.json(
      { error: "Failed to fetch email content" },
      { status: 500 }
    );
  }
}
