import React, { useMemo } from "react";
import Particles from '@/components/Particles-code';

export default function ParticlesBackground({ children }: { children?: React.ReactNode }) {
  const particlesConfig = useMemo(() => ({
    particleColors: ['#280138', '#1d001f'],
    particleCount: 300,
    particleSpread: 10,
    speed: 0.2,
    particleBaseSize: 100,
    moveParticlesOnHover: false,
    alphaParticles: true,
    disableRotation: true,
  }), []);

  return (
    <div style={{ position: 'fixed', inset: 0, width: '100vw', height: '100vh', zIndex: 0, overflow: 'hidden' }}>
      <Particles {...particlesConfig} />
      {children && (
        <div style={{ position: 'relative', zIndex: 1, width: '100%', height: '100%' }}>
          {children}
        </div>
      )}
    </div>
  );
}