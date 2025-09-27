import React from 'react';

// 简单的 markdown 渲染组件，支持加粗、斜体和换行
const SimpleMarkdown = ({ children, className = '' }) => {
  if (!children) return null;
  
  const renderText = (text) => {
    return text
      // 处理换行
      .split('\n').map((line, index, array) => (
        <React.Fragment key={index}>
          {line
            // 优先处理加粗，然后处理斜体
            .split(/(\*\*[^*]+\*\*)/).map((boldPart, boldIndex) => {
              // 加粗 **text**
              if (boldPart.startsWith('**') && boldPart.endsWith('**')) {
                return <strong key={boldIndex}>{boldPart.slice(2, -2)}</strong>;
              }
              // 在非加粗部分处理斜体
              return boldPart.split(/(\*[^*\n]+\*)/).map((italicPart, italicIndex) => {
                // 斜体 *text*
                if (italicPart.startsWith('*') && italicPart.endsWith('*') && italicPart.length > 2) {
                  return <em key={`${boldIndex}-${italicIndex}`} className="simple-markdown-italic">{italicPart.slice(1, -1)}</em>;
                }
                return italicPart;
              });
            })}
          {index < array.length - 1 && <br />}
        </React.Fragment>
      ));
  };

  return (
    <div className={className}>
      {renderText(children)}
    </div>
  );
};

export default SimpleMarkdown;
