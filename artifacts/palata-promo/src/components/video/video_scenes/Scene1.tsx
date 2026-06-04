import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function Scene1() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 1500),
      setTimeout(() => setPhase(3), 4000), // start exit
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex flex-col items-center justify-center bg-transparent z-10"
      initial={{ opacity: 0, scale: 1.1 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9, filter: 'blur(10px)' }}
      transition={{ duration: 0.8 }}
    >
      <div className="relative text-center">
        <motion.div
          className="absolute -inset-10 bg-white rounded-[40px] shadow-2xl -z-10"
          initial={{ scaleY: 0, opacity: 0 }}
          animate={phase >= 1 ? { scaleY: 1, opacity: 1 } : { scaleY: 0, opacity: 0 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        />
        
        <h1 className="text-[5vw] font-bold text-[var(--color-primary)] leading-tight tracking-tight px-12 py-8 overflow-hidden">
          {'ПАЛАТА'.split('').map((char, i) => (
            <motion.span key={i} className="inline-block"
              initial={{ y: '100%', opacity: 0 }}
              animate={phase >= 1 ? { y: 0, opacity: 1 } : { y: '100%', opacity: 0 }}
              transition={{ delay: 0.1 + i * 0.05, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}>
              {char}
            </motion.span>
          ))}
          <br />
          {'СУДЕБНЫХ'.split('').map((char, i) => (
            <motion.span key={i} className="inline-block"
              initial={{ y: '100%', opacity: 0 }}
              animate={phase >= 1 ? { y: 0, opacity: 1 } : { y: '100%', opacity: 0 }}
              transition={{ delay: 0.3 + i * 0.05, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}>
              {char}
            </motion.span>
          ))}
          <br />
          {'ЭКСПЕРТОВ'.split('').map((char, i) => (
            <motion.span key={i} className="inline-block"
              initial={{ y: '100%', opacity: 0 }}
              animate={phase >= 1 ? { y: 0, opacity: 1 } : { y: '100%', opacity: 0 }}
              transition={{ delay: 0.5 + i * 0.05, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}>
              {char}
            </motion.span>
          ))}
        </h1>
      </div>

      <motion.p 
        className="mt-12 text-[2vw] font-medium text-[var(--color-secondary)] tracking-wide uppercase"
        initial={{ opacity: 0, y: 20 }}
        animate={phase >= 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
        transition={{ duration: 0.6 }}
      >
        Прозрачность и надежность на каждом этапе
      </motion.p>
    </motion.div>
  );
}
