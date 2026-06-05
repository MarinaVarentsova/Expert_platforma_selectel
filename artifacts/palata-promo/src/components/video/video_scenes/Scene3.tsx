import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import certImg from "@assets/image_1780562837072.png";

export function Scene3() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 2000),
      setTimeout(() => setPhase(3), 3500),
      setTimeout(() => setPhase(4), 5000),
      setTimeout(() => setPhase(5), 9000), // exit
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-[var(--color-primary)] text-white clip-diagonal"
      initial={{ scale: 1.2, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ y: '100%', opacity: 0 }}
      transition={{ duration: 1, ease: [0.25, 1, 0.5, 1] }}
    >
      <div className="absolute inset-0 bg-[var(--color-primary)] z-0" />
      
      <div className="relative z-10 w-full flex items-center justify-center px-[10vw] gap-12">
        <div className="w-[50%] text-left">
          <motion.h2 
            className="text-[4vw] font-bold leading-tight mb-6"
            initial={{ opacity: 0, x: -50 }}
            animate={phase >= 1 ? { opacity: 1, x: 0 } : { opacity: 0, x: -50 }}
            transition={{ duration: 0.6 }}
          >
            Шаг 2 & 3.
            <br/>
            <span className="text-[var(--color-secondary)] text-white/80">Подбор и Выбор</span>
          </motion.h2>
          
          <motion.ul className="space-y-6 text-[1.8vw] text-white/90">
            <motion.li 
              className="flex items-center gap-4"
              initial={{ opacity: 0, x: -20 }}
              animate={phase >= 2 ? { opacity: 1, x: 0 } : { opacity: 0, x: -20 }}
            >
              <div className="w-4 h-4 rounded-full bg-white" />
              Умный автоподбор экспертов
            </motion.li>
            <motion.li 
              className="flex items-center gap-4"
              initial={{ opacity: 0, x: -20 }}
              animate={phase >= 3 ? { opacity: 1, x: 0 } : { opacity: 0, x: -20 }}
            >
              <div className="w-4 h-4 rounded-full bg-[var(--color-secondary)]" />
              Заказчик выбирает лучшего
            </motion.li>
            <motion.li 
              className="flex items-start gap-4 mt-8 font-semibold text-[2vw]"
              initial={{ opacity: 0, y: 20 }}
              animate={phase >= 4 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
            >
              <span className="text-[var(--color-secondary)] bg-white px-4 py-2 rounded-lg inline-block">
                Все эксперты сертифицированы Палатой судебных экспертов
              </span>
            </motion.li>
          </motion.ul>
        </div>

        <div className="w-[40%] relative">
          <motion.div
            className="rounded-xl overflow-hidden shadow-2xl border-4 border-white/20"
            initial={{ opacity: 0, scale: 0.8, rotateY: -30 }}
            animate={phase >= 2 ? { opacity: 1, scale: 1, rotateY: 0 } : { opacity: 0, scale: 0.8, rotateY: -30 }}
            transition={{ duration: 0.8, type: 'spring' }}
            style={{ transformPerspective: 1000 }}
          >
            <img src={certImg} alt="Сертификат" className="w-full h-auto object-cover" />
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}
