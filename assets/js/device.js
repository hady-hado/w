/* ------------------------------------------------------------
   device.js — figure out whether the visitor is on a phone,
   a tablet or a desktop, then tell the rest of the page.

   Result is available three ways:
     window.Device.kind          "phone" | "tablet" | "desktop"
     html[data-device="phone"]   CSS hook
     "devicechange" event        fired on rotate / resize
   ------------------------------------------------------------ */
(function () {
  'use strict';

  var ua = navigator.userAgent || '';
  var uaPhone = /Android.+Mobile|iPhone|iPod|Windows Phone|IEMobile|BlackBerry|BB10|Opera Mini|webOS/i.test(ua);
  var uaTablet = /iPad|Tablet|PlayBook|Silk|Kindle/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua));

  var touch = ('ontouchstart' in window) ||
              (navigator.maxTouchPoints || 0) > 0 ||
              (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);

  function detectOS() {
    if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS';
    if (/Android/i.test(ua)) return 'Android';
    if (/Windows/i.test(ua)) return 'Windows';
    if (/Mac OS X|Macintosh/i.test(ua)) return 'macOS';
    if (/CrOS/i.test(ua)) return 'ChromeOS';
    if (/Linux/i.test(ua)) return 'Linux';
    return 'Unknown';
  }

  function detectBrowser() {
    if (/Edg\//i.test(ua)) return 'Edge';
    if (/OPR\/|Opera/i.test(ua)) return 'Opera';
    if (/SamsungBrowser/i.test(ua)) return 'Samsung Internet';
    if (/Firefox\/|FxiOS/i.test(ua)) return 'Firefox';
    if (/CriOS|Chrome\//i.test(ua)) return 'Chrome';
    if (/Safari\//i.test(ua)) return 'Safari';
    return 'Unknown';
  }

  function viewport() {
    var w = window.innerWidth || document.documentElement.clientWidth || 0;
    if (window.visualViewport && window.visualViewport.width) w = Math.min(w, window.visualViewport.width);
    return w;
  }

  function detect() {
    var w = viewport();
    var shortSide = Math.min(window.screen ? window.screen.width : w, window.screen ? window.screen.height : w);
    var kind;

    if (w < 700) {
      // A narrow window is a phone layout whatever the UA claims.
      kind = 'phone';
    } else if (uaPhone && !uaTablet && w < 900) {
      kind = 'phone';
    } else if (uaTablet || (touch && shortSide < 1100 && w < 1180)) {
      kind = 'tablet';
    } else {
      kind = 'desktop';
    }

    return {
      kind: kind,
      isPhone: kind === 'phone',
      isTablet: kind === 'tablet',
      isDesktop: kind === 'desktop',
      touch: touch,
      os: detectOS(),
      browser: detectBrowser(),
      width: w,
      pixelRatio: window.devicePixelRatio || 1
    };
  }

  var current = detect();

  function apply(info) {
    var root = document.documentElement;
    if (root.getAttribute('data-device') !== info.kind) {
      root.setAttribute('data-device', info.kind);
    }
    root.setAttribute('data-touch', info.touch ? 'true' : 'false');

    var chip = document.getElementById('device-chip');
    if (chip) {
      chip.textContent = 'device: ' + info.kind + ' · ' + info.os;
      chip.setAttribute('title', info.browser + ' on ' + info.os + ', ' + info.width + 'px wide');
    }

    try {
      document.dispatchEvent(new CustomEvent('devicechange', { detail: info }));
    } catch (e) {
      var ev = document.createEvent('CustomEvent');
      ev.initCustomEvent('devicechange', true, true, info);
      document.dispatchEvent(ev);
    }
  }

  function refresh() {
    var next = detect();
    var changed = next.kind !== current.kind;
    current = next;
    if (changed) apply(current);
    else {
      var chip = document.getElementById('device-chip');
      if (chip) chip.setAttribute('title', current.browser + ' on ' + current.os + ', ' + current.width + 'px wide');
    }
  }

  window.Device = {
    get kind() { return current.kind; },
    get info() { return current; },
    isPhone: function () { return current.kind === 'phone'; },
    isTablet: function () { return current.kind === 'tablet'; },
    isDesktop: function () { return current.kind === 'desktop'; },
    refresh: refresh
  };

  apply(current);

  var t;
  function onResize() {
    clearTimeout(t);
    t = setTimeout(refresh, 120);
  }

  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', onResize);
})();
