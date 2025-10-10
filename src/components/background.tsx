import React, { useMemo } from "react";
import Particles from '@/components/Particles-code';

export default function ParticlesBackground({ children }: { children?: React.ReactNode }) {
  const particlesConfig = useMemo(() => ({
    particleColors: ['#ff1605', '#ff1605'],
    particleCount: 400,
    particleSpread: 3,
    speed: 0.4,
    particleBaseSize: 100,
    moveParticlesOnHover: true,
    alphaParticles: true,
    disableRotation: false,
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