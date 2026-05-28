import React from 'react';
import { Road } from '../types';
import { COLOR_SAFE, COLOR_WARNING, COLOR_DANGER } from '../constants';

interface IntersectionProps {
  roads: Road[];
  intersectionSize: number;
  roadWidth: number;
}

const getTrafficLightColor = (state: 'red' | 'yellow' | 'green') => {
  switch (state) {
    case 'green':
      return COLOR_SAFE;
    case 'yellow':
      return COLOR_WARNING;
    case 'red':
      return COLOR_DANGER;
  }
};

const Intersection: React.FC<IntersectionProps> = ({
  roads,
  intersectionSize,
  roadWidth,
}) => {
  const roadNorth = roads.find(r => r.direction === 'north');
  const roadSouth = roads.find(r => r.direction === 'south');
  const roadEast = roads.find(r => r.direction === 'east');
  const roadWest = roads.find(r => r.direction === 'west');

  const lightSize = 20;

  return (
    <div
      className="relative bg-gray-800 border-4 border-yellow-400"
      style={{
        width: `${intersectionSize}px`,
        height: `${intersectionSize}px`,
      }}
    >
      {/* Grid lines to show lanes */}
      <div className="absolute inset-0 border border-gray-700 opacity-30" />

      {/* Traffic lights around intersection */}
      {/* North light */}
      {roadNorth && (
        <div
          className="absolute flex items-center justify-center rounded-full animate-traffic-light"
          style={{
            width: `${lightSize}px`,
            height: `${lightSize}px`,
            backgroundColor: getTrafficLightColor(roadNorth.trafficLight),
            top: `-${lightSize + 10}px`,
            left: `${intersectionSize / 2 - lightSize / 2}px`,
          }}
        />
      )}

      {/* South light */}
      {roadSouth && (
        <div
          className="absolute flex items-center justify-center rounded-full animate-traffic-light"
          style={{
            width: `${lightSize}px`,
            height: `${lightSize}px`,
            backgroundColor: getTrafficLightColor(roadSouth.trafficLight),
            bottom: `-${lightSize + 10}px`,
            left: `${intersectionSize / 2 - lightSize / 2}px`,
          }}
        />
      )}

      {/* East light */}
      {roadEast && (
        <div
          className="absolute flex items-center justify-center rounded-full animate-traffic-light"
          style={{
            width: `${lightSize}px`,
            height: `${lightSize}px`,
            backgroundColor: getTrafficLightColor(roadEast.trafficLight),
            right: `-${lightSize + 10}px`,
            top: `${intersectionSize / 2 - lightSize / 2}px`,
          }}
        />
      )}

      {/* West light */}
      {roadWest && (
        <div
          className="absolute flex items-center justify-center rounded-full animate-traffic-light"
          style={{
            width: `${lightSize}px`,
            height: `${lightSize}px`,
            backgroundColor: getTrafficLightColor(roadWest.trafficLight),
            left: `-${lightSize + 10}px`,
            top: `${intersectionSize / 2 - lightSize / 2}px`,
          }}
        />
      )}

      {/* Center dot */}
      <div className="absolute top-1/2 left-1/2 w-2 h-2 bg-yellow-400 rounded-full -translate-x-1/2 -translate-y-1/2" />
    </div>
  );
};

export default Intersection;
