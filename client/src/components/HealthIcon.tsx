import React from 'react';

interface HealthIconProps {
  className?: string;
  size?: number;
}

export const HealthIcon: React.FC<HealthIconProps> = ({ className = "", size = 24 }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="healthGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#3b82f6" />
          <stop offset="50%" stopColor="#8b5cf6" />
          <stop offset="100%" stopColor="#d946ef" />
        </linearGradient>
      </defs>
      
      {/* Outer circle */}
      <circle
        cx="50"
        cy="50"
        r="45"
        fill="none"
        stroke="url(#healthGradient)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray="200 20"
        opacity="0.8"
      />
      
      {/* Heartbeat line */}
      <path
        d="M20 50 L25 50 L30 35 L35 65 L40 20 L45 80 L50 50 L55 40 L60 60 L65 50 L80 50"
        fill="none"
        stroke="url(#healthGradient)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      
      {/* Center pulse dot */}
      <circle
        cx="50"
        cy="50"
        r="3"
        fill="url(#healthGradient)"
        opacity="0.9"
      >
        <animate
          attributeName="r"
          values="3;5;3"
          dur="1.5s"
          repeatCount="indefinite"
        />
        <animate
          attributeName="opacity"
          values="0.9;0.5;0.9"
          dur="1.5s"
          repeatCount="indefinite"
        />
      </circle>
    </svg>
  );
};