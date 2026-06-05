import { motion, AnimatePresence } from 'framer-motion';
import { useVideoPlayer } from '@/lib/video';
import { useEffect, useRef } from 'react';
import { Scene1 } from './video_scenes/Scene1';
import { Scene2 } from './video_scenes/Scene2';
import { Scene3 } from './video_scenes/Scene3';
import { Scene4 } from './video_scenes/Scene4';
import { Scene5 } from './video_scenes/Scene5';
import { Scene6 } from './video_scenes/Scene6';

export const SCENE_DURATIONS: Record<string, number> = {
  intro: 3400,
  step1: 5400,
  step2_3: 6700,
  step4_5: 6700,
  step6_7: 6700,
  outro: 4700,
};

const SCENE_COMPONENTS: Record<string, React.ComponentType> = {
  intro: Scene1,
  step1: Scene2,
  step2_3: Scene3,
  step4_5: Scene4,
  step6_7: Scene5,
  outro: Scene6,
};

const SCENE_START_SEC: Record<string, number> = (() => {
  const out: Record<string, number> = {};
  let cumulativeMs = 0;
  for (const [key, ms] of Object.entries(SCENE_DURATIONS)) {
    out[key] = cumulativeMs / 1000;
    cumulativeMs += ms;
  }
  return out;
})();

const AUDIO_SEEK_EPSILON_SEC = 0.18;

export default function VideoTemplate({
  durations = SCENE_DURATIONS,
  loop = true,
  muted = false,
  paused = false,
  onSceneChange,
  onVideoEnd,
}: {
  durations?: Record<string, number>;
  loop?: boolean;
  muted?: boolean;
  paused?: boolean;
  onSceneChange?: (sceneKey: string) => void;
  onVideoEnd?: () => void;
} = {}) {
  const { currentScene, currentSceneKey } = useVideoPlayer({ durations, loop, onVideoEnd, paused });

  useEffect(() => {
    onSceneChange?.(currentSceneKey);
  }, [currentSceneKey, onSceneChange]);

  const baseSceneKey = currentSceneKey.replace(/_r[12]$/, '') as keyof typeof SCENE_DURATIONS;
  const sceneIndex = Object.keys(SCENE_DURATIONS).indexOf(baseSceneKey);
  const SceneComponent = SCENE_COMPONENTS[baseSceneKey];

  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = 0.45;
    const targetTime = SCENE_START_SEC[baseSceneKey] ?? 0;
    if (Math.abs(audio.currentTime - targetTime) > AUDIO_SEEK_EPSILON_SEC) {
      audio.currentTime = targetTime;
    }
    audio.play().catch(() => {});
  }, [currentSceneKey, baseSceneKey, muted]);

  return (
    <>
      <div className="w-full h-screen overflow-hidden relative" style={{ backgroundColor: 'var(--color-bg-light)' }}>
        <div className="absolute inset-0 pointer-events-none z-0">
          <motion.div
            className="absolute w-[80vw] h-[80vw] rounded-full blur-[100px] opacity-20"
            style={{ background: 'radial-gradient(circle, var(--color-secondary), transparent 70%)' }}
            animate={{
              x: ['-20%', '30%', '-10%', '50%', '-20%', '10%'][sceneIndex] || '0%',
              y: ['-20%', '10%', '-30%', '20%', '-10%', '0%'][sceneIndex] || '0%',
              scale: [1, 1.2, 0.9, 1.1, 1, 1.3][sceneIndex] || 1,
            }}
            transition={{ duration: 2, ease: [0.25, 1, 0.5, 1] }}
          />
          <motion.div
            className="absolute w-[60vw] h-[60vw] rounded-full blur-[80px] opacity-10"
            style={{ background: 'radial-gradient(circle, var(--color-primary), transparent 70%)' }}
            animate={{
              x: ['60%', '10%', '70%', '0%', '50%', '30%'][sceneIndex] || '0%',
              y: ['50%', '80%', '40%', '70%', '60%', '40%'][sceneIndex] || '0%',
            }}
            transition={{ duration: 2.5, ease: [0.25, 1, 0.5, 1] }}
          />
        </div>

        <AnimatePresence mode="popLayout">
          {SceneComponent && <SceneComponent key={currentSceneKey} />}
        </AnimatePresence>
      </div>

      <audio
        ref={audioRef}
        src={`${import.meta.env.BASE_URL}audio/bg_music.mp3`}
        preload="auto"
        autoPlay
        muted={muted}
      />
    </>
  );
}
