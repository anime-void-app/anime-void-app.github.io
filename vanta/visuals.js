/* VANTA 0.4 / bespoke visuals. No telemetry, no third-party animation packages. */
(() => {
  'use strict';

  const root = document.documentElement;
  const $ = (id) => document.getElementById(id);
  const canvas = $('neuralField');
  const hero = $('hero');
  const shell = $('vantaOrbit');
  const coreCaption = $('coreCaption');
  const stateNode = $('status');
  const send = $('send');
  const motionInput = $('motionChoice');
  const THEME_KEY = 'vanta.visual.theme';
  const MOTION_KEY = 'vanta.visual.motion';
  const palettes = Object.freeze({
    nebula: { accent: [179, 154, 255], secondary: [131, 204, 233] },
    arctic: { accent: [116, 220, 229], secondary: [157, 190, 255] },
    ember: { accent: [237, 182, 131], secondary: [223, 156, 190] }
  });
  const motionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const mobileQuery = window.matchMedia?.('(max-width: 680px)');
  let theme = 'nebula';
  let motionEnabled = true;
  let visible = true;
  let raf = null;
  let latestTime = 0;
  let lastElapsed = 0;
  let particles = [];
  let ctx;
  let w = 0, h = 0;
  let movement = { x: 0, y: 0 };
  let pointer = { x: 0, y: 0 };
  let isLoading = false;

  try {
    const savedTheme = localStorage.getItem(THEME_KEY);
    if (savedTheme && palettes[savedTheme]) theme = savedTheme;
    motionEnabled = localStorage.getItem(MOTION_KEY) !== 'off';
  } catch (_) { /* Private browser sessions may disable storage. */ }

  const useMotion = () => motionEnabled && !motionQuery?.matches;
  const showActiveTheme = () => {
    root.dataset.vantaTheme = theme;
    root.classList.toggle('vanta-motion-off', !motionEnabled);
    document.querySelectorAll('[data-theme]').forEach(button => {
      const selected = button.dataset.theme === theme;
      button.setAttribute('aria-pressed', selected ? 'true' : 'false');
    });
    if (motionInput) motionInput.checked = motionEnabled;
    const chromeBar = document.querySelector('meta[name="theme-color"]');
    if (chromeBar) chromeBar.content = theme === 'arctic' ? '#061318' : theme === 'ember' ? '#151010' : '#080910';
    const themeLabel = $('themeLabel');
    if (themeLabel) themeLabel.textContent = theme.toUpperCase();
  };
  const savePreference = (key, value) => {
    try { localStorage.setItem(key, value); } catch (_) {}
  };

  document.querySelectorAll('[data-theme]').forEach(button => {
    button.addEventListener('click', () => {
      const choice = button.dataset.theme;
      if (!palettes[choice]) return;
      theme = choice;
      savePreference(THEME_KEY, theme);
      showActiveTheme();
      drawStatic();
    });
  });
  if (motionInput) {
    motionInput.addEventListener('change', () => {
      motionEnabled = motionInput.checked;
      savePreference(MOTION_KEY, motionEnabled ? 'on' : 'off');
      showActiveTheme();
      if (useMotion()) start();
      else { stop(); drawStatic(); }
    });
  }

  function updateState() {
    const label = stateNode?.textContent || '';
    const ready = /готов|доступен|Ollama/i.test(label) && !/не\s|нет\s|не\s+запущ/i.test(label);
    isLoading = send?.textContent?.trim() === '■';
    root.classList.toggle('vanta-loading', isLoading);
    if (coreCaption) coreCaption.textContent = isLoading
      ? 'STREAM ACTIVE'
      : ready ? 'NEURAL LINK ESTABLISHED' : 'AWAITING NEURAL LINK';
    const coreDetail = $('coreDetail');
    if (coreDetail) coreDetail.textContent = isLoading
      ? 'PROCESSING'
      : ready ? 'ONLINE' : 'STANDBY';
  }
  if (stateNode || send) {
    const observer = new MutationObserver(updateState);
    if (stateNode) observer.observe(stateNode, { childList: true, subtree: true, characterData: true });
    if (send) observer.observe(send, { childList: true, subtree: true, characterData: true });
    updateState();
  }

  if (shell && window.matchMedia?.('(hover: hover) and (pointer: fine)').matches) {
    shell.addEventListener('pointermove', event => {
      if (!useMotion()) return;
      const rect = shell.getBoundingClientRect();
      const xx = (event.clientX - rect.left) / Math.max(1, rect.width) - .5;
      const yy = (event.clientY - rect.top) / Math.max(1, rect.height) - .5;
      shell.style.transform = 'perspective(700px) rotateY(' + (xx * 7).toFixed(2) +
        'deg) rotateX(' + (-yy * 6).toFixed(2) + 'deg)';
    }, { passive:true });
    shell.addEventListener('pointerleave', () => { shell.style.transform = ''; }, { passive:true });
    shell.style.transition = 'transform 260ms ease';
  }

  if (!canvas || !hero || !(ctx = canvas.getContext('2d', { alpha: true }))) {
    showActiveTheme();
    return;
  }
  function isSmall() { return mobileQuery?.matches || w < 560; }
  function resize() {
    const rect = hero.getBoundingClientRect();
    w = Math.max(1, Math.ceil(rect.width));
    h = Math.max(1, Math.ceil(rect.height));
    const dpr = Math.min(window.devicePixelRatio || 1, isSmall() ? 1.25 : 1.5);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const number = isSmall() ? 22 : Math.min(62, Math.round(w / 15));
    particles = Array.from({ length:number }, (_, i) => ({
      x: (i * 0.6180339887498948 % 1) * w,
      y: (i * 0.7548776662466927 % 1) * h,
      r: i % 13 === 0 ? 1.65 : .6 + ((i * 7) % 9) / 13,
      dx: .15 + ((i * 11) % 7) / 31,
      dy: .05 + ((i * 13) % 5) / 37,
      seed: i * 8.17
    }));
    drawStatic();
  }
  function drawStatic(now=0) {
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    const palette = palettes[theme];
    const [ar,ag,ab] = palette.accent;
    const [br,bg,bb] = palette.secondary;
    const hasMotion = useMotion();
    for (let i=0;i<particles.length;i++) {
      const a = particles[i];
      const ax = (a.x + (hasMotion ? now * a.dx * .009 : 0)) % w;
      const ay = (a.y + (hasMotion ? now * a.dy * .01 : 0)) % h;
      const pulse = hasMotion ? (.5 + .5*Math.sin(now * .0006 + a.seed)) : .68;
      ctx.beginPath();
      ctx.fillStyle = i % 5 === 0
        ? 'rgba(' + br + ',' + bg + ',' + bb + ',' + (.19 + pulse*.36).toFixed(3) + ')'
        : 'rgba(' + ar + ',' + ag + ',' + ab + ',' + (.12 + pulse*.25).toFixed(3) + ')';
      ctx.arc(ax,ay,a.r,0,Math.PI*2);
      ctx.fill();
      if (i % 10 === 0) {
        ctx.beginPath();ctx.arc(ax,ay,a.r + 3,0,Math.PI*2);
        ctx.strokeStyle = 'rgba(' + ar + ',' + ag + ',' + ab + ',.08)';
        ctx.stroke();
      }
    }
    // Sparse network bonds, never a full N*N screen-filling lattice.
    ctx.lineWidth = .65;
    const cutoff = isSmall() ? 80 : 115;
    for (let i=0; i<particles.length; i+=2) {
      const a=particles[i];
      const x1=(a.x+(hasMotion?now*a.dx*.009:0))%w;
      const y1=(a.y+(hasMotion?now*a.dy*.01:0))%h;
      for(let j=i+1; j<Math.min(i+13,particles.length); j++){
        const b=particles[j];
        const x2=(b.x+(hasMotion?now*b.dx*.009:0))%w;
        const y2=(b.y+(hasMotion?now*b.dy*.01:0))%h;
        const dist=Math.hypot(x2-x1,y2-y1);
        if(dist>cutoff)continue;
        ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);
        ctx.strokeStyle='rgba('+ar+','+ag+','+ab+','+(0.045*(1-dist/cutoff)).toFixed(3)+')';
        ctx.stroke();
      }
    }
  }
  function stop() {
    if (raf !== null) window.cancelAnimationFrame(raf);
    raf = null;
  }
  function tick(t) {
    raf = null;
    if (!useMotion() || !visible || document.hidden || hero.classList.contains('hidden')) return;
    if (t - latestTime >= (isSmall() ? 52 : 34)) {
      latestTime = t;
      lastElapsed = t;
      drawStatic(t);
    }
    raf = window.requestAnimationFrame(tick);
  }
  function start() {
    if (raf !== null || !useMotion() || !visible || document.hidden || hero.classList.contains('hidden')) return;
    raf = window.requestAnimationFrame(tick);
  }
  const onVisibility = () => { if(document.hidden) stop(); else start(); };
  document.addEventListener('visibilitychange',onVisibility);
  if (window.ResizeObserver) new ResizeObserver(() => {resize();start();}).observe(hero);
  else window.addEventListener('resize', () => {resize();start();},{passive:true});
  if (window.IntersectionObserver) {
    new IntersectionObserver(entries => {
      visible = !!entries[0]?.isIntersecting;
      if (visible) start(); else stop();
    }, {threshold:0.04}).observe(hero);
  }
  // Stream update may hide the welcome panel while the chat is open.
  new MutationObserver(() => {
    if (hero.classList.contains('hidden')) stop();
    else start();
  }).observe(hero,{attributes:true,attributeFilter:['class']});
  if (motionQuery?.addEventListener) motionQuery.addEventListener('change',()=>{if(useMotion())start();else {stop();drawStatic();}});
  showActiveTheme();
  resize();
  start();
})();