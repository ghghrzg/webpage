import React from 'react';

const segments: Record<string, string> = {
  a: '7,2 29,2 25,6 11,6',
  b: '31,3 34,7 34,24 30,28 28,25 28,9',
  c: '30,31 34,35 34,52 31,56 28,50 28,34',
  d: '7,54 29,54 25,58 11,58',
  e: '2,35 6,31 8,34 8,50 5,56 2,52',
  f: '5,3 8,9 8,25 6,28 2,24 2,7',
  g: '7,30 11,27 25,27 29,30 25,33 11,33',
};
const litByDigit = ['abcdef', 'bc', 'abged', 'abgcd', 'fgbc', 'afgcd', 'afgecd', 'abc', 'abcdefg', 'abfgcd'];

export function formatSegmentTime(ms: number) {
  const tenths = Math.min(999, Math.max(0, Math.floor((Number.isFinite(ms) ? ms : 0) / 100 + 0.000001)));
  return (tenths / 10).toFixed(1).padStart(4, '0');
}

type Props = { milliseconds: number; label: string };

export const SevenSegmentDisplay = React.memo(function SevenSegmentDisplay({ milliseconds, label }: Props) {
  const value = formatSegmentTime(milliseconds);
  const digits = [value[0], value[1], value[3]];
  return (
    <svg className="seven-segment" viewBox="0 0 135 60" role="img" aria-label={`${label}: ${value.replace('.', ',')} Sekunden`}>
      {digits.map((digit, index) => (
        <g key={index} transform={`translate(${[0, 45, 99][index]} 0)`} aria-hidden="true">
          {Object.entries(segments).map(([name, points]) => (
            <polygon key={name} points={points} className={`seven-segment-part${litByDigit[Number(digit)].includes(name) ? ' on' : ''}`} />
          ))}
        </g>
      ))}
      <circle cx="89" cy="54" r="3" className="seven-segment-part on" aria-hidden="true" />
    </svg>
  );
});
