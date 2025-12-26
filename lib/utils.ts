import PostalMime from "postal-mime";

export function formatTimeAgo(timestamp: string): string {
  const date = new Date(timestamp);
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

  if (seconds < 60) return `${seconds} seconds ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  return `${days} days ago`;
}

function _cleanText(text: string): string {
  return text
    .replace(/\r/g, "")
    .replace(/ +/g, " ")
    .replace(/ \n/g, "\n")
    .replace(/\n /g, "\n")
    .replace(/\n\n+/g, "\n")
    .trim();
}

export async function extractTextFromMime(content: string): Promise<string> {
  try {
    const parser = new PostalMime();
    const email = await parser.parse(content);

    // Return text content, fallback to HTML content with tags stripped
    if (email.text) {
      return _cleanText(email.text);
    }

    if (email.html) {
      return _cleanText(email.html.replace(/<[^>]*>/g, ""));
    }

    return "No readable content found";
  } catch (error) {
    console.error("Error parsing MIME:", error);
    return content;
  }
}
