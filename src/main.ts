import { Game } from './Game';

window.addEventListener('DOMContentLoaded', () => {
  const startScreen = document.getElementById('start-screen')!;
  const startBtn = document.getElementById('start-btn') as HTMLButtonElement;
  const hud = document.getElementById('hud')!;

  const game = new Game();
  game.start();
  const launch = (playAudio: boolean): void => {
    if (!startScreen.classList.contains('active')) return;
    if (playAudio) {
    const bgm = new Audio('./bgm.mp3');
    bgm.loop = true;
    bgm.volume = 0.32;
    void bgm.play().catch(() => undefined);
    }

    startScreen.classList.remove('active');
    hud.classList.remove('hidden');
    game.activate();
    (window as unknown as { game: Game }).game = game;
  };

  startBtn.addEventListener('click', () => launch(true));
  if (new URLSearchParams(window.location.search).has('autostart')) launch(false);
});
