import React from "react";

const LoadingIndicator = () => {
  return (
    <div className="flex w-full justify-start">
      <div className="pl-2 pt-1">
        <span className="sr-only">AI 正在回复</span>
        <div className="loading-breath-dot" aria-hidden="true"></div>
      </div>
    </div>
  );
};

export default LoadingIndicator;
