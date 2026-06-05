import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function Scene1() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 300),
      setTimeout(() => setPhase(2), 1100),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center z-10"
      style={{ background: 'linear-gradient(135deg, #0F4C9A 0%, #002B5C 100%)' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 0.96, filter: 'blur(8px)' }}
      transition={{ duration: 0.6 }}
    >
      {/* Logo card */}
      <motion.div
        initial={{ scale: 0.75, opacity: 0, y: 24 }}
        animate={phase >= 1 ? { scale: 1, opacity: 1, y: 0 } : { scale: 0.75, opacity: 0, y: 24 }}
        transition={{ type: 'spring', stiffness: 200, damping: 20 }}
        className="mb-[3vw]"
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
        className="text-[1.8vw] font-semibold text-white tracking-[0.25em] uppercase"
        initial={{ opacity: 0, y: 14 }}
        animate={phase >= 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: 14 }}
        transition={{ duration: 0.7 }}
      >
        Платформа профессиональных экспертов
      </motion.p>
    </motion.div>
  );
}
