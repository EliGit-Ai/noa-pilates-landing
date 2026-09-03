(function () {
  "use strict";

  var BREATH_CYCLE_MS = 8000;
  function breathAt(now) {
    var phase = (now % BREATH_CYCLE_MS) / BREATH_CYCLE_MS;
    return 0.5 - 0.5 * Math.cos(phase * Math.PI * 2);
  }
  function isInhaling(now) {
    return (now % BREATH_CYCLE_MS) / BREATH_CYCLE_MS < 0.5;
  }
  function prefersReducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  var reducedMotion = prefersReducedMotion();
  var root = document.documentElement;

  /* ---------------- שעון הנשימה ---------------- */
  (function breathClock() {
    if (reducedMotion) return;
    function tick(now) {
      root.style.setProperty("--breath", breathAt(now).toFixed(4));
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  })();

  /* ---------------- שכבת הזריחה ---------------- */
  (function sunriseLayer() {
    var ticking = false;
    function measure() {
      ticking = false;
      var total = document.documentElement.scrollHeight - window.innerHeight;
      var progress = total > 0 ? window.scrollY / total : 0;
      var sunrise = Math.pow(Math.min(1, Math.max(0, progress)), 1.8);
      root.style.setProperty("--sunrise", sunrise.toFixed(3));
    }
    function onScroll() {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(measure);
      }
    }
    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
  })();

  /* ---------------- אור נר עוקב עכבר ---------------- */
  (function cursorGlow() {
    if (reducedMotion || !window.matchMedia("(pointer: fine)").matches) return;
    var el = document.getElementById("cursor-glow");
    if (!el) return;
    var targetX = window.innerWidth / 2, targetY = window.innerHeight / 2;
    var x = targetX, y = targetY, visible = false;
    window.addEventListener("pointermove", function (e) {
      targetX = e.clientX;
      targetY = e.clientY;
      if (!visible) { visible = true; el.style.opacity = "1"; }
    }, { passive: true });
    function tick() {
      x += (targetX - x) * 0.08;
      y += (targetY - y) * 0.08;
      el.style.transform = "translate3d(" + (x - 340) + "px," + (y - 340) + "px,0)";
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  })();

  /* ---------------- שאיפה/נשיפה מעל הכותרת ---------------- */
  (function breathWord() {
    var inhaleEl = document.getElementById("kicker-inhale");
    var exhaleEl = document.getElementById("kicker-exhale");
    if (!inhaleEl || !exhaleEl || reducedMotion) return;
    function tick(now) {
      var inhale = isInhaling(now);
      inhaleEl.style.opacity = inhale ? "1" : "0";
      exhaleEl.style.opacity = inhale ? "0" : "1";
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  })();

  /* ---------------- שדה הלוגו — קנבס חלקיקים מהגליף האמיתי ---------------- */
  (function logoField() {
    var canvas = document.getElementById("hero-canvas");
    if (!canvas) return;
    var ctx = canvas.getContext("2d");
    if (!ctx) return;

    var IVORY = "241, 232, 219";
    var DAWN = "226, 164, 92";
    var TOUCH_RADIUS = 115;

    var small = window.matchMedia("(max-width: 640px)").matches;
    var fine = window.matchMedia("(pointer: fine)").matches;
    var interactive = fine && !reducedMotion;

    var points = [];
    var dust = buildDust(small ? 90 : 160);
    var width = 0, height = 0, dpr = 1;

    function buildDust(count) {
      var arr = [];
      var golden = Math.PI * (3 - Math.sqrt(5));
      for (var i = 0; i < count; i++) {
        var y = 1 - (i / (count - 1)) * 2;
        var r = Math.sqrt(1 - y * y);
        var theta = golden * i;
        arr.push({ x: Math.cos(theta) * r, y: y * 0.7, z: Math.sin(theta) * r, tw: Math.random() * Math.PI * 2 });
      }
      return arr;
    }

    function sampleLogo(img, cell) {
      var w = img.naturalWidth, h = img.naturalHeight;
      if (!w || !h) return [];
      var off = document.createElement("canvas");
      off.width = w; off.height = h;
      var octx = off.getContext("2d", { willReadFrequently: true });
      octx.drawImage(img, 0, 0);
      var data;
      try { data = octx.getImageData(0, 0, w, h).data; } catch (e) { return []; }

      var cols = Math.ceil(w / cell), rows = Math.ceil(h / cell);
      var norm = Math.max(w, h) / 2;
      var pts = [];
      for (var cy = 0; cy < rows; cy++) {
        for (var cx = 0; cx < cols; cx++) {
          var pick = -1, seen = 0;
          var yEnd = Math.min((cy + 1) * cell, h);
          var xEnd = Math.min((cx + 1) * cell, w);
          for (var y = cy * cell; y < yEnd; y++) {
            for (var x = cx * cell; x < xEnd; x++) {
              if (data[(y * w + x) * 4 + 3] > 60) {
                seen++;
                if (Math.random() * seen < 1) pick = y * w + x;
              }
            }
          }
          if (pick < 0) continue;
          var nx = ((pick % w) - w / 2) / norm;
          var ny = (Math.floor(pick / w) - h / 2) / norm;
          pts.push({
            bx: nx, by: ny,
            curve: 0.95 * nx * nx + 0.3 * ny * ny + (Math.random() - 0.5) * 0.05,
            dawn: Math.random() < 0.09,
            tw: Math.random() * Math.PI * 2,
            ox: 0, oy: 0, vx: 0, vy: 0
          });
        }
      }
      return pts;
    }

    function resize() {
      var rect = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width; height = rect.height;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }
    resize();
    var ro = new ResizeObserver(function () {
      resize();
      if (reducedMotion) draw(0);
    });
    ro.observe(canvas);

    var targetTiltX = 0, targetTiltY = 0, tiltX = 0, tiltY = 0;
    var pointer = null;

    if (interactive) {
      window.addEventListener("pointermove", function (e) {
        var nx = (e.clientX / window.innerWidth) * 2 - 1;
        var ny = (e.clientY / window.innerHeight) * 2 - 1;
        targetTiltY = nx * 0.26;
        targetTiltX = ny * 0.17;
        var rect = canvas.getBoundingClientRect();
        pointer = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      }, { passive: true });
      window.addEventListener("pointerleave", function () { pointer = null; });
    }

    var onScreen = true;
    var io = new IntersectionObserver(function (entries) { onScreen = entries[0].isIntersecting; });
    io.observe(canvas);

    var fade = 0;

    function draw(now) {
      var breath = reducedMotion ? 0.4 : breathAt(now);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      if (!points.length) return;
      if (fade < 1) fade = Math.min(1, fade + (reducedMotion ? 1 : 0.02));

      var cx = width / 2, cy = height / 2;
      var base = Math.min(width * 0.42, height * 0.5);
      var scale = base * (0.95 + 0.05 * breath);

      tiltX += (targetTiltX - tiltX) * 0.045;
      tiltY += (targetTiltY - tiltY) * 0.045;

      var yaw = (reducedMotion ? 0 : Math.sin(now * 0.00019) * 0.26) + tiltY;
      var pitch = (reducedMotion ? 0 : Math.sin(now * 0.00013) * 0.085) + tiltX;
      var depth = 0.6 + breath * 0.4;

      var sinY = Math.sin(yaw), cosY = Math.cos(yaw);
      var sinX = Math.sin(pitch), cosX = Math.cos(pitch);
      var persp = 3.4;

      var glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, base * 1.35);
      glow.addColorStop(0, "rgba(" + DAWN + "," + (0.075 + breath * 0.09) * fade + ")");
      glow.addColorStop(0.5, "rgba(" + DAWN + "," + (0.028 + breath * 0.04) * fade + ")");
      glow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, width, height);

      var dustR = base * 1.28;
      for (var di = 0; di < dust.length; di++) {
        var d = dust[di];
        var x1 = d.x * cosY + d.z * sinY;
        var z1 = -d.x * sinY + d.z * cosY;
        var y1 = d.y * cosX - z1 * sinX;
        var z2 = d.y * sinX + z1 * cosX;
        var k = persp / (persp - z2);
        var sx = cx + x1 * dustR * k;
        var sy = cy + y1 * dustR * k;
        var depthN = (z2 + 1) / 2;
        var tw = reducedMotion ? 1 : 0.7 + 0.3 * Math.sin(now * 0.0009 + d.tw);
        ctx.beginPath();
        ctx.arc(sx, sy, 0.5 + depthN * 0.5, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(" + IVORY + "," + (0.07 + depthN * 0.13) * tw * fade + ")";
        ctx.fill();
      }

      for (var pi = 0; pi < points.length; pi++) {
        var p = points[pi];
        var z0 = -(p.curve - 0.28) * depth;
        var px1 = p.bx * cosY + z0 * sinY;
        var pz1 = -p.bx * sinY + z0 * cosY;
        var py1 = p.by * cosX - pz1 * sinX;
        var pz2 = p.by * sinX + pz1 * cosX;
        var pk = persp / (persp - pz2);
        var psx = cx + px1 * scale * pk;
        var psy = cy + py1 * scale * pk;

        if (interactive) {
          p.vx += -p.ox * 0.055;
          p.vy += -p.oy * 0.055;
          p.vx *= 0.88; p.vy *= 0.88;
          p.ox += p.vx; p.oy += p.vy;
        }

        var fx = psx + p.ox, fy = psy + p.oy;
        var touch = 0;
        if (pointer) {
          var dx = fx - pointer.x, dy = fy - pointer.y;
          var d2 = dx * dx + dy * dy;
          if (d2 < TOUCH_RADIUS * TOUCH_RADIUS) {
            var dd = Math.sqrt(d2) || 1;
            touch = 1 - dd / TOUCH_RADIUS;
            var push = touch * touch * 2.8;
            p.vx += (dx / dd) * push;
            p.vy += (dy / dd) * push;
          }
        }

        var pDepthN = (pz2 + 1) / 2;
        var twinkle = reducedMotion ? 1 : 0.78 + 0.22 * Math.sin(now * 0.0011 + p.tw);
        var alpha = Math.min(1, (0.36 + pDepthN * 0.64) * twinkle * (0.86 + breath * 0.22) + touch * 0.42) * fade;
        var size = (0.58 + pDepthN * 1.1) * (small ? 0.95 : 1) + touch * 0.6;

        ctx.beginPath();
        ctx.arc(fx, fy, size, 0, Math.PI * 2);
        ctx.fillStyle = (p.dawn || touch > 0.45)
          ? "rgba(" + DAWN + "," + Math.min(1, alpha * 1.3) + ")"
          : "rgba(" + IVORY + "," + alpha + ")";
        ctx.fill();
      }
    }

    function start() {
      if (reducedMotion) { draw(0); return; }
      function loop(now) {
        if (onScreen) draw(now);
        requestAnimationFrame(loop);
      }
      requestAnimationFrame(loop);
    }

    var img = new Image();
    img.onload = function () {
      points = sampleLogo(img, small ? 4 : 3);
      start();
    };
    img.onerror = function () { start(); };
    img.src = "assets/brand-glyph.png";
  })();

  /* ---------------- ניווט הנשימה ---------------- */
  (function breathNav() {
    var sectionIds = ["about", "classes", "group", "who", "noa", "place", "faq"];
    var mobileLinks = document.querySelectorAll(".breath-nav-mobile a");
    var desktopLinks = document.querySelectorAll(".breath-nav-desktop a");
    var chipsList = document.getElementById("nav-chips");

    function setActive(id) {
      mobileLinks.forEach(function (a) { a.classList.toggle("is-active", a.dataset.section === id); });
      desktopLinks.forEach(function (a) { a.classList.toggle("is-active", a.dataset.section === id); });
      var chip = chipsList && chipsList.querySelector('[href="#' + id + '"]');
      if (chip && chip.scrollIntoView) {
        chip.scrollIntoView({ inline: "center", block: "nearest", behavior: reducedMotion ? "auto" : "smooth" });
      }
    }

    var observer = new IntersectionObserver(function (entries) {
      var visible = entries.filter(function (e) { return e.isIntersecting; })
        .sort(function (a, b) { return b.intersectionRatio - a.intersectionRatio; })[0];
      if (visible) setActive(visible.target.id);
    }, { rootMargin: "-45% 0px -45% 0px", threshold: [0, 0.25, 0.5, 1] });

    sectionIds.forEach(function (id) {
      var el = document.getElementById(id);
      if (el) observer.observe(el);
    });
  })();

  /* ---------------- גלילה חלקה ---------------- */
  (function smoothScroll() {
    var MIN_MS = 320, MAX_MS = 620;
    function ease(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
    var frame = 0;

    document.addEventListener("click", function (event) {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      var link = event.target.closest ? event.target.closest("a") : null;
      var href = link && link.getAttribute("href");
      if (!link || !href || href === "#" || href.charAt(0) !== "#") return;
      var target = document.getElementById(href.slice(1));
      if (!target) return;
      event.preventDefault();

      var offset = parseFloat(getComputedStyle(target).scrollMarginTop || "0");
      var to = Math.max(0, Math.min(
        target.getBoundingClientRect().top + window.scrollY - offset,
        document.documentElement.scrollHeight - window.innerHeight
      ));
      var from = window.scrollY;
      var distance = to - from;
      history.pushState(null, "", href);

      if (reducedMotion || Math.abs(distance) < 2) {
        window.scrollTo(0, to);
        return;
      }
      var duration = Math.min(MAX_MS, Math.max(MIN_MS, Math.abs(distance) * 0.45));
      var start = performance.now();
      cancelAnimationFrame(frame);
      function step(now) {
        var progress = Math.min(1, (now - start) / duration);
        window.scrollTo(0, from + distance * ease(progress));
        if (progress < 1) frame = requestAnimationFrame(step);
      }
      frame = requestAnimationFrame(step);
    });
  })();

  /* ---------------- חשיפה בכניסה לתצוגה ---------------- */
  (function reveal() {
    var els = document.querySelectorAll(".reveal");
    if (reducedMotion) {
      els.forEach(function (el) { el.classList.add("is-shown"); });
      return;
    }
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-shown");
          observer.unobserve(entry.target);
        }
      });
    }, { rootMargin: "0px 0px -12% 0px", threshold: 0.05 });
    els.forEach(function (el) { observer.observe(el); });
  })();

  /* ---------------- ספירה עולה ---------------- */
  (function countUp() {
    var els = document.querySelectorAll(".count-up");
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        observer.unobserve(entry.target);
        var el = entry.target;
        var target = parseInt(el.dataset.target, 10);
        var suffix = el.dataset.suffix || "";
        var display = el.dataset.display;
        if (display) { el.textContent = display; return; }
        if (reducedMotion) { el.textContent = target.toLocaleString("he-IL") + suffix; return; }
        var duration = 1400, start = performance.now();
        function step(now) {
          var t = Math.min(1, (now - start) / duration);
          var eased = 1 - Math.pow(1 - t, 3);
          el.textContent = Math.round(target * eased).toLocaleString("he-IL") + suffix;
          if (t < 1) requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
      });
    }, { threshold: 0.5 });
    els.forEach(function (el) { observer.observe(el); });
  })();

  /* ---------------- כפתורים מגנטיים ---------------- */
  (function magneticButtons() {
    if (reducedMotion) return;
    document.querySelectorAll("a.btn").forEach(function (el) {
      el.addEventListener("pointermove", function (e) {
        if (e.pointerType !== "mouse") return;
        var rect = el.getBoundingClientRect();
        var dx = e.clientX - (rect.left + rect.width / 2);
        var dy = e.clientY - (rect.top + rect.height / 2);
        el.style.transform = "translate(" + dx * 0.14 + "px," + dy * 0.22 + "px)";
      });
      el.addEventListener("pointerleave", function () { el.style.transform = ""; });
    });
  })();

  /* ---------------- טופס הרשמה ---------------- */
  (function registerForm() {
    var form = document.getElementById("register-form");
    if (!form) return;

    var CONTACT_ENDPOINT = "https://elik.app.n8n.cloud/webhook/noa-pilates-contact";
    var PREFIXES = ["050", "052", "053", "054", "055", "058"];
    var startedAt = Date.now();

    var GROUPS = {
      "morning-wednesday": { dayLabel: "יום רביעי", timeLabel: "07:30", durationLabel: "שעה", startDateLabel: "21 באוקטובר" },
      "evening-monday": { dayLabel: "יום שני", timeLabel: "19:00", durationLabel: "שעה", startDateLabel: null }
    };

    function normalizePhone(prefix, local) {
      if (!/^\d{7}$/.test(local)) return null;
      var digits = prefix.slice(1) + local;
      if (!/^5\d{8}$/.test(digits)) return null;
      return "+972" + digits;
    }

    function showError(id, show) {
      var el = document.getElementById("err-" + id);
      if (el) el.hidden = !show;
    }

    function validate(values) {
      var ok = true;
      if (!values.group) { showError("group", true); ok = false; } else showError("group", false);
      if (!values.fullName || values.fullName.trim().length < 2) { showError("fullName", true); ok = false; } else showError("fullName", false);
      var normPhone = normalizePhone(values.phonePrefix, values.phoneLocal);
      if (!normPhone) { showError("phone", true); ok = false; } else showError("phone", false);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email || "")) { showError("email", true); ok = false; } else showError("email", false);
      if (!values.firstTime) { showError("firstTime", true); ok = false; } else showError("firstTime", false);
      if (!values.medicalAck) { showError("medicalAck", true); ok = false; } else showError("medicalAck", false);
      return { ok: ok, normPhone: normPhone };
    }

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var data = new FormData(form);
      var values = {
        group: data.get("group"),
        fullName: (data.get("fullName") || "").toString(),
        phonePrefix: data.get("phonePrefix") || PREFIXES[0],
        phoneLocal: (data.get("phoneLocal") || "").toString(),
        email: (data.get("email") || "").toString(),
        firstTime: data.get("firstTime"),
        medicalAck: data.get("medicalAck") === "on",
        honeypot: (data.get("company") || "").toString()
      };

      var result = validate(values);
      var serverError = document.getElementById("form-server-error");
      serverError.hidden = true;
      if (!result.ok) return;

      // מלכודת בוטים: מילוי שדה חברה או שליחה תוך פחות משנייה מהטעינה — מתעלמים בשקט
      if (values.honeypot || Date.now() - startedAt < 1000) return;

      var submitBtn = document.getElementById("register-submit");
      submitBtn.disabled = true;
      submitBtn.textContent = "שולח...";

      var groupInfo = GROUPS[values.group];
      var payload = {
        group: values.group,
        fullName: values.fullName.trim(),
        phone: result.normPhone,
        email: values.email.trim(),
        firstTime: values.firstTime,
        medicalAck: "yes"
      };

      fetch(CONTACT_ENDPOINT, { method: "POST", body: new URLSearchParams(payload) })
        .then(function (res) {
          if (!res.ok) throw new Error("server");
          form.hidden = true;
          document.getElementById("success-title").textContent = "מחכים לך ב" + groupInfo.dayLabel;
          var dl = document.getElementById("success-details");
          dl.innerHTML = "";
          var lines = [
            groupInfo.dayLabel + ", " + groupInfo.timeLabel + " · " + groupInfo.durationLabel,
            groupInfo.startDateLabel ? "מתחילים ב־" + groupInfo.startDateLabel : null,
            "ביאליק, רמת גן · קומה שנייה · יש מעלית",
            "מזרנים וכל הציוד הנדרש נמצאים בסטודיו",
            "התשלום מתבצע בסטודיו בלבד"
          ].filter(Boolean);
          lines.forEach(function (line) {
            var div = document.createElement("div");
            div.textContent = line;
            dl.appendChild(div);
          });
          document.getElementById("register-success").hidden = false;
        })
        .catch(function () {
          serverError.hidden = false;
          submitBtn.disabled = false;
          submitBtn.textContent = "שריין לי מקום";
        });
    });
  })();
})();
