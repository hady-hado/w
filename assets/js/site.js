/* ------------------------------------------------------------
   site.js — renders the page from data/site.json.

   The page is a list of sections (hero, products, text, stats,
   faq, gallery, cta, canvas, contact). Each one is a block the
   admin panel can add, reorder, edit or remove.
   Arabic is the default locale; AR / FR / EN live in the JSON.
   All numerals are Latin.
   ------------------------------------------------------------ */
(function () {
  'use strict';

  var DATA_URL = 'data/site.json';
  var STORE_KEY = 'sop-lab-lang';
  var LOCALES = ['ar', 'fr', 'en'];
  var DEFAULT_LOCALE = 'ar';
  var SCHEMA = 3;

  var UI = {
    ar: {
      dir: 'rtl',
      cta: 'اكتشف المنتجات',
      cta2: 'تواصل معنا',
      formName: 'الاسم',
      formEmail: 'البريد الإلكتروني',
      formMessage: 'الرسالة',
      formSend: 'إرسال',
      formSending: 'جارٍ الإرسال…',
      formOk: 'وصلتنا رسالتك — شكرًا لك.',
      formErr: 'تعذّر الإرسال. جرّب البريد مباشرة.',
      formHint: 'سيفتح تطبيق البريد لديك لإكمال الإرسال.',
      open: 'فتح',
      source: 'الكود',
      empty: 'لم يُنشر شيء بعد — عُد قريبًا.',
      error: 'تعذّر تحميل المحتوى. تحقّق من الاتصال ثم حاول مجددًا.',
      retry: 'إعادة المحاولة',
      facts: { team: 'الفريق', founded: 'التأسيس', focus: 'المجال', status: 'الحالة' },
      status: { live: 'متوفّر', beta: 'تجريبي', soon: 'قريبًا' }
    },
    fr: {
      dir: 'ltr',
      cta: 'Voir les produits',
      cta2: 'Nous écrire',
      formName: 'Nom',
      formEmail: 'E-mail',
      formMessage: 'Message',
      formSend: 'Envoyer',
      formSending: 'Envoi…',
      formOk: 'Message envoyé, merci !',
      formErr: "L'envoi a échoué. Essayez le lien e-mail.",
      formHint: "Votre application mail s'ouvrira pour terminer l'envoi.",
      open: 'Ouvrir',
      source: 'Code',
      empty: 'Rien de publié pour le moment.',
      error: 'Le contenu ne peut pas être chargé. Vérifiez la connexion.',
      retry: 'Réessayer',
      facts: { team: 'Équipe', founded: 'Créé en', focus: 'Domaine', status: 'Statut' },
      status: { live: 'Disponible', beta: 'Bêta', soon: 'Bientôt' }
    },
    en: {
      dir: 'ltr',
      cta: 'See the products',
      cta2: 'Get in touch',
      formName: 'Name',
      formEmail: 'Email',
      formMessage: 'Message',
      formSend: 'Send',
      formSending: 'Sending…',
      formOk: 'Message sent — thank you.',
      formErr: 'Could not send. Try the email link instead.',
      formHint: 'Your mail app will open to finish sending.',
      open: 'Open',
      source: 'Source',
      empty: 'Nothing published yet — check back soon.',
      error: 'Content could not be loaded. Check your connection.',
      retry: 'Retry',
      facts: { team: 'Team', founded: 'Founded', focus: 'Focus', status: 'Status' },
      status: { live: 'Live', beta: 'Beta', soon: 'Coming soon' }
    }
  };

  var state = { lang: DEFAULT_LOCALE, data: null, device: null };
  var reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  function ui() { return UI[state.lang] || UI[DEFAULT_LOCALE]; }

  function localeBlock(node) {
    if (!node) return {};
    var i18n = node.i18n || {};
    var order = [state.lang, 'en', DEFAULT_LOCALE];
    for (var i = 0; i < order.length; i++) {
      if (i18n[order[i]] && Object.keys(i18n[order[i]]).length) return i18n[order[i]];
    }
    return {};
  }

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        var val = attrs[key];
        if (val === null || val === undefined || val === '') return;
        if (key === 'text') node.textContent = val;
        else if (key === 'class') node.className = val;
        else if (key === 'style') node.setAttribute('style', val);
        else node.setAttribute(key, val);
      });
    }
    (children || []).forEach(function (child) {
      if (child === null || child === undefined || child === '') return;
      node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    });
    return node;
  }

  function safeUrl(url) {
    var u = String(url || '').trim();
    return /^(https?:\/\/|mailto:|#|\/)/i.test(u) ? u : '';
  }

  function countLabel(n) {
    if (state.lang === 'ar') {
      if (n === 1) return '1 منتج';
      if (n === 2) return '2 منتجان';
      return n + ' منتجات';
    }
    var single = state.lang === 'fr' ? 'produit' : 'product';
    var many = state.lang === 'fr' ? 'produits' : 'products';
    return n + ' ' + (n === 1 ? single : many);
  }

  /* ---------------- theme ---------------- */

  function applyTheme() {
    var theme = (state.data.brand && state.data.brand.theme) || {};
    var root = document.documentElement;

    if (theme.accent) root.style.setProperty('--accent', theme.accent);

    if (typeof theme.radius === 'number' && !isNaN(theme.radius)) {
      root.style.setProperty('--radius', theme.radius + 'px');
      root.style.setProperty('--radius-sm', Math.max(6, Math.round(theme.radius * 0.6)) + 'px');
    }

    if (typeof theme.aurora === 'number' && !isNaN(theme.aurora)) {
      Array.prototype.forEach.call(document.querySelectorAll('.blob'), function (blob) {
        blob.style.opacity = (0.5 * theme.aurora).toFixed(2);
      });
    }

    root.setAttribute('data-fonts', theme.fonts || 'alexandria');
  }

  /* ---------------- motion ---------------- */

  var Motion = {
    observer: null,

    init: function () {
      if (!('IntersectionObserver' in window) || reduced) return;
      this.observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) Motion.show(entry.target);
        });
      }, { rootMargin: '0px 0px -6% 0px', threshold: 0.06 });
    },

    show: function (node) {
      node.classList.add('is-visible');
      if (Motion.observer) Motion.observer.unobserve(node);
      var delay = parseFloat(node.style.transitionDelay) || 0;
      setTimeout(function () {
        node.classList.remove('reveal', 'is-visible');
        node.style.transitionDelay = '';
      }, 700 + delay);
    },

    fallback: function () {
      if (reduced) return;
      var h = window.innerHeight || document.documentElement.clientHeight;
      Array.prototype.forEach.call(document.querySelectorAll('.reveal'), function (node) {
        var box = node.getBoundingClientRect();
        if (box.top < h * 0.95 && box.bottom > 0) Motion.show(node);
      });
    },

    watch: function (nodes) {
      if (!nodes || !nodes.length) return;
      if (!this.observer || reduced) return;
      nodes.forEach(function (node, index) {
        if (node.classList.contains('reveal')) return;
        node.classList.add('reveal');
        node.style.transitionDelay = Math.min(index * 70, 420) + 'ms';
        Motion.observer.observe(node);
      });
      Motion.fallback();
    }
  };

  var fallbackTimer;
  function scheduleFallback() {
    clearTimeout(fallbackTimer);
    fallbackTimer = setTimeout(function () { Motion.fallback(); }, 180);
  }

  function reveal() { document.documentElement.classList.remove('js-loading'); }

  /* ---------------- shared pieces ---------------- */

  function heroVisual() {
    return el('div', { class: 'hero-visual', 'aria-hidden': 'true' }, [
      el('div', { class: 'shot shot-main' }, [
        el('div', { class: 'shot-bar' }, [el('span'), el('span'), el('span')]),
        el('div', { class: 'shot-body' }, [
          el('div', { class: 'shot-line w40' }),
          el('div', { class: 'shot-line w80' }),
          el('div', { class: 'shot-tiles' }, [
            el('div', { class: 'shot-tile accent' }),
            el('div', { class: 'shot-tile' }),
            el('div', { class: 'shot-tile' })
          ]),
          el('div', { class: 'shot-line w60' }),
          el('div', { class: 'shot-line w40' })
        ])
      ]),
      el('div', { class: 'shot shot-float' }, [
        el('div', { class: 'shot-pill' }, [el('span', { class: 'dot' }), el('span', { text: 'live' })]),
        el('div', { class: 'shot-line w80' }),
        el('div', { class: 'shot-line w60' })
      ])
    ]);
  }

  function productCard(p) {
    var copy = localeBlock(p);
    var dict = ui();
    var status = (p.status || '').toLowerCase();

    var preview = safeUrl(p.image)
      ? el('div', { class: 'card-preview' }, [
          el('img', { src: safeUrl(p.image), alt: copy.name || '', loading: 'lazy' })
        ])
      : el('div', { class: 'card-preview' }, [
          el('span', { class: 'preview-glyph', text: p.glyph || String(copy.name || '?').charAt(0) }),
          el('div', { class: 'preview-lines' }, [el('i'), el('i')])
        ]);

    var links = [];
    if (safeUrl(p.url)) links.push(el('a', { href: safeUrl(p.url), target: '_blank', rel: 'noopener', text: dict.open }));
    if (safeUrl(p.source)) links.push(el('a', { href: safeUrl(p.source), target: '_blank', rel: 'noopener', text: dict.source }));

    return el('article', { class: 'card' }, [
      preview,
      el('div', { class: 'card-body' }, [
        el('div', { class: 'card-top' }, [
          el('h3', { class: 'card-name', text: copy.name || p.id || '' }),
          el('span', {
            class: 'pill' + (dict.status[status] ? ' pill-' + status : ''),
            text: dict.status[status] || p.status || ''
          })
        ]),
        copy.tagline ? el('p', { class: 'card-tagline', text: copy.tagline }) : null,
        copy.description ? el('p', { class: 'card-desc', text: copy.description }) : null,
        (copy.tags && copy.tags.length)
          ? el('ul', { class: 'tags' }, copy.tags.map(function (t) { return el('li', { text: t }); }))
          : null,
        links.length ? el('div', { class: 'card-links' }, links) : null
      ])
    ]);
  }

  function sectionHead(heading, note) {
    if (!heading && !note) return null;
    return el('div', { class: 'section-head' }, [
      el('h2', { text: heading || '' }),
      note ? el('p', { class: 'section-note', text: note }) : null
    ]);
  }

  function prose(text, className) {
    var box = el('div', { class: className || 'prose' });
    String(text || '').split(/\n{2,}/).forEach(function (para) {
      if (para.trim()) box.appendChild(el('p', { text: para.trim() }));
    });
    return box;
  }

  /* ---------------- sections ---------------- */

  function blockHero(s) {
    var brand = state.data.brand || {};
    var copy = localeBlock(brand);
    var dict = ui();
    var split = (s.layout || 'split') === 'split';

    var eyebrow = el('p', { class: 'eyebrow' }, [
      el('span', { class: 'dot', 'aria-hidden': 'true' }),
      el('span', { text: copy.kicker || '' }),
      copy.location ? el('span', { class: 'sep', 'aria-hidden': 'true', text: '·' }) : null,
      copy.location ? el('span', { text: copy.location }) : null
    ]);

    var copyCol = el('div', { class: 'hero-copy' }, [
      eyebrow,
      el('h1', { class: 'hero-title', text: copy.tagline || '' }),
      el('p', { class: 'hero-lede', text: copy.intro || '' }),
      el('div', { class: 'hero-actions' }, [
        el('a', { class: 'btn btn-primary', href: '#products', text: dict.cta }),
        el('a', { class: 'btn btn-ghost', href: '#contact', text: dict.cta2 })
      ])
    ]);

    var inner = split && s.showVisual !== false
      ? el('div', { class: 'wrap hero-grid' }, [copyCol, heroVisual()])
      : el('div', { class: 'wrap hero-inner' }, [copyCol]);

    return el('section', { class: 'hero' + (split ? '' : ' hero-centered'), id: s.id }, [inner]);
  }

  function blockProducts(s) {
    var copy = localeBlock(s);
    var products = state.data.products || [];
    var grid = el('div', { class: 'product-grid cols-' + (s.columns || 3) });

    if (!products.length) {
      grid.appendChild(el('p', { class: 'empty', text: ui().empty }));
    } else {
      products.forEach(function (p) { grid.appendChild(productCard(p)); });
    }

    Motion.watch(Array.prototype.slice.call(grid.children));

    return el('section', { class: 'section block-products', id: s.id }, [
      el('div', { class: 'wrap' }, [
        sectionHead(copy.heading, products.length ? countLabel(products.length) : ''),
        grid
      ])
    ]);
  }

  function blockText(s) {
    var copy = localeBlock(s);
    var body = copy.body || localeBlock(state.data.brand).about || '';
    var withFacts = (s.layout || 'plain') === 'facts';
    var dict = ui();
    var b = localeBlock(state.data.brand);

    var main = el('div', null, [
      el('h2', { text: copy.heading || '' }),
      prose(body)
    ]);

    if (!withFacts) {
      return el('section', { class: 'section block-text', id: s.id }, [
        el('div', { class: 'wrap' }, [main])
      ]);
    }

    var facts = el('dl', { class: 'facts' });
    [
      [dict.facts.team, b.team],
      [dict.facts.founded, b.founded],
      [dict.facts.focus, b.focus],
      [dict.facts.status, b.status]
    ].forEach(function (row) {
      if (!row[1]) return;
      facts.appendChild(el('div', null, [el('dt', { text: row[0] }), el('dd', { text: row[1] })]));
    });

    return el('section', { class: 'section block-text', id: s.id }, [
      el('div', { class: 'wrap about-grid' }, [main, facts])
    ]);
  }

  function blockStats(s) {
    var copy = localeBlock(s);
    var items = copy.items || [];
    var grid = el('div', { class: 'stats' }, items.map(function (item) {
      return el('div', { class: 'stat' }, [
        el('span', { class: 'stat-value', text: item.value || '' }),
        el('span', { class: 'stat-label', text: item.label || '' })
      ]);
    }));

    return el('section', { class: 'section block-stats', id: s.id }, [
      el('div', { class: 'wrap' }, [sectionHead(copy.heading), grid])
    ]);
  }

  function blockFaq(s) {
    var copy = localeBlock(s);
    var items = copy.items || [];
    var list = el('div', { class: 'faq' }, items.map(function (item) {
      return el('details', { class: 'faq-item' }, [
        el('summary', { text: item.q || '' }),
        el('p', { text: item.a || '' })
      ]);
    }));

    return el('section', { class: 'section block-faq', id: s.id }, [
      el('div', { class: 'wrap' }, [sectionHead(copy.heading), list])
    ]);
  }

  function blockGallery(s) {
    var copy = localeBlock(s);
    var images = s.images || [];
    var grid = el('div', { class: 'gallery cols-' + (s.columns || 3) }, images.map(function (img) {
      var src = safeUrl(img.src);
      if (!src) return null;
      return el('figure', { class: 'gallery-item' }, [
        el('img', { src: src, alt: img.alt || '', loading: 'lazy' })
      ]);
    }));

    return el('section', { class: 'section block-gallery', id: s.id }, [
      el('div', { class: 'wrap' }, [sectionHead(copy.heading), grid])
    ]);
  }

  function blockCta(s) {
    var copy = localeBlock(s);
    var href = safeUrl(copy.buttonUrl) || '#contact';
    var inner = el('div', { class: 'cta-band' }, [
      el('div', { class: 'cta-copy' }, [
        el('h2', { text: copy.heading || '' }),
        copy.body ? el('p', { text: copy.body }) : null
      ]),
      el('a', {
        class: 'btn btn-primary',
        href: href,
        target: href.indexOf('#') === 0 ? null : '_blank',
        rel: href.indexOf('#') === 0 ? null : 'noopener',
        text: copy.buttonLabel || ui().cta2
      })
    ]);

    return el('section', { class: 'section block-cta', id: s.id }, [el('div', { class: 'wrap' }, [inner])]);
  }

  function blockCanvas(s) {
    var copy = localeBlock(s);
    var frame = el('div', {
      class: 'canvas',
      style: 'aspect-ratio:' + (s.ratio || '16/9')
    }, (s.items || []).map(function (item) {
      var itemCopy = (item.i18n && (item.i18n[state.lang] || item.i18n.en)) || {};
      var style = 'left:' + (item.x || 0) + '%;top:' + (item.y || 0) + '%;width:' + (item.w || 30) + '%;' +
        (item.rotate ? 'transform:rotate(' + item.rotate + 'deg);' : '');

      if (item.type === 'image') {
        return el('div', { class: 'cv-item cv-image', style: style }, [
          safeUrl(item.src) ? el('img', { src: safeUrl(item.src), alt: '', loading: 'lazy' }) : el('span', { text: 'image' })
        ]);
      }
      if (item.type === 'card') {
        return el('div', { class: 'cv-item cv-card', style: style }, [
          el('span', { class: 'cv-title', text: itemCopy.title || '' }),
          el('span', { class: 'cv-body', text: itemCopy.text || '' })
        ]);
      }
      return el('div', { class: 'cv-item cv-box', style: style }, [
        el('span', { class: 'cv-title', text: itemCopy.title || '' }),
        el('span', { class: 'cv-body', text: itemCopy.text || '' })
      ]);
    }));

    return el('section', { class: 'section block-canvas', id: s.id }, [
      el('div', { class: 'wrap' }, [
        copy.heading ? sectionHead(copy.heading) : null,
        frame
      ])
    ]);
  }

  function blockContact(s) {
    var brand = state.data.brand || {};
    var copy = localeBlock(s);
    var dict = ui();

    var note = el('p', { class: 'form-note', role: 'status', 'aria-live': 'polite' });
    var button = el('button', { class: 'btn btn-primary', type: 'submit', text: dict.formSend });

    var form = el('form', { class: 'contact-form', novalidate: 'novalidate' }, [
      el('div', { class: 'form-row' }, [
        el('label', { class: 'form-field' }, [
          el('span', { text: dict.formName }),
          el('input', { type: 'text', name: 'name', autocomplete: 'name', required: 'required' })
        ]),
        el('label', { class: 'form-field' }, [
          el('span', { text: dict.formEmail }),
          el('input', { type: 'email', name: 'email', autocomplete: 'email', dir: 'ltr', required: 'required' })
        ])
      ]),
      el('label', { class: 'form-field' }, [
        el('span', { text: dict.formMessage }),
        el('textarea', { name: 'message', rows: '4', required: 'required' })
      ]),
      el('div', { class: 'form-actions' }, [button, note])
    ]);

    function say(message, kind) {
      note.textContent = message;
      note.className = 'form-note' + (kind ? ' ' + kind : '');
    }

    say(brand.formEndpoint ? '' : dict.formHint, '');

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var endpoint = safeUrl(brand.formEndpoint);
      var data = new FormData(form);

      if (!endpoint) {
        if (!brand.email) { say(dict.formErr, 'err'); return; }
        var subject = encodeURIComponent(String(data.get('name') || '') + ' — ' + (brand.name || 'website'));
        var body = encodeURIComponent(String(data.get('message') || '') + '\n\n' + String(data.get('email') || ''));
        window.location.href = 'mailto:' + brand.email + '?subject=' + subject + '&body=' + body;
        return;
      }

      button.disabled = true;
      button.textContent = dict.formSending;
      say('', '');

      fetch(endpoint, { method: 'POST', body: data, headers: { Accept: 'application/json' } })
        .then(function (res) {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          form.reset();
          say(dict.formOk, 'ok');
        })
        .catch(function (err) {
          console.error('[site] contact form failed:', err);
          say(dict.formErr, 'err');
        })
        .then(function () {
          button.disabled = false;
          button.textContent = dict.formSend;
        });
    });

    var links = el('div', { class: 'contact-links' }, (brand.links || []).map(function (link) {
      var href = safeUrl(link.url);
      if (!href) return null;
      var label = link.label;
      if (label && typeof label === 'object') label = label[state.lang] || label.en || label[DEFAULT_LOCALE];
      if (typeof label !== 'string' || !label) label = href;
      return el('a', {
        href: href,
        target: href.indexOf('mailto:') === 0 ? null : '_blank',
        rel: 'noopener',
        text: label
      });
    }));

    return el('section', { class: 'section block-contact', id: s.id }, [
      el('div', { class: 'wrap' }, [
        el('div', { class: 'contact-card' }, [
          el('h2', { text: copy.heading || '' }),
          brand.email ? el('a', { class: 'contact-mail', href: 'mailto:' + brand.email, text: brand.email, dir: 'ltr' }) : null,
          form,
          links
        ])
      ])
    ]);
  }

  var BLOCKS = {
    hero: blockHero,
    products: blockProducts,
    text: blockText,
    stats: blockStats,
    faq: blockFaq,
    gallery: blockGallery,
    cta: blockCta,
    canvas: blockCanvas,
    contact: blockContact
  };

  var DEFAULT_SECTIONS = [
    { id: 'hero', type: 'hero', layout: 'split', showVisual: true },
    { id: 'products', type: 'products', columns: 3 },
    { id: 'about', type: 'text', layout: 'facts' },
    { id: 'contact', type: 'contact' }
  ];

  function renderSections() {
    var root = document.getElementById('blocks');
    if (!root) return;
    root.textContent = '';

    var sections = Array.isArray(state.data.sections) && state.data.sections.length
      ? state.data.sections
      : DEFAULT_SECTIONS;

    sections.forEach(function (section) {
      var builder = BLOCKS[section.type];
      if (!builder) return;
      var node = builder(section);
      if (node) root.appendChild(node);
    });

    Motion.watch(Array.prototype.slice.call(root.querySelectorAll('.section-head, .about-grid > *, .contact-card, .cta-band, .stats > *, .faq-item')));
  }

  function renderFooter() {
    var year = document.getElementById('year');
    if (year) year.textContent = String(new Date().getFullYear());
  }

  function renderAll() {
    if (!state.data) return;
    document.documentElement.classList.remove('content-error');
    applyTheme();
    renderSections();
    renderFooter();
    document.title = (state.data.brand && state.data.brand.name)
      ? state.data.brand.name + (localeBlock(state.data.brand).taglineShort
          ? ' — ' + localeBlock(state.data.brand).taglineShort
          : '')
      : 'SOP Lab';
    reveal();
  }

  function renderError() {
    document.documentElement.classList.add('content-error');
    var root = document.getElementById('blocks');
    var retry = el('button', { class: 'btn btn-ghost', type: 'button', text: ui().retry });
    retry.addEventListener('click', loadContent);
    if (root) {
      root.textContent = '';
      root.appendChild(el('section', { class: 'section' }, [
        el('div', { class: 'wrap' }, [
          el('div', { class: 'empty' }, [
            el('p', { class: 'empty-text', text: ui().error }),
            retry
          ])
        ])
      ]));
    }
    reveal();
  }

  /* ---------------- language ---------------- */

  function paintLanguage(animate) {
    var main = document.querySelector('main');

    if (!animate || reduced || !main) {
      if (state.data) renderAll();
      return;
    }

    main.classList.add('is-switching');
    setTimeout(function () {
      if (state.data) renderAll();
      setTimeout(function () { main.classList.remove('is-switching'); }, 20);
    }, 130);
    setTimeout(function () { main.classList.remove('is-switching'); }, 700);
  }

  function applyLang(lang, animate) {
    if (LOCALES.indexOf(lang) < 0) lang = DEFAULT_LOCALE;
    state.lang = lang;

    document.documentElement.setAttribute('lang', lang);
    document.documentElement.setAttribute('dir', ui().dir);

    try { localStorage.setItem(STORE_KEY, lang); } catch (e) { /* private mode */ }

    Array.prototype.forEach.call(document.querySelectorAll('.lang-switch [data-lang]'), function (button) {
      button.setAttribute('aria-pressed', button.getAttribute('data-lang') === lang ? 'true' : 'false');
    });

    paintLanguage(animate);
  }

  /* ---------------- content ---------------- */

  var loading = false;

  function loadContent() {
    if (loading) return;
    loading = true;

    fetch(DATA_URL + '?v=' + Date.now(), { cache: 'no-store' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        if (!data || !data.brand || !data.brand.i18n) throw new Error('content is missing translations');
        if (data.schema && data.schema > SCHEMA) console.warn('[site] content schema is newer than this page:', data.schema);
        state.data = data;
        renderAll();
      })
      .catch(function (err) {
        console.error('[site] could not load content:', err);
        state.data = null;
        renderError();
      })
      .then(function () { loading = false; });
  }

  function init() {
    var saved = null;
    try { saved = localStorage.getItem(STORE_KEY); } catch (e) { /* ignore */ }

    Motion.init();

    Array.prototype.forEach.call(document.querySelectorAll('.lang-switch [data-lang]'), function (button) {
      button.addEventListener('click', function () {
        if (button.getAttribute('data-lang') === state.lang) return;
        button.classList.remove('is-pressed');
        void button.offsetWidth;
        button.classList.add('is-pressed');
        applyLang(button.getAttribute('data-lang'), true);
      });
    });

    window.addEventListener('scroll', scheduleFallback, { passive: true });
    window.addEventListener('resize', scheduleFallback);
    window.addEventListener('scroll', initParallaxOnce, { passive: true, once: true });

    applyLang(saved && LOCALES.indexOf(saved) >= 0 ? saved : DEFAULT_LOCALE, false);
    loadContent();
    setTimeout(Motion.fallback, 900);
  }

  /* ---------------- parallax (attached once) ---------------- */

  var parallaxOn = false;

  function initParallaxOnce() {
    if (parallaxOn) return;
    var aurora = document.querySelector('.aurora');
    if (!aurora || reduced) return;
    if (window.Device && window.Device.isPhone()) return;
    parallaxOn = true;

    var ticking = false;
    window.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        var offset = Math.min(window.scrollY || 0, 2400) * 0.06;
        aurora.style.transform = 'translate3d(0,' + (-offset).toFixed(1) + 'px,0)';
        ticking = false;
      });
    }, { passive: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
