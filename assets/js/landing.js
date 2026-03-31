'use strict';
/* AgriHibalo — landing.js  (index.html only) */

/* ── BOOT ── */
document.addEventListener('DOMContentLoaded', () => {
  bootLoader();
  bootCursor();
  bootCanvas();
  bootNavScroll();
  bootRipple();
  animateStats();
});

/* ── LOADER ── */
function bootLoader() {
  window.addEventListener('load', () =>
    setTimeout(() => document.getElementById('loader')?.classList.add('done'), 600)
  );
}

/* ── CURSOR ── */
function bootCursor() {
  const g = document.getElementById('cursor-glow');
  if (!g || window.matchMedia('(hover:none)').matches) return;
  let mx = 0, my = 0, cx = 0, cy = 0;
  document.addEventListener('mousemove', e => { mx = e.clientX; my = e.clientY; });
  (function tick() {
    cx += (mx - cx) * .18; cy += (my - cy) * .18;
    g.style.left = cx + 'px'; g.style.top = cy + 'px';
    requestAnimationFrame(tick);
  })();
  document.addEventListener('mouseover', e => {
    g.classList.toggle('hovering', !!e.target.closest('a,button,[role="button"]'));
  });
}

/* ── HERO CANVAS PARTICLES ── */
function bootCanvas() {
  const canvas = document.getElementById('hero-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let W, H, particles = [];

  function resize() {
    W = canvas.width  = canvas.offsetWidth;
    H = canvas.height = canvas.offsetHeight;
  }

  class P {
    constructor() { this.reset(true); }
    reset(init) {
      this.x  = Math.random() * W;
      this.y  = init ? Math.random() * H : H + 10;
      this.r  = Math.random() * 2 + .5;
      this.vx = (Math.random() - .5) * .4;
      this.vy = -(Math.random() * .6 + .2);
      this.a  = Math.random() * .5 + .1;
      this.col = Math.random() > .5
        ? `rgba(255,191,52,${this.a})`
        : `rgba(255,255,255,${this.a * .55})`;
    }
    update() { this.x += this.vx; this.y += this.vy; if (this.y < -10) this.reset(false); }
    draw()   { ctx.beginPath(); ctx.arc(this.x, this.y, this.r, 0, Math.PI*2); ctx.fillStyle = this.col; ctx.fill(); }
  }

  new ResizeObserver(resize).observe(canvas.parentElement);
  resize();
  particles = Array.from({ length: 70 }, () => new P());
  (function animate() { ctx.clearRect(0, 0, W, H); particles.forEach(p => { p.update(); p.draw(); }); requestAnimationFrame(animate); })();
}

/* ── NAVBAR SCROLL SHADOW ── */
function bootNavScroll() {
  window.addEventListener('scroll', () =>
    document.getElementById('navbar')?.classList.toggle('scrolled', window.scrollY > 4),
    { passive: true }
  );
}

/* ── RIPPLE ── */
function bootRipple() {
  document.addEventListener('click', e => {
    const btn = e.target.closest('a,button');
    if (!btn) return;
    const r = document.createElement('div');
    const sz = 60;
    r.className = 'ripple';
    r.style.cssText = `width:${sz}px;height:${sz}px;left:${e.clientX-sz/2}px;top:${e.clientY-sz/2}px`;
    document.getElementById('rpl-root')?.appendChild(r);
    r.addEventListener('animationend', () => r.remove());
  });
}

/* ── BURGER ── */
function toggleBurger() {
  const mn = document.getElementById('mob-nav');
  const bg = document.getElementById('burger');
  const o  = mn.classList.toggle('open');
  bg.classList.toggle('open', o);
  bg.setAttribute('aria-expanded', String(o));
}

/* ── ANIMATE STAT COUNTERS ── */
function animateStats() {
  const targets = [
    { id: 'lp-q', target: 5  },
    { id: 'lp-a', target: 8  },
  ];
  const obs = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      targets.forEach(({ id, target }) => {
        const el = document.getElementById(id);
        if (!el) return;
        let t = 0;
        const timer = setInterval(() => {
          t += 16;
          const p = Math.min(t / 800, 1);
          el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3)));
          if (p >= 1) clearInterval(timer);
        }, 16);
      });
      obs.disconnect();
    });
  }, { threshold: .3 });

  const statsEl = document.querySelector('.lp-mini-stats');
  if (statsEl) obs.observe(statsEl);
}

/* ── SCROLL REVEAL ── */
function bootScrollReveal() {
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.style.animationPlayState = 'running';
        obs.unobserve(e.target);
      }
    });
  }, { threshold: .15 });
  document.querySelectorAll('.how-card, .dc, .tl-item').forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(20px)';
    el.style.transition = 'opacity .45s ease, transform .45s ease';
    obs.observe(el);
  });
}

/* ── DOMAIN ROUTING → app.html ── */
function goToFeed(domain) {
  sessionStorage.setItem('domain', domain);
  window.location.href = 'app.html';
}