/* ---------------------------------------------
   צ'אט האתר — מחובר לסוכן של נועה פילאטיס ב-n8n בשיטת polling.

   חוזה:
     POST  /webhook/noa-chat         { message, sessionId, website }
       200 → { jobId, status: "pending" }
       400 → { error, field }                     (הודעה בעברית למשתמש)
     GET   /webhook/noa-chat-status?jobId=…
       200 → { jobId, status: "pending"|"done"|"error"|"not_found", stage, result: { reply } }
   --------------------------------------------- */
(function () {
  "use strict";

  var START_URL = "https://elik.app.n8n.cloud/webhook/noa-chat";
  var STATUS_URL = "https://elik.app.n8n.cloud/webhook/noa-chat-status";
  var POLL_EVERY_MS = 2000;
  var POLL_CAP_MS = 90000;
  var REQUEST_TIMEOUT_MS = 15000;
  var MAX_STATUS_FAILURES = 3;

  var ERRORS = {
    offline: { title: "אין חיבור לאינטרנט", action: "בדקו את החיבור ולחצו \"נסו שוב\"." },
    unreachable: { title: "הצ'אט לא זמין כרגע", action: "השרת לא ענה. נסו שוב בעוד דקה, או כתבו לנועה בוואטסאפ." },
    server: { title: "משהו השתבש אצלנו", action: "נסו שוב בעוד דקה. אם זה חוזר, אפשר להתקשר: 052-000-0000." },
    failed: { title: "לא הצלחנו לנסח תשובה", action: "נסו לשלוח את השאלה שוב." },
    notFound: { title: "השאלה לא נמצאה במערכת", action: "ייתכן שהיא פגה. שלחו אותה שוב." },
    timeout: { title: "התשובה מתעכבת יותר מהרגיל", action: "נסו שוב בעוד רגע." }
  };

  var SUGGESTIONS = ["כמה עולה מנוי חודשי?", "מה כוללת קבוצת הבוקר?", "אפשר להקפיא מנוי?"];

  var launcher = document.getElementById("chat-launcher");
  var panel = document.getElementById("chat-panel");
  if (!launcher || !panel) return;

  var log = panel.querySelector(".chat-log");
  var form = panel.querySelector(".chat-form");
  var input = panel.querySelector("#chat-input");
  var sendBtn = panel.querySelector(".chat-send");
  var closeBtn = panel.querySelector(".chat-close");
  var honeypot = panel.querySelector("#chat-website");
  var formError = panel.querySelector(".chat-form-error");

  var busy = false;
  var started = false;

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function JobError(kind, data) { this.kind = kind; this.data = data; }

  function sessionId() {
    var id = null;
    try { id = sessionStorage.getItem("noa-chat-session"); } catch (e) { /* storage blocked */ }
    if (!id || !/^[A-Za-z0-9_-]{8,64}$/.test(id)) {
      id = "ns" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
      try { sessionStorage.setItem("noa-chat-session", id); } catch (e) { /* storage blocked */ }
    }
    return id;
  }
  var SESSION = sessionId();

  function fetchJson(url, options) {
    if (!navigator.onLine) return Promise.reject(new JobError("offline"));
    var ctrl = new AbortController();
    var t = setTimeout(function () { ctrl.abort(); }, REQUEST_TIMEOUT_MS);
    var opts = Object.assign({}, options || {}, { signal: ctrl.signal, cache: "no-store" });
    return fetch(url, opts)
      .catch(function () { throw new JobError(navigator.onLine ? "unreachable" : "offline"); })
      .then(function (res) {
        return res.json().catch(function () { return null; }).then(function (data) {
          if (res.status === 400 && data && data.error) throw new JobError("invalid", data);
          if (!res.ok || !data) throw new JobError("server");
          return data;
        });
      })
      .finally(function () { clearTimeout(t); });
  }

  function startJob(body) {
    return fetchJson(START_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }).then(function (job) {
      if (!job.jobId) throw new JobError("server");
      return job.jobId;
    });
  }

  async function pollJob(jobId, startedAt) {
    var failures = 0;
    for (;;) {
      if (Date.now() - startedAt > POLL_CAP_MS) throw new JobError("timeout");
      await sleep(POLL_EVERY_MS);
      var status;
      try {
        status = await fetchJson(STATUS_URL + "?jobId=" + encodeURIComponent(jobId));
        failures = 0;
      } catch (err) {
        failures += 1;
        if (failures >= MAX_STATUS_FAILURES) throw err;
        continue;
      }
      if (status.status === "pending") continue;
      if (status.status === "done") return status;
      if (status.status === "not_found") throw new JobError("notFound");
      throw new JobError("failed");
    }
  }

  /* ---------- תצוגה ---------- */

  function scrollDown() { log.scrollTop = log.scrollHeight; }

  // תשובת הסוכן היא קלט לא מהימן: בונים DOM עם textContent בלבד.
  // תמיכה מינימלית ב-**הדגשה** ובשורות שמתחילות ב"- " או "• ".
  function appendInline(parent, text) {
    var parts = text.split("**");
    parts.forEach(function (part, i) {
      if (!part) return;
      if (i % 2 === 1) {
        var b = document.createElement("strong");
        b.textContent = part;
        parent.appendChild(b);
      } else {
        parent.appendChild(document.createTextNode(part));
      }
    });
  }

  function renderReply(text) {
    var frag = document.createDocumentFragment();
    var list = null;
    String(text).split(/\n+/).forEach(function (raw) {
      // "*(גרסה …)*" → "(גרסה …)"; בלי lookbehind, שלא נתמך בספארי ישן
      var line = raw.trim().replace(/^[*_]+\(/, "(").replace(/\)[*_]+$/, ")");
      if (!line) return;
      var bullet = line.match(/^(?:[-•]|\d+\.)\s+(.*)$/);
      if (bullet) {
        if (!list) { list = document.createElement("ul"); frag.appendChild(list); }
        var li = document.createElement("li");
        appendInline(li, bullet[1]);
        list.appendChild(li);
      } else {
        list = null;
        var p = document.createElement("p");
        appendInline(p, line);
        frag.appendChild(p);
      }
    });
    return frag;
  }

  function addMessage(who, content) {
    var msg = document.createElement("div");
    msg.className = "chat-msg chat-msg--" + who;
    msg.setAttribute("dir", "auto");
    if (typeof content === "string") msg.textContent = content;
    else msg.appendChild(content);
    log.appendChild(msg);
    scrollDown();
    return msg;
  }

  // מה שקורה באמת: השאלה נשלחה ← התקבל מספר עבודה ← הסוכן עובד (שעון) ← תשובה.
  function addWaiting() {
    var el = document.createElement("div");
    el.className = "chat-wait";
    el.setAttribute("role", "status");
    var dots = document.createElement("span");
    dots.className = "chat-wait-dots";
    dots.setAttribute("aria-hidden", "true");
    dots.innerHTML = "<i></i><i></i><i></i>";
    var label = document.createElement("span");
    label.className = "chat-wait-label";
    label.textContent = "שולחים את השאלה…";
    var meta = document.createElement("span");
    meta.className = "chat-wait-meta";
    el.append(dots, label, meta);
    log.appendChild(el);
    scrollDown();

    var clock = null;
    return {
      working: function (jobId, startedAt) {
        label.textContent = "מחפשים במחירון ובתקנון";
        var id = document.createElement("bdi");
        id.dir = "ltr";
        id.className = "chat-job-id";
        id.textContent = "#" + jobId.slice(-6);
        var secs = document.createElement("span");
        var tick = function () { secs.textContent = Math.round((Date.now() - startedAt) / 1000) + " שנ׳"; };
        tick();
        clock = setInterval(tick, 1000);
        meta.replaceChildren(secs, document.createTextNode(" · "), id);
      },
      remove: function () { clearInterval(clock); el.remove(); },
      error: function (info, onRetry) {
        clearInterval(clock);
        el.className = "chat-error";
        el.setAttribute("role", "alert");
        var title = document.createElement("b");
        title.textContent = info.title;
        var action = document.createElement("p");
        action.textContent = info.action;
        var retry = document.createElement("button");
        retry.type = "button";
        retry.className = "chat-retry";
        retry.textContent = "נסו שוב";
        retry.addEventListener("click", function () { el.remove(); onRetry(); }, { once: true });
        el.replaceChildren(title, action, retry);
        scrollDown();
      }
    };
  }

  function setBusy(on) {
    busy = on;
    sendBtn.disabled = on;
    panel.querySelectorAll(".chat-chip").forEach(function (c) { c.disabled = on; });
  }

  async function ask(message) {
    if (busy) return;
    setBusy(true);
    formError.hidden = true;
    var wait = addWaiting();
    var startedAt = Date.now();
    try {
      var jobId = await startJob({ message: message, sessionId: SESSION, website: honeypot.value });
      wait.working(jobId, startedAt);
      var status = await pollJob(jobId, startedAt);
      var reply = status.result && status.result.reply;
      if (!reply) throw new JobError("failed");
      wait.remove();
      addMessage("bot", renderReply(reply));
    } catch (err) {
      if (err instanceof JobError && err.kind === "invalid") {
        wait.remove();
        formError.textContent = err.data.error;
        formError.hidden = false;
        input.focus();
      } else {
        var kind = err instanceof JobError && ERRORS[err.kind] ? err.kind : "server";
        console.error("[chat]", kind, err);
        wait.error(ERRORS[kind], function () { ask(message); });
      }
    } finally {
      setBusy(false);
    }
  }

  function send(text) {
    var message = String(text || "").trim();
    if (!message) {
      formError.textContent = "כתבו שאלה לפני השליחה.";
      formError.hidden = false;
      input.focus();
      return;
    }
    if (message.length > 500) {
      formError.textContent = "השאלה ארוכה מדי. נסו לקצר לעד 500 תווים.";
      formError.hidden = false;
      return;
    }
    if (busy) return;
    var chips = panel.querySelector(".chat-chips");
    if (chips) chips.remove();
    addMessage("user", message);
    input.value = "";
    ask(message);
  }

  function greet() {
    if (started) return;
    started = true;
    addMessage("bot", "היי! אני העוזר הדיגיטלי של נועה פילאטיס. אפשר לשאול אותי על מחירים, מנויים, קבוצת הבוקר, ביטולים והקפאה.");
    var chips = document.createElement("div");
    chips.className = "chat-chips";
    SUGGESTIONS.forEach(function (q) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "chat-chip";
      b.textContent = q;
      b.addEventListener("click", function () { send(q); });
      chips.appendChild(b);
    });
    log.appendChild(chips);
  }

  function openChat() {
    panel.hidden = false;
    launcher.setAttribute("aria-expanded", "true");
    document.body.classList.add("chat-open");
    greet();
    scrollDown();
    input.focus({ preventScroll: true });
  }

  function closeChat() {
    panel.hidden = true;
    launcher.setAttribute("aria-expanded", "false");
    document.body.classList.remove("chat-open");
    launcher.focus();
  }

  launcher.addEventListener("click", function () {
    if (panel.hidden) openChat(); else closeChat();
  });
  closeBtn.addEventListener("click", closeChat);
  panel.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeChat();
  });
  document.querySelectorAll("[data-open-chat]").forEach(function (el) {
    el.addEventListener("click", function (e) { e.preventDefault(); openChat(); });
  });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    send(input.value);
  });
  input.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      send(input.value);
    }
  });
  input.addEventListener("input", function () { formError.hidden = true; });
})();
