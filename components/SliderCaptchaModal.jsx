import React, { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "framer-motion";
import { getApiBaseUrl } from "../utils/runtimeConfig";
import { getDeviceId } from "../utils/deviceId";

const SliderCaptcha = dynamic(() => import("rc-slider-captcha"), {
  ssr: false,
});

const DEFAULT_WIDTH = 320;
const DEFAULT_HEIGHT = 160;
const DEFAULT_PUZZLE_WIDTH = 60;
const DEFAULT_MIN_DURATION_MS = 220;
const CHALLENGE_DEDUP_WINDOW_MS = 300;
const MODAL_EASE = [0.22, 1, 0.36, 1];

const TIP_TEXT = {
  default: "请按住滑块，拖动完成拼图",
  moving: "继续拖动完成拼图",
  verifying: "校验中...",
  error: "校验失败",
  success: "校验成功",
  errors: "失败过多，请重试",
  loadFailed: "加载失败，请点击重试",
};

const sampleTrail = (trail) => {
  if (!Array.isArray(trail)) return [];
  return trail
    .filter((item) => Array.isArray(item) && item.length >= 2)
    .filter((_, idx) => idx % 2 === 0)
    .slice(0, 120)
    .map(([x, y]) => [Number(x), Number(y)]);
};

const normalizeImageUrl = (url) => {
  const text = String(url || "").trim();
  if (!text) return "";
  if (/^https?:\/\//i.test(text)) return text;
  if (text.startsWith("/public/")) {
    return `${getApiBaseUrl()}${text}`;
  }
  return text;
};

export default function SliderCaptchaModal({
  open,
  scene = "login",
  title = "安全验证",
  description = "请完成滑块验证后继续操作",
  onClose,
  onSuccess,
  onFailed,
}) {
  const normalizeInlineError = useCallback(
    (message) => {
      const text = String(message || "").trim();
      return text || "验证码校验失败，请重试";
    },
    [],
  );
  const actionRef = useRef();
  const latestChallengeIdRef = useRef("");
  const inFlightChallengeRequestRef = useRef(null);
  const recentChallengeResultRef = useRef({ expiresAt: 0, result: null });
  const challengeLoadingSeqRef = useRef(0);
  const [sliderWidth, setSliderWidth] = useState(DEFAULT_WIDTH);
  const [sliderHeight, setSliderHeight] = useState(DEFAULT_HEIGHT);
  const [puzzleWidth, setPuzzleWidth] = useState(DEFAULT_PUZZLE_WIDTH);
  const [minDuration, setMinDuration] = useState(DEFAULT_MIN_DURATION_MS);
  const [loadingChallenge, setLoadingChallenge] = useState(false);
  const [challengeError, setChallengeError] = useState("");
  const [inlineError, setInlineError] = useState("");
  const [summaryText, setSummaryText] = useState("");
  const hasOpenedRef = useRef(false);

  const discardChallenge = useCallback(
    async (challengeId) => {
      const challengeToken = String(challengeId || "").trim();
      if (!challengeToken) return;
      try {
        await fetch(`${getApiBaseUrl()}/auth/captcha/discard`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Device-ID": getDeviceId(),
          },
          credentials: "include",
          body: JSON.stringify({
            challenge_id: challengeToken,
            scene,
          }),
        });
      } catch (_err) {
        // 最终会由服务端定时清理兜底，这里仅做最佳努力回收。
      }
    },
    [scene],
  );

  const releaseCurrentChallenge = useCallback(
    (challengeId = latestChallengeIdRef.current) => {
      const currentId = String(challengeId || "").trim();
      if (!currentId) return;
      if (currentId === latestChallengeIdRef.current) {
        latestChallengeIdRef.current = "";
      }
      void discardChallenge(currentId);
    },
    [discardChallenge],
  );

  const requestChallenge = useCallback(async () => {
    const now = Date.now();
    const recentResult = recentChallengeResultRef.current;
    if (recentResult.result && now < recentResult.expiresAt) {
      return recentResult.result;
    }
    if (inFlightChallengeRequestRef.current) {
      return inFlightChallengeRequestRef.current;
    }

    const requestTask = (async () => {
      const requestSeq = ++challengeLoadingSeqRef.current;
      setLoadingChallenge(true);
      setChallengeError("");
      const previousChallengeId = latestChallengeIdRef.current;
      latestChallengeIdRef.current = "";
      if (previousChallengeId) {
        // 旧挑战回收不阻塞新挑战生成，避免串行等待带来的额外延迟。
        void discardChallenge(previousChallengeId);
      }
      try {
        const response = await fetch(
          `${getApiBaseUrl()}/auth/captcha/challenge`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Device-ID": getDeviceId(),
            },
            credentials: "include",
            body: JSON.stringify({ scene }),
          },
        );
        const result = await response.json();
        if (!response.ok || !result?.success) {
          throw new Error(result?.message || "获取验证码失败");
        }

        const payload = result?.data || {};
        const slider = payload?.slider || {};
        const challengeId = String(payload?.challenge_id || "").trim();
        const nextBgUrl = normalizeImageUrl(payload?.bg_url);
        const nextPuzzleUrl = normalizeImageUrl(payload?.puzzle_url);

        if (!challengeId || !nextBgUrl || !nextPuzzleUrl) {
          throw new Error("验证码挑战数据不完整，请重试");
        }

        latestChallengeIdRef.current = challengeId;
        setInlineError("");
        setSliderWidth(Number(slider?.width || DEFAULT_WIDTH));
        setSliderHeight(Number(slider?.height || DEFAULT_HEIGHT));
        setPuzzleWidth(Number(slider?.puzzle_width || DEFAULT_PUZZLE_WIDTH));
        setMinDuration(
          Number(slider?.min_duration_ms || DEFAULT_MIN_DURATION_MS),
        );
        const challengeResult = { bgUrl: nextBgUrl, puzzleUrl: nextPuzzleUrl };
        recentChallengeResultRef.current = {
          expiresAt: Date.now() + CHALLENGE_DEDUP_WINDOW_MS,
          result: challengeResult,
        };
        return challengeResult;
      } catch (err) {
        latestChallengeIdRef.current = "";
        setChallengeError(err?.message || "获取验证码失败，请重试");
        throw err;
      } finally {
        if (
          typeof window !== "undefined" &&
          typeof window.requestAnimationFrame === "function"
        ) {
          window.requestAnimationFrame(() => {
            window.requestAnimationFrame(() => {
              if (challengeLoadingSeqRef.current === requestSeq) {
                setLoadingChallenge(false);
              }
            });
          });
        } else {
          if (challengeLoadingSeqRef.current === requestSeq) {
            setLoadingChallenge(false);
          }
        }
      }
    })();

    inFlightChallengeRequestRef.current = requestTask;
    try {
      return await requestTask;
    } finally {
      if (inFlightChallengeRequestRef.current === requestTask) {
        inFlightChallengeRequestRef.current = null;
      }
    }
  }, [discardChallenge, scene]);

  useEffect(() => {
    if (open) {
      hasOpenedRef.current = true;
    } else if (hasOpenedRef.current) {
      releaseCurrentChallenge();
    }
    challengeLoadingSeqRef.current += 1;
    setLoadingChallenge(false);
    setInlineError("");
    setSummaryText("");
  }, [open, scene, releaseCurrentChallenge]);

  useEffect(() => {
    return () => {
      releaseCurrentChallenge();
    };
  }, [releaseCurrentChallenge]);

  const refreshCaptcha = useCallback((resetErrorCount = false) => {
    recentChallengeResultRef.current = { expiresAt: 0, result: null };
    releaseCurrentChallenge();
    setSummaryText("");
    setChallengeError("");
    challengeLoadingSeqRef.current += 1;
    setLoadingChallenge(true);
    if (actionRef.current?.refresh) {
      actionRef.current.refresh(resetErrorCount);
    }
  }, [releaseCurrentChallenge]);

  const handleClose = useCallback((reason = "close") => {
    releaseCurrentChallenge();
    if (typeof onClose === "function") {
      onClose(reason);
    }
  }, [onClose, releaseCurrentChallenge]);

  const handleVerify = async (data) => {
    const challengeId = latestChallengeIdRef.current;
    if (!challengeId) {
      const message = "验证码挑战不存在，请重试";
      setInlineError(normalizeInlineError(message));
      setSummaryText("");
      refreshCaptcha();
      if (typeof onFailed === "function") onFailed(message);
      return Promise.reject(new Error(message));
    }

    if (Number(data?.duration || 0) < minDuration) {
      const message = "拖动过快，请重试";
      setInlineError(normalizeInlineError(message));
      setSummaryText("");
      refreshCaptcha();
      if (typeof onFailed === "function") onFailed(message);
      return Promise.reject(new Error(message));
    }

    try {
      const response = await fetch(`${getApiBaseUrl()}/auth/captcha/verify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Device-ID": getDeviceId(),
        },
        credentials: "include",
        body: JSON.stringify({
          challenge_id: challengeId,
          scene,
          x: Number(data?.x || 0),
          y: Number(data?.y || 0),
          slider_offset_x: Number(data?.sliderOffsetX || 0),
          duration: Number(data?.duration || 0),
          trail: sampleTrail(data?.trail),
        }),
      });
      const result = await response.json();
      if (!response.ok || !result?.success) {
        throw new Error(result?.message || "验证码校验失败");
      }

      const captchaToken = result?.data?.captcha_token;
      if (!captchaToken) {
        throw new Error("验证码凭证生成失败");
      }

      const verifyResult = result?.data || {};
      setInlineError("");
      setSummaryText(verifyResult?.summary_text || "");

      if (typeof onSuccess === "function") {
        try {
          const callbackResult = onSuccess(captchaToken, verifyResult);
          if (callbackResult && typeof callbackResult.then === "function") {
            void callbackResult.catch(() => {
              // 业务请求放到弹窗外执行，避免阻塞验证码交互。
            });
          }
        } catch (_err) {
          // 业务回调异常不影响验证码通过状态。
        }
      }
      handleClose("success");
      return Promise.resolve();
    } catch (err) {
      const message = err?.message || "验证码校验失败";
      setInlineError(normalizeInlineError(message));
      setSummaryText("");
      refreshCaptcha();
      if (typeof onFailed === "function") onFailed(message);
      return Promise.reject(new Error(message));
    }
  };

  return (
    <AnimatePresence initial={false}>
      {open ? (
        <motion.div
          key="slider-captcha-modal"
          className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 px-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
        >
          <motion.div
            className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl"
            initial={{ opacity: 0, y: 18, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.97 }}
            transition={{ duration: 0.32, ease: MODAL_EASE }}
          >
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
              <button
                type="button"
                onClick={() => handleClose("close")}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
                aria-label="关闭验证弹窗"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>

            <p
              className={`mb-4 text-sm ${inlineError ? "font-medium text-red-600" : "text-gray-600"}`}
            >
              {inlineError || description}
            </p>

            <div className="mx-auto w-full">
              <div className="relative flex justify-center">
                <SliderCaptcha
                  actionRef={actionRef}
                  request={requestChallenge}
                  bgSize={{ width: sliderWidth, height: sliderHeight }}
                  puzzleSize={{ width: puzzleWidth, left: 0 }}
                  tipText={TIP_TEXT}
                  autoRefreshOnError={false}
                  errorHoldDuration={500}
                  onVerify={handleVerify}
                  loadingBoxProps={{
                    icon: (
                      <i className="fas fa-spinner fa-spin text-xl text-gray-500"></i>
                    ),
                    text: (
                      <span className="mt-2 text-xs text-gray-500">
                        正在加载...
                      </span>
                    ),
                  }}
                  jigsawContent={
                    summaryText ? (
                      <div
                        className="pointer-events-none absolute bottom-0 left-0 right-0 z-20 px-2 py-1 text-center text-xs font-semibold text-white backdrop-blur-sm"
                        style={{ backgroundColor: "rgba(5, 150, 105, 0.86)" }}
                      >
                        {summaryText}
                      </div>
                    ) : null
                  }
                  style={{
                    width: `${sliderWidth}px`,
                    maxWidth: "100%",
                    margin: "0 auto",
                  }}
                />
                {loadingChallenge ? (
                  <div className="absolute inset-0 z-30 flex items-center justify-center bg-white">
                    <div className="flex flex-col items-center text-gray-500">
                      <i className="fas fa-spinner fa-spin text-xl"></i>
                      <span className="mt-2 text-xs">正在加载...</span>
                    </div>
                  </div>
                ) : null}
              </div>
              {challengeError ? (
                <div className="mt-2 text-center text-xs text-red-600">
                  {challengeError}
                </div>
              ) : null}
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
