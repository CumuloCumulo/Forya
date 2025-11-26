import { Game } from './Game.js';

// 等待 DOM 加载完成
window.addEventListener('DOMContentLoaded', () => {
  // 显示开始屏幕
  const startScreen = document.getElementById('start-screen');
  const startBtn = document.getElementById('start-btn');
  const controlsHint = document.querySelector('.controls-hint');
  
  // 初始状态
  startScreen.classList.add('active');
  controlsHint.classList.add('hidden');

  let game = null;

  startBtn.addEventListener('click', () => {
    // 播放背景音乐
    const bgm = new Audio('./bgm.mp3');
    bgm.loop = true;
    bgm.volume = 0.5; // 设置合适音量
    bgm.play().catch(e => console.warn("自动播放被阻止，需要用户交互:", e));

    // 隐藏开始屏幕
    startScreen.classList.remove('active');
    controlsHint.classList.remove('hidden');
    
    // 延迟一点启动游戏，给 UI 动画一点时间
    setTimeout(() => {
      if (!game) {
        game = new Game();
        game.start();
        window.game = game;
      }
    }, 300);
  });
});

