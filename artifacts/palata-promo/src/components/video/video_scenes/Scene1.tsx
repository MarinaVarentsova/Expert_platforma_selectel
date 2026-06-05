import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function Scene1() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 400),
      setTimeout(() => setPhase(2), 1400),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center bg-transparent z-10"
      initial={{ opacity: 0, scale: 1.05 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.92, filter: 'blur(10px)' }}
      transition={{ duration: 0.8 }}
    >
      {/* Logo */}
      <motion.div
        initial={{ scale: 0.7, opacity: 0, y: 20 }}
        animate={phase >= 1 ? { scale: 1, opacity: 1, y: 0 } : { scale: 0.7, opacity: 0, y: 20 }}
        transition={{ type: 'spring', stiffness: 180, damping: 18 }}
        className="mb-8"
      >
        <img
          src={`${import.meta.env.BASE_URL}logo.jpg`}
          alt="Палата судебных экспертов"
          className="h-[18vw] w-auto rounded-[2vw] shadow-2xl object-contain bg-white p-[1.2vw]"
          style={{ filter: 'contrast(1.05) saturate(1.1)' }}
        />
      </motion.div>

      {/* Tagline */}
      <motion.p
        className="text-[2vw] font-medium text-[var(--color-secondary)] tracking-wide uppercase"
        initial={{ opacity: 0, y: 16 }}
        animate={phase >= 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}
        transition={{ duration: 0.6 }}
      >
        Прозрачность и надежность на каждом этапе
      </motion.p>
    </motion.div>
  );
}
