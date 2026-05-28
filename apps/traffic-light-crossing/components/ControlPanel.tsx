import React from 'react';
import { TrashIcon, Volume2Icon, VolumeXIcon, PlayIcon, PauseIcon, RotateCcwIcon } from 'lucide-react';

interface ControlPanelProps {
  score: number;
  lives: number;
  time: number;
  isRunning: boolean;
  isPaused: boolean;
  isMuted: boolean;
  onMuteToggle: () => void;
  onPlayPause: () => void;
  onReset: () => void;
}

const ControlPanel: React.FC<ControlPanelProps> = ({
  score,
  lives,
  time,
  isRunning,
  isPaused,
  isMuted,
  onMuteToggle,
  onPlayPause,
  onReset,
}) => {
  return (
    <div className="w-full bg-gradient-to-r from-gray-900 to-gray-800 border-b-4 border-yellow-400 p-4">
      <div className="flex justify-between items-center max-w-6xl mx-auto">
        {/* Score and Lives */}
        <div className="flex gap-8">
          <div className="text-white">
            <div className="text-sm opacity-75">Score</div>
            <div className="text-3xl font-bold text-yellow-400">{score}</div>
          </div>
          <div className="text-white">
            <div className="text-sm opacity-75">Lives</div>
            <div className="text-3xl font-bold text-red-400">❤️ × {lives}</div>
          </div>
          <div className="text-white">
            <div className="text-sm opacity-75">Time</div>
            <div className="text-3xl font-bold text-blue-400">{time}s</div>
          </div>
        </div>

        {/* Controls */}
        <div className="flex gap-2">
          <button
            onClick={onMuteToggle}
            className="p-2 bg-gray-700 hover:bg-gray-600 rounded text-white shadow-hard active-press"
            title="Toggle sound"
          >
            {isMuted ? <VolumeXIcon size={24} /> : <Volume2Icon size={24} />}
          </button>
          {isRunning && (
            <button
              onClick={onPlayPause}
              className="p-2 bg-blue-500 hover:bg-blue-600 rounded text-white shadow-hard active-press"
              title={isPaused ? 'Resume' : 'Pause'}
            >
              {isPaused ? <PlayIcon size={24} /> : <PauseIcon size={24} />}
            </button>
          )}
          <button
            onClick={onReset}
            className="p-2 bg-red-500 hover:bg-red-600 rounded text-white shadow-hard active-press"
            title="Reset game"
          >
            <RotateCcwIcon size={24} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ControlPanel;
