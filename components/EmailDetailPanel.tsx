interface EmailDetailPanelProps {
  emailContent: string | null;
  parsedText: string | null;
  activeTab: "raw" | "text";
  onTabChange: (tab: "raw" | "text") => void;
}

export default function EmailDetailPanel({
  emailContent,
  parsedText,
  activeTab,
  onTabChange,
}: EmailDetailPanelProps) {
  return (
    <div className="border border-gray-200 rounded-lg bg-white">
      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => onTabChange("text")}
          className={`px-4 py-2 text-sm font-medium ${
            activeTab === "text"
              ? "border-b-2 border-blue-500 text-blue-600"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Text View
        </button>
        <button
          onClick={() => onTabChange("raw")}
          className={`px-4 py-2 text-sm font-medium ${
            activeTab === "raw"
              ? "border-b-2 border-blue-500 text-blue-600"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Raw View
        </button>
      </div>

      {/* Content */}
      <div className="p-4">
        {emailContent === null ? (
          <div className="text-gray-500">Loading email content...</div>
        ) : (
          <pre className="whitespace-pre-wrap text-sm font-mono overflow-x-auto">
            {activeTab === "raw" ? emailContent : parsedText}
          </pre>
        )}
      </div>
    </div>
  );
}
