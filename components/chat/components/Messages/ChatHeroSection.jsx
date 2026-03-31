import React from "react";
import { motion } from "framer-motion";

import TextType from "../../../TextType";
import InputBar from "../Input/InputBar";
import { TEXTTYPE_PROPS } from "../../utils/shared";

const ChatHeroSection = ({
  inp,
  setInp,
  handleSend,
  handleStop,
  mode,
  isLoading,
  enableImageUpload,
  pendingImage,
  handleImageUpload,
  clearPendingImage,
  isUploadingImage,
  suggestions,
}) => {
  return (
    <section className="flex min-h-[calc(100vh-220px)] flex-col items-center justify-center gap-8 text-center">
      <div className="text-3xl font-semibold text-gray-900 h-12 flex items-center justify-center select-none">
        <TextType {...TEXTTYPE_PROPS} />
      </div>
      <div className="w-full max-w-2xl px-4">
        <motion.div layoutId="input-container" className="w-full">
          <InputBar
            value={inp}
            onChange={setInp}
            onSend={handleSend}
            onStop={handleStop}
            placeholder={mode === "admin" ? "输入管理指令…" : "问我任何问题…"}
            autoFocus
            isLoading={isLoading}
            enableImageUpload={enableImageUpload}
            pendingImage={pendingImage}
            onImageUpload={handleImageUpload}
            onClearImage={clearPendingImage}
            isUploadingImage={isUploadingImage}
          />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.5 }}
          className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4 select-none"
        >
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              onClick={() => setInp(suggestion)}
              className="flex items-center justify-center rounded-full border border-gray-100 bg-gray-50/50 px-4 py-3 text-sm text-gray-600 transition-all hover:bg-white hover:shadow-md hover:border-gray-200 hover:-translate-y-0.5"
            >
              <span className="truncate">{suggestion}</span>
            </button>
          ))}
        </motion.div>
      </div>
    </section>
  );
};

export default ChatHeroSection;
