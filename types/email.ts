export interface Email {
  messageId: string;
  timestamp: string;
  source: string;
  sender: string;
  destination: string;
  s3Key: string;
  subject: string;
}
