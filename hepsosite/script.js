document.addEventListener('DOMContentLoaded', () => {
  // ====== Ano no footer ======
  (function () {
    const y = document.getElementById('footerYear');
    if (y) y.textContent = String(new Date().getFullYear());
  })();

  // ====== HERO: slider básico (15s por slide) ======
  (function heroSlider(){
    const slidesEls = [...document.querySelectorAll('.hero-slide')];
    if (!slidesEls.length) return;

    const dotsWrap = document.querySelector('.hero-dots');
    const btnNext = document.getElementById('heroNext');
    const btnPrev = document.getElementById('heroPrev');
    // classe correta da seção hero:
    const hero    = document.querySelector('.hero-section');

    const delay = 15000;
    let current = 0, timer = null;

    slidesEls.forEach((s,i)=>s.classList.toggle('active', i===current));

    function renderDots(){
      if (!dotsWrap) return;
      dotsWrap.innerHTML = '';
      slidesEls.forEach((_,i)=>{
        const d=document.createElement('button');
        d.type='button';
        d.className='hero-dot'+(i===current?' active':'');
        d.setAttribute('aria-label',`Ir para slide ${i+1}`);
        d.setAttribute('aria-current', String(i===current));
        d.addEventListener('click',()=>{ go(i,true); });
        dotsWrap.appendChild(d);
      });
    }

    function syncActiveVideos(){
      slidesEls.forEach((slide,i)=>{
        const v=slide.querySelector('video');
        if(!v) return;
        if(i===current){
          v.play().catch(()=>{});
        } else {
          v.pause();
          try { v.currentTime = 0; } catch(_) {}
        }
      });
    }

    function go(index, manual){
      slidesEls[current].classList.remove('active');
      current = (index + slidesEls.length) % slidesEls.length;
      slidesEls[current].classList.add('active');
      renderDots();
      syncActiveVideos();
      if (manual) restart();
    }

    const next = () => go(current+1);
    const prev = () => go(current-1);
    const restart = () => {
      clearInterval(timer);
      timer = setInterval(next, delay);
    };

    btnNext?.addEventListener('click', ()=>{ next(); restart(); });
    btnPrev?.addEventListener('click', ()=>{ prev(); restart(); });

    // Teclado
    window.addEventListener('keydown', (e)=>{
      if (e.key==='ArrowRight'){ next(); restart(); }
      if (e.key==='ArrowLeft'){  prev(); restart(); }
    });

    // Pausa ao passar o mouse (desktop)
    hero?.addEventListener('mouseenter', ()=>clearInterval(timer));
    hero?.addEventListener('mouseleave', restart);

    renderDots();
    restart();
    syncActiveVideos();

    // Destrava autoplay na primeira interação
    function resumeAll(){
      slidesEls.forEach(slide=>{
        const v = slide.querySelector('video');
        v?.play().catch(()=>{});
      });
      window.removeEventListener('pointerdown', resumeAll);
      window.removeEventListener('keydown', resumeAll);
    }
    window.addEventListener('pointerdown', resumeAll);
    window.addEventListener('keydown', resumeAll);

    // Pausa quando a aba não está visível
    document.addEventListener('visibilitychange', ()=>{
      if(document.hidden) clearInterval(timer);
      else { restart(); syncActiveVideos(); }
    });
  })();

  // ====== Reveal on Scroll ======
  (function revealOnScroll(){
    const targets=document.querySelectorAll('.servicos-reveal,.principios-reveal,.setores-reveal,.sobre-reveal');
    if (!targets.length) return;

    if (!('IntersectionObserver' in window)) {
      // Fallback pra navegadores antigos
      targets.forEach(el=>{
        el.classList.forEach(cls=>{
          if(cls.endsWith('-reveal')){
            el.classList.add(cls.replace('-reveal','-visible'));
          }
        });
      });
      return;
    }

    const io=new IntersectionObserver((entries)=>{
      entries.forEach(e=>{
        if(e.isIntersecting){
          e.target.classList.forEach(cls=>{
            if(cls.endsWith('-reveal')) {
              e.target.classList.add(cls.replace('-reveal','-visible'));
            }
          });
          io.unobserve(e.target);
        }
      });
    },{threshold:.18, rootMargin:'0px 0px -10% 0px'});
    targets.forEach(el=>io.observe(el));
  })();

  // ====== Navbar Mobile + Submenu (100% iPhone-safe) ======
  (function navbarMobile(){
    const navToggle = document.getElementById('navbarToggle');
    const mobileNav = document.getElementById('navbarMobile');
    if (!navToggle || !mobileNav) return;

    const mobileBtn = mobileNav.querySelector('.mobile-collapse-btn');
    const mobileSub = document.getElementById('mobileProdutosSub');

    let isOpen = false;

    function openMenu() {
      isOpen = true;
      mobileNav.classList.add('open');
      navToggle.classList.add('open');
      document.body.style.overflow = 'hidden';
      navToggle.setAttribute('aria-expanded','true');
    }

    function closeMenu() {
      isOpen = false;
      mobileNav.classList.remove('open');
      navToggle.classList.remove('open');
      document.body.style.overflow = '';
      navToggle.setAttribute('aria-expanded','false');
    }

    function toggleMenu(e) {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      if (isOpen) closeMenu();
      else openMenu();
    }

    // Clique no hambúrguer / X
    navToggle.addEventListener('click', toggleMenu, { passive:false });

    // Fechar ao clicar em qualquer link dentro do menu mobile
    mobileNav.querySelectorAll('a').forEach(link=>{
      link.addEventListener('click', ()=>{
        if (isOpen) closeMenu();
      });
    });

    // Fechar com ESC
    window.addEventListener('keydown', (e)=>{
      if (e.key === 'Escape' && isOpen) {
        closeMenu();
      }
    });

    // Fechar ao voltar para desktop (evita menu “preso” aberto ao rotacionar tela)
    window.addEventListener('resize', () => {
      if (window.innerWidth > 1060 && isOpen) {
        closeMenu();
      }
    });

    // Submenu "Produtos ▾" dentro do mobile
    if (mobileBtn && mobileSub) {
      mobileBtn.addEventListener('click', (e)=>{
        e.stopPropagation();
        const open = mobileSub.classList.toggle('open');
        mobileBtn.setAttribute('aria-expanded', String(open));
      });
    }

    // IMPORTANTE: NÃO TEM mais document.addEventListener('click') pra fechar.
    // Isso evita exatamente o bug de "abre e some" no iPhone.
  })();

  // ====== Dropdown (desktop) ======
  (function navbarDropdown(){
    const dd=document.getElementById('produtosDropdown'); 
    if(!dd) return;
    const btn=dd.querySelector('.menu-dropdown-btn');
    const panel=dd.querySelector('.dropdown-panel');
    if (!btn || !panel) return;

    let open=false;
    const setOpen=(v)=>{
      open=v; 
      dd.classList.toggle('open',v);
      btn.setAttribute('aria-expanded', String(v));
    };

    btn.addEventListener('click', (e)=>{
      e.preventDefault();
      e.stopPropagation();
      setOpen(!open);
    });

    const supportsHover = window.matchMedia
      ? window.matchMedia('(hover:hover)').matches
      : false;

    if (supportsHover) {
      dd.addEventListener('mouseenter', ()=>setOpen(true));
      dd.addEventListener('mouseleave', ()=>setOpen(false));
    }

    document.addEventListener('keydown',e=>{ 
      if(e.key==='Escape' && open) setOpen(false); 
    });

    document.addEventListener('click',e=>{ 
      if(open && !dd.contains(e.target)) setOpen(false); 
    });

    panel.addEventListener('focusout',e=>{
      const rt=e.relatedTarget;
      if(open && (!rt || !dd.contains(rt))) setOpen(false);
    });
  })();
});
