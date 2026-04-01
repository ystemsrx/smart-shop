import React from 'react';

const SLOT_HEIGHT = 1.2; // em

const Digit = ({ d }) => {
  const n = parseInt(d);
  const items = Array.from({ length: 10 }, (_, i) => i);
  return (
    <span
      className="inline-block overflow-hidden relative"
      style={{
        height: `${SLOT_HEIGHT}em`,
        width: '0.7em',
        lineHeight: `${SLOT_HEIGHT}em`,
      }}
    >
      <span
        className="block transition-transform duration-500 ease-out will-change-transform absolute top-0 left-0 right-0"
        style={{
          transform: `translateY(-${n * SLOT_HEIGHT}em)`,
          lineHeight: `${SLOT_HEIGHT}em`,
        }}
      >
        {items.map((v) => (
          <span
            key={v}
            className="block text-center"
            style={{ height: `${SLOT_HEIGHT}em`, lineHeight: `${SLOT_HEIGHT}em` }}
          >
            {v}
          </span>
        ))}
      </span>
    </span>
  );
};

export default function AnimatedPrice({ value, prefix = '¥', className = '', precision = 2 }) {
  const str = (Number.isFinite(value) ? Number(value) : 0).toFixed(precision);
  const txt = `${prefix || ''}${str}`;
  return (
    <span className={`${className} inline-flex`} style={{ fontVariantNumeric: 'tabular-nums', alignItems: 'stretch' }}>
      {txt.split('').map((ch, idx) => (
        ch >= '0' && ch <= '9'
          ? <Digit key={idx} d={ch} />
          : <span key={idx} className="inline-flex items-center" style={{ height: `${SLOT_HEIGHT}em`, lineHeight: `${SLOT_HEIGHT}em` }}>{ch}</span>
      ))}
    </span>
  );
}

