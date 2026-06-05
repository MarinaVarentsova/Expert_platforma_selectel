import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function Scene6() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 1500),
      setTimeout(() => setPhase(3), 2500),
      setTimeout(() => setPhase(4), 3500),
      setTimeout(() => setPhase(5), 6000), // exit
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex flex-col items-center justify-center bg-[var(--color-primary)] z-20"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 1 }}
    >
      <div className="text-center px-12 relative z-10">
        <motion.div
          className="mx-auto mb-8"
          initial={{ scale: 0, rotate: -180 }}
          animate={phase >= 1 ? { scale: 1, rotate: 0 } : { scale: 0, rotate: -180 }}
          transition={{ type: 'spring', stiffness: 200, damping: 20 }}
        >
          <img
            src={`${import.meta.env.BASE_URL}logo.jpg`}
            alt="Палата судебных экспертов"
            className="h-[14vw] w-auto rounded-[2vw] shadow-2xl object-contain bg-white p-[1vw]"
            style={{ filter: 'contrast(1.05) saturate(1.1)' }}
          />
        </motion.div>

        <motion.h1 
          className="text-[4vw] font-bold text-white leading-tight tracking-tight mb-8"
          initial={{ opacity: 0, y: 30 }}
          animate={phase >= 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
          transition={{ duration: 0.8 }}
        >
          Палата Судебных Экспертов
        </motion.h1>

        <div className="flex gap-8 justify-center">
          {['Надежно.', 'Прозрачно.', 'Профессионально.'].map((text, i) => (
            <motion.span 
              key={i}
              className="text-[2vw] text-white/80 font-medium"
              initial={{ opacity: 0, y: 20 }}
              animate={phase >= 3 + i * 0.5 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
              transition={{ duration: 0.5 }}
            >
              {text}
            </motion.span>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
