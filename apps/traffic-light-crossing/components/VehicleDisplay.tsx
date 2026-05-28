import React from 'react';
import { Vehicle, Direction } from '../types';
import { VEHICLE_SIZE } from '../constants';

interface VehicleDisplayProps {
  vehicle: Vehicle;
  intersectionSize: number;
  roadWidth: number;
  laneHeight: number;
}

const getVehicleRotation = (direction: Direction): number => {
  const rotations: Record<Direction, number> = {
    north: 180,
    south: 0,
    east: 270,
    west: 90,
  };
  return rotations[direction];
};

const getVehiclePosition = (vehicle: Vehicle, intersectionSize: number, roadWidth: number, laneHeight: number) => {
  const { direction, position, lane } = vehicle;
  const unitSize = intersectionSize;

  switch (direction) {
    case 'south':
      return {
        x: roadWidth / 2 - VEHICLE_SIZE / 2,
        y: -unitSize + (position / 100) * (unitSize * 2),
      };
    case 'north':
      return {
        x: roadWidth / 2 - VEHICLE_SIZE / 2,
        y: unitSize - (position / 100) * (unitSize * 2),
      };
    case 'east':
      return {
        x: -unitSize + (position / 100) * (unitSize * 2),
        y: lane === 0 ? roadWidth / 2 - VEHICLE_SIZE / 2 : roadWidth - VEHICLE_SIZE / 2,
      };
    case 'west':
      return {
        x: unitSize - (position / 100) * (unitSize * 2),
        y: lane === 0 ? roadWidth / 2 - VEHICLE_SIZE / 2 : roadWidth - VEHICLE_SIZE / 2,
      };
  }
};

const VehicleDisplay: React.FC<VehicleDisplayProps> = ({
  vehicle,
  intersectionSize,
  roadWidth,
  laneHeight,
}) => {
  const pos = getVehiclePosition(vehicle, intersectionSize, roadWidth, laneHeight);
  const rotation = getVehicleRotation(vehicle.direction);

  return (
    <div
      className={`absolute transition-none ${
        vehicle.crashed ? 'animate-crash' : 'animate-car-enter'
      }`}
      style={{
        left: `${pos.x}px`,
        top: `${pos.y}px`,
        width: `${VEHICLE_SIZE}px`,
        height: `${VEHICLE_SIZE}px`,
        transform: `rotate(${rotation}deg)`,
      }}
    >
      {/* Vehicle body */}
      <div className={`w-full h-full rounded flex items-center justify-center text-xs font-bold text-white ${
        vehicle.crashed ? 'bg-red-600' : 'bg-blue-500'
      }`}>
        <span>🚗</span>
      </div>
    </div>
  );
};

export default VehicleDisplay;
