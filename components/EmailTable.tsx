import { formatTimeAgo } from "@/lib/utils";
import { Email } from "@/types/email";
import React from "react";
import EmailDetailPanel from "./EmailDetailPanel";

interface EmailTableProps {
  emails: Email[];
  selectedEmail: string | null;
  emailContent: string | null;
  parsedText: string | null;
  activeTab: "raw" | "text";
  onRowClick: (email: Email) => void;
  onTabChange: (tab: "raw" | "text") => void;
}

export default function EmailTable({
  emails,
  selectedEmail,
  emailContent,
  parsedText,
  activeTab,
  onRowClick,
  onTabChange,
}: EmailTableProps) {
  if (emails.length === 0) {
    return (
      <div className="text-center text-gray-500 py-12">
        Enter an email address and click Search to view messages
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[300px]">
              Sender
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Subject
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[100px]">
              Received
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {emails.map((email) => (
            <React.Fragment key={email.messageId}>
              <tr
                onClick={() => onRowClick(email)}
                className="hover:bg-gray-50 cursor-pointer"
              >
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {email.sender}
                </td>
                <td className="px-6 py-4 text-sm text-gray-900">
                  {email.subject}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {formatTimeAgo(email.timestamp)}
                </td>
              </tr>
              {selectedEmail === email.messageId && (
                <tr>
                  <td colSpan={3} className="px-6 py-4 bg-gray-50">
                    <EmailDetailPanel
                      emailContent={emailContent}
                      parsedText={parsedText}
                      activeTab={activeTab}
                      onTabChange={onTabChange}
                    />
                  </td>
                </tr>
              )}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
