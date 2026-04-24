import { Game } from './Game';

// 等待 DOM 加载完成
window.addEventListener('DOMContentLoaded', () => {
  const startScreen = document.getElementById('start-screen')!;
  const startBtn = document.getElementById('start-btn') as HTMLButtonElement;
  const controlsHint = document.querySelector('.controls-hint') as HTMLElement;

  // 初始状态
  startScreen.classList.add('active');
  controlsHint.classList.add('hidden');

  let game: Game | null = null;

  startBtn.addEventListener('click', () => {
    // 播放背景音乐
    const bgm = new Audio('./bgm.mp3');
    bgm.loop = true;
    bgm.volume = 0.5;
    bgm.play().catch((e: Error) => console.warn("自动播放被阻止，需要用户交互:", e));

    // 隐藏开始屏幕
    startScreen.classList.remove('active');
    controlsHint.classList.remove('hidden');

    // 延迟启动游戏
    setTimeout(() => {
      if (!game) {
        game = new Game();
        game.start();
        (window as unknown as { game: Game }).game = game;
      }
    }, 300);
  });
});
