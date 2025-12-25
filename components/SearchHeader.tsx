import React from "react";

interface SearchHeaderProps {
  account: string;
  loading: boolean;
  onAccountChange: (value: string) => void;
  onSearch: () => void;
  inputRef?: React.RefObject<HTMLInputElement | null>;
}

export default function SearchHeader({
  account,
  loading,
  onAccountChange,
  onSearch,
  inputRef,
}: SearchHeaderProps) {
  const domain = process.env.NEXT_PUBLIC_DOMAIN_NAME;

  return (
    <header className="bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex items-center gap-4">
          <div className="flex-1 flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={account}
              onChange={(e) => onAccountChange(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onSearch()}
              placeholder="Enter email account (e.g., user)"
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="text-gray-500 self-center mr-10">
              {domain ? `@${domain}` : undefined}
            </div>
            <button
              onClick={onSearch}
              disabled={loading}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {loading ? "Searching..." : "Search"}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
