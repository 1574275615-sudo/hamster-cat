export enum GameStatus {
  START = 'START',
  PLAYING = 'PLAYING',
  WON = 'WON',
  GAMEOVER = 'GAMEOVER',
}

export enum GameMode {
  LIMITED = 'LIMITED',
  INFINITE = 'INFINITE',
}

export interface Point {
  x: number;
  y: number;
}

export interface Rocket extends Point {
  id: string;
  startX: number;
  startY: number;
  targetX: number;
  targetY: number;
  speed: number;
  isDestroyed: boolean;
}

export interface Interceptor extends Point {
  id: string;
  startX: number;
  startY: number;
  targetX: number;
  targetY: number;
  speed: number;
  isExploded: boolean;
}

export interface Explosion extends Point {
  id: string;
  radius: number;
  maxRadius: number;
  growthRate: number;
  isFinished: boolean;
}

export interface Turret {
  id: number;
  x: number;
  y: number;
  ammo: number;
  maxAmmo: number;
  isDestroyed: boolean;
}

export interface City {
  id: number;
  x: number;
  y: number;
  isDestroyed: boolean;
}

export interface GameState {
  score: number;
  status: GameStatus;
  mode: GameMode;
  rockets: Rocket[];
  interceptors: Interceptor[];
  explosions: Explosion[];
  turrets: Turret[];
  cities: City[];
  wave: number;
}
