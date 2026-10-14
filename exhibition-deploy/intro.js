// Loader screen: the title head, a short story told line by line, a bar that fills step by step,
// and an Enter button that is ALWAYS active (clicking it early just waits for the assets, then goes in).
(() => {
  const $ = (id) => document.getElementById(id);
  // [text, how long it stays (ms, including reading time)]. The last line stays until Enter.
  const LINES = [
    ['in a quiet neighbourhood in Istanbul', 3000],
    ['I spent my childhood in my grandmother’s house', 3300],
    ['I later 3D scanned it', 2400],
    ['in an attempt to simulate my memories virtually', 3200],
    ['enter my virtual archive', 0],
  ];
  const FADE = 550;
  let step = 0, real = 0, ready = false, entered = false, handler = null, timers = [];
  const wait = (ms) => new Promise((r) => timers.push(setTimeout(r, ms)));

  function bar() {                         // text-paced, but never ahead of what has really loaded
    const stepFrac = Math.min(step, LINES.length) / LINES.length;
    $('barfill').style.width = (Math.min(entered ? 1 : stepFrac, ready ? 1 : real) * 100).toFixed(1) + '%';
  }
  async function run() {
    const t = $('introText');
    for (let i = 0; i < LINES.length && !entered; i++) {
      t.classList.remove('in'); await wait(i ? FADE : 300);
      if (entered) return;
      t.textContent = LINES[i][0]; t.classList.toggle('last', i === LINES.length - 1);
      step = i + 1; bar(); t.classList.add('in');
      if (!LINES[i][1]) return;
      await wait(LINES[i][1]);
    }
  }
  function go() { if (handler && ready && entered) { timers.forEach(clearTimeout); handler(); handler = null; } }

  $('enter').addEventListener('click', () => {
    entered = true; bar();
    if (!ready) { $('enter').textContent = 'Loading…'; $('introText').classList.remove('in'); }
    go();
  });
  window.Intro = {
    setProgress(f) { real = f; bar(); },
    setReady() { ready = true; $('loader').classList.add('ready'); bar(); go(); },
    onEnter(fn) { handler = fn; go(); },
  };
  run();
})();
