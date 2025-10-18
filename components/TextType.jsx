import React, { useEffect, useRef, useState, memo } from 'react';
import { gsap } from 'gsap';

const TextType = memo(({ 
  text = [], 
  typingSpeed = 75, 
  pauseDuration = 1500, 
  deletingSpeed = 50,
  cursorBlinkDuration = 0.5,
  showCursor = true, 
  cursorCharacter = "_",
  randomOrder = true
}) => {
  const textRef = useRef(null);
  const cursorRef = useRef(null);
  const [currentTextIndex, setCurrentTextIndex] = useState(0);
  const [currentText, setCurrentText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const lastTextIndexRef = useRef(-1); // 用ref来同步跟踪上一个索引
  const timelineRef = useRef(null);
  const animationControllerRef = useRef(null); // 用于控制动画的中断
  const isInitializedRef = useRef(false); // 防止重复初始化

  // 随机选择下一个文本索引的函数，避免连续显示相同文本
  const getNextTextIndex = () => {
    if (!randomOrder) {
      const nextIndex = (currentTextIndex + 1) % text.length;
      lastTextIndexRef.current = nextIndex;
      return nextIndex;
    }
    
    if (text.length <= 1) {
      lastTextIndexRef.current = 0;
      return 0;
    }
    
    let nextIndex;
    let attempts = 0;
    do {
      nextIndex = Math.floor(Math.random() * text.length);
      attempts++;
      // 防止无限循环，最多尝试10次
      if (attempts > 10) {
        break;
      }
    } while (nextIndex === lastTextIndexRef.current && text.length > 1);
    
    lastTextIndexRef.current = nextIndex;
    return nextIndex;
  };

  useEffect(() => {
    if (!text.length || !textRef.current) return;

    // 如果动画已经在运行，不要重新启动
    if (isInitializedRef.current && animationControllerRef.current && !animationControllerRef.current.aborted) {
      return;
    }

    // 清理之前的动画
    if (timelineRef.current) {
      timelineRef.current.kill();
    }
    if (animationControllerRef.current) {
      animationControllerRef.current.aborted = true;
    }

    const tl = gsap.timeline({ repeat: -1 });
    timelineRef.current = tl;

    // 光标闪烁动画
    if (showCursor && cursorRef.current) {
      gsap.set(cursorRef.current, { opacity: 1, visibility: 'visible' });
      gsap.to(cursorRef.current, {
        opacity: 0,
        duration: cursorBlinkDuration,
        repeat: -1,
        yoyo: true,
        ease: "power2.inOut",
        immediateRender: true
      });
    }

    const typeText = (textToType, index) => {
      return new Promise((resolve, reject) => {
        const controller = animationControllerRef.current;
        if (controller?.aborted) {
          reject(new Error('Animation aborted'));
          return;
        }
        
        setIsTyping(true);
        setCurrentTextIndex(index);
        let currentLength = 0;
        
        const typeChar = () => {
          const controller = animationControllerRef.current;
          if (controller?.aborted) {
            reject(new Error('Animation aborted'));
            return;
          }
          
          if (currentLength <= textToType.length) {
            setCurrentText(textToType.slice(0, currentLength));
            currentLength++;
            setTimeout(typeChar, typingSpeed);
          } else {
            setIsTyping(false);
            setTimeout(resolve, pauseDuration);
          }
        };
        
        // 清空当前文本并开始打字
        setCurrentText('');
        setTimeout(typeChar, typingSpeed);
      });
    };

    const eraseText = () => {
      return new Promise((resolve, reject) => {
        const controller = animationControllerRef.current;
        if (controller?.aborted) {
          reject(new Error('Animation aborted'));
          return;
        }
        
        setIsTyping(true);
        // 获取当前显示的文本长度
        let currentLength;
        setCurrentText(prev => {
          currentLength = prev.length;
          return prev;
        });
        
        const eraseChar = () => {
          const controller = animationControllerRef.current;
          if (controller?.aborted) {
            reject(new Error('Animation aborted'));
            return;
          }
          
          if (currentLength >= 0) {
            setCurrentText(prev => {
              const newText = prev.slice(0, currentLength);
              return newText;
            });
            currentLength--;
            setTimeout(eraseChar, deletingSpeed);
          } else {
            setIsTyping(false);
            setTimeout(resolve, 300);
          }
        };
        
        setTimeout(eraseChar, deletingSpeed);
      });
    };

    // 创建动画控制器
    const controller = { aborted: false };
    animationControllerRef.current = controller;

    const runAnimation = async () => {
      const controller = animationControllerRef.current;
      try {
        while (controller && !controller.aborted) {
          // 随机或顺序选择下一个文本索引
          const nextIndex = getNextTextIndex();
          setCurrentTextIndex(nextIndex);
          
          // 打字动画
          await typeText(text[nextIndex], nextIndex);
          
          if (controller.aborted) break;
          
          // 停留一段时间
          await new Promise((resolve, reject) => {
            if (controller.aborted) {
              reject(new Error('Animation aborted'));
              return;
            }
            setTimeout(resolve, pauseDuration);
          });
          
          if (controller.aborted) break;
          
          // 删除动画
          await eraseText();
          
          if (controller.aborted) break;
          
          // 短暂停顿后继续下一轮
          await new Promise((resolve, reject) => {
            if (controller.aborted) {
              reject(new Error('Animation aborted'));
              return;
            }
            setTimeout(resolve, 300);
          });
        }
      } catch (error) {
        // 动画被中断，正常情况
        if (error.message !== 'Animation aborted') {
          console.error('TextType animation error:', error);
        }
      }
    };

    // 开始动画循环
    runAnimation();
    isInitializedRef.current = true;

    return () => {
      // 中断动画
      if (animationControllerRef.current) {
        animationControllerRef.current.aborted = true;
      }
      
      // 清理GSAP动画
      if (timelineRef.current) {
        timelineRef.current.kill();
      }
      
      // 清理光标动画
      if (cursorRef.current) {
        gsap.killTweensOf(cursorRef.current);
      }
      
      isInitializedRef.current = false;
    };
  }, [text, typingSpeed, pauseDuration, deletingSpeed, cursorBlinkDuration, showCursor, randomOrder]);

  return (
    <div className="inline-flex items-center">
      <span ref={textRef} className="text-3xl font-semibold">
        {currentText}
      </span>
      {showCursor && (
        <span 
          ref={cursorRef} 
          className="text-3xl font-semibold ml-1"
          style={{ display: 'inline-block', opacity: 1, visibility: 'visible' }}
        >
          {cursorCharacter}
        </span>
      )}
    </div>
  );
});

// 给memo组件一个显示名称，便于调试
TextType.displayName = 'TextType';

export default TextType;