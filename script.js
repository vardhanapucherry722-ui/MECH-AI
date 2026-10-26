/**
 * MECH AI — Industrial IoT Telemetry Platform
 * Comprehensive Frontend Application Engine
 *
 * Handles:
 * - Real-time Supabase telemetry streaming & connection management
 * - High-fidelity local simulation (Demo Mode) with physical drift modeling
 * - Chart.js 4-channel analytical time-series visualizations
 * - HTML5 Canvas 2D sparkline generation for each sensor card
 * - Configurable multi-parameter threshold rules engine & alert incident center
 * - Environmental Quality Index (EQI) radial dial computation
 * - Searchable, sortable, paginated telemetry history table with CSV export
 * - Web Audio API synthesized alert chimes
 * - Dark / Light theme toggling with dynamic chart palette adaptation
 */

(() => {
  "use strict";

  // =========================================================================
  // 1. CONFIGURATION & STATE MANAGEMENT
  // =========================================================================

  const $ = (id) => document.getElementById(id);
  const $$ = (sel) => document.querySelectorAll(sel);

  // Load baseline configuration from config.js and localStorage overrides
  const baseConfig = window.MECH_AI_CONFIG || {};
  const config = {
    supabaseUrl: localStorage.getItem("mech_ai_supabase_url") ?? baseConfig.supabaseUrl ?? "",
    supabasePublishableKey: localStorage.getItem("mech_ai_supabase_key") ?? baseConfig.supabasePublishableKey ?? "",
    machineId: localStorage.getItem("mech_ai_machine_id") ?? baseConfig.machineId ?? "Alpha-01",
    pollIntervalMs: Number(localStorage.getItem("mech_ai_poll_interval") ?? baseConfig.pollIntervalMs ?? 5000),
  };

  // Application State
  const MAX_BUFFER = 100;
  let currentMode = "demo"; // 'demo' | 'supabase'
  let readings = [];
  let supabaseClient = null;
  let realtimeChannel = null;
  let demoTimer = null;
  let pollTimer = null;
  let refreshCountdownTimer = null;
  let nextPollTime = 0;
  let audioContext = null;

  // Chart Instances
  let charts = {
    temperature: null,
    humidity: null,
    vibration: null,
    power: null,
  };

  // Default and saved threshold settings
  const DEFAULT_THRESHOLDS = {
    temp: 40,        // °C
    humidity: 85,    // % RH
    vibration: 1.5,  // g RMS
    rain: 50,        // %
    battery: 3.4,    // V (low voltage threshold)
  };

  let thresholds = { ...DEFAULT_THRESHOLDS };
  try {
    const savedThresholds = localStorage.getItem("mech_ai_thresholds");
    if (savedThresholds) {
      thresholds = { ...DEFAULT_THRESHOLDS, ...JSON.parse(savedThresholds) };
    }
  } catch (e) {
    console.warn("Failed to load saved thresholds:", e);
  }

  // History Table State
  const tableState = {
    search: "",
    sourceFilter: "all",
    statusFilter: "all",
    sortColumn: "recorded_at",
    sortAscending: false,
    pageSize: 25,
    currentPage: 1,
  };

  // =========================================================================
  // 2. INITIALIZATION & ROUTING
  // =========================================================================

  document.addEventListener("DOMContentLoaded", () => {
    initTheme();
    initNavigation();
    initSettingsForm();
    initThresholdControls();
    initCharts();
    initHistoryTableControls();
    initGlobalShortcuts();
    initDigitalTwinControls();

    // Set dynamic footer copyright year
    $("footerYear").textContent = new Date().getFullYear();

    // Start in demo mode by default
    startDemoMode();
  });

  // -------------------------------------------------------------------------
  // Theme Management
  // -------------------------------------------------------------------------
  function initTheme() {
    const savedTheme = localStorage.getItem("mech-ai-theme") || "dark";
    setTheme(savedTheme);

    $("themeToggle").addEventListener("click", () => {
      const isLight = document.body.classList.contains("light-theme");
      setTheme(isLight ? "dark" : "light");
    });

    // Sync Settings Radios
    const radioDark = $("radioDarkTheme");
    const radioLight = $("radioLightTheme");
    if (radioDark && radioLight) {
      radioDark.addEventListener("click", () => setTheme("dark"));
      radioLight.addEventListener("click", () => setTheme("light"));
    }
  }

  function setTheme(theme) {
    if (theme === "light") {
      document.body.classList.add("light-theme");
      document.body.classList.remove("dark-theme");
      $("radioDarkTheme")?.classList.remove("active");
      $("radioLightTheme")?.classList.add("active");
    } else {
      document.body.classList.remove("light-theme");
      document.body.classList.add("dark-theme");
      $("radioDarkTheme")?.classList.add("active");
      $("radioLightTheme")?.classList.remove("active");
    }

    try {
      localStorage.setItem("mech-ai-theme", theme);
    } catch {}

    // Update charts grid/text styling on theme change
    updateChartTheme();
  }

  // -------------------------------------------------------------------------
  // Navigation & View Routing
  // -------------------------------------------------------------------------
  function initNavigation() {
    const sidebar = $("sidebar");
    const appShell = $("appShell");
    const navOverlay = $("navOverlay");
    const sidebarToggle = $("sidebarToggle");
    const mobileMenuToggle = $("mobileMenuToggle");

    // Collapsible sidebar on desktop
    const savedSidebarState = localStorage.getItem("mech-ai-sidebar-collapsed");
    if (savedSidebarState === "true") {
      appShell.classList.add("sidebar-collapsed");
    }

    sidebarToggle?.addEventListener("click", () => {
      appShell.classList.toggle("sidebar-collapsed");
      try {
        localStorage.setItem(
          "mech-ai-sidebar-collapsed",
          appShell.classList.contains("sidebar-collapsed")
        );
      } catch {}
    });

    // Mobile menu drawer toggle
    mobileMenuToggle?.addEventListener("click", () => {
      const isOpen = sidebar.classList.toggle("open");
      navOverlay.classList.toggle("open", isOpen);
      mobileMenuToggle.setAttribute("aria-expanded", String(isOpen));
    });

    navOverlay?.addEventListener("click", () => {
      sidebar.classList.remove("open");
      navOverlay.classList.remove("open");
      mobileMenuToggle?.setAttribute("aria-expanded", "false");
    });

    // Navigation links routing
    $$(".sidebar-nav .nav-item").forEach((link) => {
      link.addEventListener("click", (e) => {
        const targetView = link.getAttribute("data-view");
        if (targetView) {
          switchView(targetView);
          // Close mobile menu if open
          sidebar.classList.remove("open");
          navOverlay.classList.remove("open");
          mobileMenuToggle?.setAttribute("aria-expanded", "false");
        }
      });
    });

    // Overview KPI quick-jump links
    $$(".kpi-card[data-target]").forEach((card) => {
      card.addEventListener("click", () => {
        const target = card.getAttribute("data-target");
        if (target) switchView(target);
      });
    });

    // Bell button quick-jump to Alert Center
    $("alertBellBtn")?.addEventListener("click", () => switchView("alerts"));

    // Handle hash change
    window.addEventListener("hashchange", handleHashRoute);
    handleHashRoute();
  }

  function handleHashRoute() {
    const hash = window.location.hash.replace("#", "").trim();
    const validViews = ["overview", "twin", "monitoring", "analytics", "alerts", "history", "status", "settings"];
    if (validViews.includes(hash)) {
      switchView(hash, false);
    }
  }

  function switchView(viewName, updateHash = true) {
    $$(".view-section").forEach((sec) => sec.classList.remove("active"));
    $$(".sidebar-nav .nav-item").forEach((item) => item.classList.remove("active"));

    const targetSection = $("view-" + viewName);
    const targetNavLink = $( "nav" + viewName.charAt(0).toUpperCase() + viewName.slice(1) );

    if (targetSection) targetSection.classList.add("active");
    if (targetNavLink) targetNavLink.classList.add("active");

    const titles = {
      overview: "Overview",
      twin: "3D Digital Twin",
      monitoring: "Live Monitoring",
      analytics: "Sensor Analytics",
      alerts: "Alert Center",
      history: "Historical Data",
      status: "System Status",
      settings: "Settings",
    };

    $("breadcrumbTitle").textContent = titles[viewName] || "Overview";

    if (updateHash) {
      window.location.hash = viewName;
    }

    // 3D Digital Twin Lifecycle Management
    if (viewName === "twin") {
      if (window.MechDigitalTwin) {
        window.MechDigitalTwin.init($("digitalTwinContainer"), $("twinCanvas"), $("twinHudLayer"));
        window.MechDigitalTwin.resume();
        window.MechDigitalTwin.onWindowResize();
        if (readings.length) {
          window.MechDigitalTwin.updateTelemetry(readings[readings.length - 1], thresholds);
        }
      }
    } else {
      if (window.MechDigitalTwin) {
        window.MechDigitalTwin.pause();
      }
    }

    // Resize charts if opening analytics
    if (viewName === "analytics") {
      setTimeout(() => {
        Object.values(charts).forEach((c) => c && c.resize());
      }, 50);
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // =========================================================================
  // 3. DATA NORMALIZATION & SIMULATION ENGINE
  // =========================================================================

  function normalizeReading(row) {
    const temp = row.temperature == null ? null : Number(Number(row.temperature).toFixed(1));
    const hum = row.humidity == null ? null : Math.round(Number(row.humidity));
    const vib = row.vibration != null ? Number(Number(row.vibration).toFixed(2)) : (row.gas_raw ? Number((Number(row.gas_raw) / 1000).toFixed(2)) : 0.45);
    const tilt = row.tilt_angle != null ? Number(Number(row.tilt_angle).toFixed(1)) : (row.pm25 ? Number((Number(row.pm25) / 10).toFixed(1)) : 1.2);
    const rain = row.rain_level != null ? Math.round(Number(row.rain_level)) : (row.pm10 ? Math.min(100, Math.round(Number(row.pm10))) : 4);
    const batt = row.battery_volts != null ? Number(Number(row.battery_volts).toFixed(2)) : 3.92;
    const solar = row.solar_volts != null ? Number(Number(row.solar_volts).toFixed(2)) : 5.45;
    const rpm = row.motor_rpm != null ? Math.round(Number(row.motor_rpm)) : 1850;

    // Evaluate hardware alarm status
    const isAlarm = Boolean(
      row.buzzer_active ||
      row.alarm_led ||
      (temp != null && temp >= thresholds.temp) ||
      (hum != null && hum >= thresholds.humidity) ||
      (vib != null && vib >= thresholds.vibration) ||
      (rain != null && rain >= thresholds.rain) ||
      (batt != null && batt <= thresholds.battery)
    );

    return {
      id: row.id ?? null,
      machine_id: String(row.machine_id || config.machineId || "Alpha-01"),
      temperature: temp,
      humidity: hum,
      vibration: vib,
      tilt_angle: tilt,
      rain_level: rain,
      battery_volts: batt,
      solar_volts: solar,
      motor_rpm: rpm,
      buzzer_active: isAlarm,
      alarm_led: isAlarm,
      gas_raw: row.gas_raw != null ? Math.round(Number(row.gas_raw)) : Math.round(vib * 1000),
      pm25: row.pm25 != null ? Number(Number(row.pm25).toFixed(1)) : Number((tilt * 10).toFixed(1)),
      pm10: row.pm10 != null ? Number(Number(row.pm10).toFixed(1)) : Number(rain.toFixed(1)),
      recorded_at: row.recorded_at || new Date().toISOString(),
      is_simulated: Boolean(row.is_simulated),
    };
  }

  /**
   * Generates realistic IoT environmental and mechanical telemetry with physical drift.
   */
  function generateSyntheticReading(timestampOffsetMs = 0) {
    const prev = readings[readings.length - 1];

    // Helper for bounded random walks
    const drift = (prevVal, delta, min, max, decimals = 1) => {
      const step = (Math.random() - 0.48) * delta;
      const res = Math.min(max, Math.max(min, prevVal + step));
      return Number(res.toFixed(decimals));
    };

    const prevTemp = prev?.temperature ?? 27.5;
    const prevHum = prev?.humidity ?? 56;
    const prevVib = prev?.vibration ?? 0.45;
    const prevTilt = prev?.tilt_angle ?? 1.2;
    const prevRain = prev?.rain_level ?? 2;
    const prevBatt = prev?.battery_volts ?? 3.94;
    const prevSolar = prev?.solar_volts ?? 5.40;
    const prevRpm = prev?.motor_rpm ?? 1850;

    // Ambient climate drift
    const newTemp = drift(prevTemp, 0.35, 21.0, 42.0, 1);
    const newHum = drift(prevHum, 1.0, 30, 92, 0);

    // MPU6050 vibration drift with occasional mechanical unbalance resonance
    let newVib = drift(prevVib, 0.08, 0.15, 2.8, 2);
    if (Math.random() < 0.08) {
      newVib = Number(Math.min(2.8, newVib + 0.6 + Math.random() * 0.5).toFixed(2));
    }
    const newTilt = drift(prevTilt, 0.12, 0.2, 8.5, 1);

    // Rain sensor: normally dry (0–8%), occasional precipitation spike
    let newRain = drift(prevRain, 2, 0, 85, 0);
    if (Math.random() < 0.04) {
      newRain = Math.min(95, newRain + Math.round(30 + Math.random() * 40));
    }

    // Solar harvesting & 3.7V LiPo battery management
    const newSolar = drift(prevSolar, 0.08, 4.6, 6.0, 2);
    // When solar is strong, battery charges up to 4.18V, otherwise slowly discharges
    const battStep = (newSolar > 5.0 ? 0.02 : -0.01) + (Math.random() - 0.5) * 0.01;
    const newBatt = Number(Math.min(4.20, Math.max(3.20, prevBatt + battStep)).toFixed(2));

    // Testbed motor speed around 1800 RPM
    const newRpm = Math.round(drift(prevRpm, 45, 1200, 2800, 0));

    const recTime = new Date(Date.now() - timestampOffsetMs).toISOString();

    return normalizeReading({
      machine_id: config.machineId || "Alpha-01",
      temperature: newTemp,
      humidity: newHum,
      vibration: newVib,
      tilt_angle: newTilt,
      rain_level: newRain,
      battery_volts: newBatt,
      solar_volts: newSolar,
      motor_rpm: newRpm,
      recorded_at: recTime,
      is_simulated: true,
    });
  }

  // =========================================================================
  // 4. SUPABASE LIVE INTEGRATION & DATA MODES
  // =========================================================================

  function setMode(mode) {
    if (mode === "supabase") {
      startSupabaseMode();
    } else {
      startDemoMode();
    }
  }

  function startDemoMode() {
    clearInterval(demoTimer);
    clearInterval(pollTimer);
    clearInterval(refreshCountdownTimer);
    if (realtimeChannel) {
      realtimeChannel.unsubscribe();
      realtimeChannel = null;
    }

    currentMode = "demo";
    $("btnModeDemo").classList.add("active");
    $("btnModeDemo").setAttribute("aria-checked", "true");
    $("btnModeSupabase").classList.remove("active");
    $("btnModeSupabase").setAttribute("aria-checked", "false");

    setConnectionStatus("demo", "Demo Mode (Simulated)");
    $("gatewayModeDisplay").textContent = "Demo Mode";
    $("gatewayStatusPill").className = "status-pill status-ok";
    $("gatewayStatusPill").textContent = "● Simulation Active";

    showBanner(
      "info",
      "<strong>Demo Mode Active:</strong> Synthetically generated readings simulate an active ESP32 sensor array. No physical database calls are being made.",
      "Configure Supabase",
      () => switchView("settings")
    );

    // Seed 14 historical data points spaced 1 minute apart so charts and sparklines look beautiful
    const seedRows = [];
    for (let i = 14; i >= 0; i--) {
      seedRows.push(generateSyntheticReading(i * 60000));
    }
    readings = seedRows.slice(-MAX_BUFFER);
    renderAll();

    // Generate fresh demo sample every 5 seconds
    demoTimer = setInterval(() => {
      const newSample = generateSyntheticReading();
      appendReading(newSample);
    }, 5000);

    startRefreshCountdown(5000);
    showToast("Switched to Demo Simulation Mode.", "info");
  }

  async function startSupabaseMode() {
    clearInterval(demoTimer);
    clearInterval(pollTimer);
    clearInterval(refreshCountdownTimer);

    currentMode = "supabase";
    $("btnModeSupabase").classList.add("active");
    $("btnModeSupabase").setAttribute("aria-checked", "true");
    $("btnModeDemo").classList.remove("active");
    $("btnModeDemo").setAttribute("aria-checked", "false");

    const hasConfig = Boolean(config.supabaseUrl && config.supabasePublishableKey);
    if (!hasConfig) {
      setConnectionStatus("error", "Configuration Needed");
      showBanner(
        "warning",
        "<strong>Supabase Setup Needed:</strong> Please provide your Supabase Project URL and public publishable key in <code>config.js</code> or in Dashboard Settings.",
        "Open Settings",
        () => switchView("settings")
      );
      showToast("Supabase credentials missing. Open Settings to configure.", "warning");
      readings = [];
      renderAll();
      return;
    }

    setConnectionStatus("connecting", "Connecting to Supabase...");
    await fetchSupabaseReadings();

    // Start recurring polling
    const interval = Math.max(2000, config.pollIntervalMs || 5000);
    pollTimer = setInterval(fetchSupabaseReadings, interval);
    startRefreshCountdown(interval);

    // Setup Supabase Realtime Channel if client is active
    setupRealtimeSubscription();
  }

  function getSupabaseClient() {
    if (supabaseClient) return supabaseClient;
    if (!window.supabase) {
      console.error("Supabase JS SDK library not loaded.");
      return null;
    }
    try {
      supabaseClient = window.supabase.createClient(
        config.supabaseUrl,
        config.supabasePublishableKey,
        {
          auth: { persistSession: false, autoRefreshToken: false },
        }
      );
      return supabaseClient;
    } catch (err) {
      console.error("Supabase client init failed:", err);
      return null;
    }
  }

  async function fetchSupabaseReadings(isManual = false) {
    const client = getSupabaseClient();
    if (!client) {
      setConnectionStatus("error", "SDK Not Loaded");
      return;
    }

    const startTime = performance.now();
    try {
      const { data, error } = await client
        .from("sensor_readings")
        .select("*")
        .eq("machine_id", config.machineId || "Alpha-01")
        .order("recorded_at", { ascending: false })
        .limit(MAX_BUFFER);

      const latencyMs = Math.round(performance.now() - startTime);
      $("diagLatencyVal").textContent = latencyMs + " ms";

      if (error) throw error;

      if (!data || data.length === 0) {
        setConnectionStatus("connected", "Connected · 0 rows");
        showBanner(
          "info",
          `<strong>Connected to Supabase:</strong> Table <code>sensor_readings</code> is reachable, but 0 records found for Machine ID: <code>${escapeHtml(
            config.machineId
          )}</code>. Insert sample data or transmit from ESP32.`,
          "View Schemas",
          () => switchView("status")
        );
        readings = [];
        renderAll();
        return;
      }

      // Reverse so oldest is index 0 and newest is at the end
      const normalizedRows = data.map(normalizeReading).reverse();
      readings = normalizedRows.slice(-MAX_BUFFER);

      setConnectionStatus("connected", `Live (${config.machineId})`);
      $("gatewayModeDisplay").textContent = "Online Live";
      $("gatewayStatusPill").className = "status-pill status-ok";
      $("gatewayStatusPill").textContent = "● Supabase Streaming";

      hideBanner();
      renderAll();

      if (isManual) {
        showToast(`Fetched ${data.length} readings from Supabase.`, "success");
      }
    } catch (err) {
      console.error("Supabase query error:", err);
      setConnectionStatus("error", "Database Error");
      $("gatewayStatusPill").className = "status-pill status-critical";
      $("gatewayStatusPill").textContent = "● Query Error";

      showBanner(
        "error",
        `<strong>Database Connection Error:</strong> ${escapeHtml(
          err.message || "Failed to query sensor_readings table."
        )} Check project URL, API key, and RLS policies.`,
        "Retry Connection",
        () => fetchSupabaseReadings(true)
      );

      if (isManual) {
        showToast(`Supabase read failed: ${err.message}`, "error");
      }
    }
  }

  function setupRealtimeSubscription() {
    const client = getSupabaseClient();
    if (!client || !client.channel) return;

    try {
      if (realtimeChannel) realtimeChannel.unsubscribe();

      realtimeChannel = client
        .channel("table-db-changes")
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "sensor_readings",
            filter: `machine_id=eq.${config.machineId || "Alpha-01"}`,
          },
          (payload) => {
            if (payload && payload.new) {
              const newRecord = normalizeReading(payload.new);
              appendReading(newRecord);
            }
          }
        )
        .subscribe();
    } catch (err) {
      console.warn("Realtime subscription notice:", err);
    }
  }

  function appendReading(newRecord) {
    readings.push(newRecord);
    if (readings.length > MAX_BUFFER) {
      readings.shift();
    }
    renderAll();
  }

  function setConnectionStatus(type, label) {
    const badge = $("connectionBadge");
    const labelEl = $("connectionLabel");
    const retryBtn = $("retryConnectionBtn");
    const sidebarDot = $("sidebarNodeDot");
    const footerDot = $("footerDot");
    const footerText = $("footerStatusText");

    badge.className = "connection-status-badge";
    labelEl.textContent = label;
    footerText.textContent = label;

    if (type === "connected") {
      badge.classList.add("status-connected");
      retryBtn.classList.add("hidden");
      sidebarDot.className = "status-indicator-dot online";
      footerDot.style.background = "var(--teal)";
    } else if (type === "error") {
      badge.classList.add("status-error");
      retryBtn.classList.remove("hidden");
      sidebarDot.className = "status-indicator-dot";
      footerDot.style.background = "var(--rose)";
    } else if (type === "connecting") {
      badge.classList.add("status-connecting");
      retryBtn.classList.add("hidden");
      sidebarDot.className = "status-indicator-dot";
      footerDot.style.background = "var(--amber)";
    } else {
      // Demo
      retryBtn.classList.add("hidden");
      sidebarDot.className = "status-indicator-dot online";
      footerDot.style.background = "var(--cyan)";
    }
  }

  function startRefreshCountdown(intervalMs) {
    clearInterval(refreshCountdownTimer);
    nextPollTime = Date.now() + intervalMs;
    const pill = $("refreshCountdownText");

    refreshCountdownTimer = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((nextPollTime - Date.now()) / 1000));
      pill.textContent = `Sync in ${remaining}s`;
      if (remaining <= 0) {
        nextPollTime = Date.now() + intervalMs;
      }
    }, 1000);
  }

  // =========================================================================
  // 5. RENDERING & UI UPDATES
  // =========================================================================

  function renderAll() {
    if (!readings.length) {
      renderEmptyState();
      return;
    }

    const latest = readings[readings.length - 1];
    const prev = readings.length > 1 ? readings[readings.length - 2] : null;

    renderOverviewHero(latest);
    renderSensorCards(latest, prev);
    renderAlertCenter(latest);
    renderCharts();
    renderHistoryTable();

    // Reflect telemetry in 3D Digital Twin
    if (window.MechDigitalTwin) {
      window.MechDigitalTwin.updateTelemetry(latest, thresholds);
    }

    // Update 3D Telemetry Quick Strip
    if ($("twinTemp")) $("twinTemp").textContent = latest.temperature != null ? latest.temperature.toFixed(1) : "--";
    if ($("twinHumidity")) $("twinHumidity").textContent = latest.humidity != null ? latest.humidity : "--";
    if ($("twinVibration")) $("twinVibration").textContent = latest.vibration != null ? latest.vibration.toFixed(2) : "--";
    if ($("twinTilt")) $("twinTilt").textContent = latest.tilt_angle != null ? latest.tilt_angle.toFixed(1) : "--";
    if ($("twinRain")) $("twinRain").textContent = latest.rain_level != null ? latest.rain_level : "--";
    if ($("twinBattery")) $("twinBattery").textContent = latest.battery_volts != null ? latest.battery_volts.toFixed(2) : "--";
    if ($("twinMotor")) $("twinMotor").textContent = latest.motor_rpm != null ? latest.motor_rpm : "--";
    if ($("twinAlarm")) {
      const isAlarm = latest.buzzer_active || latest.alarm_led;
      $("twinAlarm").textContent = isAlarm ? "ALARM ACTIVE (Buzzer ON)" : "Normal (Silent)";
      $("twinAlarm").style.color = isAlarm ? "var(--rose)" : "var(--teal)";
    }
  }

  function renderEmptyState() {
    $("valTemperature").textContent = "--";
    $("valHumidity").textContent = "--";
    $("valVibration").textContent = "--";
    $("valRain").textContent = "--";
    $("valBattery").textContent = "--";
    $("valMotor").textContent = "--";
    $("kpiTemp").textContent = "--";
    $("kpiVibration").textContent = "--";
    $("kpiBattery").textContent = "--";
    $("heroLastUpdate").textContent = "No data received";
    $("recordCountVal").textContent = "0";

    const emptyHtml = `<tr><td colspan="12" class="table-empty-row">No sensor readings found. Make sure data is flowing or switch to Demo Mode.</td></tr>`;
    $("telemetryTableBody").innerHTML = emptyHtml;
  }

  // -------------------------------------------------------------------------
  // Overview Hero & KPIs
  // -------------------------------------------------------------------------
  function renderOverviewHero(latest) {
    const dateObj = new Date(latest.recorded_at);
    const timeFormatted = dateObj.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

    $("heroLastUpdate").textContent = timeFormatted;
    $("heroDeviceName").textContent = latest.machine_id || config.machineId || "Alpha-01";
    $("sidebarNodeId").textContent = latest.machine_id || config.machineId || "Alpha-01";
    $("recordCountVal").textContent = readings.length;

    // Quick KPIs
    $("kpiTemp").textContent = latest.temperature != null ? latest.temperature.toFixed(1) : "--";
    $("kpiVibration").textContent = latest.vibration != null ? latest.vibration.toFixed(2) : "--";
    $("kpiBattery").textContent = latest.battery_volts != null ? latest.battery_volts.toFixed(2) : "--";

    // Dynamic status text for vibration
    if ($("kpiVibrationStatus")) {
      if (latest.vibration >= thresholds.vibration) {
        $("kpiVibrationStatus").textContent = "▲ High vibration fault";
        $("kpiVibrationStatus").className = "kpi-status-text warn";
      } else {
        $("kpiVibrationStatus").textContent = "● Normal vibration";
        $("kpiVibrationStatus").className = "kpi-status-text good";
      }
    }

    // Dynamic status text for battery
    if ($("kpiBatteryStatus")) {
      if (latest.battery_volts <= thresholds.battery) {
        $("kpiBatteryStatus").textContent = "▲ Battery voltage low";
        $("kpiBatteryStatus").className = "kpi-status-text warn";
      } else {
        $("kpiBatteryStatus").textContent = "● Solar charging nominal";
        $("kpiBatteryStatus").className = "kpi-status-text good";
      }
    }

    const activeCount = [
      latest.temperature,
      latest.humidity,
      latest.vibration,
      latest.rain_level,
      latest.battery_volts,
      latest.motor_rpm,
      latest.solar_volts,
    ].filter((v) => v != null).length;
    $("kpiActiveSensors").textContent = `${activeCount} / 7`;
  }

  // -------------------------------------------------------------------------
  // Sensor Cards, Deltas, & Sparklines
  // -------------------------------------------------------------------------
  function renderSensorCards(latest, prev) {
    // 1. Temperature (DHT11)
    updateSensorCard({
      valEl: $("valTemperature"),
      deltaEl: $("deltaTemperature"),
      barEl: $("barTemperature"),
      statusEl: $("tempStatusPill"),
      value: latest.temperature,
      prevValue: prev?.temperature,
      unit: "°C",
      warnThreshold: thresholds.temp,
      maxScale: 80,
      sparkId: "sparkTemp",
      sparkColor: "#60a5fa",
      dataKey: "temperature",
    });

    // 2. Humidity (DHT11)
    updateSensorCard({
      valEl: $("valHumidity"),
      deltaEl: $("deltaHumidity"),
      barEl: $("barHumidity"),
      statusEl: $("humidityStatusPill"),
      value: latest.humidity,
      prevValue: prev?.humidity,
      unit: "%",
      warnThreshold: thresholds.humidity,
      maxScale: 100,
      sparkId: "sparkHumidity",
      sparkColor: "#34d399",
      dataKey: "humidity",
    });

    // 3. MPU6050 Vibration & Structural Tilt
    updateSensorCard({
      valEl: $("valVibration"),
      deltaEl: $("deltaVibration"),
      barEl: $("barVibration"),
      statusEl: $("vibrationStatusPill"),
      value: latest.vibration,
      prevValue: prev?.vibration,
      unit: "g",
      warnThreshold: thresholds.vibration,
      maxScale: 4.0,
      sparkId: "sparkVibration",
      sparkColor: "#00f0ff",
      dataKey: "vibration",
    });
    if ($("valTiltDisplay")) {
      $("valTiltDisplay").textContent = (latest.tilt_angle != null ? latest.tilt_angle.toFixed(1) : "--") + "°";
    }

    // 4. Rain & Moisture Sensor Module
    updateSensorCard({
      valEl: $("valRain"),
      deltaEl: $("deltaRain"),
      barEl: $("barRain"),
      statusEl: $("rainStatusPill"),
      value: latest.rain_level,
      prevValue: prev?.rain_level,
      unit: "%",
      warnThreshold: thresholds.rain,
      maxScale: 100,
      sparkId: "sparkRain",
      sparkColor: "#38bdf8",
      dataKey: "rain_level",
    });
    if ($("rainStatusPill")) {
      if (latest.rain_level >= thresholds.rain) {
        $("rainStatusPill").textContent = "▲ Rain Detected";
        $("rainStatusPill").className = "status-pill status-warn";
      } else if (latest.rain_level > 15) {
        $("rainStatusPill").textContent = "● Damp";
        $("rainStatusPill").className = "status-pill status-watch";
      } else {
        $("rainStatusPill").textContent = "● Dry";
        $("rainStatusPill").className = "status-pill status-normal";
      }
    }

    // 5. Solar Panel & 3.7V LiPo Battery
    updateSensorCard({
      valEl: $("valBattery"),
      deltaEl: $("deltaBattery"),
      barEl: $("barBattery"),
      statusEl: $("batteryStatusPill"),
      value: latest.battery_volts,
      prevValue: prev?.battery_volts,
      unit: "V",
      warnThreshold: 999, // Custom low logic below
      maxScale: 4.2,
      sparkId: "sparkBattery",
      sparkColor: "#fbbf24",
      dataKey: "battery_volts",
    });
    if ($("valSolarDisplay")) {
      $("valSolarDisplay").textContent = (latest.solar_volts != null ? latest.solar_volts.toFixed(2) : "--") + " V";
    }
    if ($("batteryStatusPill")) {
      if (latest.battery_volts <= thresholds.battery) {
        $("batteryStatusPill").textContent = "▲ Low Battery";
        $("batteryStatusPill").className = "status-pill status-critical";
      } else if (latest.battery_volts < 3.6) {
        $("batteryStatusPill").textContent = "● Discharging";
        $("batteryStatusPill").className = "status-pill status-watch";
      } else {
        $("batteryStatusPill").textContent = "● Charged";
        $("batteryStatusPill").className = "status-pill status-normal";
      }
    }

    // 6. Testbed Motor for Failure Simulation
    updateSensorCard({
      valEl: $("valMotor"),
      deltaEl: $("deltaMotor"),
      barEl: $("barMotor"),
      statusEl: $("motorStatusPill"),
      value: latest.motor_rpm,
      prevValue: prev?.motor_rpm,
      unit: "RPM",
      warnThreshold: 2600,
      maxScale: 3000,
      sparkId: "sparkMotor",
      sparkColor: "#c084fc",
      dataKey: "motor_rpm",
    });
    if ($("valMotorUnbalance")) {
      const isFault = latest.vibration >= thresholds.vibration;
      $("valMotorUnbalance").textContent = isFault ? "FAULT INDUCED" : "Eccentric Active";
      $("valMotorUnbalance").style.color = isFault ? "var(--rose)" : "var(--cyan)";
    }

    // 7. Active Buzzer & Alarm Indicator LEDs Suite
    const isAlarm = latest.buzzer_active || latest.alarm_led;
    if ($("valAlarmMode")) {
      $("valAlarmMode").textContent = isAlarm ? "ALERT TRIGGERED (Active)" : "Silent (Normal Standby)";
      $("valAlarmMode").style.color = isAlarm ? "var(--rose)" : "var(--text-primary)";
    }
    if ($("deltaAlarm")) {
      $("deltaAlarm").innerHTML = `<span class="delta-val">${isAlarm ? "LED: FLASHING (Red)" : "LED: OK (Green)"}</span>`;
      $("deltaAlarm").className = isAlarm ? "sensor-delta-pill delta-up" : "sensor-delta-pill delta-down";
    }
    if ($("ledGreenIndicator")) {
      $("ledGreenIndicator").style.background = isAlarm ? "#64748b" : "#10b981";
    }
    if ($("ledRedIndicator")) {
      $("ledRedIndicator").style.background = isAlarm ? "#ef4444" : "#64748b";
    }
    if ($("buzzerAudioIcon")) {
      $("buzzerAudioIcon").textContent = isAlarm ? "🔊" : "🔇";
    }
    if ($("buzzerStateLabel")) {
      $("buzzerStateLabel").textContent = isAlarm ? "BUZZER SOUNDING" : "Buzzer Muted";
      $("buzzerStateLabel").style.color = isAlarm ? "var(--rose)" : "var(--text-secondary)";
    }
    if ($("barAlarm")) {
      $("barAlarm").style.width = isAlarm ? "100%" : "0%";
    }
    if ($("alarmStatusPill")) {
      $("alarmStatusPill").textContent = isAlarm ? "▲ ALARM ACTIVE" : "● Standby";
      $("alarmStatusPill").className = isAlarm ? "status-pill status-critical" : "status-pill status-normal";
    }
  }

  function updateSensorCard(opts) {
    const {
      valEl,
      deltaEl,
      barEl,
      statusEl,
      value,
      prevValue,
      unit,
      warnThreshold,
      maxScale,
      sparkId,
      sparkColor,
      dataKey,
    } = opts;

    if (value == null || !Number.isFinite(value)) {
      valEl.textContent = "--";
      statusEl.className = "status-pill status-watch";
      statusEl.textContent = "● No Signal";
      deltaEl.innerHTML = `<span class="delta-arrow">─</span><span class="delta-val">--</span>`;
      deltaEl.className = "sensor-delta-pill";
      barEl.style.width = "0%";
      return;
    }

    // Number display
    valEl.textContent = Number.isInteger(value) ? value : value.toFixed(1);

    // Delta calculation
    if (prevValue != null && Number.isFinite(prevValue)) {
      const diff = value - prevValue;
      const formattedDiff = Math.abs(diff).toFixed(Number.isInteger(value) ? 0 : 1);
      if (Math.abs(diff) < 0.05) {
        deltaEl.innerHTML = `<span class="delta-arrow">─</span><span class="delta-val">0${unit ? " " + unit : ""}</span>`;
        deltaEl.className = "sensor-delta-pill";
      } else if (diff > 0) {
        deltaEl.innerHTML = `<span class="delta-arrow">▲</span><span class="delta-val">+${formattedDiff}${unit ? " " + unit : ""}</span>`;
        deltaEl.className = "sensor-delta-pill delta-up";
      } else {
        deltaEl.innerHTML = `<span class="delta-arrow">▼</span><span class="delta-val">-${formattedDiff}${unit ? " " + unit : ""}</span>`;
        deltaEl.className = "sensor-delta-pill delta-down";
      }
    } else {
      deltaEl.innerHTML = `<span class="delta-arrow">─</span><span class="delta-val">Baseline</span>`;
      deltaEl.className = "sensor-delta-pill";
    }

    // Progress Gauge Bar
    const pct = Math.min(100, Math.max(0, (value / maxScale) * 100));
    barEl.style.width = pct + "%";

    // Status Pill
    if (value >= warnThreshold) {
      statusEl.className = "status-pill status-warn";
      statusEl.textContent = "▲ Warning";
    } else if (value >= warnThreshold * 0.8) {
      statusEl.className = "status-pill status-watch";
      statusEl.textContent = "● Watch";
    } else {
      statusEl.className = "status-pill status-normal";
      statusEl.textContent = "● Optimal";
    }

    // Draw HTML5 Canvas Sparkline
    drawSparkline(sparkId, readings.map((r) => r[dataKey]), sparkColor);
  }

  /**
   * High-DPI HTML5 Canvas 2D Sparkline generator.
   */
  function drawSparkline(canvasId, dataPoints, strokeColor) {
    const canvas = $(canvasId);
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    const validPoints = dataPoints.filter((v) => v != null && Number.isFinite(v));
    if (validPoints.length < 2) return;

    // Handle high-DPI displays
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = rect.width || canvas.width;
    const h = rect.height || canvas.height;

    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, w, h);

    const min = Math.min(...validPoints);
    const max = Math.max(...validPoints);
    const range = max - min || 1;
    const padding = 4;
    const usableHeight = h - padding * 2;
    const stepX = (w - padding * 2) / (validPoints.length - 1);

    // Build path points
    const points = validPoints.map((val, idx) => ({
      x: padding + idx * stepX,
      y: h - padding - ((val - min) / range) * usableHeight,
    }));

    // Area fill with gradient
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, strokeColor + "40");
    grad.addColorStop(1, strokeColor + "00");

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.lineTo(points[points.length - 1].x, h);
    ctx.lineTo(points[0].x, h);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Line stroke
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 1.8;
    ctx.lineJoin = "round";
    ctx.stroke();

    // Pulse dot on latest point
    const last = points[points.length - 1];
    ctx.beginPath();
    ctx.arc(last.x, last.y, 3, 0, Math.PI * 2);
    ctx.fillStyle = strokeColor;
    ctx.fill();
  }

  // -------------------------------------------------------------------------
  // 6. ALERT CENTER & ENVIRONMENTAL SAFETY INDEX (EQI)
  // -------------------------------------------------------------------------
  function renderAlertCenter(latest) {
    const issues = [];

    // Evaluate against active thresholds
    if (latest.temperature != null && latest.temperature >= thresholds.temp) {
      issues.push({
        severity: "warning",
        title: "Ambient Temperature Limit Exceeded",
        desc: `Recorded reading of ${latest.temperature}°C is at or above the warning limit of ${thresholds.temp}°C.`,
        remedy: "Inspect test bench ventilation grills and ambient heat dissipation.",
        time: latest.recorded_at,
      });
    }

    if (latest.humidity != null && latest.humidity >= thresholds.humidity) {
      issues.push({
        severity: "warning",
        title: "Elevated Relative Humidity",
        desc: `Relative humidity at ${latest.humidity}% RH exceeds the configured limit of ${thresholds.humidity}%.`,
        remedy: "Engage dehumidification systems to prevent moisture condensation on sensor PCBs.",
        time: latest.recorded_at,
      });
    }

    if (latest.vibration != null && latest.vibration >= thresholds.vibration) {
      issues.push({
        severity: "critical",
        title: "Machine Vibration Limit Exceeded (MPU6050)",
        desc: `Machine vibration intensity reached ${latest.vibration} g RMS (limit: ${thresholds.vibration} g). High vibration indicates motor unbalance or bearing mechanical fault.`,
        remedy: "Inspect motor eccentric weight coupling, dampen testbed vibrations, and verify bearing alignment.",
        time: latest.recorded_at,
      });
    }

    if (latest.rain_level != null && latest.rain_level >= thresholds.rain) {
      issues.push({
        severity: "critical",
        title: "Precipitation / Water Ingress Detected",
        desc: `Conductive rain sensor plate registered ${latest.rain_level}% moisture (limit: ${thresholds.rain}%). Water ingress detected on monitoring station.`,
        remedy: "Verify weatherproofing enclosure, inspect cable grommets, and dry serpentine detection plate.",
        time: latest.recorded_at,
      });
    }

    if (latest.battery_volts != null && latest.battery_volts <= thresholds.battery) {
      issues.push({
        severity: "warning",
        title: "3.7V LiPo Battery Low Voltage Warning",
        desc: `Battery cell voltage dropped to ${latest.battery_volts} V (critical alert threshold: ${thresholds.battery} V). Off-grid autonomy threatened.`,
        remedy: "Ensure solar panel receives direct sunlight and inspect TP4056 BMS charging contacts.",
        time: latest.recorded_at,
      });
    }

    // Update Counter Badges
    const alertCount = issues.length;
    $("navAlertCounter").textContent = alertCount;
    $("navAlertCounter").className = "nav-counter" + (alertCount === 0 ? " zero" : "");
    $("bellCounter").textContent = alertCount;
    $("bellCounter").className = "bell-counter" + (alertCount === 0 ? " zero" : "");
    $("kpiAlertCount").textContent = alertCount;
    $("activeAlertBadge").textContent = `${alertCount} Active`;
    $("activeAlertBadge").className =
      "alert-status-counter" + (alertCount > 0 ? " has-alerts" : "");

    // Update Alert List UI
    const container = $("alertListContainer");
    if (issues.length === 0) {
      container.innerHTML = `
        <div class="alert-empty-state">
          <div class="empty-icon-circle">✓</div>
          <h3>All Hardware Parameters Within Limits</h3>
          <p>No threshold violations detected on machine Alpha-01. Vibration, temperature, battery, and moisture comply with configured limits.</p>
        </div>`;
      $("kpiAlertStatus").textContent = "● All parameters optimal";
      $("kpiAlertStatus").className = "kpi-status-text good";
    } else {
      $("kpiAlertStatus").textContent = `▲ ${alertCount} alert(s) requiring review`;
      $("kpiAlertStatus").className = "kpi-status-text warn";

      container.replaceChildren();
      issues.forEach((issue) => {
        const item = document.createElement("div");
        item.className = `alert-item-card ${issue.severity}`;
        item.innerHTML = `
          <div class="alert-item-icon">${issue.severity === "critical" ? "▲" : "⚠️"}</div>
          <div class="alert-item-content">
            <div class="alert-item-header">
              <span class="alert-item-title">${escapeHtml(issue.title)}</span>
              <span class="alert-item-time">${formatDate(issue.time)}</span>
            </div>
            <div class="alert-item-desc">${escapeHtml(issue.desc)}</div>
            <div class="alert-item-remedy"><strong>Action:</strong> ${escapeHtml(issue.remedy)}</div>
          </div>`;
        container.appendChild(item);
      });

      // Play audio chime if critical and enabled
      if (issues.some((i) => i.severity === "critical")) {
        triggerAudioChime();
      }
    }

    // Compute System Health Index (0 to 100)
    let healthScore = 100;
    if (latest.vibration != null) {
      healthScore -= Math.min(35, (latest.vibration / thresholds.vibration) * 25);
    }
    if (latest.rain_level != null) {
      healthScore -= Math.min(25, (latest.rain_level / thresholds.rain) * 20);
    }
    if (latest.battery_volts != null && latest.battery_volts < 3.7) {
      healthScore -= Math.min(20, ((3.7 - latest.battery_volts) / (3.7 - thresholds.battery)) * 20);
    }
    if (latest.temperature != null && latest.temperature > thresholds.temp) {
      healthScore -= 15;
    }
    if (latest.humidity != null && latest.humidity > thresholds.humidity) {
      healthScore -= 10;
    }
    healthScore = Math.max(15, Math.min(100, Math.round(healthScore)));

    $("eqiScoreVal").textContent = healthScore;
    const progressCircle = $("eqiProgressCircle");
    if (progressCircle) {
      // Circumference = 2 * PI * 66 ≈ 414.69
      const totalLen = 414.69;
      const offset = totalLen - (healthScore / 100) * totalLen;
      progressCircle.style.strokeDashoffset = offset;

      if (healthScore >= 85) {
        progressCircle.style.stroke = "var(--teal)";
        $("eqiStatusText").textContent = "OPTIMAL STATUS";
        $("eqiStatusText").style.color = "var(--teal)";
      } else if (healthScore >= 65) {
        progressCircle.style.stroke = "var(--amber)";
        $("eqiStatusText").textContent = "WATCH STATUS";
        $("eqiStatusText").style.color = "var(--amber)";
      } else {
        progressCircle.style.stroke = "var(--rose)";
        $("eqiStatusText").textContent = "FAULT DETECTED";
        $("eqiStatusText").style.color = "var(--rose)";
      }
    }
  }

  // Synthesized Web Audio Chime
  function triggerAudioChime() {
    if (!$("cfgAudioAlerts")?.checked) return;
    try {
      if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (audioContext.state === "suspended") {
        audioContext.resume();
      }
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(587.33, audioContext.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, audioContext.currentTime + 0.15); // A5
      gain.gain.setValueAtTime(0.12, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.35);
      osc.connect(gain);
      gain.connect(audioContext.destination);
      osc.start();
      osc.stop(audioContext.currentTime + 0.36);
    } catch (e) {
      console.warn("Audio chime prevented:", e);
    }
  }

  // =========================================================================
  // 7. CHART.JS ANALYTICS ENGINE
  // =========================================================================

  function initCharts() {
    if (!window.Chart) {
      console.error("Chart.js is not loaded.");
      return;
    }

    const commonOptions = getChartOptions();

    // Chart 1: Temperature Trajectory
    charts.temperature = new Chart($("temperatureChart"), {
      type: "line",
      data: {
        labels: [],
        datasets: [
          createDataset("Temperature (°C)", "#3b82f6", "rgba(59, 130, 246, 0.15)"),
        ],
      },
      options: commonOptions,
    });

    // Chart 2: Humidity Dynamics
    charts.humidity = new Chart($("humidityChart"), {
      type: "line",
      data: {
        labels: [],
        datasets: [
          createDataset("Humidity (% RH)", "#10b981", "rgba(16, 185, 129, 0.15)"),
        ],
      },
      options: commonOptions,
    });

    // Chart 3: MPU6050 Vibration & Tilt Dynamics
    charts.vibration = new Chart($("vibrationChart"), {
      type: "line",
      data: {
        labels: [],
        datasets: [
          createDataset("Vibration (g RMS)", "#00f0ff", "rgba(0, 240, 255, 0.12)"),
          createDataset("Tilt Angle (°)", "#3b82f6", "rgba(59, 130, 246, 0.08)"),
        ],
      },
      options: commonOptions,
    });

    // Chart 4: Solar & LiPo Battery Power Curve
    charts.power = new Chart($("powerChart"), {
      type: "line",
      data: {
        labels: [],
        datasets: [
          createDataset("LiPo Battery (V)", "#fbbf24", "rgba(251, 191, 36, 0.15)"),
          createDataset("Rain Moisture (%)", "#38bdf8", "rgba(56, 189, 248, 0.10)"),
        ],
      },
      options: commonOptions,
    });

    // Time-range filter buttons
    $$(".filter-btn-group .filter-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        $$(".filter-btn-group .filter-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        renderCharts();
      });
    });

    // Export chart data button
    $("exportChartDataBtn")?.addEventListener("click", exportCsvData);
  }

  function createDataset(label, color, bgColor) {
    return {
      label,
      data: [],
      borderColor: color,
      backgroundColor: bgColor,
      borderWidth: 2,
      pointRadius: 2.5,
      pointHoverRadius: 5,
      pointBackgroundColor: color,
      tension: 0.35,
      fill: true,
      spanGaps: false,
    };
  }

  function getChartOptions() {
    const isLight = document.body.classList.contains("light-theme");
    const gridColor = isLight ? "rgba(15, 23, 42, 0.06)" : "rgba(255, 255, 255, 0.06)";
    const tickColor = isLight ? "#64748b" : "#94a3b8";

    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 300 },
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: {
          display: true,
          position: "top",
          labels: {
            color: tickColor,
            font: { family: "'Plus Jakarta Sans', sans-serif", size: 11, weight: 600 },
            boxWidth: 12,
            boxHeight: 12,
            borderRadius: 3,
            useBorderRadius: true,
          },
        },
        tooltip: {
          backgroundColor: isLight ? "#ffffff" : "#0d1424",
          titleColor: isLight ? "#0f172a" : "#f8fafc",
          bodyColor: isLight ? "#334155" : "#cbd5e1",
          borderColor: isLight ? "#cbd5e1" : "rgba(0, 240, 255, 0.3)",
          borderWidth: 1,
          padding: 10,
          cornerRadius: 8,
          boxPadding: 4,
          usePointStyle: true,
          titleFont: { family: "'Plus Jakarta Sans', sans-serif", size: 12, weight: 700 },
          bodyFont: { family: "'JetBrains Mono', monospace", size: 11 },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            color: tickColor,
            font: { family: "'JetBrains Mono', monospace", size: 10 },
            maxRotation: 0,
            maxTicksLimit: 7,
          },
          border: { color: gridColor },
        },
        y: {
          grid: { color: gridColor },
          ticks: {
            color: tickColor,
            font: { family: "'JetBrains Mono', monospace", size: 10 },
          },
          border: { display: false },
        },
      },
    };
  }

  function updateChartTheme() {
    const opts = getChartOptions();
    Object.values(charts).forEach((c) => {
      if (c) {
        c.options = opts;
        c.update();
      }
    });
  }

  function renderCharts() {
    if (!charts.temperature) return;

    const activeRangeBtn = document.querySelector(".filter-btn-group .filter-btn.active");
    const limit = activeRangeBtn ? Number(activeRangeBtn.getAttribute("data-range")) : 12;
    const sliceRows = readings.slice(-limit);

    const labels = sliceRows.map((r) =>
      new Date(r.recorded_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    );

    // 1. Temperature Chart
    const temps = sliceRows.map((r) => r.temperature);
    charts.temperature.data.labels = labels;
    charts.temperature.data.datasets[0].data = temps;
    charts.temperature.update();
    calculateStats(temps, $("statTempAvg"), $("statTempMax"), 1);

    // 2. Humidity Chart
    const hums = sliceRows.map((r) => r.humidity);
    charts.humidity.data.labels = labels;
    charts.humidity.data.datasets[0].data = hums;
    charts.humidity.update();
    calculateStats(hums, $("statHumidityAvg"), $("statHumidityMax"), 0);

    // 3. MPU6050 Vibration & Tilt Dynamics
    if (charts.vibration) {
      const vibs = sliceRows.map((r) => r.vibration);
      const tilts = sliceRows.map((r) => r.tilt_angle);
      charts.vibration.data.labels = labels;
      charts.vibration.data.datasets[0].data = vibs;
      charts.vibration.data.datasets[1].data = tilts;
      charts.vibration.update();
      calculateStats(vibs, $("statVibrationAvg"), null, 2);
      calculateStats(tilts, $("statTiltAvg"), null, 1);
    }

    // 4. Solar & LiPo Battery Power Curve
    if (charts.power) {
      const batts = sliceRows.map((r) => r.battery_volts);
      const rains = sliceRows.map((r) => r.rain_level);
      charts.power.data.labels = labels;
      charts.power.data.datasets[0].data = batts;
      charts.power.data.datasets[1].data = rains;
      charts.power.update();
      calculateStats(batts, $("statBatteryAvg"), null, 2);
      calculateStats(rains, null, $("statRainMax"), 0);
    }
  }

  function calculateStats(values, avgEl, maxEl, decimals = 1) {
    const valid = values.filter((v) => v != null && Number.isFinite(v));
    if (!valid.length) {
      if (avgEl) avgEl.textContent = "--";
      if (maxEl) maxEl.textContent = "--";
      return;
    }
    const sum = valid.reduce((a, b) => a + b, 0);
    const avg = sum / valid.length;
    const max = Math.max(...valid);

    if (avgEl) avgEl.textContent = avg.toFixed(decimals);
    if (maxEl) maxEl.textContent = max.toFixed(decimals);
  }

  // =========================================================================
  // 8. HISTORICAL DATA TABLE & CSV EXPORT
  // =========================================================================

  function initHistoryTableControls() {
    $("tableSearchInput")?.addEventListener("input", (e) => {
      tableState.search = e.target.value.toLowerCase().trim();
      tableState.currentPage = 1;
      renderHistoryTable();
    });

    $("filterSource")?.addEventListener("change", (e) => {
      tableState.sourceFilter = e.target.value;
      tableState.currentPage = 1;
      renderHistoryTable();
    });

    $("filterStatus")?.addEventListener("change", (e) => {
      tableState.statusFilter = e.target.value;
      tableState.currentPage = 1;
      renderHistoryTable();
    });

    $("pageSizeSelect")?.addEventListener("change", (e) => {
      tableState.pageSize = e.target.value === "100" ? 100 : Number(e.target.value);
      tableState.currentPage = 1;
      renderHistoryTable();
    });

    // Column Sorting
    $$(".telemetry-table th.sortable").forEach((th) => {
      th.addEventListener("click", () => {
        const col = th.getAttribute("data-sort");
        if (tableState.sortColumn === col) {
          tableState.sortAscending = !tableState.sortAscending;
        } else {
          tableState.sortColumn = col;
          tableState.sortAscending = true;
        }

        // Update indicator icons
        $$(".telemetry-table th.sortable .sort-icon").forEach((icon) => (icon.textContent = "↕"));
        const activeIcon = th.querySelector(".sort-icon");
        if (activeIcon) {
          activeIcon.textContent = tableState.sortAscending ? "▲" : "▼";
        }

        renderHistoryTable();
      });
    });

    // Pagination buttons
    $("btnPagPrev")?.addEventListener("click", () => {
      if (tableState.currentPage > 1) {
        tableState.currentPage--;
        renderHistoryTable();
      }
    });

    $("btnPagNext")?.addEventListener("click", () => {
      tableState.currentPage++;
      renderHistoryTable();
    });

    // CSV Exports
    $("historyExportBtn")?.addEventListener("click", exportCsvData);
  }

  function getFilteredRows() {
    let list = [...readings];

    // Source Filter
    if (tableState.sourceFilter === "supabase") {
      list = list.filter((r) => !r.is_simulated);
    } else if (tableState.sourceFilter === "demo") {
      list = list.filter((r) => r.is_simulated);
    }

    // Status Filter
    if (tableState.statusFilter === "warning") {
      list = list.filter((r) => isRowInWarning(r));
    } else if (tableState.statusFilter === "normal") {
      list = list.filter((r) => !isRowInWarning(r));
    }

      // Search Filter
      if (tableState.search) {
        const q = tableState.search;
        list = list.filter(
          (r) =>
            r.machine_id.toLowerCase().includes(q) ||
            r.recorded_at.toLowerCase().includes(q) ||
            String(r.temperature ?? "").includes(q) ||
            String(r.humidity ?? "").includes(q) ||
            String(r.vibration ?? "").includes(q) ||
            String(r.tilt_angle ?? "").includes(q) ||
            String(r.rain_level ?? "").includes(q) ||
            String(r.battery_volts ?? "").includes(q) ||
            String(r.motor_rpm ?? "").includes(q)
        );
      }

      // Sorting
      list.sort((a, b) => {
        let valA = a[tableState.sortColumn];
        let valB = b[tableState.sortColumn];

        if (valA == null) return 1;
        if (valB == null) return -1;

        if (tableState.sortColumn === "recorded_at") {
          valA = new Date(valA).getTime();
          valB = new Date(valB).getTime();
        }

        if (valA < valB) return tableState.sortAscending ? -1 : 1;
        if (valA > valB) return tableState.sortAscending ? 1 : -1;
        return 0;
      });

      return list;
    }

    function isRowInWarning(r) {
      if (r.temperature != null && r.temperature >= thresholds.temp) return true;
      if (r.humidity != null && r.humidity >= thresholds.humidity) return true;
      if (r.vibration != null && r.vibration >= thresholds.vibration) return true;
      if (r.rain_level != null && r.rain_level >= thresholds.rain) return true;
      if (r.battery_volts != null && r.battery_volts <= thresholds.battery) return true;
      if (r.buzzer_active || r.alarm_led) return true;
      return false;
    }

    function renderHistoryTable() {
      const tbody = $("telemetryTableBody");
      if (!tbody) return;

      const filtered = getFilteredRows();
      const total = filtered.length;
      const pageSize = tableState.pageSize;
      const totalPages = Math.max(1, Math.ceil(total / pageSize));

      if (tableState.currentPage > totalPages) {
        tableState.currentPage = totalPages;
      }

      const startIdx = (tableState.currentPage - 1) * pageSize;
      const pageRows = filtered.slice(startIdx, startIdx + pageSize);

      // Pagination info
      $("pagStart").textContent = total === 0 ? 0 : startIdx + 1;
      $("pagEnd").textContent = Math.min(startIdx + pageSize, total);
      $("pagTotal").textContent = total;
      $("pagPageIndicator").textContent = `Page ${tableState.currentPage} of ${totalPages}`;

      $("btnPagPrev").disabled = tableState.currentPage <= 1;
      $("btnPagNext").disabled = tableState.currentPage >= totalPages;

      if (!pageRows.length) {
        tbody.innerHTML = `<tr><td colspan="12" class="table-empty-row">No records match your search or filter criteria.</td></tr>`;
        return;
      }

      tbody.replaceChildren();
      pageRows.forEach((r) => {
        const isWarn = isRowInWarning(r);
        const tr = document.createElement("tr");

        tr.innerHTML = `
          <td class="mono">${formatDate(r.recorded_at)}</td>
          <td><strong>${escapeHtml(r.machine_id)}</strong></td>
          <td class="mono">${r.temperature != null ? r.temperature.toFixed(1) + " °C" : "--"}</td>
          <td class="mono">${r.humidity != null ? r.humidity + " %" : "--"}</td>
          <td class="mono">${r.vibration != null ? r.vibration.toFixed(2) + " g" : "--"}</td>
          <td class="mono">${r.tilt_angle != null ? r.tilt_angle.toFixed(1) + "°" : "--"}</td>
          <td class="mono">${r.rain_level != null ? r.rain_level + " %" : "--"}</td>
          <td class="mono">${r.battery_volts != null ? r.battery_volts.toFixed(2) + " V" : "--"}</td>
          <td class="mono">${r.motor_rpm != null ? r.motor_rpm + " RPM" : "--"}</td>
          <td>
            <span class="status-pill ${r.buzzer_active ? "status-critical" : "status-normal"}">
              ${r.buzzer_active ? "🚨 ALARM" : "● OK"}
            </span>
          </td>
          <td>
            <span class="status-pill ${isWarn ? "status-warn" : "status-normal"}">
              ${isWarn ? "▲ Breached" : "● Normal"}
            </span>
          </td>
          <td>
            <span class="source-badge ${r.is_simulated ? "demo" : "supabase"}">
              ${r.is_simulated ? "Demo" : "Supabase Live"}
            </span>
          </td>
        `;
        tbody.appendChild(tr);
      });
    }

    function exportCsvData() {
      const list = getFilteredRows();
      if (!list.length) {
        showToast("No telemetry rows available to export.", "warning");
        return;
      }

      const headers = [
        "recorded_at",
        "machine_id",
        "temperature_c",
        "humidity_pct",
        "vibration_g_rms",
        "tilt_angle_deg",
        "rain_level_pct",
        "battery_volts",
        "solar_volts",
        "motor_rpm",
        "buzzer_active",
        "alarm_led",
        "is_simulated",
      ];

      const escapeCsv = (val) => `"${String(val ?? "").replace(/"/g, '""')}"`;

      const lines = [
        headers.join(","),
        ...list.map((r) =>
          [
            escapeCsv(r.recorded_at),
            escapeCsv(r.machine_id),
            escapeCsv(r.temperature),
            escapeCsv(r.humidity),
            escapeCsv(r.vibration),
            escapeCsv(r.tilt_angle),
            escapeCsv(r.rain_level),
            escapeCsv(r.battery_volts),
            escapeCsv(r.solar_volts),
            escapeCsv(r.motor_rpm),
            escapeCsv(r.buzzer_active),
            escapeCsv(r.alarm_led),
            escapeCsv(r.is_simulated),
          ].join(",")
        ),
      ];

      const csvContent = lines.join("\r\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

      link.setAttribute("href", url);
      link.setAttribute("download", `mech-ai-telemetry-${timestamp}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      showToast(`Exported ${list.length} telemetry records to CSV.`, "success");
    }

    // =========================================================================
    // 9. THRESHOLD CONTROLS & PRESET MANAGEMENT
    // =========================================================================

    function initThresholdControls() {
      // Populate slider inputs with current values
      if ($("inputTempThreshold")) {
        $("inputTempThreshold").value = thresholds.temp;
        $("lblTempThreshold").textContent = thresholds.temp;
        if ($("cardTempThresholdVal")) $("cardTempThresholdVal").textContent = thresholds.temp + "°C";
      }

      if ($("inputHumidityThreshold")) {
        $("inputHumidityThreshold").value = thresholds.humidity;
        $("lblHumidityThreshold").textContent = thresholds.humidity;
      }

      if ($("inputVibrationThreshold")) {
        $("inputVibrationThreshold").value = thresholds.vibration;
        $("lblVibrationThreshold").textContent = thresholds.vibration;
        if ($("cardVibrationThresholdVal")) $("cardVibrationThresholdVal").textContent = thresholds.vibration + " g";
      }

      if ($("inputRainThreshold")) {
        $("inputRainThreshold").value = thresholds.rain;
        $("lblRainThreshold").textContent = thresholds.rain;
        if ($("cardRainThresholdVal")) $("cardRainThresholdVal").textContent = thresholds.rain + "%";
      }

      if ($("inputBatteryThreshold")) {
        $("inputBatteryThreshold").value = thresholds.battery;
        $("lblBatteryThreshold").textContent = thresholds.battery.toFixed(2);
        if ($("cardBatteryThresholdVal")) $("cardBatteryThresholdVal").textContent = thresholds.battery.toFixed(2) + "V";
      }

      // Interactive slider event listeners
      const bindSlider = (inputId, lblId, key, cardValId, unit = "") => {
        $(inputId)?.addEventListener("input", (e) => {
          const val = Number(e.target.value);
          thresholds[key] = val;
          if ($(lblId)) $(lblId).textContent = key === "battery" ? val.toFixed(2) : val;
          if (cardValId && $(cardValId)) {
            $(cardValId).textContent = (key === "battery" ? val.toFixed(2) : val) + unit;
          }
          if (readings.length) {
            renderAlertCenter(readings[readings.length - 1]);
            renderHistoryTable();
          }
        });
      };

      bindSlider("inputTempThreshold", "lblTempThreshold", "temp", "cardTempThresholdVal", "°C");
      bindSlider("inputHumidityThreshold", "lblHumidityThreshold", "humidity", null);
      bindSlider("inputVibrationThreshold", "lblVibrationThreshold", "vibration", "cardVibrationThresholdVal", " g");
      bindSlider("inputRainThreshold", "lblRainThreshold", "rain", "cardRainThresholdVal", "%");
      bindSlider("inputBatteryThreshold", "lblBatteryThreshold", "battery", "cardBatteryThresholdVal", "V");

      // Save thresholds button
      $("saveThresholdsBtn")?.addEventListener("click", () => {
        try {
          localStorage.setItem("mech_ai_thresholds", JSON.stringify(thresholds));
          showToast("Threshold limits saved to browser memory.", "success");
        } catch (err) {
          showToast("Failed to save thresholds to storage.", "error");
        }
      });

      // Reset thresholds button
      $("resetThresholdsBtn")?.addEventListener("click", () => {
        thresholds = { ...DEFAULT_THRESHOLDS };
        localStorage.removeItem("mech_ai_thresholds");
        initThresholdControls();
        if (readings.length) {
          renderAlertCenter(readings[readings.length - 1]);
          renderHistoryTable();
        }
        showToast("Reset thresholds to industrial defaults.", "info");
      });

      // Preset Pills
      $$(".preset-pill").forEach((pill) => {
        pill.addEventListener("click", () => {
          $$(".preset-pill").forEach((p) => p.classList.remove("active"));
          pill.classList.add("active");
          const preset = pill.getAttribute("data-preset");

          if (preset === "industrial") {
            thresholds = { temp: 40, humidity: 85, vibration: 1.5, rain: 50, battery: 3.4 };
          } else if (preset === "sensitive") {
            thresholds = { temp: 32, humidity: 75, vibration: 0.8, rain: 25, battery: 3.5 };
          } else if (preset === "outdoor") {
            thresholds = { temp: 48, humidity: 90, vibration: 2.0, rain: 70, battery: 3.3 };
          }
          initThresholdControls();
          if (readings.length) {
            renderAlertCenter(readings[readings.length - 1]);
            renderHistoryTable();
          }
          showToast(`Applied ${preset.toUpperCase()} threshold preset.`, "info");
        });
      });
    }

  // =========================================================================
  // 10. SETTINGS FORM & CONNECTION TESTER
  // =========================================================================

  function initSettingsForm() {
    $("cfgSupabaseUrl").value = config.supabaseUrl;
    $("cfgSupabaseKey").value = config.supabasePublishableKey;
    $("cfgMachineId").value = config.machineId;
    $("cfgPollInterval").value = config.pollIntervalMs;
    $("lblPollInterval").textContent = `${config.pollIntervalMs / 1000} seconds`;

    // Mask/Unmask publishable key
    $("btnToggleKeyMask")?.addEventListener("click", () => {
      const input = $("cfgSupabaseKey");
      input.type = input.type === "password" ? "text" : "password";
    });

    // Live slider value label
    $("cfgPollInterval")?.addEventListener("input", (e) => {
      const secs = (Number(e.target.value) / 1000).toFixed(0);
      $("lblPollInterval").textContent = `${secs} seconds`;
    });

    // Save & Reconnect
    $("btnSaveConfig")?.addEventListener("click", () => {
      const newUrl = $("cfgSupabaseUrl").value.trim();
      const newKey = $("cfgSupabaseKey").value.trim();
      const newMachine = $("cfgMachineId").value.trim() || "Alpha-01";
      const newInterval = Number($("cfgPollInterval").value) || 5000;

      config.supabaseUrl = newUrl;
      config.supabasePublishableKey = newKey;
      config.machineId = newMachine;
      config.pollIntervalMs = newInterval;

      try {
        localStorage.setItem("mech_ai_supabase_url", newUrl);
        localStorage.setItem("mech_ai_supabase_key", newKey);
        localStorage.setItem("mech_ai_machine_id", newMachine);
        localStorage.setItem("mech_ai_poll_interval", String(newInterval));
        showToast("Settings saved to local environment.", "success");
      } catch (err) {
        showToast("Failed to persist settings.", "error");
      }

      // Recreate Supabase client
      supabaseClient = null;
      if (currentMode === "supabase") {
        startSupabaseMode();
      }
    });

    // Test Database Reachability
    $("btnTestSupabase")?.addEventListener("click", testDatabaseConnection);
    $("pingDatabaseBtn")?.addEventListener("click", testDatabaseConnection);

    // Reset to config.js button
    $("btnResetConfig")?.addEventListener("click", () => {
      localStorage.removeItem("mech_ai_supabase_url");
      localStorage.removeItem("mech_ai_supabase_key");
      localStorage.removeItem("mech_ai_machine_id");
      localStorage.removeItem("mech_ai_poll_interval");

      config.supabaseUrl = baseConfig.supabaseUrl || "";
      config.supabasePublishableKey = baseConfig.supabasePublishableKey || "";
      config.machineId = baseConfig.machineId || "Alpha-01";
      config.pollIntervalMs = baseConfig.pollIntervalMs || 5000;

      initSettingsForm();
      showToast("Reset settings to config.js baseline.", "info");
    });

    // Update config status badge
    updateConfigStatusBadge();
  }

  function updateConfigStatusBadge() {
    const badge = $("settingsConfigStatus");
    if (!badge) return;

    if (config.supabaseUrl && config.supabasePublishableKey) {
      badge.className = "status-pill status-normal";
      badge.textContent = "Configured";
    } else {
      badge.className = "status-pill status-warn";
      badge.textContent = "Credentials Missing";
    }
  }

  async function testDatabaseConnection() {
    const resultBox = $("testResultBox");
    resultBox.className = "test-result-box";
    resultBox.classList.remove("hidden");
    resultBox.innerHTML = `<strong>Testing connection...</strong> Sending probe query to Supabase.`;

    const client = getSupabaseClient();
    if (!client) {
      resultBox.className = "test-result-box error";
      resultBox.innerHTML = `<strong>Failed:</strong> Supabase client could not be instantiated. Check URL and Key.`;
      return;
    }

    const t0 = performance.now();
    try {
      const { data, error } = await client
        .from("sensor_readings")
        .select("id, machine_id, recorded_at")
        .limit(1);

      const latency = Math.round(performance.now() - t0);
      if (error) throw error;

      resultBox.className = "test-result-box success";
      resultBox.innerHTML = `
        <strong>✓ Reachability Test Successful:</strong><br>
        • Status: Database connected & table readable<br>
        • Roundtrip Latency: ${latency} ms<br>
        • Sample records detected: ${data ? data.length : 0}<br>
        • Target Machine: ${escapeHtml(config.machineId)}
      `;
      $("diagLatencyVal").textContent = latency + " ms";
      showToast(`Database reachability confirmed in ${latency}ms.`, "success");
    } catch (err) {
      resultBox.className = "test-result-box error";
      resultBox.innerHTML = `
        <strong>✕ Connection Test Failed:</strong><br>
        ${escapeHtml(err.message || "Unknown network or permission error.")}<br>
        Ensure Row Level Security policy allows SELECT to 'anon'.
      `;
      showToast(`Database probe failed: ${err.message}`, "error");
    }
  }

  // =========================================================================
  // 11. GLOBAL SHORTCUTS, BANNERS, & TOASTS
  // =========================================================================

  function initGlobalShortcuts() {
    // Mode Switcher Buttons
    $("btnModeDemo")?.addEventListener("click", () => setMode("demo"));
    $("btnModeSupabase")?.addEventListener("click", () => setMode("supabase"));

    // Global Refresh Button
    $("refreshBtn")?.addEventListener("click", triggerManualRefresh);
    $("liveRefreshBtn")?.addEventListener("click", triggerManualRefresh);
    $("retryConnectionBtn")?.addEventListener("click", () => {
      if (currentMode === "supabase") fetchSupabaseReadings(true);
    });

    // Keyboard shortcut (R = Refresh)
    window.addEventListener("keydown", (e) => {
      if (e.key === "r" && !e.ctrlKey && !e.metaKey && document.activeElement.tagName !== "INPUT") {
        e.preventDefault();
        triggerManualRefresh();
      }
    });

    // Banner dismiss
    $("bannerDismissBtn")?.addEventListener("click", hideBanner);
  }

  function triggerManualRefresh() {
    const icon = $("refreshIcon");
    if (icon) {
      icon.style.transition = "transform 0.5s ease";
      icon.style.transform = "rotate(360deg)";
      setTimeout(() => (icon.style.transform = "rotate(0deg)"), 550);
    }

    if (currentMode === "supabase") {
      fetchSupabaseReadings(true);
    } else {
      const newSample = generateSyntheticReading();
      appendReading(newSample);
      showToast("Generated new demo sensor telemetry.", "info");
    }
  }

  function showBanner(type, htmlContent, actionLabel, actionCallback) {
    const banner = $("systemBanner");
    const textEl = $("bannerText");
    const actionBtn = $("bannerActionBtn");

    banner.className = `system-banner ${type}`;
    textEl.innerHTML = htmlContent;

    if (actionLabel && actionCallback) {
      actionBtn.textContent = actionLabel;
      actionBtn.style.display = "block";
      actionBtn.onclick = actionCallback;
    } else {
      actionBtn.style.display = "none";
    }

    banner.style.display = "flex";
  }

  function hideBanner() {
    const banner = $("systemBanner");
    if (banner) banner.style.display = "none";
  }

  function showToast(message, type = "info") {
    if (!$("cfgToastNotifications")?.checked) return;

    const container = $("toastContainer");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = `toast-item ${type}`;

    const icons = {
      info: "ℹ",
      success: "✓",
      warning: "▲",
      error: "✕",
    };

    toast.innerHTML = `
      <span class="toast-icon">${icons[type] || "•"}</span>
      <span class="toast-text">${escapeHtml(message)}</span>
      <button class="toast-close" type="button" aria-label="Close notification">×</button>
    `;

    toast.querySelector(".toast-close").addEventListener("click", () => {
      toast.remove();
    });

    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateX(20px)";
      setTimeout(() => toast.remove(), 250);
    }, 4000);
  }

  // =========================================================================
  // 12. 3D DIGITAL TWIN CONTROLS & EVENT BINDINGS
  // =========================================================================

  function initDigitalTwinControls() {
    // Camera Preset Buttons
    $$(".twin-cam-presets .twin-pill-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        $$(".twin-cam-presets .twin-pill-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        const preset = btn.getAttribute("data-preset-cam");
        if (window.MechDigitalTwin) {
          window.MechDigitalTwin.setCameraPreset(preset);
        }
      });
    });

    // Feature Toggles
    $("btnTwinRotate")?.addEventListener("click", () => {
      if (window.MechDigitalTwin) {
        const active = window.MechDigitalTwin.toggleAutoRotate();
        $("btnTwinRotate").classList.toggle("active", active);
        showToast(active ? "Auto-rotation enabled." : "Auto-rotation stopped.", "info");
      }
    });

    $("btnTwinHud")?.addEventListener("click", () => {
      if (window.MechDigitalTwin) {
        const active = window.MechDigitalTwin.toggleHudTags();
        $("btnTwinHud").classList.toggle("active", active);
      }
    });

    $("btnTwinExplode")?.addEventListener("click", () => {
      if (window.MechDigitalTwin) {
        const active = window.MechDigitalTwin.toggleExplodedView();
        $("btnTwinExplode").classList.toggle("active", active);
        showToast(active ? "Exploded assembly view active." : "Assembled station view.", "info");
      }
    });

    $("btnTwinWireframe")?.addEventListener("click", () => {
      if (window.MechDigitalTwin) {
        const active = window.MechDigitalTwin.toggleWireframe();
        $("btnTwinWireframe").classList.toggle("active", active);
        showToast(active ? "Technical wireframe mode active." : "Shaded material mode.", "info");
      }
    });

    $("btnTwinReset")?.addEventListener("click", () => {
      if (window.MechDigitalTwin) {
        window.MechDigitalTwin.resetCameraView();
        $$(".twin-cam-presets .twin-pill-btn").forEach((b) => b.classList.remove("active"));
        document.querySelector('.twin-cam-presets .twin-pill-btn[data-preset-cam="isometric"]')?.classList.add("active");
        showToast("Camera reset to overview.", "info");
      }
    });

    // Component Inspector Close & Reset
    $("btnTwinCloseInspector")?.addEventListener("click", () => {
      if (window.MechDigitalTwin) {
        window.MechDigitalTwin.closeInspector();
      }
    });

    $("btnTwinResetCamera")?.addEventListener("click", () => {
      if (window.MechDigitalTwin) {
        window.MechDigitalTwin.closeInspector();
      }
    });

    // Floating HUD callout click handlers
    $$(".hud-callout").forEach((callout) => {
      callout.addEventListener("click", () => {
        const comp = callout.getAttribute("data-comp");
        if (comp && window.MechDigitalTwin) {
          window.MechDigitalTwin.inspectComponent(comp);
        }
      });
    });

    // 3D Jump buttons on Live Monitoring cards
    $$(".sensor-3d-link-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const comp = btn.getAttribute("data-focus-comp");
        switchView("twin");
        setTimeout(() => {
          if (comp && window.MechDigitalTwin) {
            window.MechDigitalTwin.inspectComponent(comp);
          }
        }, 300);
      });
    });

    // Overview 3D launch button
    document.querySelectorAll('a[data-view="twin"]').forEach((a) => {
      a.addEventListener("click", (e) => {
        e.preventDefault();
        switchView("twin");
      });
    });
  }

  // =========================================================================
  // 13. UTILITY FUNCTIONS
  // =========================================================================

  function formatDate(isoString) {
    try {
      const d = new Date(isoString);
      return (
        d.toLocaleDateString([], { month: "short", day: "numeric" }) +
        " " +
        d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
      );
    } catch {
      return String(isoString);
    }
  }

  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
})();
