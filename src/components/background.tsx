import React from 'react';
import Waves from './Waves';

interface BackgroundProps {
  lineColor?: string;
  backgroundColor?: string;
  className?: string;
  waves?: boolean;
  image?: string;
}

const Background: React.FC<BackgroundProps> = ({
  lineColor = '#10601e',
  backgroundColor = 'rgba(0, 0, 0, 1)',
  className = '',
  waves = true,
  image
}) => {
  if (image) {
    return (
      <div
        className={`absolute top-0 left-0 w-full h-full overflow-hidden ${className}`}
        style={{
          backgroundColor,
          backgroundImage: `url("${image}")`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      />
    );
  }
  if (!waves) {
    return (
      <div
        className={`absolute top-0 left-0 w-full h-full overflow-hidden ${className}`}
        style={{ backgroundColor }}
      />
    );
  }
  return (
    <Waves
      lineColor={lineColor}
      backgroundColor={backgroundColor}
      className={className}
      waveSpeedX={0.02}
      waveSpeedY={0.01}
      waveAmpX={40}
      waveAmpY={20}
      friction={0.9}
      tension={0.01}
      maxCursorMove={120}
      xGap={12}
      yGap={36}
    />
  );
};

export default Background;