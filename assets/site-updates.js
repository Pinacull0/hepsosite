// Enhancements shared by all pages; original page scripts retain their existing roles.
document.addEventListener('DOMContentLoaded', () => {
  const dropdown = document.getElementById('produtosDropdown');
  if (dropdown) {
    const button = dropdown.querySelector('.menu-dropdown-btn');
    const panel = dropdown.querySelector('.dropdown-panel');
    const setOpen = open => {
      dropdown.classList.toggle('open', open);
      button.setAttribute('aria-expanded', String(open));
      panel.inert = !open;
      panel.setAttribute('aria-hidden', String(!open));
      if (!open) dropdown.querySelectorAll('.projects-menu').forEach(menu => {
        menu.classList.remove('is-open');
        menu.querySelector('.projects-toggle').setAttribute('aria-expanded', 'false');
      });
    };
    button.addEventListener('click', event => { event.preventDefault(); setOpen(true); });
    dropdown.addEventListener('mouseenter', () => { if (matchMedia('(hover:hover)').matches) setOpen(true); });
    dropdown.addEventListener('mouseleave', () => { if (!dropdown.contains(document.activeElement)) setOpen(false); });
    dropdown.addEventListener('focusin', () => setOpen(true));
    dropdown.addEventListener('focusout', event => { if (!dropdown.contains(event.relatedTarget)) setOpen(false); });
    dropdown.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); button.focus(); setOpen(false); } });
    document.addEventListener('click', event => { if (!dropdown.contains(event.target)) setOpen(false); });
    setOpen(false);
  }
  const mobile = document.getElementById('navbarMobile');
  if (mobile) {
    const syncMobile = () => { const open = mobile.classList.contains('open'); mobile.inert = !open; mobile.setAttribute('aria-hidden', String(!open)); };
    new MutationObserver(syncMobile).observe(mobile, { attributes: true, attributeFilter: ['class'] });
    syncMobile();
  }
  document.querySelectorAll('.projects-menu').forEach(menu => {
    const toggle = menu.querySelector('.projects-toggle');
    const setOpen = open => { menu.classList.toggle('is-open', open); toggle.setAttribute('aria-expanded', String(open)); };
    toggle.addEventListener('click', event => { event.stopPropagation(); setOpen(true); });
    menu.addEventListener('mouseenter', () => { if (matchMedia('(hover:hover)').matches) setOpen(true); });
    menu.addEventListener('mouseleave', () => { if (!menu.contains(document.activeElement)) setOpen(false); });
    menu.addEventListener('focusin', () => setOpen(true));
    menu.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); menu.querySelector('.projects-menu-heading>a').focus(); setOpen(false); } });
    menu.addEventListener('focusout', event => { if (!menu.contains(event.relatedTarget)) setOpen(false); });
  });
  // Use the same native scroll-follow behavior in every side-by-side media/copy layout.
  const pairs = [];
  const layouts = [
    ['.prod-grid', '.prod-media'],
    ['.about-wrap', '.about-media'],
    ['.etapas-layout', '.etapas-media-box'],
    ['.catalogo-grid', '.catalogo-media']
  ];
  layouts.forEach(([layoutSelector, mediaSelector]) => {
    document.querySelectorAll(layoutSelector).forEach(layout => {
      const media = layout.querySelector(':scope > ' + mediaSelector);
      const copy = [...layout.children].find(child => child !== media);
      if (!media || !copy) return;
      media.classList.add('follow-media');
      pairs.push({ media, copy });
    });
  });
  if (pairs.length) {
    const header = document.querySelector('.navbar-root');
    let scheduled = false;
    function updateFollowing() {
      scheduled = false;
      const headerHeight = header ? header.getBoundingClientRect().height : 0;
      pairs.forEach(({ media, copy }) => {
        const picture = media.getBoundingClientRect();
        const text = copy.getBoundingClientRect();
        const sideBySide = picture.left >= text.right - 1 || text.left >= picture.right - 1;
        // Taller media can scroll into view before sticking; its bottom remains reachable.
        const top = Math.min(headerHeight + 16, innerHeight - picture.height - 16);
        media.style.setProperty('--follow-top', Math.round(top) + 'px');
        media.classList.toggle('is-following', sideBySide && text.height > picture.height + 8);
      });
    }
    function scheduleFollowing() {
      if (!scheduled) { scheduled = true; requestAnimationFrame(updateFollowing); }
    }
    if ('ResizeObserver' in window) {
      const observer = new ResizeObserver(scheduleFollowing);
      pairs.forEach(({ media, copy }) => { observer.observe(media); observer.observe(copy); });
      if (header) observer.observe(header);
    }
    window.addEventListener('resize', scheduleFollowing, { passive: true });
    window.addEventListener('load', scheduleFollowing, { once: true });
    if (document.fonts) document.fonts.ready.then(scheduleFollowing);
    updateFollowing();
  }
  // Prepare section videos near the viewport, but start playback only when visible.
  // Hero slides keep their existing playback controller.
  const videos = [...document.querySelectorAll('main video:not(.hero-video-bg)')];
  const prepared = new WeakSet();
  const started = new WeakSet();
  videos.forEach(video => {
    video.autoplay = false;
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
  });
  function prepareVideo(video) {
    if (prepared.has(video)) return;
    prepared.add(video);
    if (video.dataset.src) { video.src = video.dataset.src; delete video.dataset.src; }
    video.preload = 'metadata';
    video.load();
  }
  function playVisibleVideo(video) {
    if (started.has(video)) return;
    prepareVideo(video);
    // Keep the user's pause/play controls after the automatic initial start.
    const play = video.play();
    if (play) play.then(() => started.add(video)).catch(() => { video.controls = true; });
  }
  if ('IntersectionObserver' in window) {
    const preloadObserver = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) { prepareVideo(entry.target); preloadObserver.unobserve(entry.target); }
    }), { rootMargin: '200px' });
    const playObserver = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting && entry.intersectionRatio > 0) playVisibleVideo(entry.target);
    }), { threshold: [0, 0.01] });
    videos.forEach(video => { preloadObserver.observe(video); playObserver.observe(video); });
  } else {
    const checkVisibleVideos = () => videos.forEach(video => {
      const rect = video.getBoundingClientRect();
      if (rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth) playVisibleVideo(video);
    });
    window.addEventListener('scroll', checkVisibleVideos, { passive: true });
    window.addEventListener('resize', checkVisibleVideos, { passive: true });
    checkVisibleVideos();
  }
});
