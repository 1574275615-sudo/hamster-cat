/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Shield, Target, Rocket as RocketIcon, Trophy, RotateCcw, Play, Languages } from 'lucide-react';
import { GameStatus, GameMode, Point, Rocket, Interceptor, Explosion, Turret, City, GameState } from './types';
import { useGameLoop } from './hooks/useGameLoop';

const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;
const EXPLOSION_MAX_RADIUS = 40;
const EXPLOSION_GROWTH_RATE = 0.15;
const ROCKET_SPAWN_INTERVAL = 1500;
const WIN_SCORE = 1000;
const MAX_WAVES = 3;

const INITIAL_TURRETS: Turret[] = [
  { id: 0, x: 50, y: 560, ammo: 20, maxAmmo: 20, isDestroyed: false },
  { id: 1, x: 400, y: 560, ammo: 40, maxAmmo: 40, isDestroyed: false },
  { id: 2, x: 750, y: 560, ammo: 20, maxAmmo: 20, isDestroyed: false },
];

const INITIAL_CITIES: City[] = [
  { id: 0, x: 150, y: 580, isDestroyed: false },
  { id: 1, x: 250, y: 580, isDestroyed: false },
  { id: 2, x: 350, y: 580, isDestroyed: false },
  { id: 3, x: 450, y: 580, isDestroyed: false },
  { id: 4, x: 550, y: 580, isDestroyed: false },
  { id: 5, x: 650, y: 580, isDestroyed: false },
];

export default function App() {
  const [gameState, setGameState] = useState<GameState>({
    score: 0,
    status: GameStatus.START,
    mode: GameMode.LIMITED,
    rockets: [],
    interceptors: [],
    explosions: [],
    turrets: INITIAL_TURRETS,
    cities: INITIAL_CITIES,
    wave: 1,
  });

  const rocketsToSpawnRef = useRef(10);
  const [isWaveTransition, setIsWaveTransition] = useState(false);
  const [lang, setLang] = useState<'zh' | 'en'>('zh');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastSpawnTime = useRef<number>(0);

  const t = {
    zh: {
      title: 'Hamster 新星防御',
      start: '开始游戏',
      restart: '再玩一次',
      gameOver: '游戏结束',
      victory: '防御成功！',
      score: '得分',
      target: '目标',
      ammo: '弹药',
      mission: '发射仓鼠拦截猫咪，保卫城市。击退 3 波猫咪获胜。',
      allTurretsDestroyed: '所有炮台已被摧毁！',
      waveComplete: '波次完成',
      nextWave: '下一波',
      wave: '波次',
      hint: '点击屏幕发射仓鼠',
      quit: '退出',
      limitedMode: '有限模式',
      infiniteMode: '无限模式',
      ammoOut: '弹药耗尽！',
    },
    en: {
      title: 'Hamster Nova Defense',
      start: 'Start Game',
      restart: 'Play Again',
      gameOver: 'Game Over',
      victory: 'Victory!',
      score: 'Score',
      target: 'Target',
      ammo: 'Ammo',
      mission: 'Launch hamsters to intercept cats and protect cities. Defeat 3 waves to win.',
      allTurretsDestroyed: 'All turrets destroyed!',
      waveComplete: 'Wave Complete',
      nextWave: 'Next Wave',
      wave: 'Wave',
      hint: 'Click to launch hamsters',
      quit: 'Quit',
      limitedMode: 'Limited Mode',
      infiniteMode: 'Infinite Mode',
      ammoOut: 'Out of Ammo!',
    }
  }[lang];

  const initGame = useCallback((mode: GameMode) => {
    setGameState({
      score: 0,
      status: GameStatus.PLAYING,
      mode: mode,
      rockets: [],
      interceptors: [],
      explosions: [],
      turrets: INITIAL_TURRETS.map(t => ({ ...t, ammo: t.maxAmmo, isDestroyed: false })),
      cities: INITIAL_CITIES.map(c => ({ ...c, isDestroyed: false })),
      wave: 1,
    });
    rocketsToSpawnRef.current = mode === GameMode.INFINITE ? 999999 : 20;
    setIsWaveTransition(false);
    lastSpawnTime.current = performance.now();
  }, []);

  const startNextWave = useCallback(() => {
    setGameState(prev => ({
      ...prev,
      wave: prev.wave + 1,
      turrets: prev.turrets.map(t => ({ ...t, ammo: t.maxAmmo })), // Replenish ammo
    }));
    rocketsToSpawnRef.current = 20 + (gameState.wave + 1) * 5;
    setIsWaveTransition(false);
    lastSpawnTime.current = performance.now();
  }, [gameState.wave]);

  const quitGame = useCallback(() => {
    setGameState(prev => ({
      ...prev,
      status: GameStatus.START,
      rockets: [],
      interceptors: [],
      explosions: [],
    }));
    setIsWaveTransition(false);
  }, []);

  const spawnRocket = useCallback(() => {
    if (rocketsToSpawnRef.current <= 0) return;

    const startX = Math.random() * CANVAS_WIDTH;
    // We need to use the latest state for targets, but since we are in a callback 
    // that might be stale, we'll use the functional update pattern if needed, 
    // but here we just need to spawn. The targets will be checked in the update loop anyway.
    // However, to pick a target, we do need the current state.
    
    setGameState(prev => {
      const targets = [...prev.cities, ...prev.turrets].filter(t => !t.isDestroyed);
      if (targets.length === 0) return prev;

      const target = targets[Math.floor(Math.random() * targets.length)];
      const newRocket: Rocket = {
        id: Math.random().toString(36).substr(2, 9),
        x: startX,
        y: 0,
        startX: startX,
        startY: 0,
        targetX: target.x,
        targetY: target.y,
        speed: (0.05 + Math.random() * 0.05 + (prev.wave * 0.01)) * 0.8,
        isDestroyed: false,
      };
      
      rocketsToSpawnRef.current -= 1;
      return {
        ...prev,
        rockets: [...prev.rockets, newRocket],
      };
    });
  }, []);

  const fireInterceptor = (targetX: number, targetY: number) => {
    if (gameState.status !== GameStatus.PLAYING || isWaveTransition) return;

    // Find closest turret with ammo
    const availableTurrets = gameState.turrets.filter(t => !t.isDestroyed && t.ammo > 0);
    if (availableTurrets.length === 0) return;

    const turret = availableTurrets.reduce((prev, curr) => {
      const distPrev = Math.hypot(prev.x - targetX, prev.y - targetY);
      const distCurr = Math.hypot(curr.x - targetX, curr.y - targetY);
      return distPrev < distCurr ? prev : curr;
    });

    const newInterceptor: Interceptor = {
      id: Math.random().toString(36).substr(2, 9),
      x: turret.x,
      y: turret.y,
      startX: turret.x,
      startY: turret.y,
      targetX,
      targetY,
      speed: 0.4,
      isExploded: false,
    };

    setGameState(prev => ({
      ...prev,
      interceptors: [...prev.interceptors, newInterceptor],
      turrets: prev.turrets.map(t => t.id === turret.id ? { ...t, ammo: t.ammo - 1 } : t),
    }));
  };

  const update = useCallback((deltaTime: number) => {
    if (gameState.status !== GameStatus.PLAYING) return;

    setGameState(prev => {
      // 1. Update Rockets
      const updatedRockets = prev.rockets.map(r => {
        const dx = r.targetX - r.x;
        const dy = r.targetY - r.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 5) {
          return { ...r, isDestroyed: true };
        }
        const vx = (dx / dist) * r.speed * deltaTime;
        const vy = (dy / dist) * r.speed * deltaTime;
        return { ...r, x: r.x + vx, y: r.y + vy };
      });

      // Handle Rocket impacts
      let newCities = [...prev.cities];
      let newTurrets = [...prev.turrets];
      const hittingRockets = updatedRockets.filter(r => r.isDestroyed);
      
      hittingRockets.forEach(r => {
        newCities = newCities.map(c => 
          !c.isDestroyed && Math.hypot(c.x - r.x, c.y - r.y) < 20 ? { ...c, isDestroyed: true } : c
        );
        newTurrets = newTurrets.map(t => 
          !t.isDestroyed && Math.hypot(t.x - r.x, t.y - r.y) < 20 ? { ...t, isDestroyed: true } : t
        );
      });

      // 2. Update Interceptors
      const newExplosions: Explosion[] = [...prev.explosions];
      const updatedInterceptors = prev.interceptors.filter(i => {
        const dx = i.targetX - i.x;
        const dy = i.targetY - i.y;
        const dist = Math.hypot(dx, dy);
        
        if (dist < 5) {
          newExplosions.push({
            id: Math.random().toString(36).substr(2, 9),
            x: i.targetX,
            y: i.targetY,
            radius: 2,
            maxRadius: EXPLOSION_MAX_RADIUS,
            growthRate: EXPLOSION_GROWTH_RATE,
            isFinished: false,
          });
          return false;
        }
        
        const vx = (dx / dist) * i.speed * deltaTime;
        const vy = (dy / dist) * i.speed * deltaTime;
        i.x += vx;
        i.y += vy;
        return true;
      });

      // 3. Update Explosions
      const updatedExplosions = newExplosions.map(e => {
        const newRadius = e.radius + e.growthRate * deltaTime;
        if (newRadius >= e.maxRadius) {
          return { ...e, isFinished: true };
        }
        return { ...e, radius: newRadius };
      }).filter(e => !e.isFinished);

      // 4. Collision Detection (Explosions vs Rockets)
      let scoreGain = 0;
      const finalRockets = updatedRockets.filter(r => {
        if (r.isDestroyed) return false;
        const hitByExplosion = updatedExplosions.some(e => {
          const dist = Math.hypot(r.x - e.x, r.y - e.y);
          // Standard circular collision
          if (dist < e.radius) return true;
          // Generous vertical collision (clicking below cat)
          const dx = Math.abs(r.x - e.x);
          const dy = e.y - r.y; // positive if explosion is below cat
          if (dx < e.radius && dy > 0 && dy < e.radius * 1.8) return true;
          return false;
        });
        if (hitByExplosion) {
          scoreGain += 20;
          return false;
        }
        return true;
      });

      // Check Game Over / Win
      const allTurretsDestroyed = newTurrets.every(t => t.isDestroyed);
      const totalAmmo = newTurrets.reduce((sum, t) => sum + (t.isDestroyed ? 0 : t.ammo), 0);
      const noAmmo = totalAmmo === 0 && updatedInterceptors.length === 0;
      
      const newScore = prev.score + scoreGain;
      
      let newStatus = prev.status;
      if (allTurretsDestroyed || (prev.mode === GameMode.INFINITE && noAmmo)) {
        newStatus = GameStatus.GAMEOVER;
      }
      
      if (prev.mode === GameMode.LIMITED && newScore >= WIN_SCORE) {
        newStatus = GameStatus.WON;
      }

      // Spawn new rockets periodically
      const now = performance.now();
      const spawnRate = prev.mode === GameMode.INFINITE 
        ? Math.min(3, 1 + prev.score / 2000) 
        : (1 + prev.wave * 0.1);

      if (now - lastSpawnTime.current > ROCKET_SPAWN_INTERVAL / spawnRate) {
        lastSpawnTime.current = now;
      }

      // Check Wave Completion (Only for Limited Mode)
      if (prev.mode === GameMode.LIMITED && rocketsToSpawnRef.current === 0 && finalRockets.length === 0 && !isWaveTransition) {
        // Wave complete!
        // Add remaining ammo to score
        const ammoBonus = prev.turrets.reduce((sum, t) => sum + (t.isDestroyed ? 0 : t.ammo * 5), 0);
        const finalScore = newScore + ammoBonus;
        
        if (prev.wave >= MAX_WAVES || finalScore >= WIN_SCORE) {
          return { ...prev, score: finalScore, status: GameStatus.WON };
        } else {
          setIsWaveTransition(true);
          return { ...prev, score: finalScore };
        }
      }

      return {
        ...prev,
        score: newScore,
        status: newStatus,
        rockets: finalRockets,
        interceptors: updatedInterceptors,
        explosions: updatedExplosions,
        cities: newCities,
        turrets: newTurrets,
      };
    });
  }, [gameState.status, isWaveTransition]);

  useGameLoop(update, gameState.status === GameStatus.PLAYING);

  // Separate effect for spawning rockets to avoid complex state logic inside update
  useEffect(() => {
    if (gameState.status !== GameStatus.PLAYING || isWaveTransition) return;
    
    // Spawn first rocket immediately
    spawnRocket();
    
    const interval = setInterval(() => {
      spawnRocket();
    }, ROCKET_SPAWN_INTERVAL / (1 + gameState.wave * 0.1));
    return () => clearInterval(interval);
  }, [gameState.status, gameState.wave, isWaveTransition, spawnRocket]);

  // Drawing
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Background - Warm Gradient
    const bgGradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
    bgGradient.addColorStop(0, '#fdf6e3');
    bgGradient.addColorStop(1, '#eee8d5');
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Ground
    ctx.fillStyle = '#93a1a1';
    ctx.fillRect(0, CANVAS_HEIGHT - 20, CANVAS_WIDTH, 20);

    // Cats (formerly Rockets)
    gameState.rockets.forEach(r => {
      ctx.save();
      ctx.translate(r.x, r.y);
      
      // Draw Cat (2x Larger)
      ctx.fillStyle = '#657b83'; // Darker grey/blue cat for contrast
      ctx.beginPath();
      ctx.ellipse(0, 0, 16, 12, 0, 0, Math.PI * 2);
      ctx.fill();
      
      // Ears
      ctx.beginPath();
      ctx.moveTo(-12, -8);
      ctx.lineTo(-16, -20);
      ctx.lineTo(-4, -10);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(12, -8);
      ctx.lineTo(16, -20);
      ctx.lineTo(4, -10);
      ctx.fill();
      
      // Eyes
      ctx.fillStyle = '#d33682'; // Magenta eyes for a bit of pop
      ctx.beginPath();
      ctx.arc(-6, -4, 3, 0, Math.PI * 2);
      ctx.arc(6, -4, 3, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.restore();

      // Trail / Trajectory (Full line from start)
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(203, 75, 22, 0.4)'; // Orange trajectory
      ctx.lineWidth = 1.5;
      ctx.setLineDash([2, 4]); // Fine dotted line
      ctx.moveTo(r.startX, r.startY);
      ctx.lineTo(r.x, r.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineWidth = 1;
    });

    // Hamsters (formerly Interceptors)
    gameState.interceptors.forEach(i => {
      ctx.save();
      ctx.translate(i.x, i.y);
      
      // Rotate slightly based on movement direction for "flying" effect
      const dx = i.targetX - i.startX;
      const dy = i.targetY - i.startY;
      const angle = Math.atan2(dy, dx);
      ctx.rotate(angle + Math.PI / 2);

      // Draw Hamster Body (2x Larger)
      ctx.fillStyle = '#e67e22'; // Vibrant carrot orange for visibility
      ctx.beginPath();
      ctx.ellipse(0, 0, 18, 22, 0, 0, Math.PI * 2);
      ctx.fill();
      
      // White Belly (Cuteness factor)
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(0, 6, 10, 12, 0, 0, Math.PI * 2);
      ctx.fill();

      // Ears (Round and pinkish)
      ctx.fillStyle = '#e67e22';
      ctx.beginPath();
      ctx.arc(-12, -16, 8, 0, Math.PI * 2);
      ctx.arc(12, -16, 8, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.fillStyle = '#ffb6c1'; // Light pink inner ear
      ctx.beginPath();
      ctx.arc(-12, -16, 4, 0, Math.PI * 2);
      ctx.arc(12, -16, 4, 0, Math.PI * 2);
      ctx.fill();
      
      // Cheeks (Pink blobs)
      ctx.fillStyle = 'rgba(255, 182, 193, 0.6)';
      ctx.beginPath();
      ctx.arc(-10, 0, 6, 0, Math.PI * 2);
      ctx.arc(10, 0, 6, 0, Math.PI * 2);
      ctx.fill();

      // Eyes (Bigger and black)
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.arc(-6, -6, 3, 0, Math.PI * 2);
      ctx.arc(6, -6, 3, 0, Math.PI * 2);
      ctx.fill();
      
      // Little nose
      ctx.fillStyle = '#ff69b4';
      ctx.beginPath();
      ctx.arc(0, -2, 2, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.restore();

      // Target X
      ctx.strokeStyle = '#268bd2'; // Blue target
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(i.targetX - 5, i.targetY - 5);
      ctx.lineTo(i.targetX + 5, i.targetY + 5);
      ctx.moveTo(i.targetX + 5, i.targetY - 5);
      ctx.lineTo(i.targetX - 5, i.targetY + 5);
      ctx.stroke();
      ctx.lineWidth = 1;
    });

    // Explosions
    gameState.explosions.forEach(e => {
      const gradient = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, e.radius);
      gradient.addColorStop(0, '#ffffff');
      gradient.addColorStop(0.4, '#b58900');
      gradient.addColorStop(0.8, '#cb4b16');
      gradient.addColorStop(1, 'rgba(203, 75, 22, 0)');
      
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2);
      ctx.fill();
    });

    // Cities
    gameState.cities.forEach(c => {
      if (c.isDestroyed) {
        ctx.fillStyle = '#93a1a1';
        ctx.fillRect(c.x - 15, c.y - 5, 30, 5);
      } else {
        ctx.fillStyle = '#859900'; // Green
        ctx.fillRect(c.x - 15, c.y - 20, 30, 20);
        ctx.fillStyle = '#586e75';
        ctx.fillRect(c.x - 10, c.y - 15, 5, 5);
        ctx.fillRect(c.x + 5, c.y - 15, 5, 5);
      }
    });

    // Turrets
    gameState.turrets.forEach(t => {
      if (t.isDestroyed) {
        ctx.fillStyle = '#93a1a1';
        ctx.beginPath();
        ctx.moveTo(t.x - 20, t.y);
        ctx.lineTo(t.x + 20, t.y);
        ctx.lineTo(t.x, t.y - 10);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.fillStyle = '#268bd2'; // Blue
        ctx.beginPath();
        ctx.moveTo(t.x - 20, t.y);
        ctx.lineTo(t.x + 20, t.y);
        ctx.lineTo(t.x, t.y - 30);
        ctx.closePath();
        ctx.fill();

        // Ammo count
        ctx.fillStyle = '#073642';
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(t.ammo.toString(), t.x, t.y + 15);
      }
    });

  }, [gameState]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (CANVAS_WIDTH / rect.width);
    const y = (e.clientY - rect.top) * (CANVAS_HEIGHT / rect.height);
    fireInterceptor(x, y);
  };

  return (
    <div className="min-h-screen bg-warm-bg text-warm-ink font-sans flex flex-col items-center justify-center p-4">
      {/* Header HUD */}
      <div className="w-full max-w-[800px] flex justify-between items-center mb-4 px-4 py-2 bg-warm-secondary border border-warm-ink/10 rounded-xl shadow-lg">
        <div className="flex items-center gap-4">
          <div className="flex flex-col">
            <span className="text-[10px] uppercase tracking-widest text-warm-ink/60">{t.score}</span>
            <span className="text-2xl font-mono font-bold text-warm-accent">{gameState.score.toString().padStart(5, '0')}</span>
          </div>
          <div className="h-8 w-px bg-warm-ink/10" />
          <div className="flex flex-col">
            <span className="text-[10px] uppercase tracking-widest text-warm-ink/60">{t.target}</span>
            <span className="text-2xl font-mono font-bold text-warm-ink/80">
              {gameState.mode === GameMode.INFINITE ? '∞' : `${gameState.wave}/${MAX_WAVES}`}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button 
            onClick={() => setLang(l => l === 'zh' ? 'en' : 'zh')}
            className="p-2 hover:bg-warm-ink/5 rounded-lg transition-colors text-warm-ink/60"
          >
            <Languages size={20} />
          </button>
          
          {gameState.status === GameStatus.PLAYING && (
            <button 
              onClick={quitGame}
              className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-600 text-[10px] font-bold uppercase tracking-widest rounded-lg border border-red-500/20 transition-all"
            >
              {t.quit}
            </button>
          )}

          <div className="flex gap-1">
            {gameState.turrets.map(turret => (
              <div key={turret.id} className={`flex flex-col items-center p-1 rounded border ${turret.isDestroyed ? 'border-red-900/50 bg-red-950/20' : 'border-warm-ink/10 bg-warm-bg/50'}`}>
                <Shield size={12} className={turret.isDestroyed ? 'text-red-500' : 'text-blue-500'} />
                <span className="text-[10px] font-mono">{turret.ammo}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Game Area */}
      <div className="relative group">
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          onClick={handleCanvasClick}
          className="bg-warm-secondary rounded-2xl shadow-xl border border-warm-ink/5 cursor-crosshair w-full max-w-[800px] aspect-[4/3]"
        />

        {/* Overlays */}
        <AnimatePresence>
          {(gameState.status !== GameStatus.PLAYING || isWaveTransition) && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex items-center justify-center bg-warm-bg/80 rounded-2xl backdrop-blur-sm z-50"
            >
              <motion.div
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                className="text-center p-8 max-w-md"
              >
                {gameState.status === GameStatus.START && (
                  <>
                    <h1 className="text-5xl font-bold mb-4 tracking-tighter text-warm-ink">
                      {t.title}
                    </h1>
                    <p className="text-warm-ink/60 mb-8 leading-relaxed">
                      {t.mission}
                    </p>
                    <div className="flex flex-col sm:flex-row gap-4 justify-center">
                      <button
                        onClick={() => initGame(GameMode.LIMITED)}
                        className="group relative px-8 py-4 bg-warm-accent text-white font-bold rounded-full overflow-hidden transition-all hover:scale-105 active:scale-95 shadow-lg"
                      >
                        <span className="relative z-10 flex items-center gap-2">
                          <Play size={20} fill="currentColor" />
                          {t.limitedMode}
                        </span>
                      </button>
                      <button
                        onClick={() => initGame(GameMode.INFINITE)}
                        className="group relative px-8 py-4 bg-warm-ink text-white font-bold rounded-full overflow-hidden transition-all hover:scale-105 active:scale-95 shadow-lg"
                      >
                        <span className="relative z-10 flex items-center gap-2">
                          <RotateCcw size={20} />
                          {t.infiniteMode}
                        </span>
                      </button>
                    </div>
                  </>
                )}

                {isWaveTransition && (
                  <>
                    <div className="mb-6 inline-flex p-4 bg-blue-500/20 rounded-full text-blue-600">
                      <Shield size={48} />
                    </div>
                    <h2 className="text-4xl font-bold mb-2 text-blue-600">{t.waveComplete}</h2>
                    <p className="text-warm-ink/60 mb-8">{t.score}: {gameState.score}</p>
                    <button
                      onClick={startNextWave}
                      className="flex items-center gap-2 mx-auto px-8 py-4 bg-warm-accent text-white font-bold rounded-full hover:scale-105 active:scale-95 transition-all shadow-lg"
                    >
                      <Play size={20} fill="currentColor" />
                      {t.nextWave}
                    </button>
                  </>
                )}

                {gameState.status === GameStatus.WON && (
                  <>
                    <div className="mb-6 inline-flex p-4 bg-emerald-500/20 rounded-full text-emerald-600">
                      <Trophy size={48} />
                    </div>
                    <h2 className="text-4xl font-bold mb-2 text-emerald-600">{t.victory}</h2>
                    <p className="text-warm-ink/60 mb-8">{t.score}: {gameState.score}</p>
                    <button
                      onClick={() => initGame(GameMode.LIMITED)}
                      className="flex items-center gap-2 mx-auto px-8 py-4 bg-warm-accent text-white font-bold rounded-full hover:scale-105 active:scale-95 transition-all shadow-lg"
                    >
                      <RotateCcw size={20} />
                      {t.restart}
                    </button>
                  </>
                )}

                {gameState.status === GameStatus.GAMEOVER && (
                  <>
                    <div className="mb-6 inline-flex p-4 bg-red-500/20 rounded-full text-red-600">
                      <RocketIcon size={48} />
                    </div>
                    <h2 className="text-4xl font-bold mb-2 text-red-600">{t.gameOver}</h2>
                    <p className="text-warm-ink/60 mb-8">
                      {gameState.turrets.every(t => t.isDestroyed) ? t.allTurretsDestroyed : t.ammoOut}
                      <br />
                      {t.score}: {gameState.score}
                    </p>
                    <button
                      onClick={() => initGame(gameState.mode)}
                      className="flex items-center gap-2 mx-auto px-8 py-4 bg-red-600 text-white font-bold rounded-full hover:bg-red-500 hover:scale-105 active:scale-95 transition-all shadow-lg"
                    >
                      <RotateCcw size={20} />
                      {t.restart}
                    </button>
                  </>
                )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Footer Info */}
      <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-8 w-full max-w-[800px] text-warm-ink/40 text-[11px] uppercase tracking-widest">
        <div className="flex items-center gap-3 bg-warm-secondary p-4 rounded-xl border border-warm-ink/5 shadow-sm">
          <Target size={16} className="text-warm-accent" />
          <span>{t.hint}</span>
        </div>
        <div className="flex items-center gap-3 bg-warm-secondary p-4 rounded-xl border border-warm-ink/5 shadow-sm">
          <Shield size={16} className="text-blue-500" />
          <span>{lang === 'zh' ? '保护城市与炮台' : 'Protect cities and batteries'}</span>
        </div>
        <div className="flex items-center gap-3 bg-warm-secondary p-4 rounded-xl border border-warm-ink/5 shadow-sm">
          <RocketIcon size={16} className="text-red-500" />
          <span>{lang === 'zh' ? '预判猫咪飞行轨迹' : 'Predict cat flight paths'}</span>
        </div>
      </div>
    </div>
  );
}
