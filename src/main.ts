import { Game } from './Game';
import type { GameMode } from './gameplay/GameMode';

window.addEventListener('DOMContentLoaded', () => {
  const startScreen = document.getElementById('start-screen')!;
  const checkpointBtn = document.getElementById('checkpoint-btn') as HTMLButtonElement;
  const freeFlightBtn = document.getElementById('free-flight-btn') as HTMLButtonElement;
  const hud = document.getElementById('hud')!;

  const game = new Game();
  game.start();
  const launch = (mode: GameMode, playAudio: boolean): void => {
    if (!startScreen.classList.contains('active')) return;
    if (playAudio) {
    const bgm = new Audio('./bgm.mp3');
    bgm.loop = true;
    bgm.volume = 0.32;
    void bgm.play().catch(() => undefined);
    }

    startScreen.classList.remove('active');
    hud.classList.remove('hidden');
    game.activate(mode);
    (window as unknown as { game: Game }).game = game;
  };

  checkpointBtn.addEventListener('click', () => launch('checkpoint', true));
  freeFlightBtn.addEventListener('click', () => launch('free', true));
  const autoMode = new URLSearchParams(window.location.search).get('autostart');
  if (autoMode !== null) launch(autoMode === 'free' ? 'free' : 'checkpoint', false);
});
