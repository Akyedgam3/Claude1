// أنميشن الدخول: بيتركّب فوراً (قبل تحميل أي شي تاني) وبيضل لحتى تجهز الواجهة، بحد أدنى كم ثانية حتى يكتمل العرض.
import './intro.css';
import logo from '../renderer/src/assets/logo.png';

const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const MIN_MS = reduced ? 250 : 1900;
const started = performance.now();
let el: HTMLElement | null = null;

function mount(): void {
  el = document.createElement('div');
  el.id = 'wazn-intro';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = `
    <div class="wi-grid"></div><div class="wi-orb wi-o1"></div><div class="wi-orb wi-o2"></div>
    <div class="wi-center">
      <div class="wi-ring"></div><div class="wi-ring r2"></div>
      <img class="wi-logo" src="${logo}" alt="" />
      <div class="wi-name">وزن</div>
      <div class="wi-tag">حساباتك صارت <b>بوزنها</b></div>
    </div>
    <div class="wi-bar"><i></i></div>`;
  document.body.append(el);
}

function remove(): void {
  if (!el) return;
  const e = el;
  el = null;
  e.classList.add('wi-out');
  setTimeout(() => e.remove(), 600);
}

/** بيتلاشى الأنميشن لما تجهز الواجهة (أو بعد 6 ثواني كحد أقصى). */
export function finishIntro(failed = false): void {
  if (failed) return remove();
  const wait = Math.max(0, MIN_MS - (performance.now() - started));
  setTimeout(() => {
    const t0 = performance.now();
    const check = () => {
      const ready = document.querySelector('#root > :not(.splash)');
      if (ready || performance.now() - t0 > 4000) remove();
      else setTimeout(check, 60);
    };
    check();
  }, wait);
}

mount();
