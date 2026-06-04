import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import topExpertsImg from "@assets/image_1780562754001.png";

export function Scene5() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 1500),
      setTimeout(() => setPhase(3), 2500),
      setTimeout(() => setPhase(4), 9000), // exit
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex flex-col items-center justify-center z-10"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, y: '-100%' }}
      transition={{ duration: 0.8 }}
    >
      <div className="w-full flex items-center justify-center px-[10vw] gap-12">
        <div className="w-[50%] relative">
          <motion.div
            className="rounded-xl overflow-hidden shadow-2xl border border-gray-200 bg-white"
            initial={{ opacity: 0, y: 50, rotateX: 10 }}
            animate={phase >= 2 ? { opacity: 1, y: 0, rotateX: 0 } : { opacity: 0, y: 50, rotateX: 10 }}
            transition={{ duration: 0.8, type: 'spring' }}
            style={{ transformPerspective: 1000 }}
          >
            <img src={topExpertsImg} alt="Лучшие эксперты" className="w-full h-auto object-cover" />
          </motion.div>
        </div>

        <div className="w-[45%] text-left">
          <motion.h2 
            className="text-[4vw] font-bold text-[var(--color-primary)] leading-tight mb-6"
            initial={{ opacity: 0, x: 50 }}
            animate={phase >= 1 ? { opacity: 1, x: 0 } : { opacity: 0, x: 50 }}
            transition={{ duration: 0.6 }}
          >
            Шаг 6 & 7.
            <br/>
            <span className="text-[var(--color-secondary)]">Взаимная оценка</span>
          </motion.h2>
          
          <motion.div 
            className="flex items-center gap-4 mb-6"
            initial={{ opacity: 0 }}
            animate={phase >= 3 ? { opacity: 1 } : { opacity: 0 }}
          >
            <div className="flex gap-1">
              {[1,2,3,4,5].map(i => (
                <svg key={i} className="w-8 h-8 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
              ))}
            </div>
          </motion.div>

          <motion.p 
            className="text-[1.8vw] text-[var(--color-text-muted)] leading-relaxed font-medium"
            initial={{ opacity: 0, y: 20 }}
            animate={phase >= 3 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
            transition={{ duration: 0.6 }}
          >
            Честный рейтинг формируется на основе выполненных заказов и открывает доступ к лучшим специалистам.
          </motion.p>
        </div>
      </div>
    </motion.div>
  );
}
