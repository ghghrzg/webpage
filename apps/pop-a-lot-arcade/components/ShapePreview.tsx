import React from 'react';
import { Shape } from '../types';

interface ShapePreviewProps {
  shape: Shape;
  color: string;
  sizePx: number;
  isPrimary?: boolean;
}

const ShapePreview: React.FC<ShapePreviewProps> = ({ shape, color, sizePx, isPrimary = false }) => {
  const stroke = Math.max(2, sizePx * 0.06);

  const renderShape = () => {
    switch (shape) {
      case 'square':
        return (
          <svg width={sizePx} height={sizePx} viewBox="0 0 100 100" className="overflow-visible">
            <rect x="5" y="5" width="90" height="90" rx="15" fill={color} stroke="black" strokeWidth={stroke} />
            <rect x="20" y="20" width="60" height="60" rx="8" fill="none" stroke="black" strokeWidth={stroke * 0.6} opacity="0.3" />
            <path d="M12 12 L23 23 M88 12 L77 23 M88 88 L77 77 M12 88 L23 77" stroke="black" strokeWidth={stroke * 0.55} opacity="0.25" />
          </svg>
        );
      case 'triangle':
        return (
          <svg width={sizePx} height={sizePx} viewBox="0 0 100 100" className="overflow-visible">
            <path d="M50 5 L95 90 L5 90 Z" fill={color} stroke="black" strokeWidth={stroke} strokeLinejoin="round" />
            <path d="M50 20 L70 80 L30 80 Z" fill="white" fillOpacity="0.3" />
          </svg>
        );
      case 'star':
        return (
          <svg width={sizePx} height={sizePx} viewBox="0 0 100 100" className="overflow-visible">
             <path d="M50 5 L63 40 L98 40 L70 60 L80 95 L50 75 L20 95 L30 60 L2 40 L37 40 Z" fill={color} stroke="black" strokeWidth={stroke} strokeLinejoin="round" />
             <circle cx="50" cy="55" r="10" fill="white" fillOpacity="0.4" />
          </svg>
        );
      case 'pentagon':
        return (
          <svg width={sizePx} height={sizePx} viewBox="0 0 100 100" className="overflow-visible">
            <path d="M50 2 L98 38 L80 98 L20 98 L2 38 Z" fill={color} stroke="black" strokeWidth={stroke} strokeLinejoin="round" />
            <circle cx="50" cy="55" r="20" fill="none" stroke="black" strokeWidth={stroke * 0.5} opacity="0.4" />
          </svg>
        );
      case 'hexagon':
        return (
          <svg width={sizePx} height={sizePx} viewBox="0 0 100 100" className="overflow-visible">
            <path d="M25 5 L75 5 L98 50 L75 95 L25 95 L2 50 Z" fill={color} stroke="black" strokeWidth={stroke} strokeLinejoin="round" />
            <path d="M30 20 L70 20 M85 50 L70 80 M30 80 L15 50" stroke="black" strokeWidth={stroke * 0.6} opacity="0.3" fill="none" />
          </svg>
        );
      case 'diamond':
        return (
          <svg width={sizePx} height={sizePx} viewBox="0 0 100 100" className="overflow-visible">
             <path d="M50 2 L95 50 L50 98 L5 50 Z" fill={color} stroke="black" strokeWidth={stroke} strokeLinejoin="round" />
             <rect x="35" y="35" width="30" height="30" transform="rotate(45 50 50)" fill="white" fillOpacity="0.3" />
          </svg>
        );
      default:
        return (
          <svg width={sizePx} height={sizePx} viewBox="0 0 100 100" className="overflow-visible">
            <circle cx="50" cy="50" r="45" fill={color} stroke="black" strokeWidth={stroke} />
            <ellipse cx="35" cy="35" rx="10" ry="15" fill="white" fillOpacity="0.5" transform="rotate(-45 35 35)" />
          </svg>
        );
    }
  };

  return (
    <div className={`transition-transform ${isPrimary ? 'scale-100' : 'scale-95 opacity-85'}`}>
      {renderShape()}
    </div>
  );
};

export default ShapePreview;
