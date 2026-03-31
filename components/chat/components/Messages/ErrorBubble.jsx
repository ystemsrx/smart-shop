import React from "react";

const ErrorBubble = ({ message }) => (
  <div className="flex w-full justify-start">
    <div className="max-w-[80%] rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-relaxed text-red-700 shadow-sm">
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-red-500">Error</div>
      <div className="whitespace-pre-wrap">{message}</div>
    </div>
  </div>
);

export default ErrorBubble;
