"use client";

import EmailTable from "@/components/EmailTable";
import SearchHeader from "@/components/SearchHeader";
import { extractTextFromMime } from "@/lib/utils";
import { Email } from "@/types/email";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export default function Home() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [account, setAccount] = useState("");
  const [emails, setEmails] = useState<Email[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedEmail, setSelectedEmail] = useState<string | null>(null);
  const [emailContent, setEmailContent] = useState<string | null>(null);
  const [parsedText, setParsedText] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"raw" | "text">("text");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();

    // Check if there's a search param in the URL
    const accountParam = searchParams.get("account");
    if (accountParam) {
      setAccount(accountParam);
      // Trigger search automatically
      performSearch(accountParam);
    }
  }, []);

  // Auto-refresh search every minute
  useEffect(() => {
    if (!account.trim()) return;

    const interval = setInterval(() => {
      performSearch(account, true); // Preserve selection on auto-refresh
    }, 60000); // 60 seconds

    return () => clearInterval(interval);
  }, [account, selectedEmail]);

  const performSearch = async (
    searchAccount: string,
    preserveSelection = false
  ) => {
    const searchParam = searchAccount.trim().split("@")[0];
    if (!searchParam) return;

    // Only show loading state for manual searches, not background refreshes
    if (!preserveSelection) setLoading(true);
    setHasSearched(true);

    const currentSelectedEmail = preserveSelection ? selectedEmail : null;

    if (!preserveSelection) {
      setSelectedEmail(null);
      setEmailContent(null);
    }

    try {
      const response = await fetch(
        `/api/emails?destination=${encodeURIComponent(searchParam)}`
      );
      const data = await response.json();
      setEmails(data);

      // If preserving selection, check if selected email still exists
      if (preserveSelection && currentSelectedEmail) {
        const emailStillExists = data.some(
          (email: Email) => email.messageId === currentSelectedEmail
        );
        if (!emailStillExists) {
          setSelectedEmail(null);
          setEmailContent(null);
          setParsedText(null);
        }
      }
    } catch (error) {
      console.error("Error fetching emails:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!account.trim()) return;

    // Update URL with search parameter
    router.push(`?account=${encodeURIComponent(account)}`);

    await performSearch(account);
  };

  const handleRowClick = async (email: Email) => {
    if (selectedEmail === email.messageId) {
      setSelectedEmail(null);
      setEmailContent(null);
      setParsedText(null);
      return;
    }

    setSelectedEmail(email.messageId);
    setEmailContent(null);
    setParsedText(null);

    try {
      const response = await fetch(
        `/api/email?s3Key=${encodeURIComponent(email.s3Key)}`
      );
      const data = await response.json();
      setEmailContent(data.content);

      // Parse the MIME content
      const text = await extractTextFromMime(data.content);
      setParsedText(text);
    } catch (error) {
      console.error("Error fetching email content:", error);
    }
  };

  const handleAccountChange = (value: string) => {
    setAccount(value);
    setHasSearched(false);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <SearchHeader
        account={account}
        loading={loading}
        onAccountChange={handleAccountChange}
        onSearch={handleSearch}
        inputRef={inputRef}
      />

      <main className="max-w-7xl mx-auto px-4 py-8">
        {loading ? (
          <div className="text-center text-gray-500 mt-8">Loading...</div>
        ) : !hasSearched ? (
          <div className="text-center text-gray-500 mt-8">
            Enter an email address and click Search to view messages
          </div>
        ) : emails.length === 0 ? (
          <div className="text-center text-gray-500 mt-8">Empty mailbox</div>
        ) : (
          <EmailTable
            emails={emails}
            selectedEmail={selectedEmail}
            emailContent={emailContent}
            parsedText={parsedText}
            activeTab={activeTab}
            onRowClick={handleRowClick}
            onTabChange={setActiveTab}
          />
        )}
      </main>
    </div>
  );
}
