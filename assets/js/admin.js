/* ------------------------------------------------------------
   admin.js — edits data/site.json by committing to the repo
   through the GitHub contents API.

   Content is trilingual: shared fields (name, glyph, urls) and
   per-language copy picked by the language bar in the panel.
   ------------------------------------------------------------ */
(function () {
  'use strict';

  var CONFIG_KEY = 'sop-lab-admin-config';
  var API = 'https://api.github.com';
  var LOCALES = ['ar', 'fr', 'en'];
  var LANG_LABEL = { ar: 'العربية', fr: 'Français', en: 'English' };

  // ?mock=1 runs the whole editor against the local data/site.json and skips
  // every write — handy for working on the panel without a repo or token.
  var MOCK = /[?&]mock=1/.test(location.search);

  var state = {
    token: '', owner: '', repo: '', branch: 'main', path: 'data/site.json',
    sha: null, data: null, editLang: 'ar', dirty: false, busy: false
  };

  function $(id) { return document.getElementById(id); }

  /* ---------------- helpers ---------------- */

  function b64encode(str) {
    var bytes = new TextEncoder().encode(str);
    var bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  function b64decode(b64) {
    var bin = atob(String(b64 || '').replace(/\s/g, ''));
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  var toastTimer;
  function toast(message, kind) {
    var node = $('toast');
    node.textContent = message;
    node.className = 'toast show' + (kind ? ' ' + kind : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { node.className = 'toast'; }, 4200);
  }

  function setConn(kind, text) {
    var node = $('conn-status');
    node.textContent = text;
    node.className = 'conn-state' + (kind ? ' ' + kind : '');
  }

  function setDirty(value) {
    state.dirty = value;
    var note = $('dirty-note');
    note.textContent = value ? 'unsaved changes' : 'no changes';
    note.className = 'dirty' + (value ? ' on' : '');
  }

  function dirty() { if (!state.dirty) setDirty(true); }

  function slug(text) {
    return String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'product';
  }

  /* ---------------- config ---------------- */

  function loadConfig() {
    try {
      var raw = localStorage.getItem(CONFIG_KEY);
      if (raw) {
        var saved = JSON.parse(raw);
        ['token', 'owner', 'repo', 'branch', 'path'].forEach(function (key) {
          if (saved[key]) state[key] = saved[key];
        });
      }
    } catch (e) { /* ignore corrupt config */ }
  }

  function persistConfig() {
    try {
      localStorage.setItem(CONFIG_KEY, JSON.stringify({
        token: state.token, owner: state.owner, repo: state.repo,
        branch: state.branch, path: state.path
      }));
    } catch (e) { /* storage blocked */ }
  }

  // On a GitHub Pages URL the owner and repo can be guessed from the address.
  function guessRepo() {
    var host = location.hostname;
    var seg = location.pathname.split('/').filter(Boolean);
    if (/\.github\.io$/i.test(host)) {
      var base = host.replace(/\.github\.io$/i, '');
      if (!state.owner) state.owner = base;
      if (!state.repo) state.repo = seg.length ? seg[0] : base + '.github.io';
    }
  }

  /* ---------------- api ---------------- */

  function contentsUrl(path) {
    return API + '/repos/' + encodeURIComponent(state.owner) + '/' +
      encodeURIComponent(state.repo) + '/contents/' +
      (path || state.path).split('/').map(encodeURIComponent).join('/');
  }

  function api(url, options) {
    options = options || {};
    var headers = {
      'Authorization': 'Bearer ' + state.token,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    };
    Object.keys(options.headers || {}).forEach(function (k) { headers[k] = options.headers[k]; });

    return fetch(url, {
      method: options.method || 'GET',
      headers: headers,
      body: options.body || undefined
    }).then(function (res) {
      return res.text().then(function (text) {
        var json = null;
        try { json = text ? JSON.parse(text) : null; } catch (e) { /* non-json */ }
        if (!res.ok) {
          var err = new Error((json && json.message) || ('HTTP ' + res.status));
          err.status = res.status;
          throw err;
        }
        return json;
      });
    });
  }

  function describeError(err) {
    if (err.status === 401) return 'Token rejected — check it is valid and not expired.';
    if (err.status === 403) return 'No permission — the token needs Contents: Read and write on this repo.';
    if (err.status === 404) return 'Repo or path not found — check owner, repository and branch.';
    if (err.status === 409) return 'Conflict — the file changed elsewhere. Reload, then save again.';
    return err.message || 'Request failed.';
  }

  /* ---------------- data model ---------------- */

  function emptyCopy() {
    return {
      kicker: '', location: '', tagline: '', taglineShort: '', intro: '',
      about: '', team: '', founded: '', focus: '', status: ''
    };
  }

  function emptyProductCopy() {
    return { name: '', tagline: '', description: '', tags: [] };
  }

  function normalize(data) {
    data = data && typeof data === 'object' ? data : {};
    var brand = data.brand && typeof data.brand === 'object' ? data.brand : {};
    var theme = brand.theme || {};
    var out = {
      schema: 3,
      defaultLocale: LOCALES.indexOf(data.defaultLocale) >= 0 ? data.defaultLocale : 'ar',
      sections: Array.isArray(data.sections) && data.sections.length
        ? JSON.parse(JSON.stringify(data.sections))
        : JSON.parse(JSON.stringify(DEFAULT_SECTIONS)),
      brand: {
        name: brand.name || '',
        initials: brand.initials || '',
        email: brand.email || '',
        formEndpoint: brand.formEndpoint || '',
        theme: {
          accent: theme.accent || '#c9f56b',
          radius: typeof theme.radius === 'number' ? theme.radius : 20,
          aurora: typeof theme.aurora === 'number' ? theme.aurora : 1,
          fonts: theme.fonts || 'alexandria'
        },
        links: Array.isArray(brand.links) ? brand.links.map(function (l) {
          l = l || {};
          var label = l.label;
          if (!label || typeof label !== 'object') {
            var text = typeof label === 'string' ? label : '';
            label = { ar: text, fr: text, en: text };
          }
          var out = { ar: '', fr: '', en: '' };
          LOCALES.forEach(function (lang) { out[lang] = label[lang] || ''; });
          return { url: l.url || '', label: out };
        }) : [],
        i18n: {}
      },
      products: []
    };

    LOCALES.forEach(function (lang) {
      var src = (brand.i18n && brand.i18n[lang]) || {};
      var copy = emptyCopy();
      Object.keys(copy).forEach(function (key) {
        copy[key] = typeof src[key] === 'string' ? src[key] : '';
      });
      out.brand.i18n[lang] = copy;
    });

    out.products = (Array.isArray(data.products) ? data.products : []).map(function (p) {
      p = p || {};
      var product = {
        id: p.id || slug(p.name),
        glyph: p.glyph || '',
        image: p.image || '',
        status: p.status || 'soon',
        url: p.url || '',
        source: p.source || '',
        i18n: {}
      };
      LOCALES.forEach(function (lang) {
        var src = (p.i18n && p.i18n[lang]) || {};
        var copy = emptyProductCopy();
        copy.name = typeof src.name === 'string' ? src.name : '';
        copy.tagline = typeof src.tagline === 'string' ? src.tagline : '';
        copy.description = typeof src.description === 'string' ? src.description : '';
        copy.tags = Array.isArray(src.tags) ? src.tags.slice() : [];
        product.i18n[lang] = copy;
      });
      return product;
    });

    return out;
  }

  function loadRemote() {
    if (MOCK) {
      fetch('../data/site.json?v=' + Date.now(), { cache: 'no-store' })
        .then(function (res) { return res.json(); })
        .then(function (data) {
          state.sha = 'mock';
          state.data = normalize(data);
          state.editLang = data.defaultLocale || 'ar';
          renderEditor();
          setConn('ok', 'mock mode · local file, nothing is committed');
          setDirty(false);
        })
        .catch(function (err) {
          console.error('[admin] mock load failed', err);
          setConn('err', 'mock load failed');
          toast('Could not read data/site.json.', 'err');
        });
      return;
    }

    if (!state.token || !state.owner || !state.repo) {
      setConn('warn', 'token, owner and repository are required');
      return;
    }
    state.busy = true;
    setConn('', 'loading…');

    api(contentsUrl() + '?ref=' + encodeURIComponent(state.branch))
      .then(function (file) {
        state.sha = file.sha;
        state.data = normalize(JSON.parse(b64decode(file.content)));
        if (LOCALES.indexOf(state.data.defaultLocale) >= 0) state.editLang = state.data.defaultLocale;
        renderEditor();
        setConn('ok', 'connected · ' + state.owner + '/' + state.repo);
        setDirty(false);
      })
      .catch(function (err) {
        if (err.status === 404) {
          state.sha = null;
          state.data = normalize({});
          renderEditor();
          setConn('warn', 'no ' + state.path + ' yet — save will create it');
          setDirty(true);
        } else {
          console.error('[admin] load failed', err);
          setConn('err', 'not connected');
          toast(describeError(err), 'err');
        }
      })
      .then(function () { state.busy = false; });
  }

  /* ---------------- editor ---------------- */

  var DEFAULT_SECTIONS = [
    { id: 'hero', type: 'hero', layout: 'split', showVisual: true },
    { id: 'products', type: 'products', columns: 3 },
    { id: 'about', type: 'text', layout: 'facts' },
    { id: 'contact', type: 'contact' }
  ];

  var SECTION_LABELS = {
    hero: 'Hero', products: 'Products', text: 'Text / About', stats: 'Numbers',
    faq: 'FAQ', gallery: 'Gallery', cta: 'Call to action', canvas: 'Freeform canvas', contact: 'Contact'
  };

  var COPY_FIELDS = [
    ['c-kicker', 'kicker'], ['c-location', 'location'], ['c-tagline', 'tagline'],
    ['c-short', 'taglineShort'], ['c-intro', 'intro'], ['c-about', 'about'],
    ['c-team', 'team'], ['c-founded', 'founded'], ['c-focus', 'focus'], ['c-status', 'status']
  ];

  function renderEditor() {
    $('editor').classList.remove('is-hidden');

    $('b-name').value = state.data.brand.name;
    $('b-initials').value = state.data.brand.initials;
    $('b-email').value = state.data.brand.email;
    $('b-form').value = state.data.brand.formEndpoint;

    var theme = state.data.brand.theme || {};
    $('b-accent').value = theme.accent || '#c9f56b';
    $('b-radius').value = typeof theme.radius === 'number' ? theme.radius : 20;
    $('b-aurora').value = typeof theme.aurora === 'number' ? theme.aurora : 1;
    $('b-fonts').value = theme.fonts || 'alexandria';

    renderLangBar();
    renderCopy();
    renderSectionsEditor();
    renderProducts();
    renderLinks();

    $('file-state').textContent = state.sha ? 'file loaded' : 'new file';
    $('foot-repo').textContent = state.owner + '/' + state.repo + ' · ' + state.branch;
  }

  function renderLangBar() {
    Array.prototype.forEach.call(document.querySelectorAll('#edit-lang [data-edit-lang]'), function (button) {
      button.setAttribute('aria-pressed', button.getAttribute('data-edit-lang') === state.editLang ? 'true' : 'false');
    });
    $('copy-title').textContent = 'Text — ' + LANG_LABEL[state.editLang];
    $('lang-hint').textContent = state.editLang === state.data.defaultLocale
      ? LANG_LABEL[state.editLang] + ' is the default language (shown first).'
      : 'Editing the ' + LANG_LABEL[state.editLang] + ' version.';
  }

  function renderCopy() {
    var copy = state.data.brand.i18n[state.editLang];
    COPY_FIELDS.forEach(function (pair) {
      var input = $(pair[0]);
      input.value = copy[pair[1]] || '';
      input.dir = state.editLang === 'ar' ? 'rtl' : 'ltr';
    });
  }

  function field(label, input) {
    var wrap = document.createElement('label');
    wrap.className = 'field';
    var span = document.createElement('span');
    span.textContent = label;
    wrap.appendChild(span);
    wrap.appendChild(input);
    return wrap;
  }

  function textInput(value, onInput, attrs) {
    var input = document.createElement('input');
    input.type = 'text';
    input.value = value == null ? '' : value;
    input.dir = state.editLang === 'ar' ? 'rtl' : 'ltr';
    input.addEventListener('input', function () { onInput(input.value); });
    Object.keys(attrs || {}).forEach(function (k) { input.setAttribute(k, attrs[k]); });
    return input;
  }

  /* ---------------- image upload ---------------- */

  // Shrink in the browser before committing: phone screenshots are 3–6 MB,
  // the site only needs ~1600px wide.
  function downscale(file, maxWidth) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        try {
          var scale = Math.min(1, maxWidth / (img.width || maxWidth));
          var canvas = document.createElement('canvas');
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
          var webp = canvas.toDataURL('image/webp', 0.85);
          var isWebp = webp.indexOf('data:image/webp') === 0;
          URL.revokeObjectURL(url);
          resolve({ dataUrl: isWebp ? webp : canvas.toDataURL('image/jpeg', 0.86), ext: isWebp ? 'webp' : 'jpg' });
        } catch (err) { reject(err); }
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('Unreadable image file.')); };
      img.src = url;
    });
  }

  function uploadFile(file, baseName, status) {
    if (MOCK) return Promise.resolve('assets/img/' + slug(baseName) + '-mock.webp');
    return downscale(file, 1600).then(function (out) {
      var name = 'assets/img/' + slug(baseName) + '-' + Date.now() + '.' + out.ext;
      if (status) status.textContent = 'committing…';
      return api(contentsUrl(name), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'content: add image ' + name,
          content: out.dataUrl.split(',')[1],
          branch: state.branch
        })
      }).then(function () { return name; });
    });
  }

  function uploadImage(product, file, status) {
    if (!file) return;
    status.textContent = 'preparing…';
    uploadFile(file, product.id || product.i18n.ar.name || 'product', status)
      .then(function (name) {
        product.image = name;
        renderProducts();
        dirty();
        toast('Image committed as ' + name + '. Press Save & publish to link it.', 'ok');
      })
      .catch(function (err) {
        console.error('[admin] upload failed', err);
        status.textContent = describeError(err);
        toast(err.message || 'Upload failed.', 'err');
      });
  }

  function iconButton(glyph, title, disabled, onClick) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'icon-btn';
    b.textContent = glyph;
    b.title = title;
    b.setAttribute('aria-label', title);
    b.disabled = !!disabled;
    b.addEventListener('click', onClick);
    return b;
  }

  function renderProducts() {
    var box = $('products');
    box.textContent = '';

    if (!state.data.products.length) {
      var empty = document.createElement('p');
      empty.className = 'help';
      empty.style.margin = '0';
      empty.textContent = 'No products yet. Add one — the site shows them in this order.';
      box.appendChild(empty);
      return;
    }

    state.data.products.forEach(function (p, index) {
      var copy = p.i18n[state.editLang];
      var card = document.createElement('div');
      card.className = 'prod';

      var head = document.createElement('div');
      head.className = 'prod-head';

      var idx = document.createElement('span');
      idx.className = 'prod-index';
      idx.textContent = ('0' + (index + 1)).slice(-2) + ' / ' + (copy.name || p.id);
      head.appendChild(idx);

      head.appendChild(iconButton('↑', 'Move up', index === 0, function () { moveProduct(index, -1); }));
      head.appendChild(iconButton('↓', 'Move down', index === state.data.products.length - 1, function () { moveProduct(index, 1); }));
      var del = iconButton('✕', 'Delete product', false, function () { removeProduct(index); });
      del.classList.add('danger');
      head.appendChild(del);
      card.appendChild(head);

      var grid = document.createElement('div');
      grid.className = 'prod-grid';

      grid.appendChild(field('Glyph', textInput(p.glyph, function (v) { p.glyph = v; dirty(); }, { maxlength: '3' })));


      var nameField = field('Name (' + LANG_LABEL[state.editLang] + ')',
        textInput(copy.name, function (v) { copy.name = v; dirty(); }));
      grid.appendChild(nameField);

      var select = document.createElement('select');
      [['live', 'Live'], ['beta', 'Beta'], ['soon', 'Coming soon']].forEach(function (opt) {
        var o = document.createElement('option');
        o.value = opt[0];
        o.textContent = opt[1];
        if (p.status === opt[0]) o.selected = true;
        select.appendChild(o);
      });
      select.addEventListener('change', function () { p.status = select.value; dirty(); });
      grid.appendChild(field('Status', select));

      var tagline = field('Tagline', textInput(copy.tagline, function (v) { copy.tagline = v; dirty(); }));
      tagline.classList.add('span-all');
      grid.appendChild(tagline);

      var desc = document.createElement('textarea');
      desc.rows = 2;
      desc.value = copy.description || '';
      desc.dir = state.editLang === 'ar' ? 'rtl' : 'ltr';
      desc.addEventListener('input', function () { copy.description = desc.value; dirty(); });
      var descField = field('Description', desc);
      descField.classList.add('span-all');
      grid.appendChild(descField);

      var tags = textInput((copy.tags || []).join(', '), function (v) {
        copy.tags = v.split(',').map(function (t) { return t.trim(); }).filter(Boolean);
        dirty();
      }, { placeholder: 'POS, Windows' });
      var tagsField = field('Tags (comma separated)', tags);
      tagsField.classList.add('span-all');
      grid.appendChild(tagsField);

      var sharedFields = document.createElement('div');
      sharedFields.className = 'prod-shared';
      sharedFields.textContent = 'shared';
      grid.appendChild(sharedFields);

      grid.appendChild(field('Link', textInput(p.url, function (v) { p.url = v; dirty(); }, { placeholder: 'https://…', dir: 'ltr' })));
      grid.appendChild(field('Source', textInput(p.source, function (v) { p.source = v; dirty(); }, { placeholder: 'https://github.com/…', dir: 'ltr' })));
      var imageField = field('Preview image URL', textInput(p.image, function (v) { p.image = v; dirty(); }, { placeholder: 'assets/img/counter.png', dir: 'ltr' }));
      imageField.classList.add('span-all');
      grid.appendChild(imageField);

      // upload straight into the repo; the commit happens immediately
      var uploadRow = document.createElement('div');
      uploadRow.className = 'upload-row';

      if (p.image) {
        var thumb = document.createElement('img');
        thumb.className = 'thumb';
        thumb.src = /^https?:/i.test(p.image) ? p.image : '../' + p.image.replace(/^\.?\//, '');
        thumb.alt = '';
        uploadRow.appendChild(thumb);
      }

      var fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = 'image/*';
      var uploadStatus = document.createElement('span');
      uploadStatus.className = 'upload-status';

      fileInput.addEventListener('change', function () {
        if (fileInput.files && fileInput.files[0]) uploadImage(p, fileInput.files[0], uploadStatus);
      });

      uploadRow.appendChild(fileInput);
      uploadRow.appendChild(uploadStatus);
      grid.appendChild(uploadRow);

      card.appendChild(grid);
      box.appendChild(card);
    });
  }

  function moveProduct(index, delta) {
    var list = state.data.products;
    var target = index + delta;
    if (target < 0 || target >= list.length) return;
    var item = list.splice(index, 1)[0];
    list.splice(target, 0, item);
    renderProducts();
    dirty();
  }

  function removeProduct(index) {
    var p = state.data.products[index];
    var label = p.i18n[state.editLang].name || p.i18n.ar.name || 'this product';
    if (!window.confirm('Delete "' + label + '"? This removes all language versions.')) return;
    state.data.products.splice(index, 1);
    renderProducts();
    dirty();
  }

  function renderLinks() {
    var box = $('links');
    box.textContent = '';

    if (!state.data.brand.links.length) {
      var empty = document.createElement('p');
      empty.className = 'help';
      empty.style.margin = '0';
      empty.textContent = 'No links. These show under Contact.';
      box.appendChild(empty);
      return;
    }

    state.data.brand.links.forEach(function (link, index) {
      var row = document.createElement('div');
      row.className = 'link-row';

      row.appendChild(textInput(link.label[state.editLang], function (v) {
        link.label[state.editLang] = v;
        dirty();
      }, { placeholder: 'Label (' + LANG_LABEL[state.editLang] + ')' }));

      var url = textInput(link.url, function (v) { link.url = v; dirty(); }, { placeholder: 'https://github.com/you' });
      url.classList.add('link-url');
      url.dir = 'ltr';
      row.appendChild(url);

      row.appendChild(iconButton('✕', 'Remove link', false, function () {
        state.data.brand.links.splice(index, 1);
        renderLinks();
        dirty();
      }));

      box.appendChild(row);
    });
  }

  /* ---------------- sections editor ---------------- */

  var FIELD_SPECS = {
    hero: [
      { key: 'layout', label: 'Layout', type: 'select', options: [['split', 'Text + mockup'], ['centered', 'Centered text']] },
      { key: 'showVisual', label: 'Show product mockup', type: 'bool' }
    ],
    products: [
      { key: 'heading', label: 'Heading', loc: true },
      { key: 'columns', label: 'Columns', type: 'select', numeric: true, options: [['2', '2'], ['3', '3'], ['4', '4']] }
    ],
    text: [
      { key: 'heading', label: 'Heading', loc: true },
      { key: 'body', label: 'Body (blank line between paragraphs)', loc: true, textarea: true },
      { key: 'layout', label: 'Layout', type: 'select', options: [['plain', 'Text only'], ['facts', 'Text + facts panel']] }
    ],
    stats: [
      { key: 'heading', label: 'Heading', loc: true },
      { key: 'items', label: 'Numbers', type: 'pairs', loc: true, fields: [['value', 'Value'], ['label', 'Label']] }
    ],
    faq: [
      { key: 'heading', label: 'Heading', loc: true },
      { key: 'items', label: 'Questions', type: 'pairs', loc: true, fields: [['q', 'Question'], ['a', 'Answer']], textareas: ['a'] }
    ],
    gallery: [
      { key: 'heading', label: 'Heading', loc: true },
      { key: 'columns', label: 'Columns', type: 'select', numeric: true, options: [['2', '2'], ['3', '3'], ['4', '4']] },
      { key: 'images', label: 'Images', type: 'gallery' }
    ],
    cta: [
      { key: 'heading', label: 'Heading', loc: true },
      { key: 'body', label: 'Text', loc: true, textarea: true },
      { key: 'buttonLabel', label: 'Button label', loc: true },
      { key: 'buttonUrl', label: 'Button link', placeholder: '#contact' }
    ],
    contact: [
      { key: 'heading', label: 'Heading', loc: true }
    ],
    canvas: [
      { key: 'heading', label: 'Heading', loc: true },
      { key: 'ratio', label: 'Frame ratio', type: 'select', options: [['16/9', '16:9'], ['4/3', '4:3'], ['1/1', '1:1']] },
      { key: 'items', label: 'Freeform items', type: 'canvas' }
    ]
  };

  function ensureLocale(obj) {
    obj.i18n = obj.i18n && typeof obj.i18n === 'object' ? obj.i18n : {};
    LOCALES.forEach(function (lang) { obj.i18n[lang] = obj.i18n[lang] || {}; });
    return obj.i18n;
  }

  function sectionCopy(section) {
    var i18n = ensureLocale(section);
    return i18n[state.editLang];
  }

  function renderSectionsEditor() {
    var box = $('sections-list');
    if (!box) return;
    box.textContent = '';

    if (!state.data.sections.length) {
      var empty = document.createElement('p');
      empty.className = 'help';
      empty.style.margin = '0';
      empty.textContent = 'No sections. Add one below — the page renders them in this order.';
      box.appendChild(empty);
      return;
    }

    state.data.sections.forEach(function (section, index) {
      box.appendChild(sectionCard(section, index));
    });
  }

  function sectionCard(section, index) {
    var card = document.createElement('div');
    card.className = 'section-editor';

    var head = document.createElement('div');
    head.className = 'section-editor-head';

    var badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = SECTION_LABELS[section.type] || section.type;

    var idLabel = document.createElement('span');
    idLabel.className = 'section-editor-name';
    idLabel.textContent = '#' + section.id;

    head.appendChild(badge);
    head.appendChild(idLabel);

    head.appendChild(iconButton('↑', 'Move up', index === 0, function () { moveSection(index, -1); }));
    head.appendChild(iconButton('↓', 'Move down', index === state.data.sections.length - 1, function () { moveSection(index, 1); }));
    head.appendChild(iconButton('⧉', 'Duplicate', false, function () { duplicateSection(index); }));
    var del = iconButton('✕', 'Delete section', false, function () { removeSection(index); });
    del.classList.add('danger');
    head.appendChild(del);
    card.appendChild(head);

    var fields = document.createElement('div');
    fields.className = 'section-fields';
    (FIELD_SPECS[section.type] || []).forEach(function (spec) {
      fields.appendChild(buildField(section, spec));
    });
    card.appendChild(fields);

    return card;
  }

  function buildField(section, spec) {
    var value = spec.loc ? sectionCopy(section)[spec.key] : section[spec.key];

    if (spec.type === 'select') {
      var select = document.createElement('select');
      spec.options.forEach(function (opt) {
        var o = document.createElement('option');
        o.value = opt[0];
        o.textContent = opt[1];
        if (String(value) === opt[0]) o.selected = true;
        select.appendChild(o);
      });
      select.addEventListener('change', function () {
        var next = spec.numeric ? Number(select.value) : select.value;
        if (spec.loc) sectionCopy(section)[spec.key] = next;
        else section[spec.key] = next;
        dirty();
      });
      return field(spec.label, select);
    }

    if (spec.type === 'bool') {
      var wrap = document.createElement('label');
      wrap.className = 'check-field';
      var input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = value !== false;
      input.addEventListener('change', function () { section[spec.key] = input.checked; dirty(); });
      var text = document.createElement('span');
      text.textContent = spec.label;
      wrap.appendChild(input);
      wrap.appendChild(text);
      return wrap;
    }

    if (spec.type === 'pairs') return pairsField(section, spec);
    if (spec.type === 'gallery') return galleryField(section, spec);
    if (spec.type === 'canvas') return canvasField(section, spec);

    if (spec.textarea) {
      var area = document.createElement('textarea');
      area.rows = 3;
      area.value = value || '';
      area.dir = state.editLang === 'ar' ? 'rtl' : 'ltr';
      area.addEventListener('input', function () {
        if (spec.loc) sectionCopy(section)[spec.key] = area.value;
        else section[spec.key] = area.value;
        dirty();
      });
      return field(spec.label, area);
    }

    var single = textInput(value, function (v) {
      if (spec.loc) sectionCopy(section)[spec.key] = v;
      else section[spec.key] = v;
      dirty();
    }, { placeholder: spec.placeholder || '' });
    return field(spec.label, single);
  }

  function pairsField(section, spec) {
    var wrap = document.createElement('div');
    wrap.className = 'pairs';

    var copy = sectionCopy(section);
    copy[spec.key] = Array.isArray(copy[spec.key]) ? copy[spec.key] : [];
    var list = copy[spec.key];

    var label = document.createElement('span');
    label.className = 'field-label';
    label.textContent = spec.label + ' (' + LANG_LABEL[state.editLang] + ')';
    wrap.appendChild(label);

    list.forEach(function (item, index) {
      var row = document.createElement('div');
      row.className = 'pair-row';

      spec.fields.forEach(function (pair) {
        var key = pair[0];
        var isTextarea = (spec.textareas || []).indexOf(key) >= 0;
        var input;

        if (isTextarea) {
          input = document.createElement('textarea');
          input.rows = 2;
          input.value = item[key] || '';
        } else {
          input = document.createElement('input');
          input.type = 'text';
          input.value = item[key] || '';
        }
        input.dir = state.editLang === 'ar' ? 'rtl' : 'ltr';
        input.placeholder = pair[1];
        input.addEventListener('input', function () { item[key] = input.value; dirty(); });
        row.appendChild(field(pair[1], input));
      });

      row.appendChild(iconButton('✕', 'Remove', false, function () {
        list.splice(index, 1);
        renderSectionsEditor();
        dirty();
      }));

      wrap.appendChild(row);
    });

    var addRow = iconButton('＋', 'Add row', false, function () {
      var blank = {};
      spec.fields.forEach(function (pair) { blank[pair[0]] = ''; });
      list.push(blank);
      renderSectionsEditor();
      dirty();
    });
    addRow.classList.add('add-row');
    addRow.textContent = '＋ Add row';
    wrap.appendChild(addRow);

    return wrap;
  }

  function galleryField(section) {
    var wrap = document.createElement('div');
    wrap.className = 'pairs';
    section.images = Array.isArray(section.images) ? section.images : [];

    var label = document.createElement('span');
    label.className = 'field-label';
    label.textContent = 'Images';
    wrap.appendChild(label);

    section.images.forEach(function (img, index) {
      var row = document.createElement('div');
      row.className = 'pair-row';

      row.appendChild(field('Image URL', textInput(img.src, function (v) { img.src = v; dirty(); }, { placeholder: 'assets/img/shot.png', dir: 'ltr' })));

      var uploadWrap = document.createElement('div');
      uploadWrap.className = 'upload-row';
      var fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = 'image/*';
      var status = document.createElement('span');
      status.className = 'upload-status';
      fileInput.addEventListener('change', function () {
        if (!fileInput.files || !fileInput.files[0]) return;
        status.textContent = 'preparing…';
        uploadFile(fileInput.files[0], 'gallery', status)
          .then(function (name) { img.src = name; renderSectionsEditor(); dirty(); toast('Image committed: ' + name, 'ok'); })
          .catch(function (err) { status.textContent = describeError(err); toast(err.message || 'Upload failed.', 'err'); });
      });
      uploadWrap.appendChild(fileInput);
      uploadWrap.appendChild(status);
      row.appendChild(uploadWrap);

      row.appendChild(iconButton('✕', 'Remove image', false, function () {
        section.images.splice(index, 1);
        renderSectionsEditor();
        dirty();
      }));

      wrap.appendChild(row);
    });

    var add = iconButton('＋', 'Add image', false, function () {
      section.images.push({ src: '', alt: '' });
      renderSectionsEditor();
      dirty();
    });
    add.classList.add('add-row');
    wrap.appendChild(add);

    return wrap;
  }

  function canvasField(section) {
    var wrap = document.createElement('div');
    wrap.className = 'canvas-editor-wrap';
    section.items = Array.isArray(section.items) ? section.items : [];

    var label = document.createElement('span');
    label.className = 'field-label';
    label.textContent = 'Drag to position, drag the corner to resize';
    wrap.appendChild(label);

    var frame = document.createElement('div');
    frame.className = 'canvas-editor';
    frame.style.aspectRatio = section.ratio || '16/9';

    section.items.forEach(function (item, index) {
      var node = document.createElement('div');
      node.className = 'cv-node cv-' + (item.type || 'text');
      node.style.left = (item.x || 0) + '%';
      node.style.top = (item.y || 0) + '%';
      node.style.width = (item.w || 30) + '%';

      var copyText = (item.i18n && (item.i18n[state.editLang] || item.i18n.en)) || {};
      var title = document.createElement('span');
      title.className = 'cv-node-title';
      title.textContent = copyText.title || (item.type === 'image' ? 'image' : 'text');
      node.appendChild(title);

      var del = document.createElement('button');
      del.type = 'button';
      del.className = 'cv-del';
      del.textContent = '✕';
      del.addEventListener('click', function (event) {
        event.stopPropagation();
        section.items.splice(index, 1);
        renderSectionsEditor();
        dirty();
      });
      node.appendChild(del);

      var handle = document.createElement('span');
      handle.className = 'cv-handle';
      node.appendChild(handle);

      attachDrag(node, handle, item, frame);
      frame.appendChild(node);
    });

    wrap.appendChild(frame);

    var tools = document.createElement('div');
    tools.className = 'row-actions';
    [['text', '＋ Text'], ['card', '＋ Card'], ['image', '＋ Image']].forEach(function (pair) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn btn-ghost btn-sm';
      b.textContent = pair[1];
      b.addEventListener('click', function () {
        var item = { id: 'item-' + Date.now(), type: pair[0], x: 8, y: 8, w: 30, i18n: {} };
        if (pair[0] === 'image') item.src = '';
        section.items.push(item);
        renderSectionsEditor();
        dirty();
      });
      tools.appendChild(b);
    });
    wrap.appendChild(tools);

    return wrap;
  }

  function attachDrag(node, handle, item, frame) {
    var dragging = false;
    var resizing = false;
    var start = null;

    function point(event) {
      var box = frame.getBoundingClientRect();
      return {
        x: ((event.clientX - box.left) / box.width) * 100,
        y: ((event.clientY - box.top) / box.height) * 100
      };
    }

    function onMove(event) {
      if (!dragging && !resizing) return;
      var p = point(event);
      if (resizing) {
        item.w = Math.max(10, Math.min(96, Math.round(p.x - (item.x || 0))));
        node.style.width = item.w + '%';
      } else {
        item.x = Math.max(0, Math.min(92, Math.round(p.x - start.dx)));
        item.y = Math.max(0, Math.min(94, Math.round(p.y - start.dy)));
        node.style.left = item.x + '%';
        node.style.top = item.y + '%';        
      }
    }

    function stop() {
      if (!dragging && !resizing) return;
      dragging = false;
      resizing = false;
      node.classList.remove('dragging');
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', stop);
      dirty();
    }

    node.addEventListener('pointerdown', function (event) {
      if (event.target === handle) return;
      event.preventDefault();
      var p = point(event);
      start = { dx: p.x - (item.x || 0), dy: p.y - (item.y || 0) };
      dragging = true;
      node.classList.add('dragging');
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', stop);
    });

    handle.addEventListener('pointerdown', function (event) {
      event.preventDefault();
      event.stopPropagation();
      resizing = true;
      node.classList.add('dragging');
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', stop);
    });
  }

  function moveSection(index, delta) {
    var list = state.data.sections;
    var target = index + delta;
    if (target < 0 || target >= list.length) return;
    var item = list.splice(index, 1)[0];
    list.splice(target, 0, item);
    renderSectionsEditor();
    dirty();
  }

  function duplicateSection(index) {
    var clone = JSON.parse(JSON.stringify(state.data.sections[index]));
    clone.id = (clone.id || 'section') + '-' + Math.random().toString(36).slice(2, 5);
    state.data.sections.splice(index + 1, 0, clone);
    renderSectionsEditor();
    dirty();
  }

  function removeSection(index) {
    var label = SECTION_LABELS[state.data.sections[index].type] || 'section';
    if (!window.confirm('Remove the ' + label + ' section from the page?')) return;
    state.data.sections.splice(index, 1);
    renderSectionsEditor();
    dirty();
  }

  function addSection(type) {
    var section = { id: type + '-' + Math.random().toString(36).slice(2, 5), type: type, i18n: {} };

    if (type === 'hero') { section.layout = 'split'; section.showVisual = true; }
    if (type === 'products') section.columns = 3;
    if (type === 'text') section.layout = 'plain';
    if (type === 'gallery') { section.columns = 3; section.images = []; }
    if (type === 'canvas') { section.ratio = '16/9'; section.items = []; }
    if (type === 'cta') section.buttonUrl = '#contact';

    LOCALES.forEach(function (lang) {
      section.i18n[lang] = { heading: SECTION_LABELS[type] || type };
      if (type === 'stats' || type === 'faq') section.i18n[lang].items = [];
    });

    state.data.sections.push(section);
    renderSectionsEditor();
    dirty();
    toast('Added a ' + (SECTION_LABELS[type] || type) + ' section.', 'ok');
  }

  /* ---------------- save ---------------- */

  function save() {
    if (state.busy || !state.data) return;

    if (MOCK) {
      state.data.updatedAt = new Date().toISOString();
      setDirty(false);
      toast('Mock mode: changes are not committed. Remove ?mock=1 and connect a repo to publish.', 'ok');
      return;
    }

    if (!state.data.brand.name.trim()) {
      toast('Give the group a name first.', 'err');
      $('b-name').focus();
      return;
    }

    var payload = JSON.parse(JSON.stringify(state.data));
    payload.updatedAt = new Date().toISOString();
    payload.brand.links = payload.brand.links.filter(function (l) { return l.url; });

    var body = {
      message: 'content: update site from admin panel',
      content: b64encode(JSON.stringify(payload, null, 2) + '\n'),
      branch: state.branch
    };
    if (state.sha) body.sha = state.sha;

    state.busy = true;
    var btn = $('btn-save');
    btn.disabled = true;
    btn.textContent = 'Saving…';
    setConn('', 'committing…');

    api(contentsUrl(), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
      .then(function (res) {
        if (res && res.content) state.sha = res.content.sha;
        state.data.updatedAt = payload.updatedAt;
        setDirty(false);
        setConn('ok', 'saved · ' + state.owner + '/' + state.repo);
        toast('Committed. Visitors see the change in about a minute.', 'ok');
        persistConfig();
      })
      .catch(function (err) {
        console.error('[admin] save failed', err);
        setConn('err', 'save failed');
        toast(describeError(err), 'err');
      })
      .then(function () {
        state.busy = false;
        btn.disabled = false;
        btn.textContent = 'Save & publish';
      });
  }

  /* ---------------- wiring ---------------- */

  function readConnectionForm() {
    state.token = $('token').value.trim();
    state.owner = $('owner').value.trim();
    state.repo = $('repo').value.trim();
    state.branch = $('branch').value.trim() || 'main';
    state.path = $('path').value.trim() || 'data/site.json';
  }

  function fillConnectionForm() {
    $('token').value = state.token;
    $('owner').value = state.owner;
    $('repo').value = state.repo;
    $('branch').value = state.branch;
    $('path').value = state.path;
  }

  function init() {
    loadConfig();
    guessRepo();
    fillConnectionForm();

    var info = window.Device ? window.Device.info : null;
    if (info) $('device-line').textContent = 'this browser: ' + info.kind + ' · ' + info.os + ' · ' + info.width + 'px';

    $('conn-form').addEventListener('submit', function (event) {
      event.preventDefault();
      readConnectionForm();
      persistConfig();
      loadRemote();
    });

    $('btn-forget').addEventListener('click', function () {
      if (!window.confirm('Remove the stored token from this browser?')) return;
      try { localStorage.removeItem(CONFIG_KEY); } catch (e) { /* ignore */ }
      state.token = '';
      $('token').value = '';
      setConn('', 'token cleared');
      toast('Token removed from this browser.', 'ok');
    });

    $('btn-logout').addEventListener('click', function (event) {
      event.preventDefault();
      state.token = '';
      $('token').value = '';
      $('editor').classList.add('is-hidden');
      setConn('', 'locked');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    $('b-name').addEventListener('input', function () { state.data.brand.name = this.value; dirty(); });
    $('b-initials').addEventListener('input', function () { state.data.brand.initials = this.value; dirty(); });
    $('b-email').addEventListener('input', function () { state.data.brand.email = this.value; dirty(); });
    $('b-form').addEventListener('input', function () { state.data.brand.formEndpoint = this.value; dirty(); });

    $('b-accent').addEventListener('input', function () { state.data.brand.theme.accent = this.value; dirty(); });
    $('b-radius').addEventListener('input', function () { state.data.brand.theme.radius = Number(this.value) || 0; dirty(); });
    $('b-aurora').addEventListener('input', function () { state.data.brand.theme.aurora = Number(this.value); dirty(); });
    $('b-fonts').addEventListener('change', function () { state.data.brand.theme.fonts = this.value; dirty(); });

    $('btn-add-section').addEventListener('click', function () {
      addSection($('add-section-type').value);
    });

    COPY_FIELDS.forEach(function (pair) {
      var input = $(pair[0]);
      input.addEventListener('input', function () {
        if (!state.data) return;
        state.data.brand.i18n[state.editLang][pair[1]] = input.value;
        dirty();
      });
    });

    Array.prototype.forEach.call(document.querySelectorAll('#edit-lang [data-edit-lang]'), function (button) {
      button.addEventListener('click', function () {
        state.editLang = button.getAttribute('data-edit-lang');
        renderLangBar();
        renderCopy();
        renderSectionsEditor();
        renderProducts();
        renderLinks();
      });
    });

    $('btn-add-product').addEventListener('click', function () {
      var product = { id: 'product-' + (state.data.products.length + 1), glyph: '', image: '', status: 'soon', url: '', source: '', i18n: {} };
      LOCALES.forEach(function (lang) { product.i18n[lang] = emptyProductCopy(); });
      state.data.products.push(product);
      renderProducts();
      dirty();
      var last = $('products').lastElementChild;
      if (last) {
        var input = last.querySelector('input');
        if (input) input.focus();
      }
    });

    $('btn-add-link').addEventListener('click', function () {
      state.data.brand.links.push({ label: { ar: '', fr: '', en: '' }, url: '' });
      renderLinks();
      dirty();
    });

    $('btn-save').addEventListener('click', save);

    $('btn-reload').addEventListener('click', function () {
      if (state.dirty && !window.confirm('Discard unsaved changes and reload from GitHub?')) return;
      loadRemote();
    });

    document.addEventListener('devicechange', function (event) {
      if (event.detail) {
        $('device-line').textContent = 'this browser: ' + event.detail.kind + ' · ' + event.detail.os + ' · ' + event.detail.width + 'px';
      }
    });

    window.addEventListener('beforeunload', function (event) {
      if (!state.dirty) return;
      event.preventDefault();
      event.returnValue = '';
    });

    if (MOCK || (state.token && state.owner && state.repo)) loadRemote();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
