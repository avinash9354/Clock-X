(function () {
  "use strict";

  /* =====================================================================
   *  STORAGE MANAGER
   * ===================================================================== */
  var STORE_KEY = "clockhub_state_v4";
  var defaultState = {
    version: 4,
    mode: "dark", theme: "midnight", format: "12", anim: true, autoMode: false,
    studio: { showSecHand: true, showNumbers: true, showDigital: true, customColors: null },
    cities: [
      { name: "India", tz: "Asia/Kolkata" },
      { name: "London", tz: "Europe/London" },
      { name: "New York", tz: "America/New_York" }
    ],
    alarms: [],
    weatherCity: "India",
    weatherApiKey: "",
    events: [],
    tasks: [],
    pomodoro: { durWork: 25, durShort: 5, durLong: 15, autoStart: false },
    statistics: { daily: {} },
    soundSettings: { tick: true, chime: false, masterVolume: 70, alarmVolume: 80, timerVolume: 80, pomodoVolume: 80 },
    settings: { dateFormat: "long", weekStart: 1 },
    timerPresets: [60, 300, 600, 900, 1500, 1800, 2700, 3600]
  };

  function loadState() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        // migration: merge missing keys from defaults
        return deepMerge(JSON.parse(JSON.stringify(defaultState)), parsed);
      }
    } catch (e) { /* localStorage unavailable */ }
    return JSON.parse(JSON.stringify(defaultState));
  }
  function deepMerge(target, source) {
    Object.keys(source).forEach(function (k) {
      if (source[k] && typeof source[k] === "object" && !Array.isArray(source[k])) {
        if (!target[k] || typeof target[k] !== "object") target[k] = {};
        deepMerge(target[k], source[k]);
      } else {
        target[k] = source[k];
      }
    });
    return target;
  }
  function saveState() { try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { } }
  function pad(n) { return n < 10 ? "0" + n : "" + n; }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }
  function sanitize(str) { var d = document.createElement("div"); d.textContent = str; return d.innerHTML; }
  function todayKey() { return new Date().toISOString().slice(0, 10); }

  var state = loadState();

  /* =====================================================================
   *  NOTIFICATION MANAGER
   * ===================================================================== */
  var NotificationManager = {
    toastContainer: null,
    init: function () {
      this.toastContainer = document.getElementById("toastContainer");
      this.updateStatus();
    },
    canBrowser: function () { return "Notification" in window; },
    getPermission: function () { return this.canBrowser() ? Notification.permission : "denied"; },
    requestPermission: function (cb) {
      if (!this.canBrowser()) { if (cb) cb(false); return; }
      Notification.requestPermission().then(function (p) { if (cb) cb(p === "granted"); });
    },
    updateStatus: function () {
      var el = document.getElementById("notifStatus");
      if (!el) return;
      if (!this.canBrowser()) { el.textContent = "Not supported in this browser"; return; }
      var map = { granted: "✅ Granted", denied: "❌ Denied", default: "⚠ Not requested yet" };
      el.textContent = map[this.getPermission()] || "Unknown";
    },
    notify: function (title, body, type) {
      // Browser notification
      if (this.canBrowser() && this.getPermission() === "granted") {
        try { new Notification(title, { body: body, icon: "icon-192.png" }); } catch (e) { }
      }
      // In-app toast always
      this.toast(title, body, type || "info");
    },
    toast: function (title, body, type) {
      if (!this.toastContainer) return;
      var t = document.createElement("div");
      t.className = "toast" + (type === "alarm" ? " toast-alarm" : type === "success" ? " toast-success" : "");
      var icons = { alarm: "⏰", success: "✅", info: "🔔", pomo: "🍅", timer: "⏳" };
      t.innerHTML = '<div class="toast-icon">' + (icons[type] || "🔔") + '</div>' +
        '<div class="toast-body"><div class="toast-title">' + sanitize(title) + '</div>' +
        (body ? '<div class="toast-msg">' + sanitize(body) + '</div>' : '') + '</div>' +
        '<button class="toast-close" aria-label="Close">✕</button>';
      t.querySelector(".toast-close").onclick = function () { t.remove(); };
      this.toastContainer.appendChild(t);
      setTimeout(function () { if (t.parentNode) t.remove(); }, 5000);
    }
  };

  /* =====================================================================
   *  SOUND MANAGER
   * ===================================================================== */
  var SoundManager = {
    audioCtx: null,
    getCtx: function () {
      if (!this.audioCtx) this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      return this.audioCtx;
    },
    _beep: function (freq, duration, vol) {
      var masterVol = (state.soundSettings.masterVolume || 70) / 100;
      try {
        var ctx = this.getCtx();
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.frequency.value = freq;
        gain.gain.value = (vol || 0.15) * masterVol;
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(); osc.stop(ctx.currentTime + duration);
      } catch (e) { }
    },
    tick: function () {
      if (!state.soundSettings.tick) return;
      try {
        var ctx = this.getCtx();
        var osc = ctx.createOscillator(); var gain = ctx.createGain();
        osc.frequency.value = 1400;
        gain.gain.value = 0.018 * ((state.soundSettings.masterVolume || 70) / 100);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(); osc.stop(ctx.currentTime + 0.02);
      } catch (e) { }
    },
    chime: function () {
      if (!state.soundSettings.chime) return;
      var freqs = [523, 659, 784, 1047];
      var masterVol = (state.soundSettings.masterVolume || 70) / 100;
      try {
        var ctx = this.getCtx();
        freqs.forEach(function (f, i) {
          var osc = ctx.createOscillator(); var gain = ctx.createGain();
          osc.frequency.value = f; gain.gain.value = 0.1 * masterVol;
          osc.connect(gain); gain.connect(ctx.destination);
          var s = ctx.currentTime + i * 0.3;
          osc.start(s); osc.stop(s + 0.25);
        });
      } catch (e) { }
    },
    alarm: function (times) {
      var vol = ((state.soundSettings.alarmVolume || 80) / 100) * ((state.soundSettings.masterVolume || 70) / 100);
      try {
        var ctx = this.getCtx();
        for (var i = 0; i < (times || 4); i++) {
          (function (idx) {
            var osc = ctx.createOscillator(); var gain = ctx.createGain();
            osc.frequency.value = 880; gain.gain.value = vol * 0.2;
            osc.connect(gain); gain.connect(ctx.destination);
            var start = ctx.currentTime + idx * 0.35;
            osc.start(start); osc.stop(start + 0.22);
          })(i);
        }
      } catch (e) { }
    },
    timerDone: function () {
      var vol = ((state.soundSettings.timerVolume || 80) / 100) * ((state.soundSettings.masterVolume || 70) / 100);
      var freqs = [880, 1100, 1320];
      try {
        var ctx = this.getCtx();
        freqs.forEach(function (f, i) {
          var osc = ctx.createOscillator(); var gain = ctx.createGain();
          osc.frequency.value = f; gain.gain.value = vol * 0.15;
          osc.connect(gain); gain.connect(ctx.destination);
          var s = ctx.currentTime + i * 0.2;
          osc.start(s); osc.stop(s + 0.18);
        });
      } catch (e) { }
    },
    pomoDone: function () {
      var vol = ((state.soundSettings.pomodoVolume || 80) / 100) * ((state.soundSettings.masterVolume || 70) / 100);
      try {
        var ctx = this.getCtx();
        [523, 659, 784, 1047, 784, 1047].forEach(function (f, i) {
          var osc = ctx.createOscillator(); var gain = ctx.createGain();
          osc.frequency.value = f; gain.gain.value = vol * 0.12;
          osc.connect(gain); gain.connect(ctx.destination);
          var s = ctx.currentTime + i * 0.18;
          osc.start(s); osc.stop(s + 0.16);
        });
      } catch (e) { }
    }
  };

  /* =====================================================================
   *  NAV / VIEWS
   * ===================================================================== */
  var app = document.getElementById("app");
  var sidebar = document.getElementById("sidebar");
  var hamburger = document.getElementById("hamburger");
  var sidebarClose = document.getElementById("sidebarClose");
  var nav = document.getElementById("nav");

  function switchView(id) {
    document.querySelectorAll(".view").forEach(function (v) { v.classList.remove("active"); });
    var target = document.getElementById("view-" + id);
    if (target) target.classList.add("active");
    document.querySelectorAll(".nav-item[data-view]").forEach(function (item) {
      item.classList.toggle("active", item.dataset.view === id);
    });
    if (window.innerWidth <= 820) closeSidebar();
    // refresh views on open
    if (id === "statistics") StatisticsManager.render();
    if (id === "events") EventManager.render();
    if (id === "tasks") TaskManager.render();
    if (id === "converter") ConverterManager.renderQuick();
    if (id === "world") WorldClockManager.render();
  }
  nav.querySelectorAll(".nav-item[data-view]").forEach(function (item) {
    item.addEventListener("click", function () { switchView(item.dataset.view); });
  });
  function openSidebar() { app.classList.remove("sidebar-hidden"); }
  function closeSidebar() { app.classList.add("sidebar-hidden"); }
  function toggleSidebar() { app.classList.toggle("sidebar-hidden"); }
  hamburger.addEventListener("click", function (e) {
    e.stopPropagation();
    toggleSidebar();
  });
  sidebarClose.addEventListener("click", function (e) {
    e.stopPropagation();
    closeSidebar();
  });
  document.addEventListener("click", function (e) {
    if (window.innerWidth <= 820 && !app.classList.contains("sidebar-hidden")) {
      if (!sidebar.contains(e.target) && !hamburger.contains(e.target)) {
        closeSidebar();
      }
    }
  });
  window.addEventListener("resize", function () {
    if (window.innerWidth <= 820) {
      closeSidebar();
    } else {
      openSidebar();
    }
  });
  if (window.innerWidth <= 820) closeSidebar();

  /* Quick action buttons on home */
  function qa(id, view) {
    var btn = document.getElementById(id);
    if (btn) btn.addEventListener("click", function () { switchView(view); });
  }
  qa("qaStopwatch", "stopwatch"); qa("qaTimer", "timer"); qa("qaPomodoro", "pomodoro");
  qa("qaAlarm", "alarm"); qa("qaEvents", "events"); qa("qaWorld", "world");

  /* =====================================================================
   *  THEME / MODE TOGGLES
   * ===================================================================== */
  var toggleMode = document.getElementById("toggleMode");
  var toggleFormat = document.getElementById("toggleFormat");
  var toggleAnim = document.getElementById("toggleAnim");
  var toggleAutoMode = document.getElementById("toggleAutoMode");

  function applyMode() { document.documentElement.setAttribute("data-mode", state.mode); toggleMode.checked = state.mode === "light"; }
  function applyFormat() { document.getElementById("toggleFormat").checked = state.format === "24"; }
  function applyTheme() {
    document.documentElement.setAttribute("data-theme", state.theme);
    document.querySelectorAll(".theme-card").forEach(function (c) { c.classList.toggle("selected", c.dataset.theme === state.theme); });
    if (typeof updateThemeColors === "function") updateThemeColors();
  }
  function applyAnim() { document.body.classList.toggle("no-anim", !state.anim); toggleAnim.checked = state.anim; }

  toggleMode.addEventListener("change", function () {
    state.mode = toggleMode.checked ? "light" : "dark";
    state.autoMode = false; if (toggleAutoMode) toggleAutoMode.checked = false;
    saveState(); applyMode();
  });
  toggleFormat.addEventListener("change", function () { state.format = toggleFormat.checked ? "24" : "12"; saveState(); applyFormat(); WorldClockManager.render(); });
  toggleAnim.addEventListener("change", function () { state.anim = toggleAnim.checked; saveState(); applyAnim(); });
  if (toggleAutoMode) {
    toggleAutoMode.checked = state.autoMode;
    toggleAutoMode.addEventListener("change", function () {
      state.autoMode = toggleAutoMode.checked; saveState();
      if (state.autoMode) checkAutoMode();
    });
  }

  document.getElementById("rowDarkLight").addEventListener("click", function (e) {
    if (e.target.tagName === "INPUT" || e.target.tagName === "LABEL") return;
    toggleMode.checked = !toggleMode.checked; toggleMode.dispatchEvent(new Event("change"));
  });
  document.getElementById("rowFormat").addEventListener("click", function (e) {
    if (e.target.tagName === "INPUT" || e.target.tagName === "LABEL") return;
    toggleFormat.checked = !toggleFormat.checked; toggleFormat.dispatchEvent(new Event("change"));
  });
  document.getElementById("switchModeWrap").addEventListener("click", function (e) {
    e.stopPropagation(); toggleMode.checked = !toggleMode.checked; toggleMode.dispatchEvent(new Event("change"));
  });
  document.getElementById("switchFormatWrap").addEventListener("click", function (e) {
    e.stopPropagation(); toggleFormat.checked = !toggleFormat.checked; toggleFormat.dispatchEvent(new Event("change"));
  });

  function checkAutoMode() {
    if (!state.autoMode) return;
    var dark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    state.mode = dark ? "dark" : "light"; applyMode();
  }
  if (window.matchMedia) {
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", function () {
      if (state.autoMode) checkAutoMode();
    });
  }

  /* =====================================================================
   *  CLOCK STUDIO (Themes & Custom Colors)
   * ===================================================================== */
  var DEFAULT_CLOCK_COLORS = {
    sec: "#04fc43",
    min: "#fee800",
    hrs: "#ff2972"
  };

  var THEMES = [
    { id: "midnight", name: "Midnight Neon" },
    { id: "sunset", name: "Sunset" },
    { id: "ocean", name: "Ocean" },
    { id: "forest", name: "Forest" },
    { id: "mono", name: "Monochrome" },
    { id: "neon", name: "Neon" },
    { id: "aurora", name: "Aurora" },
    { id: "cyberpunk", name: "Cyberpunk" }
  ];
  // [secColor, minColor, hrsColor]
  var THEME_COLORS = {
    midnight: ["#04fc43", "#fee800", "#ff2972"],
    sunset: ["#ff4d6d", "#ffd166", "#ff8a3d"],
    ocean: ["#3d7dff", "#7de0ff", "#2ecbe0"],
    forest: ["#1f8f5f", "#b7e778", "#57c785"],
    mono: ["#ff5a5a", "#b9b9b9", "#e7e7e7"],
    neon: ["#00ff88", "#ff00ff", "#00ffff"],
    aurora: ["#f472b6", "#34d399", "#a78bfa"],
    cyberpunk: ["#00f3ff", "#ff003c", "#ffe600"]
  };

  function applyClockColors(secColor, minColor, hrsColor) {
    if (!secColor) secColor = DEFAULT_CLOCK_COLORS.sec;
    if (!minColor) minColor = DEFAULT_CLOCK_COLORS.min;
    if (!hrsColor) hrsColor = DEFAULT_CLOCK_COLORS.hrs;

    // 1. Root CSS variables
    document.documentElement.style.setProperty("--clr-sec", secColor);
    document.documentElement.style.setProperty("--clr-min", minColor);
    document.documentElement.style.setProperty("--clr-hrs", hrsColor);
    document.documentElement.style.setProperty("--clr-a", secColor);
    document.documentElement.style.setProperty("--clr-b", minColor);
    document.documentElement.style.setProperty("--clr-c", hrsColor);

    // 2. Direct style on clock elements (seconds, minutes, hours circles + digital time)
    var elSec = document.getElementById("sec");
    var elMin = document.getElementById("min");
    var elHrs = document.getElementById("hrs");
    var elSeconds = document.getElementById("seconds");
    var elMinutes = document.getElementById("minutes");
    var elHours = document.getElementById("hours");

    if (elSec) elSec.style.setProperty("--clr", secColor);
    if (elMin) elMin.style.setProperty("--clr", minColor);
    if (elHrs) elHrs.style.setProperty("--clr", hrsColor);
    if (elSeconds) elSeconds.style.setProperty("--clr", secColor);
    if (elMinutes) elMinutes.style.setProperty("--clr", minColor);
    if (elHours) elHours.style.setProperty("--clr", hrsColor);

    // 3. Inputs & preview swatches in Clock Studio
    var inpSec = document.getElementById("studioColorA");
    var inpMin = document.getElementById("studioColorB");
    var inpHrs = document.getElementById("studioColorC");
    if (inpSec && inpSec.value.toLowerCase() !== secColor.toLowerCase()) inpSec.value = secColor;
    if (inpMin && inpMin.value.toLowerCase() !== minColor.toLowerCase()) inpMin.value = minColor;
    if (inpHrs && inpHrs.value.toLowerCase() !== hrsColor.toLowerCase()) inpHrs.value = hrsColor;

    var prevSec = document.getElementById("previewSec");
    var prevMin = document.getElementById("previewMin");
    var prevHrs = document.getElementById("previewHrs");
    if (prevSec) prevSec.style.background = secColor;
    if (prevMin) prevMin.style.background = minColor;
    if (prevHrs) prevHrs.style.background = hrsColor;

    var hexSec = document.getElementById("hexSec");
    var hexMin = document.getElementById("hexMin");
    var hexHrs = document.getElementById("hexHrs");
    if (hexSec) hexSec.textContent = secColor.toUpperCase();
    if (hexMin) hexMin.textContent = minColor.toUpperCase();
    if (hexHrs) hexHrs.textContent = hrsColor.toUpperCase();
  }

  function updateThemeColors() {
    if (state.studio && state.studio.customColors && Array.isArray(state.studio.customColors) && state.studio.customColors.length === 3) {
      applyClockColors(state.studio.customColors[0], state.studio.customColors[1], state.studio.customColors[2]);
    } else {
      var tCols = THEME_COLORS[state.theme] || [DEFAULT_CLOCK_COLORS.sec, DEFAULT_CLOCK_COLORS.min, DEFAULT_CLOCK_COLORS.hrs];
      applyClockColors(tCols[0], tCols[1], tCols[2]);
    }
  }

  var themeGrid = document.getElementById("themeGrid");
  THEMES.forEach(function (t) {
    var card = document.createElement("div");
    card.className = "theme-card"; card.dataset.theme = t.id;
    var colors = THEME_COLORS[t.id] || [DEFAULT_CLOCK_COLORS.sec, DEFAULT_CLOCK_COLORS.min, DEFAULT_CLOCK_COLORS.hrs];
    card.innerHTML = '<div class="theme-swatch">' + colors.map(function (c) { return '<span style="background:' + c + '"></span>'; }).join("") + '</div><div class="theme-name">' + t.name + '</div>';
    card.addEventListener("click", function () {
      state.theme = t.id;
      state.studio.customColors = null;
      saveState();
      applyTheme();
      NotificationManager.toast("Theme Applied", t.name + " theme active.", "info");
    });
    themeGrid.appendChild(card);
  });

  function handleCustomColorChange() {
    var sec = document.getElementById("studioColorA").value;
    var min = document.getElementById("studioColorB").value;
    var hrs = document.getElementById("studioColorC").value;
    state.studio.customColors = [sec, min, hrs];
    saveState();
    applyClockColors(sec, min, hrs);
  }

  ["studioColorA", "studioColorB", "studioColorC"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) {
      el.addEventListener("input", handleCustomColorChange);
      el.addEventListener("change", handleCustomColorChange);
    }
  });

  document.getElementById("studioApplyColors").addEventListener("click", function () {
    handleCustomColorChange();
    NotificationManager.toast("Custom Colors Applied", "Your accent colors are active and saved.", "success");
  });

  document.getElementById("studioResetColors").addEventListener("click", function () {
    state.studio.customColors = null;
    state.theme = "midnight";
    saveState();
    applyTheme();
    NotificationManager.toast("Colors Reset", "Clock colors reset to default (Green #04fc43, Yellow #fee800, Pink #ff2972).", "success");
  });
  // Studio options
  document.getElementById("studioSecHand").addEventListener("change", function () {
    state.studio.showSecHand = this.checked; saveState(); applyStudioOptions();
  });
  document.getElementById("studioNumbers").addEventListener("change", function () {
    state.studio.showNumbers = this.checked; saveState(); applyStudioOptions();
  });
  document.getElementById("studioDigital").addEventListener("change", function () {
    state.studio.showDigital = this.checked; saveState(); applyStudioOptions();
  });
  function applyStudioOptions() {
    var s = state.studio;
    document.getElementById("sec").classList.toggle("hidden-sec", !s.showSecHand);
    document.getElementById("studioSecHand").checked = s.showSecHand;
    document.querySelector(".numbers").classList.toggle("no-numbers", !s.showNumbers);
    document.getElementById("studioNumbers").checked = s.showNumbers;
    document.getElementById("time").classList.toggle("hidden-digital", !s.showDigital);
    document.getElementById("studioDigital").checked = s.showDigital;
  }

  /* =====================================================================
   *  MAIN CLOCK (original logic preserved, enhanced)
   * ===================================================================== */
  var hr = document.querySelector("#hrs");
  var min = document.querySelector("#min");
  var sec = document.querySelector("#sec");
  var hoursEl = document.querySelector("#hours");
  var minutesEl = document.querySelector("#minutes");
  var secondsEl = document.querySelector("#seconds");
  var ampmEl = document.querySelector("#AMPM");
  var dateFull = document.getElementById("dateFull");
  var tzInfo = document.getElementById("tzInfo");

  var lastSecond = -1;
  var lastHour = -1;
  function updateClock() {
    var day = new Date();
    var h = day.getHours(), m = day.getMinutes(), s = day.getSeconds(), ms = day.getMilliseconds();

    var hourAngle = (h % 12) * 30 + (m / 60) * 30 + (s / 3600) * 30 + (ms / 3600000) * 30;
    var minuteAngle = m * 6 + (s / 60) * 6 + (ms / 60000) * 6;
    var secondAngle = s * 6 + (ms / 1000) * 6;

    hr.style.transform = "rotateZ(" + hourAngle + "deg)";
    min.style.transform = "rotateZ(" + minuteAngle + "deg)";
    sec.style.transform = "rotateZ(" + secondAngle + "deg)";

    if (s !== lastSecond) {
      var h1 = h;
      if (state.format === "12") {
        ampmEl.style.display = "flex";
        if (h1 >= 12) { h1 -= 12; ampmEl.textContent = "PM"; } else { ampmEl.textContent = "AM"; }
        if (h1 === 0) h1 = 12;
      } else {
        ampmEl.style.display = "none";
      }
      hoursEl.textContent = h1 < 10 ? "0" + h1 : h1;
      minutesEl.textContent = m < 10 ? "0" + m : m;
      secondsEl.textContent = s < 10 ? "0" + s : s;
      lastSecond = s;

      // Date
      var fmt = state.settings && state.settings.dateFormat || "long";
      var opts = fmt === "short" ? { day: "2-digit", month: "2-digit", year: "numeric" } :
        fmt === "medium" ? { day: "2-digit", month: "short", year: "numeric" } :
          { weekday: "long", day: "2-digit", month: "long", year: "numeric" };
      dateFull.textContent = day.toLocaleDateString("en-GB", opts);
      var tzName = Intl.DateTimeFormat().resolvedOptions().timeZone;
      var offsetMin = -day.getTimezoneOffset();
      var sign = offsetMin >= 0 ? "+" : "-";
      var offAbs = Math.abs(offsetMin);
      var offStr = "UTC" + sign + pad(Math.floor(offAbs / 60)) + ":" + pad(offAbs % 60);
      tzInfo.textContent = tzName + " • " + offStr;

      SoundManager.tick();
      AlarmManager.check(day);

      // Hourly chime
      if (h !== lastHour && m === 0 && s === 0) { SoundManager.chime(); lastHour = h; }

      // Day progress
      updateDayProgress(h, m, s);

      // Ambient clock
      updateAmbientClock(day);
    }
    requestAnimationFrame(updateClock);
  }

  function updateDayProgress(h, m, s) {
    var totalSec = h * 3600 + m * 60 + s;
    var pct = Math.round(totalSec / 864);
    var bar = document.getElementById("dayProgressBar");
    var pctEl = document.getElementById("dayProgressPct");
    if (bar) bar.style.width = pct + "%";
    if (pctEl) pctEl.textContent = pct + "%";
  }

  // Day info (sunrise/sunset estimated, week number)
  function updateDayInfo() {
    var now = new Date();
    // Week number (ISO)
    var d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    var dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    var yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    var weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    var weekEl = document.getElementById("valWeek");
    if (weekEl) weekEl.textContent = "W" + weekNo;

    // Approximate sunrise/sunset (fixed lat/lon 20°N 77°E for India, generic otherwise)
    var sunrise = new Date(now); sunrise.setHours(6, 18, 0, 0);
    var sunset = new Date(now); sunset.setHours(18, 32, 0, 0);
    var dayLen = Math.round((sunset - sunrise) / 60000); // minutes

    var srEl = document.getElementById("valSunrise"), ssEl = document.getElementById("valSunset"), dlEl = document.getElementById("valDayLen");
    if (srEl) srEl.textContent = fmtTime12(6, 18);
    if (ssEl) ssEl.textContent = fmtTime12(18, 32);
    if (dlEl) dlEl.textContent = Math.floor(dayLen / 60) + "h " + (dayLen % 60) + "m";

    // Also set weather sunrise/sunset
    var wsr = document.getElementById("wSunrise"), wss = document.getElementById("wSunset");
    if (wsr) wsr.textContent = fmtTime12(6, 18);
    if (wss) wss.textContent = fmtTime12(18, 32);
  }
  function fmtTime12(h, m) {
    var ampm = h >= 12 ? "PM" : "AM"; var h1 = h % 12 || 12;
    return h1 + ":" + pad(m) + " " + ampm;
  }

  function updateAmbientClock(now) {
    var amb = document.getElementById("ambientClock");
    if (!amb) return;
    var h = now.getHours(), m = now.getMinutes(), s = now.getSeconds();
    var h1 = h;
    if (state.format === "12") {
      var ampm = h >= 12 ? " PM" : " AM"; h1 = h % 12 || 12;
      amb.textContent = pad(h1) + ":" + pad(m) + ":" + pad(s) + ampm;
    } else {
      amb.textContent = pad(h) + ":" + pad(m) + ":" + pad(s);
    }
    var dateEl = document.getElementById("ambientDate");
    if (dateEl) dateEl.textContent = now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  }

  /* =====================================================================
   *  WORLD CLOCK MANAGER
   * ===================================================================== */
  var ALL_CITIES = [
    { name: "India", tz: "Asia/Kolkata", flag: "🇮🇳" },
    { name: "London", tz: "Europe/London", flag: "🇬🇧" },
    { name: "New York", tz: "America/New_York", flag: "🇺🇸" },
    { name: "Tokyo", tz: "Asia/Tokyo", flag: "🇯🇵" },
    { name: "Sydney", tz: "Australia/Sydney", flag: "🇦🇺" },
    { name: "Dubai", tz: "Asia/Dubai", flag: "🇦🇪" },
    { name: "Los Angeles", tz: "America/Los_Angeles", flag: "🇺🇸" },
    { name: "Paris", tz: "Europe/Paris", flag: "🇫🇷" },
    { name: "Singapore", tz: "Asia/Singapore", flag: "🇸🇬" },
    { name: "Moscow", tz: "Europe/Moscow", flag: "🇷🇺" },
    { name: "Beijing", tz: "Asia/Shanghai", flag: "🇨🇳" },
    { name: "Seoul", tz: "Asia/Seoul", flag: "🇰🇷" },
    { name: "Berlin", tz: "Europe/Berlin", flag: "🇩🇪" },
    { name: "Toronto", tz: "America/Toronto", flag: "🇨🇦" },
    { name: "Chicago", tz: "America/Chicago", flag: "🇺🇸" },
    { name: "Bangkok", tz: "Asia/Bangkok", flag: "🇹🇭" },
    { name: "Cairo", tz: "Africa/Cairo", flag: "🇪🇬" },
    { name: "Mexico City", tz: "America/Mexico_City", flag: "🇲🇽" },
    { name: "São Paulo", tz: "America/Sao_Paulo", flag: "🇧🇷" },
    { name: "Istanbul", tz: "Europe/Istanbul", flag: "🇹🇷" },
    { name: "Karachi", tz: "Asia/Karachi", flag: "🇵🇰" },
    { name: "Lagos", tz: "Africa/Lagos", flag: "🇳🇬" },
    { name: "Johannesburg", tz: "Africa/Johannesburg", flag: "🇿🇦" },
    { name: "Riyadh", tz: "Asia/Riyadh", flag: "🇸🇦" },
    { name: "Jakarta", tz: "Asia/Jakarta", flag: "🇮🇩" }
  ];
  var WorldClockManager = {
    interval: null,
    init: function () {
      this.refreshSelect();
      this.render();
      this.interval = setInterval(this.render.bind(this), 1000);
      document.getElementById("addCityBtn").addEventListener("click", this.add.bind(this));
      document.getElementById("wcSearch").addEventListener("input", this.onSearch.bind(this));
    },
    onSearch: function () {
      var q = document.getElementById("wcSearch").value.toLowerCase().trim();
      document.querySelectorAll(".wc-item").forEach(function (el) {
        el.style.display = el.dataset.name && el.dataset.name.toLowerCase().includes(q) ? "" : "none";
      });
    },
    refreshSelect: function () {
      var sel = document.getElementById("citySelect");
      sel.innerHTML = "";
      var added = state.cities.map(function (c) { return c.name; });
      ALL_CITIES.filter(function (c) { return !added.includes(c.name); }).forEach(function (c) {
        var o = document.createElement("option"); o.value = c.name; o.textContent = (c.flag || "") + " " + c.name;
        sel.appendChild(o);
      });
    },
    add: function () {
      var name = document.getElementById("citySelect").value;
      var city = ALL_CITIES.find(function (c) { return c.name === name; });
      if (city && !state.cities.some(function (c) { return c.name === name; })) {
        state.cities.push(city); saveState(); this.refreshSelect(); this.render();
      }
    },
    render: function () {
      var list = document.getElementById("wcList");
      if (!list) return;
      var localOff = -(new Date().getTimezoneOffset());
      list.innerHTML = "";
      var q = (document.getElementById("wcSearch") || {}).value || "";
      state.cities.forEach(function (c, idx) {
        var now = new Date();
        var timeStr = now.toLocaleTimeString(state.format === "12" ? "en-US" : "en-GB", {
          timeZone: c.tz, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: state.format === "12"
        });
        var dateStr = now.toLocaleDateString("en-GB", { timeZone: c.tz, weekday: "short", day: "numeric", month: "short" });
        // UTC offset via Intl
        var fmt = new Intl.DateTimeFormat("en", { timeZone: c.tz, timeZoneName: "short" });
        var parts = fmt.formatToParts(now);
        var tzName = (parts.find(function (p) { return p.type === "timeZoneName"; }) || {}).value || c.tz;
        // hour of day for day/night
        var cityHour = parseInt(now.toLocaleString("en-US", { timeZone: c.tz, hour: "numeric", hour12: false }), 10);
        var isDay = cityHour >= 6 && cityHour < 20;
        // Offset
        var offMs = now - new Date(now.toLocaleString("en-US", { timeZone: c.tz }));
        // diff from local
        var cityOffMin = -(offMs / 60000) + localOff;
        var diffSign = cityOffMin >= 0 ? "+" : "-";
        var diffAbs = Math.abs(Math.round(cityOffMin));
        var diffStr = diffAbs === 0 ? "Local" : diffSign + Math.floor(diffAbs / 60) + "h " + (diffAbs % 60 > 0 ? diffAbs % 60 + "m" : "");

        var div = document.createElement("div");
        div.className = "wc-item"; div.dataset.name = c.name;
        if (q && !c.name.toLowerCase().includes(q.toLowerCase())) div.style.display = "none";
        div.innerHTML = '<div class="wc-left">' +
          '<div class="wc-city">' + (c.flag || "🌍") + " " + sanitize(c.name) + '</div>' +
          '<div class="wc-tz">' + sanitize(c.tz) + "</div>" +
          '<div class="wc-meta">' + sanitize(diffStr) + " from local</div>" +
          '</div>' +
          '<div class="wc-right">' +
          '<div class="wc-time">' + timeStr + '</div>' +
          '<div class="wc-date">' + dateStr + '</div>' +
          '</div>' +
          '<div class="wc-actions">' +
          '<div class="wc-dot ' + (isDay ? "day" : "night") + '" title="' + (isDay ? "Day" : "Night") + '"></div>' +
          (idx >= 3 ? '<button class="btn danger" data-remove="' + idx + '" style="padding:5px 9px;font-size:11px;">✕</button>' : '') +
          '</div>';
        list.appendChild(div);
      });
      list.querySelectorAll("[data-remove]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          state.cities.splice(parseInt(btn.dataset.remove, 10), 1);
          saveState(); WorldClockManager.refreshSelect(); WorldClockManager.render();
        });
      });
      // Weather select
      var weatherCityEl = document.getElementById("weatherCity");
      if (weatherCityEl && weatherCityEl.options.length === 0) {
        ALL_CITIES.forEach(function (c) {
          var o = document.createElement("option"); o.value = c.name; o.textContent = c.name;
          if (c.name === state.weatherCity) o.selected = true;
          weatherCityEl.appendChild(o);
        });
        weatherCityEl.addEventListener("change", WeatherService.render.bind(WeatherService));
      }
    }
  };

  /* =====================================================================
   *  TIME CONVERTER
   * ===================================================================== */
  var ConverterManager = {
    init: function () {
      // populate selects
      var allTzs = ALL_CITIES.map(function (c) { return c.tz; });
      // add local tz
      var localTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (!allTzs.includes(localTz)) allTzs.unshift(localTz);
      ["convFromTz", "convToTz"].forEach(function (id) {
        var sel = document.getElementById(id);
        allTzs.forEach(function (tz) {
          var o = document.createElement("option"); o.value = tz; o.textContent = tz; sel.appendChild(o);
        });
      });
      document.getElementById("convToTz").value = "Europe/London";
      // default date/time = now
      var n = new Date();
      document.getElementById("convDate").value = n.toISOString().slice(0, 10);
      document.getElementById("convTime").value = pad(n.getHours()) + ":" + pad(n.getMinutes());

      document.getElementById("convNow").addEventListener("click", function () {
        var n2 = new Date();
        document.getElementById("convDate").value = n2.toISOString().slice(0, 10);
        document.getElementById("convTime").value = pad(n2.getHours()) + ":" + pad(n2.getMinutes());
        ConverterManager.convert();
      });
      document.getElementById("convertBtn").addEventListener("click", this.convert.bind(this));
      this.renderQuick();
    },
    convert: function () {
      try {
        var fromTz = document.getElementById("convFromTz").value;
        var toTz = document.getElementById("convToTz").value;
        var date = document.getElementById("convDate").value;
        var time = document.getElementById("convTime").value;
        if (!date || !time) return;
        // parse in from timezone
        var dtStr = date + "T" + time + ":00";
        var fromDate = new Date(dtStr);
        var toTime = fromDate.toLocaleTimeString(state.format === "12" ? "en-US" : "en-GB", {
          timeZone: toTz, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: state.format === "12"
        });
        var toDate = fromDate.toLocaleDateString("en-GB", { timeZone: toTz, weekday: "short", day: "numeric", month: "short", year: "numeric" });
        document.getElementById("convResult").textContent = toTime;
        document.getElementById("convResultDate").textContent = toDate;
      } catch (e) {
        document.getElementById("convResult").textContent = "Error";
        document.getElementById("convResultDate").textContent = "";
      }
    },
    renderQuick: function () {
      var list = document.getElementById("convQuickList");
      if (!list) return;
      list.innerHTML = "";
      var toTzEl = document.getElementById("convToTz");
      var toTz = toTzEl ? toTzEl.value : "Europe/London";
      var now = new Date();
      state.cities.forEach(function (c) {
        var t = now.toLocaleTimeString(state.format === "12" ? "en-US" : "en-GB", {
          timeZone: c.tz, hour: "2-digit", minute: "2-digit", hour12: state.format === "12"
        });
        var div = document.createElement("div");
        div.className = "conv-quick-item";
        div.innerHTML = '<span>' + (c.flag || "🌍") + " " + sanitize(c.name) + '</span><span class="cq-time">' + t + '</span>';
        list.appendChild(div);
      });
    }
  };

  /* =====================================================================
   *  WEATHER SERVICE
   * ===================================================================== */
  var WEATHER_ICONS = ["☀️", "🌤️", "⛅", "🌥️", "🌦️", "🌧️", "⛈️", "❄️", "🌫️"];
  var WEATHER_DESC = ["Clear sky", "Mostly sunny", "Partly cloudy", "Cloudy", "Light showers", "Rain showers", "Thunderstorms", "Snow flurries", "Misty"];
  var WeatherService = {
    hashStr: function (str) { var h = 0; for (var i = 0; i < str.length; i++) { h = (h << 5) - h + str.charCodeAt(i); h |= 0; } return Math.abs(h); },
    render: function () {
      var cityEl = document.getElementById("weatherCity");
      var city = (cityEl && cityEl.value) || state.weatherCity;
      state.weatherCity = city; saveState();
      var day = new Date().toDateString();
      var seed = this.hashStr(city + day);
      var idx = seed % WEATHER_ICONS.length;
      var temp = 14 + (seed % 22);
      var humidity = 30 + (seed % 60);
      var wind = 4 + (seed % 26);
      var feels = temp + ((seed % 5) - 2);
      var uv = 1 + (seed % 11);
      var vis = 5 + (seed % 20);
      var pres = 1000 + (seed % 30);
      document.getElementById("wIcon").textContent = WEATHER_ICONS[idx];
      document.getElementById("wDesc").textContent = WEATHER_DESC[idx] + " in " + city;
      document.getElementById("wTemp").textContent = temp + "°C";
      document.getElementById("wHumidity").textContent = humidity + "%";
      document.getElementById("wWind").textContent = wind + " km/h";
      document.getElementById("wFeels").textContent = feels + "°C";
      document.getElementById("wUV").textContent = uv;
      document.getElementById("wVisibility").textContent = vis + " km";
      document.getElementById("wPressure").textContent = pres + " hPa";
      // ambient weather
      var amb = document.getElementById("ambientWeather");
      if (amb) amb.textContent = WEATHER_ICONS[idx] + " " + temp + "°C · " + WEATHER_DESC[idx];
    }
  };

  /* =====================================================================
   *  ALARM MANAGER
   * ===================================================================== */
  var AlarmManager = {
    firedThisMinute: {},
    snoozeQueue: [],
    init: function () {
      this.render();
      document.getElementById("addAlarmBtn").addEventListener("click", this.add.bind(this));
      document.getElementById("alarmDismiss").addEventListener("click", function () {
        document.getElementById("alarmBanner").classList.remove("show");
      });
      document.getElementById("alarmSnooze").addEventListener("click", this.snooze.bind(this));
    },
    add: function () {
      var t = document.getElementById("alarmTime").value;
      if (!t) return;
      var label = document.getElementById("alarmLabel").value.trim();
      var repeat = document.getElementById("alarmRepeat").value;
      state.alarms.push({ id: uid(), time: t, label: label, enabled: true, repeat: repeat, snoozedUntil: null });
      saveState(); this.render();
      document.getElementById("alarmLabel").value = "";
      NotificationManager.toast("Alarm Added", t + (label ? " — " + label : ""), "success");
    },
    render: function () {
      var list = document.getElementById("alarmList");
      list.innerHTML = "";
      state.alarms.forEach(function (a, idx) {
        var div = document.createElement("div");
        div.className = "alarm-item";
        var repeatLabels = { once: "Once", daily: "Every day", weekdays: "Weekdays", weekends: "Weekends" };
        div.innerHTML = '<div>' +
          '<div class="t">' + sanitize(a.time) + '</div>' +
          '<div class="lbl">' + sanitize(a.label || "Alarm") + '</div>' +
          '<div class="rep">' + (repeatLabels[a.repeat] || "Once") + '</div>' +
          '</div>' +
          '<div class="alarm-actions">' +
          '<div class="switch"><input type="checkbox" class="alarmToggle" data-idx="' + idx + '" id="al' + idx + '"' + (a.enabled ? " checked" : "") + '><label for="al' + idx + '"></label></div>' +
          '<button class="btn danger" data-del="' + idx + '" style="padding:6px 10px;font-size:12px;">Delete</button>' +
          '</div>';
        list.appendChild(div);
      });
      list.querySelectorAll(".alarmToggle").forEach(function (chk) {
        chk.addEventListener("change", function () { state.alarms[parseInt(chk.dataset.idx, 10)].enabled = chk.checked; saveState(); });
      });
      list.querySelectorAll("[data-del]").forEach(function (btn) {
        btn.addEventListener("click", function () { state.alarms.splice(parseInt(btn.dataset.del, 10), 1); saveState(); AlarmManager.render(); });
      });
    },
    check: function (now) {
      var hh = pad(now.getHours()), mm = pad(now.getMinutes());
      var current = hh + ":" + mm;
      var dayOfWeek = now.getDay(); // 0=Sun,6=Sat
      if (now.getSeconds() === 0) this.firedThisMinute = {};

      // Check snooze queue
      this.snoozeQueue = this.snoozeQueue.filter(function (item) {
        if (Date.now() >= item.fireAt) {
          AlarmManager.ring(item.label, item.time);
          return false;
        }
        return true;
      });

      state.alarms.forEach(function (a) {
        if (!a.enabled || a.time !== current || AlarmManager.firedThisMinute[a.id]) return;
        // repeat check
        var shouldFire = a.repeat === "daily" || a.repeat === "once" ||
          (a.repeat === "weekdays" && dayOfWeek >= 1 && dayOfWeek <= 5) ||
          (a.repeat === "weekends" && (dayOfWeek === 0 || dayOfWeek === 6));
        if (!shouldFire) return;
        AlarmManager.firedThisMinute[a.id] = true;
        AlarmManager.ring(a.label || "Alarm", a.time);
        if (a.repeat === "once") { a.enabled = false; saveState(); AlarmManager.render(); }
      });
    },
    ring: function (label, time) {
      document.getElementById("alarmBannerText").textContent = "⏰ " + label + " — " + time;
      document.getElementById("alarmBanner").classList.add("show");
      SoundManager.alarm(5);
      NotificationManager.notify("⏰ Alarm", label + " — " + time, "alarm");
      switchView("alarm");
      StatisticsManager.record("alarmFired");
    },
    snooze: function () {
      document.getElementById("alarmBanner").classList.remove("show");
      var bannerText = document.getElementById("alarmBannerText").textContent;
      this.snoozeQueue.push({ fireAt: Date.now() + 10 * 60 * 1000, label: "Snoozed Alarm", time: "+" + 10 + "m" });
      NotificationManager.toast("Alarm Snoozed", "Rings again in 10 minutes.", "info");
    }
  };

  /* =====================================================================
   *  STOPWATCH MANAGER
   * ===================================================================== */
  var StopwatchManager = {
    running: false,
    startTime: 0,
    elapsed: 0,
    rafId: null,
    lapTimes: [],
    lapStarts: [],
    init: function () {
      document.getElementById("swStartBtn").addEventListener("click", this.toggle.bind(this));
      document.getElementById("swLapBtn").addEventListener("click", this.lap.bind(this));
      document.getElementById("swResetBtn").addEventListener("click", this.reset.bind(this));
      document.getElementById("swClearBtn").addEventListener("click", this.clearLaps.bind(this));
      document.getElementById("swExportBtn").addEventListener("click", this.exportCSV.bind(this));
    },
    fmtMs: function (ms) {
      var m = Math.floor(ms / 60000), s = Math.floor((ms % 60000) / 1000), cs = Math.floor(ms % 1000);
      return pad(m) + ":" + pad(s) + "." + (cs < 100 ? (cs < 10 ? "00" : "0") : "") + cs;
    },
    tick: function () {
      var current = Date.now() - this.startTime + this.elapsed;
      document.getElementById("swDisplay").textContent = this.fmtMs(current);
      if (this.running) this.rafId = requestAnimationFrame(this.tick.bind(this));
    },
    toggle: function () {
      if (!this.running) {
        this.running = true; this.startTime = Date.now();
        document.getElementById("swStartBtn").textContent = "Pause";
        this.rafId = requestAnimationFrame(this.tick.bind(this));
        StatisticsManager.record("swStart");
      } else {
        this.running = false; this.elapsed += Date.now() - this.startTime;
        cancelAnimationFrame(this.rafId);
        document.getElementById("swStartBtn").textContent = "Resume";
      }
    },
    lap: function () {
      var now = Date.now() - this.startTime + this.elapsed;
      var lapDur = this.lapTimes.length > 0 ? now - this.lapTimes[this.lapTimes.length - 1] : now;
      this.lapTimes.push(now);
      this.updateLapUI(lapDur, now);
      this.updateStats();
    },
    updateLapUI: function (lapDur, total) {
      var div = document.createElement("div");
      div.dataset.lapDur = lapDur;
      div.innerHTML = "<span>Lap " + this.lapTimes.length + "</span><span style='color:var(--panel-sub);font-size:11px;'>+" + this.fmtMs(lapDur) + "</span><span>" + this.fmtMs(total) + "</span>";
      document.getElementById("swLaps").insertBefore(div, document.getElementById("swLaps").firstChild);
      this.highlightBestWorst();
    },
    highlightBestWorst: function () {
      var laps = document.querySelectorAll("#swLaps div");
      laps.forEach(function (l) { l.classList.remove("best-lap", "worst-lap"); });
      var durs = Array.from(laps).map(function (l) { return parseInt(l.dataset.lapDur || "0", 10); });
      if (durs.length < 2) return;
      var minD = Math.min.apply(null, durs), maxD = Math.max.apply(null, durs);
      laps.forEach(function (l) {
        var d = parseInt(l.dataset.lapDur || "0", 10);
        if (d === minD) l.classList.add("best-lap");
        else if (d === maxD) l.classList.add("worst-lap");
      });
    },
    updateStats: function () {
      var laps = Array.from(document.querySelectorAll("#swLaps div")).map(function (l) { return parseInt(l.dataset.lapDur || "0", 10); });
      if (laps.length === 0) { document.getElementById("swStats").style.display = "none"; return; }
      document.getElementById("swStats").style.display = "grid";
      document.getElementById("swBestLap").textContent = this.fmtMs(Math.min.apply(null, laps));
      document.getElementById("swWorstLap").textContent = this.fmtMs(Math.max.apply(null, laps));
      var avg = laps.reduce(function (a, b) { return a + b; }, 0) / laps.length;
      document.getElementById("swAvgLap").textContent = this.fmtMs(Math.round(avg));
    },
    reset: function () {
      this.running = false; this.elapsed = 0; cancelAnimationFrame(this.rafId);
      this.lapTimes = [];
      document.getElementById("swDisplay").textContent = "00:00.000";
      document.getElementById("swLaps").innerHTML = "";
      document.getElementById("swStartBtn").textContent = "Start";
      document.getElementById("swStats").style.display = "none";
    },
    clearLaps: function () {
      this.lapTimes = [];
      document.getElementById("swLaps").innerHTML = "";
      document.getElementById("swStats").style.display = "none";
    },
    exportCSV: function () {
      var laps = Array.from(document.querySelectorAll("#swLaps div"));
      if (laps.length === 0) { NotificationManager.toast("No laps", "Record some laps first.", "info"); return; }
      var rows = ["Lap,Duration,Total"];
      laps.forEach(function (l, i) {
        var spans = l.querySelectorAll("span");
        rows.push((laps.length - i) + "," + (spans[1] ? spans[1].textContent.replace("+", "") : "") + "," + (spans[2] ? spans[2].textContent : ""));
      });
      var csv = rows.join("\n");
      var blob = new Blob([csv], { type: "text/csv" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a"); a.href = url; a.download = "clockhub-laps.csv"; a.click();
      URL.revokeObjectURL(url);
    }
  };

  /* =====================================================================
   *  TIMER MANAGER
   * ===================================================================== */
  var TimerManager = {
    total: 300,
    endTime: 0,
    remaining: 300,
    running: false,
    rafId: null,
    circumference: 2 * Math.PI * 92,
    getCircumference: function () {
      var ring = document.getElementById("timerRingFg");
      if (ring && ring.r && ring.r.baseVal && ring.r.baseVal.value) {
        return 2 * Math.PI * ring.r.baseVal.value;
      }
      return 2 * Math.PI * 92;
    },
    init: function () {
      this.circumference = this.getCircumference();
      var ring = document.getElementById("timerRingFg");
      if (ring) ring.style.strokeDasharray = this.circumference;
      this.updateDisplay(this.remaining);
      this.initInputListeners();
      document.getElementById("timerStartBtn").addEventListener("click", this.start.bind(this));
      document.getElementById("timerPauseBtn").addEventListener("click", this.pause.bind(this));
      document.getElementById("timerResetBtn").addEventListener("click", this.reset.bind(this));
      // Preset buttons
      document.querySelectorAll(".preset-btn").forEach(function (btn) {
        btn.addEventListener("click", function () {
          document.querySelectorAll(".preset-btn").forEach(function (b) { b.classList.remove("active-preset"); });
          btn.classList.add("active-preset");
          var s = parseInt(btn.dataset.sec, 10);
          TimerManager.setTotal(s);
        });
      });
    },
    initInputListeners: function () {
      ["tHours", "tMinutes", "tSeconds"].forEach(function (id) {
        document.getElementById(id).addEventListener("change", function () { TimerManager.fromInputs(); });
      });
    },
    fromInputs: function () {
      var h = parseInt(document.getElementById("tHours").value || 0, 10);
      var m = parseInt(document.getElementById("tMinutes").value || 0, 10);
      var s = parseInt(document.getElementById("tSeconds").value || 0, 10);
      this.setTotal(h * 3600 + m * 60 + s);
    },
    setTotal: function (secs) {
      if (this.running) this.pause();
      this.total = secs; this.remaining = secs;
      this.updateDisplay(secs);
      // Sync inputs
      document.getElementById("tHours").value = Math.floor(secs / 3600);
      document.getElementById("tMinutes").value = Math.floor((secs % 3600) / 60);
      document.getElementById("tSeconds").value = secs % 60;
    },
    fmtTimer: function (s) { s = Math.max(0, s); var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60; return pad(h) + ":" + pad(m) + ":" + pad(ss); },
    updateDisplay: function (secs) {
      document.getElementById("timerDisplay").textContent = this.fmtTimer(Math.round(secs));
      var pct = this.total > 0 ? secs / this.total : 0;
      var ring = document.getElementById("timerRingFg");
      var circ = this.circumference || this.getCircumference();
      if (ring) ring.style.strokeDashoffset = circ * (1 - pct);
      var pctEl = document.getElementById("timerPct");
      if (pctEl) pctEl.textContent = Math.round(pct * 100) + "%";
    },
    tick: function () {
      if (!this.running) return;
      var rem = (this.endTime - Date.now()) / 1000;
      if (rem <= 0) { this.done(); return; }
      this.remaining = rem;
      this.updateDisplay(rem);
      this.rafId = requestAnimationFrame(this.tick.bind(this));
    },
    start: function () {
      if (this.running) return;
      if (this.remaining <= 0) { this.fromInputs(); if (this.total <= 0) return; this.remaining = this.total; }
      this.running = true;
      this.endTime = Date.now() + this.remaining * 1000;
      this.rafId = requestAnimationFrame(this.tick.bind(this));
      StatisticsManager.record("timerStart");
    },
    pause: function () {
      this.running = false; cancelAnimationFrame(this.rafId);
      this.remaining = (this.endTime - Date.now()) / 1000;
    },
    reset: function () {
      this.running = false; cancelAnimationFrame(this.rafId);
      this.remaining = this.total;
      this.updateDisplay(this.total);
    },
    done: function () {
      this.running = false; cancelAnimationFrame(this.rafId);
      this.remaining = 0; this.updateDisplay(0);
      document.getElementById("timerDisplay").textContent = "Time's up!";
      SoundManager.timerDone();
      NotificationManager.notify("⏳ Timer Done", (document.getElementById("timerLabel").value || "Timer") + " finished!", "timer");
      StatisticsManager.record("timerDone");
      if (document.getElementById("timerAutoRestart").checked) {
        setTimeout(function () { TimerManager.reset(); TimerManager.start(); }, 1500);
      }
    }
  };

  /* =====================================================================
   *  POMODORO MANAGER
   * ===================================================================== */
  var PomodoroManager = {
    type: "work",          // work | short | long
    sessionNum: 0,
    completedWork: 0,
    running: false,
    endTime: 0,
    remaining: 0,
    rafId: null,
    CIRCUMFERENCE: 2 * Math.PI * 70,
    init: function () {
      var ring = document.getElementById("pomoRingFg");
      if (ring) ring.style.strokeDasharray = this.CIRCUMFERENCE;
      this.remaining = this.getDur();
      this.updateDisplay();
      this.renderDots();

      document.getElementById("pomoStartBtn").addEventListener("click", this.toggle.bind(this));
      document.getElementById("pomoSkipBtn").addEventListener("click", this.skip.bind(this));
      document.getElementById("pomoResetBtn").addEventListener("click", this.resetSession.bind(this));
      document.getElementById("pomoSaveDur").addEventListener("click", this.saveDurations.bind(this));

      document.querySelectorAll(".pomo-tab").forEach(function (tab) {
        tab.addEventListener("click", function () {
          if (PomodoroManager.running) return;
          document.querySelectorAll(".pomo-tab").forEach(function (t) { t.classList.remove("active"); });
          tab.classList.add("active");
          PomodoroManager.type = tab.dataset.type;
          PomodoroManager.remaining = PomodoroManager.getDur();
          PomodoroManager.updateDisplay();
        });
      });

      // Sync duration inputs from state
      document.getElementById("pomoDurWork").value = state.pomodoro.durWork;
      document.getElementById("pomoDurShort").value = state.pomodoro.durShort;
      document.getElementById("pomoDurLong").value = state.pomodoro.durLong;
      document.getElementById("pomoAutoStart").checked = state.pomodoro.autoStart;
      document.getElementById("pomoAutoStart").addEventListener("change", function () {
        state.pomodoro.autoStart = this.checked; saveState();
      });
      this.updateTodayStats();
    },
    getDur: function () {
      if (this.type === "short") return state.pomodoro.durShort * 60;
      if (this.type === "long") return state.pomodoro.durLong * 60;
      return state.pomodoro.durWork * 60;
    },
    saveDurations: function () {
      state.pomodoro.durWork = Math.max(1, parseInt(document.getElementById("pomoDurWork").value, 10) || 25);
      state.pomodoro.durShort = Math.max(1, parseInt(document.getElementById("pomoDurShort").value, 10) || 5);
      state.pomodoro.durLong = Math.max(1, parseInt(document.getElementById("pomoDurLong").value, 10) || 15);
      saveState();
      if (!this.running) { this.remaining = this.getDur(); this.updateDisplay(); }
      NotificationManager.toast("Durations Saved", "New session durations applied.", "success");
    },
    toggle: function () {
      if (!this.running) {
        this.running = true;
        this.endTime = Date.now() + this.remaining * 1000;
        document.getElementById("pomoStartBtn").textContent = "Pause";
        this.rafId = requestAnimationFrame(this.tick.bind(this));
      } else {
        this.running = false;
        this.remaining = (this.endTime - Date.now()) / 1000;
        cancelAnimationFrame(this.rafId);
        document.getElementById("pomoStartBtn").textContent = "Resume";
      }
    },
    tick: function () {
      if (!this.running) return;
      var rem = (this.endTime - Date.now()) / 1000;
      if (rem <= 0) { this.done(); return; }
      this.remaining = rem;
      this.updateDisplay();
      this.rafId = requestAnimationFrame(this.tick.bind(this));
    },
    updateDisplay: function () {
      var s = Math.max(0, Math.round(this.remaining));
      var m = Math.floor(s / 60), ss = s % 60;
      document.getElementById("pomoDisplay").textContent = pad(m) + ":" + pad(ss);
      var dur = this.getDur();
      var pct = dur > 0 ? this.remaining / dur : 0;
      var ring = document.getElementById("pomoRingFg");
      if (ring) ring.style.strokeDashoffset = this.CIRCUMFERENCE * (1 - pct);
      var labels = { work: "Work Session", short: "Short Break", long: "Long Break" };
      document.getElementById("pomoSessionLabel").textContent = labels[this.type] || "Session";
    },
    done: function () {
      this.running = false; cancelAnimationFrame(this.rafId);
      SoundManager.pomoDone();

      if (this.type === "work") {
        this.completedWork++;
        this.sessionNum++;
        StatisticsManager.record("pomoDone", state.pomodoro.durWork);
        NotificationManager.notify("🍅 Focus Session Complete!", "Take a break — you've earned it.", "pomo");
        // auto next: short break, every 4 work = long break
        this.type = (this.completedWork % 4 === 0) ? "long" : "short";
      } else {
        NotificationManager.notify("☕ Break Over!", "Ready to focus again?", "pomo");
        this.type = "work";
      }

      this.remaining = this.getDur();
      this.updateDisplay();
      this.renderDots();
      this.updateTodayStats();

      document.querySelectorAll(".pomo-tab").forEach(function (t) { t.classList.toggle("active", t.dataset.type === PomodoroManager.type); });
      document.getElementById("pomoStartBtn").textContent = "Start";

      if (state.pomodoro.autoStart) {
        setTimeout(function () { PomodoroManager.toggle(); }, 1500);
      }
    },
    skip: function () {
      this.running = false; cancelAnimationFrame(this.rafId);
      this.done();
    },
    resetSession: function () {
      this.running = false; cancelAnimationFrame(this.rafId);
      this.remaining = this.getDur();
      this.updateDisplay();
      document.getElementById("pomoStartBtn").textContent = "Start";
    },
    renderDots: function () {
      var dots = document.getElementById("pomoDots");
      if (!dots) return;
      dots.innerHTML = "";
      for (var i = 0; i < 4; i++) {
        var d = document.createElement("div");
        d.className = "pomo-dot" + (i < this.completedWork % 4 ? " done" : (i === this.completedWork % 4 && this.type === "work" ? " current" : ""));
        dots.appendChild(d);
      }
      document.getElementById("pomoSessionNum").textContent = "Session " + (this.sessionNum + 1) + " of 4";
    },
    updateTodayStats: function () {
      var today = todayKey();
      var d = (state.statistics.daily[today] || {});
      document.getElementById("pomoTodaySessions").textContent = d.pomodoroSessions || 0;
      var fm = d.focusMinutes || 0;
      document.getElementById("pomoTodayMinutes").textContent = fm >= 60 ? Math.floor(fm / 60) + "h " + (fm % 60) + "m" : fm + "m";
      // streak
      var streak = 0, check = new Date();
      for (var i = 0; i < 365; i++) {
        var k = check.toISOString().slice(0, 10);
        if (state.statistics.daily[k] && state.statistics.daily[k].pomodoroSessions > 0) { streak++; check.setDate(check.getDate() - 1); }
        else break;
      }
      document.getElementById("pomoStreak").textContent = streak;
    }
  };

  /* =====================================================================
   *  EVENT MANAGER
   * ===================================================================== */
  var EventManager = {
    editId: null,
    countdownIntervals: [],
    init: function () {
      document.getElementById("addEvtBtn").addEventListener("click", this.add.bind(this));
      document.getElementById("cancelEvtEdit").addEventListener("click", this.cancelEdit.bind(this));
      this.render();
    },
    add: function () {
      var name = document.getElementById("evtName").value.trim();
      var date = document.getElementById("evtDate").value;
      if (!name || !date) { NotificationManager.toast("Missing fields", "Event name and date are required.", "info"); return; }
      var evt = {
        id: uid(),
        name: name,
        date: date,
        time: document.getElementById("evtTime").value || "00:00",
        desc: document.getElementById("evtDesc").value.trim(),
        icon: document.getElementById("evtIcon").value,
        color: document.getElementById("evtColor").value,
        notifyMinutes: parseInt(document.getElementById("evtRemind").value, 10),
        pinned: false
      };
      if (this.editId) {
        var idx = state.events.findIndex(function (e) { return e.id === EventManager.editId; });
        if (idx >= 0) { evt.id = this.editId; state.events[idx] = evt; }
        this.editId = null;
        document.getElementById("addEvtBtn").textContent = "+ Add Event";
        document.getElementById("cancelEvtEdit").style.display = "none";
      } else {
        state.events.push(evt);
      }
      saveState(); this.clearForm(); this.render();
    },
    clearForm: function () {
      ["evtName", "evtDesc"].forEach(function (id) { document.getElementById(id).value = ""; });
      document.getElementById("evtDate").value = "";
      document.getElementById("evtTime").value = "09:00";
    },
    cancelEdit: function () {
      this.editId = null; this.clearForm();
      document.getElementById("addEvtBtn").textContent = "+ Add Event";
      document.getElementById("cancelEvtEdit").style.display = "none";
    },
    render: function () {
      var list = document.getElementById("eventList");
      if (!list) return;
      // clear old intervals
      this.countdownIntervals.forEach(clearInterval);
      this.countdownIntervals = [];
      list.innerHTML = "";
      var events = state.events.slice().sort(function (a, b) { return new Date(a.date + "T" + a.time) - new Date(b.date + "T" + b.time); });
      if (events.length === 0) {
        list.innerHTML = '<div style="text-align:center;color:var(--panel-sub);padding:24px;font-size:14px;">No events yet. Add your first event above.</div>';
        return;
      }
      events.forEach(function (evt) {
        var card = document.createElement("div");
        card.className = "event-card";
        card.style.borderLeftColor = evt.color || "#2f7bff";
        card.innerHTML = '<div class="event-card-header">' +
          '<div class="event-icon">' + (evt.icon || "📅") + '</div>' +
          '<div class="event-name">' + sanitize(evt.name) + '</div>' +
          (evt.pinned ? '<div class="event-pinned-badge">📌</div>' : '') +
          '<div class="event-actions">' +
          '<button class="btn" data-pin="' + evt.id + '" style="padding:5px 8px;font-size:12px;">' + (evt.pinned ? "Unpin" : "Pin") + '</button>' +
          '<button class="btn" data-edit="' + evt.id + '" style="padding:5px 8px;font-size:12px;">Edit</button>' +
          '<button class="btn danger" data-del="' + evt.id + '" style="padding:5px 8px;font-size:12px;">✕</button>' +
          '</div></div>' +
          (evt.desc ? '<div class="event-desc">' + sanitize(evt.desc) + '</div>' : '') +
          '<div class="event-countdown" id="ect-' + evt.id + '"><div class="evt-unit"><div class="evt-val" id="ed-' + evt.id + '">—</div><div class="evt-lbl">Days</div></div><div class="evt-unit"><div class="evt-val" id="eh-' + evt.id + '">—</div><div class="evt-lbl">Hours</div></div><div class="evt-unit"><div class="evt-val" id="em-' + evt.id + '">—</div><div class="evt-lbl">Mins</div></div><div class="evt-unit"><div class="evt-val" id="es-' + evt.id + '">—</div><div class="evt-lbl">Secs</div></div></div>';
        list.appendChild(card);
        // Countdown ticker
        EventManager.tickEvent(evt);
        var interval = setInterval(function () { EventManager.tickEvent(evt); }, 1000);
        EventManager.countdownIntervals.push(interval);
      });
      list.querySelectorAll("[data-del]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          state.events = state.events.filter(function (e) { return e.id !== btn.dataset.del; });
          saveState(); EventManager.render();
        });
      });
      list.querySelectorAll("[data-pin]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var e = state.events.find(function (ev) { return ev.id === btn.dataset.pin; });
          if (e) { e.pinned = !e.pinned; saveState(); EventManager.render(); }
        });
      });
      list.querySelectorAll("[data-edit]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var e = state.events.find(function (ev) { return ev.id === btn.dataset.edit; });
          if (!e) return;
          document.getElementById("evtName").value = e.name;
          document.getElementById("evtDate").value = e.date;
          document.getElementById("evtTime").value = e.time;
          document.getElementById("evtDesc").value = e.desc || "";
          document.getElementById("evtIcon").value = e.icon || "📅";
          document.getElementById("evtColor").value = e.color || "#2f7bff";
          document.getElementById("evtRemind").value = e.notifyMinutes || 0;
          EventManager.editId = e.id;
          document.getElementById("addEvtBtn").textContent = "Update Event";
          document.getElementById("cancelEvtEdit").style.display = "";
          document.getElementById("eventForm").scrollIntoView({ behavior: "smooth" });
        });
      });
    },
    tickEvent: function (evt) {
      var target = new Date(evt.date + "T" + (evt.time || "00:00") + ":00");
      var diff = target - Date.now();
      var dEl = document.getElementById("ed-" + evt.id);
      var hEl = document.getElementById("eh-" + evt.id);
      var mEl = document.getElementById("em-" + evt.id);
      var sEl = document.getElementById("es-" + evt.id);
      if (!dEl) return;
      if (diff <= 0) { dEl.textContent = hEl.textContent = mEl.textContent = "0"; sEl.textContent = "0"; return; }
      var days = Math.floor(diff / 86400000);
      var hours = Math.floor((diff % 86400000) / 3600000);
      var mins = Math.floor((diff % 3600000) / 60000);
      var secs = Math.floor((diff % 60000) / 1000);
      dEl.textContent = days; hEl.textContent = pad(hours); mEl.textContent = pad(mins); sEl.textContent = pad(secs);

      // reminder check
      if (evt.notifyMinutes > 0) {
        var minLeft = diff / 60000;
        if (minLeft <= evt.notifyMinutes && minLeft > evt.notifyMinutes - 1 / 60) {
          NotificationManager.notify("📅 Event Reminder", evt.name + " is in " + Math.round(minLeft) + " minutes!", "info");
        }
      }
    }
  };

  /* =====================================================================
   *  TASK MANAGER
   * ===================================================================== */
  var TaskManager = {
    filter: "all",
    editId: null,
    init: function () {
      // Set today as default date
      document.getElementById("taskDate").value = new Date().toISOString().slice(0, 10);
      document.getElementById("addTaskBtn").addEventListener("click", this.add.bind(this));
      document.getElementById("cancelTaskEdit").addEventListener("click", this.cancelEdit.bind(this));
      document.querySelectorAll(".filter-btn").forEach(function (btn) {
        btn.addEventListener("click", function () {
          document.querySelectorAll(".filter-btn").forEach(function (b) { b.classList.remove("active"); });
          btn.classList.add("active");
          TaskManager.filter = btn.dataset.filter;
          TaskManager.render();
        });
      });
      this.render();
    },
    add: function () {
      var title = document.getElementById("taskTitle").value.trim();
      if (!title) { NotificationManager.toast("Missing title", "Please enter a task title.", "info"); return; }
      var task = {
        id: uid(),
        title: title,
        desc: document.getElementById("taskDesc").value.trim(),
        date: document.getElementById("taskDate").value || new Date().toISOString().slice(0, 10),
        startTime: document.getElementById("taskStart").value,
        endTime: document.getElementById("taskEnd").value,
        priority: document.getElementById("taskPriority").value,
        category: document.getElementById("taskCategory").value,
        done: false
      };
      if (this.editId) {
        var idx = state.tasks.findIndex(function (t) { return t.id === TaskManager.editId; });
        if (idx >= 0) { task.id = this.editId; task.done = state.tasks[idx].done; state.tasks[idx] = task; }
        this.editId = null;
        document.getElementById("addTaskBtn").textContent = "+ Add Task";
        document.getElementById("cancelTaskEdit").style.display = "none";
      } else {
        state.tasks.push(task);
      }
      saveState(); this.clearForm(); this.render();
    },
    clearForm: function () {
      document.getElementById("taskTitle").value = "";
      document.getElementById("taskDesc").value = "";
      document.getElementById("taskStart").value = "";
      document.getElementById("taskEnd").value = "";
    },
    cancelEdit: function () {
      this.editId = null; this.clearForm();
      document.getElementById("addTaskBtn").textContent = "+ Add Task";
      document.getElementById("cancelTaskEdit").style.display = "none";
    },
    complete: function (id) {
      var t = state.tasks.find(function (x) { return x.id === id; });
      if (t) { t.done = !t.done; saveState(); this.render(); if (t.done) StatisticsManager.record("taskDone"); }
    },
    render: function () {
      var list = document.getElementById("taskList");
      if (!list) return;
      list.innerHTML = "";
      var today = new Date().toISOString().slice(0, 10);
      var filtered = state.tasks.filter(function (t) {
        if (TaskManager.filter === "today") return t.date === today;
        if (TaskManager.filter === "pending") return !t.done;
        if (TaskManager.filter === "done") return t.done;
        return true;
      }).sort(function (a, b) {
        if (a.date !== b.date) return a.date < b.date ? -1 : 1;
        return (a.startTime || "") < (b.startTime || "") ? -1 : 1;
      });
      if (filtered.length === 0) {
        list.innerHTML = '<div style="text-align:center;color:var(--panel-sub);padding:24px;font-size:14px;">No tasks found.</div>';
        return;
      }
      filtered.forEach(function (t) {
        var div = document.createElement("div");
        div.className = "task-item" + (t.done ? " done" : "") + " priority-" + t.priority;
        var timeBlock = (t.startTime && t.endTime) ? t.startTime + " — " + t.endTime : (t.startTime || "");
        div.innerHTML = '<div class="task-check' + (t.done ? " checked" : "") + '" data-complete="' + t.id + '">' + (t.done ? "✓" : "") + '</div>' +
          '<div class="task-body">' +
          '<div class="task-title">' + (t.category || "") + " " + sanitize(t.title) + '</div>' +
          (timeBlock ? '<div class="task-time-block">🕐 ' + timeBlock + '</div>' : '') +
          (t.desc ? '<div class="task-meta">' + sanitize(t.desc) + '</div>' : '') +
          '<div class="task-meta">' + (t.date === today ? "Today" : t.date) + '</div>' +
          '</div>' +
          '<div class="task-actions">' +
          '<button class="btn" data-edit="' + t.id + '" style="padding:5px 8px;font-size:11px;">Edit</button>' +
          '<button class="btn danger" data-del="' + t.id + '" style="padding:5px 8px;font-size:11px;">✕</button>' +
          '</div>';
        list.appendChild(div);
      });
      list.querySelectorAll("[data-complete]").forEach(function (el) {
        el.addEventListener("click", function () { TaskManager.complete(el.dataset.complete); });
      });
      list.querySelectorAll("[data-del]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          state.tasks = state.tasks.filter(function (t) { return t.id !== btn.dataset.del; });
          saveState(); TaskManager.render();
        });
      });
      list.querySelectorAll("[data-edit]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var t = state.tasks.find(function (x) { return x.id === btn.dataset.edit; });
          if (!t) return;
          document.getElementById("taskTitle").value = t.title;
          document.getElementById("taskDesc").value = t.desc || "";
          document.getElementById("taskDate").value = t.date;
          document.getElementById("taskStart").value = t.startTime || "";
          document.getElementById("taskEnd").value = t.endTime || "";
          document.getElementById("taskPriority").value = t.priority;
          document.getElementById("taskCategory").value = t.category;
          TaskManager.editId = t.id;
          document.getElementById("addTaskBtn").textContent = "Update Task";
          document.getElementById("cancelTaskEdit").style.display = "";
        });
      });
    }
  };

  /* =====================================================================
   *  STATISTICS MANAGER
   * ===================================================================== */
  var StatisticsManager = {
    record: function (type, value) {
      var key = todayKey();
      if (!state.statistics.daily[key]) state.statistics.daily[key] = { focusMinutes: 0, pomodoroSessions: 0, timersCompleted: 0, tasksCompleted: 0, swStarts: 0 };
      var d = state.statistics.daily[key];
      if (type === "pomoDone") { d.pomodoroSessions++; d.focusMinutes += value || 0; }
      else if (type === "timerDone") d.timersCompleted++;
      else if (type === "taskDone") d.tasksCompleted++;
      else if (type === "swStart") d.swStarts++;
      saveState();
      PomodoroManager.updateTodayStats();
    },
    render: function () {
      var key = todayKey();
      var d = state.statistics.daily[key] || {};
      var fm = d.focusMinutes || 0;
      document.getElementById("statFocusToday").textContent = fm >= 60 ? Math.floor(fm / 60) + "h " + (fm % 60) + "m" : fm + "m";
      document.getElementById("statPomoToday").textContent = d.pomodoroSessions || 0;
      document.getElementById("statTimersToday").textContent = d.timersCompleted || 0;
      document.getElementById("statTasksToday").textContent = d.tasksCompleted || 0;
      this.drawWeekChart();
      // streak
      var streak = 0, check = new Date();
      for (var i = 0; i < 365; i++) {
        var k = check.toISOString().slice(0, 10);
        if (state.statistics.daily[k] && (state.statistics.daily[k].pomodoroSessions > 0 || state.statistics.daily[k].focusMinutes > 0)) { streak++; check.setDate(check.getDate() - 1); }
        else break;
      }
      document.getElementById("statStreakVal").textContent = streak;
    },
    drawWeekChart: function () {
      var canvas = document.getElementById("statWeekChart");
      if (!canvas || !canvas.getContext) return;
      var ctx = canvas.getContext("2d");
      canvas.width = canvas.offsetWidth || 400;
      var days = [], maxVal = 1;
      for (var i = 6; i >= 0; i--) {
        var d = new Date(); d.setDate(d.getDate() - i);
        var k = d.toISOString().slice(0, 10);
        var val = (state.statistics.daily[k] || {}).focusMinutes || 0;
        var label = d.toLocaleDateString("en-GB", { weekday: "short" });
        days.push({ label: label, val: val });
        if (val > maxVal) maxVal = val;
      }
      var W = canvas.width, H = canvas.height || 100;
      ctx.clearRect(0, 0, W, H);
      var barW = W / days.length * 0.5, gap = W / days.length;
      var isDark = state.mode === "dark";
      days.forEach(function (day, i) {
        var x = i * gap + gap * 0.25;
        var barH = maxVal > 0 ? (day.val / maxVal) * (H - 30) : 0;
        var y = H - 20 - barH;
        ctx.fillStyle = "#2f7bff";
        ctx.globalAlpha = day.val > 0 ? 0.85 : 0.2;
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(x, y, barW, barH, 4) : ctx.rect(x, y, barW, barH);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = isDark ? "#8b98ad" : "#66707f";
        ctx.font = "10px Poppins,sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(day.label, x + barW / 2, H - 4);
        if (day.val > 0) {
          ctx.fillStyle = isDark ? "#eaf0fb" : "#1a2230";
          ctx.font = "9px Poppins,sans-serif";
          ctx.fillText(day.val + "m", x + barW / 2, y - 4);
        }
      });
    }
  };

  /* =====================================================================
   *  SOUND CENTER UI
   * ===================================================================== */
  function initSoundCenter() {
    var volMaster = document.getElementById("volMaster");
    var volAlarm = document.getElementById("volAlarm");
    var volTimer = document.getElementById("volTimer");
    var volPomo = document.getElementById("volPomo");
    var toggleChime = document.getElementById("toggleChime");

    volMaster.value = state.soundSettings.masterVolume;
    document.getElementById("volMasterVal").textContent = state.soundSettings.masterVolume + "%";
    volAlarm.value = state.soundSettings.alarmVolume;
    volTimer.value = state.soundSettings.timerVolume;
    volPomo.value = state.soundSettings.pomodoVolume;
    toggleChime.checked = state.soundSettings.chime;

    volMaster.addEventListener("input", function () {
      state.soundSettings.masterVolume = parseInt(volMaster.value, 10);
      document.getElementById("volMasterVal").textContent = volMaster.value + "%";
      saveState();
    });
    volAlarm.addEventListener("change", function () { state.soundSettings.alarmVolume = parseInt(volAlarm.value, 10); saveState(); });
    volTimer.addEventListener("change", function () { state.soundSettings.timerVolume = parseInt(volTimer.value, 10); saveState(); });
    volPomo.addEventListener("change", function () { state.soundSettings.pomodoVolume = parseInt(volPomo.value, 10); saveState(); });
    toggleChime.addEventListener("change", function () { state.soundSettings.chime = toggleChime.checked; saveState(); });

    var toggleSound = document.getElementById("toggleSound");
    toggleSound.checked = state.soundSettings.tick;
    toggleSound.addEventListener("change", function () { state.soundSettings.tick = toggleSound.checked; saveState(); });

    document.getElementById("testTick").addEventListener("click", function () { SoundManager.tick(); });
    document.getElementById("testChime").addEventListener("click", function () { SoundManager.chime(); });
    document.getElementById("testAlarm").addEventListener("click", function () { SoundManager.alarm(3); });
    document.getElementById("testTimer").addEventListener("click", function () { SoundManager.timerDone(); });
    document.getElementById("testPomo").addEventListener("click", function () { SoundManager.pomoDone(); });
  }

  /* =====================================================================
   *  DISPLAY SETTINGS
   * ===================================================================== */
  var fullscreenBtn = document.getElementById("fullscreenBtn");
  fullscreenBtn.addEventListener("click", function () {
    if (!document.fullscreenElement) { document.documentElement.requestFullscreen().catch(function () { }); }
    else { document.exitFullscreen(); }
  });
  document.addEventListener("fullscreenchange", function () {
    fullscreenBtn.textContent = document.fullscreenElement ? "Exit Fullscreen" : "Enter Fullscreen";
  });

  /* Ambient Mode */
  var ambientOverlay = document.getElementById("ambientOverlay");
  function openAmbient() { ambientOverlay.classList.add("open"); }
  function closeAmbient() { ambientOverlay.classList.remove("open"); }
  document.getElementById("ambientBtn").addEventListener("click", openAmbient);
  ambientOverlay.addEventListener("click", closeAmbient);

  /* =====================================================================
   *  SETTINGS CENTER
   * ===================================================================== */
  function initSettings() {
    var dateFormatEl = document.getElementById("settDateFormat");
    var weekStartEl = document.getElementById("settWeekStart");
    var weatherKeyEl = document.getElementById("weatherApiKey");

    dateFormatEl.value = (state.settings && state.settings.dateFormat) || "long";
    weekStartEl.value = (state.settings && state.settings.weekStart !== undefined ? state.settings.weekStart : 1);
    weatherKeyEl.value = state.weatherApiKey || "";

    dateFormatEl.addEventListener("change", function () { if (!state.settings) state.settings = {}; state.settings.dateFormat = dateFormatEl.value; saveState(); });
    weekStartEl.addEventListener("change", function () { if (!state.settings) state.settings = {}; state.settings.weekStart = parseInt(weekStartEl.value, 10); saveState(); });

    document.getElementById("saveWeatherKey").addEventListener("click", function () {
      state.weatherApiKey = weatherKeyEl.value.trim(); saveState();
      NotificationManager.toast("API Key Saved", "Weather key stored.", "success");
    });

    document.getElementById("reqNotifPerm").addEventListener("click", function () {
      NotificationManager.requestPermission(function (ok) {
        NotificationManager.updateStatus();
        NotificationManager.toast(ok ? "Notifications Enabled" : "Permission Denied", ok ? "You'll get alerts for alarms and timers." : "Enable in browser settings.", ok ? "success" : "info");
      });
    });
    NotificationManager.updateStatus();

    // Export
    document.getElementById("exportDataBtn").addEventListener("click", function () {
      var json = JSON.stringify(state, null, 2);
      var blob = new Blob([json], { type: "application/json" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a"); a.href = url; a.download = "clockhub-backup-" + todayKey() + ".json"; a.click();
      URL.revokeObjectURL(url);
      NotificationManager.toast("Data Exported", "Backup downloaded.", "success");
    });

    // Import
    document.getElementById("importDataBtn").addEventListener("click", function () {
      document.getElementById("importFileInput").click();
    });
    document.getElementById("importFileInput").addEventListener("change", function (e) {
      var file = e.target.files[0]; if (!file) return;
      var reader = new FileReader();
      reader.onload = function (ev) {
        try {
          var imported = JSON.parse(ev.target.result);
          if (!imported || typeof imported !== "object" || !imported.version) throw new Error("Invalid backup");
          Object.assign(state, imported); saveState();
          applyMode(); applyFormat(); applyTheme(); applyAnim();
          AlarmManager.render(); WorldClockManager.render(); EventManager.render(); TaskManager.render();
          NotificationManager.toast("Import Successful", "Data restored from backup.", "success");
        } catch (err) {
          NotificationManager.toast("Import Failed", "Invalid or corrupted backup file.", "info");
        }
      };
      reader.readAsText(file);
      e.target.value = "";
    });

    // Reset
    document.getElementById("resetDataBtn").addEventListener("click", function () {
      if (confirm("This will permanently clear ALL Clock Hub data. Are you sure?")) {
        try { localStorage.removeItem(STORE_KEY); } catch (e) { }
        location.reload();
      }
    });
  }

  /* =====================================================================
   *  COMMAND PALETTE
   * ===================================================================== */
  var CommandPalette = {
    open: false,
    selected: 0,
    commands: [
      { icon: "🏠", label: "Go to Home", hint: "H", action: function () { switchView("home"); } },
      { icon: "🌍", label: "Go to World Clocks", hint: "W", action: function () { switchView("world"); } },
      { icon: "⏰", label: "Go to Alarms", hint: "A", action: function () { switchView("alarm"); } },
      { icon: "⏱", label: "Go to Stopwatch", hint: "S", action: function () { switchView("stopwatch"); } },
      { icon: "⏳", label: "Go to Timer", hint: "T", action: function () { switchView("timer"); } },
      { icon: "🍅", label: "Go to Pomodoro", hint: "P", action: function () { switchView("pomodoro"); } },
      { icon: "📅", label: "Go to Events", hint: "E", action: function () { switchView("events"); } },
      { icon: "✅", label: "Go to Tasks", action: function () { switchView("tasks"); } },
      { icon: "🔄", label: "Go to Time Converter", hint: "C", action: function () { switchView("converter"); } },
      { icon: "📊", label: "Go to Statistics", action: function () { switchView("statistics"); } },
      { icon: "🎨", label: "Open Clock Studio", action: function () { switchView("studio"); } },
      { icon: "🌦", label: "Go to Weather", action: function () { switchView("weather"); } },
      { icon: "🔊", label: "Sound Center", action: function () { switchView("sound"); } },
      { icon: "⚙", label: "Settings", action: function () { switchView("settings"); } },
      { icon: "🌙", label: "Toggle Dark / Light Mode", hint: "D", action: function () { toggleMode.click(); } },
      { icon: "🕐", label: "Toggle 12 / 24 Hour Format", hint: "F", action: function () { toggleFormat.click(); } },
      { icon: "🖥", label: "Fullscreen", action: function () { fullscreenBtn.click(); } },
      { icon: "🌟", label: "Ambient / Screensaver Mode", action: openAmbient },
      { icon: "▶", label: "Start Stopwatch", action: function () { switchView("stopwatch"); document.getElementById("swStartBtn").click(); } },
      { icon: "▶", label: "Start Pomodoro", action: function () { switchView("pomodoro"); document.getElementById("pomoStartBtn").click(); } }
    ],
    init: function () {
      var overlay = document.getElementById("cmdOverlay");
      var input = document.getElementById("cmdInput");
      var closeBtn = document.getElementById("cmdClose");
      closeBtn.addEventListener("click", this.close.bind(this));
      overlay.addEventListener("click", function (e) { if (e.target === overlay) CommandPalette.close(); });
      input.addEventListener("input", this.filter.bind(this));
      input.addEventListener("keydown", this.onKey.bind(this));
      this.render(this.commands);
    },
    show: function () {
      document.getElementById("cmdOverlay").classList.add("open");
      document.getElementById("cmdInput").value = "";
      this.render(this.commands); this.selected = 0; this.highlight();
      document.getElementById("cmdInput").focus();
      this.open = true;
    },
    close: function () {
      document.getElementById("cmdOverlay").classList.remove("open"); this.open = false;
    },
    filter: function () {
      var q = document.getElementById("cmdInput").value.toLowerCase();
      var filtered = q ? this.commands.filter(function (c) { return c.label.toLowerCase().includes(q); }) : this.commands;
      this.render(filtered); this.selected = 0; this.highlight();
    },
    render: function (cmds) {
      var list = document.getElementById("cmdList");
      list.innerHTML = "";
      cmds.forEach(function (cmd, i) {
        var li = document.createElement("li");
        li.className = "cmd-item"; li.dataset.idx = i;
        li.innerHTML = '<span class="cmd-item-icon">' + cmd.icon + '</span><span class="cmd-item-label">' + cmd.label + '</span>' + (cmd.hint ? '<span class="cmd-item-hint"><kbd>' + cmd.hint + '</kbd></span>' : '');
        li.addEventListener("click", function () { cmd.action(); CommandPalette.close(); });
        li.addEventListener("mouseenter", function () { CommandPalette.selected = i; CommandPalette.highlight(); });
        list.appendChild(li);
      });
    },
    highlight: function () {
      var items = document.querySelectorAll(".cmd-item");
      items.forEach(function (it, i) { it.classList.toggle("cmd-selected", i === CommandPalette.selected); });
      if (items[this.selected]) items[this.selected].scrollIntoView({ block: "nearest" });
    },
    onKey: function (e) {
      var items = document.querySelectorAll(".cmd-item");
      if (e.key === "ArrowDown") { e.preventDefault(); this.selected = Math.min(this.selected + 1, items.length - 1); this.highlight(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); this.selected = Math.max(this.selected - 1, 0); this.highlight(); }
      else if (e.key === "Enter") {
        e.preventDefault();
        var q = document.getElementById("cmdInput").value.toLowerCase();
        var filtered = q ? this.commands.filter(function (c) { return c.label.toLowerCase().includes(q); }) : this.commands;
        if (filtered[this.selected]) { filtered[this.selected].action(); this.close(); }
      } else if (e.key === "Escape") { this.close(); }
    }
  };

  /* =====================================================================
   *  KEYBOARD SHORTCUTS
   * ===================================================================== */
  document.addEventListener("keydown", function (e) {
    var active = document.activeElement;
    var inInput = ["INPUT", "SELECT", "TEXTAREA"].indexOf(active.tagName) !== -1;

    // Command palette: Ctrl+K always
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); CommandPalette.show(); return; }

    if (inInput) return;

    switch (e.key.toLowerCase()) {
      case "h": switchView("home"); break;
      case "w": switchView("world"); break;
      case "a": switchView("alarm"); break;
      case "s": switchView("stopwatch"); break;
      case "t": switchView("timer"); break;
      case "p": switchView("pomodoro"); break;
      case "e": switchView("events"); break;
      case "c": switchView("converter"); break;
      case "d": toggleMode.checked = !toggleMode.checked; toggleMode.dispatchEvent(new Event("change")); break;
      case "f": toggleFormat.checked = !toggleFormat.checked; toggleFormat.dispatchEvent(new Event("change")); break;
      case "m": toggleSidebar(); break;
      case "escape":
        if (ambientOverlay.classList.contains("open")) { closeAmbient(); }
        else if (document.getElementById("cmdOverlay").classList.contains("open")) { CommandPalette.close(); }
        else { closeSidebar(); }
        break;
      case " ":
        if (document.getElementById("view-stopwatch").classList.contains("active")) { e.preventDefault(); document.getElementById("swStartBtn").click(); }
        else if (document.getElementById("view-timer").classList.contains("active")) { e.preventDefault(); if (TimerManager.running) TimerManager.pause(); else TimerManager.start(); }
        else if (document.getElementById("view-pomodoro").classList.contains("active")) { e.preventDefault(); document.getElementById("pomoStartBtn").click(); }
        break;
    }
    // Alt+A = ambient
    if (e.altKey && e.key.toLowerCase() === "a") { e.preventDefault(); openAmbient(); }
  });

  /* =====================================================================
   *  ABOUT PAGE
   * ===================================================================== */
  // Version already hardcoded in HTML

  /* =====================================================================
   *  INIT EVERYTHING
   * ===================================================================== */
  applyMode(); applyFormat(); applyTheme(); applyAnim(); applyStudioOptions();
  if (state.autoMode) checkAutoMode();

  NotificationManager.init();
  WorldClockManager.init();
  ConverterManager.init();
  WeatherService.render();
  AlarmManager.init();
  StopwatchManager.init();
  TimerManager.init();
  PomodoroManager.init();
  EventManager.init();
  TaskManager.init();
  StatisticsManager.render();
  initSoundCenter();
  initSettings();
  CommandPalette.init();
  updateDayInfo();
  setInterval(updateDayInfo, 60000);
  setInterval(ConverterManager.renderQuick.bind(ConverterManager), 5000);

  updateClock();

})();