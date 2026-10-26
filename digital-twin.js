/**
 * MECH AI — 3D Digital Twin Engine (Updated Hardware Suite)
 * Industrial IoT Machine Health & Environmental Monitoring Station
 *
 * Hardware Components:
 * 1. ESP32-WROOM-32D Core Microcontroller Gateway
 * 2. Solar Panel Input & 3.7V LiPo Battery with TP4056 BMS
 * 3. DHT11 Ambient Temperature & Humidity Sensor
 * 4. Rain Sensor Module (Gold serpentine detection plate + LM393 comparator)
 * 5. MPU6050 6-Axis Accelerometer & Vibration / Tilt Sensor
 * 6. Testbed Motor with Eccentric Weight for Mechanical Failure Simulation
 * 7. Active Piezo Buzzer & Alarm Indicator LEDs
 * 8. Complete Jumper Wire Routing & Industrial Aluminum Chassis
 */

window.MechDigitalTwin = (() => {
  "use strict";

  let scene, camera, renderer, controls;
  let containerEl, canvasEl, hudLayerEl;
  let animationFrameId = null;
  let isRunning = false;
  let isInitialized = false;

  // Component registry for raycasting & inspection
  const components = {};
  const selectableMeshes = [];
  let hoveredComponent = null;
  let selectedComponent = null;

  // Dynamic moving parts
  let motorShaftMesh = null;
  let motorEccentricMesh = null;
  let motorSpeed = 0.08;

  // Animation states
  let isExploded = false;
  let isWireframe = false;
  let isAutoRotate = false;
  let showHudTags = true;
  let targetCameraPos = null;
  let targetControlsTarget = null;
  let cameraTransitionProgress = 1;

  // Telemetry caches
  let currentReadings = null;
  let currentThresholds = { temp: 40, humidity: 85, vibration: 1.5, rain: 50, battery: 3.4 };

  // Raycaster
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2(-999, -999);

  // Materials Cache
  const materials = {};

  // Component metadata for inspection
  const COMPONENT_METADATA = {
    esp32: {
      name: "ESP32-WROOM-32D Microcontroller",
      category: "Edge Processing Gateway",
      manufacturer: "Espressif Systems",
      pinout: "38-Pin DevKit · I2C, ADC, PWM, UART, GPIO",
      voltage: "3.3V Logic (5V VIN from Solar/LiPo BMS)",
      specs: "Dual-Core Xtensa LX6 @ 240MHz · 520KB SRAM · 4MB SPI Flash · Wi-Fi 802.11 b/g/n & BLE 4.2",
      role: "Central processing hub aggregating environmental, machine vibration, power, and precipitation telemetry. Executes real-time threshold monitoring and controls the alarm buzzer/LED.",
      targetCamera: { pos: new THREE.Vector3(-75, 70, 75), lookAt: new THREE.Vector3(-75, 10, 5) }
    },
    power: {
      name: "Solar Panel & 3.7V LiPo Battery Subsystem",
      category: "Renewable Power Management & BMS",
      manufacturer: "TP4056 Solar Charge Controller + 18650 LiPo",
      pinout: "B+ / B- (3.7V LiPo) · IN+ / IN- (5V-6V Solar Panel) · OUT+ to ESP32 VIN",
      voltage: "3.7V Nominal (3.0V Cutoff – 4.2V Fully Charged)",
      specs: "Monocrystalline Solar Panel (6V 2W) · 3.7V 2200mAh LiPo Cell · TP4056 BMS with DW01A battery protection",
      role: "Provides uninterrupted off-grid power to the monitoring station with solar harvesting, battery charge management, and real-time battery voltage monitoring via voltage divider.",
      targetCamera: { pos: new THREE.Vector3(-85, 95, -60), lookAt: new THREE.Vector3(-85, 25, -60) }
    },
    motor: {
      name: "Testbed Machine Motor for Failure Simulation",
      category: "Mechanical Actuator & Testbed Simulator",
      manufacturer: "Precision DC Geared Machine Drive",
      pinout: "GPIO 18 (PWM / MOSFET Driver) · 5V Power Rail",
      voltage: "5.0V DC (Controlled via Logic-Level N-Channel MOSFET)",
      specs: "0–3000 RPM Variable Speed · High-Torque Carbon Brush · Eccentric Unbalanced Flywheel for Vibration Induction",
      role: "Simulates industrial mechanical equipment (fans, bearings, shafts). The eccentric weight allows controlled simulation of mechanical unbalance, bearing wear, and vibration anomalies.",
      targetCamera: { pos: new THREE.Vector3(25, 75, -40), lookAt: new THREE.Vector3(25, 20, -50) }
    },
    mpu6050: {
      name: "MPU-6050 6-Axis Vibration & Tilt Sensor",
      category: "Inertial Measurement Unit (IMU)",
      manufacturer: "TDK InvenSense",
      pinout: "GPIO 21 (I2C SDA) · GPIO 22 (I2C SCL) · 3.3V VCC · GND",
      voltage: "3.3V – 5.0V (On-board LDO regulator)",
      specs: "3-Axis Accelerometer (±2g to ±16g) · 3-Axis Gyroscope (±250 to ±2000°/s) · Digital Motion Processor (DMP)",
      role: "Firmly coupled to the testbed motor mount to detect mechanical vibration signatures, peak-to-peak acceleration, RMS vibration intensity, and structural tilt deviations.",
      targetCamera: { pos: new THREE.Vector3(25, 55, 10), lookAt: new THREE.Vector3(25, 15, -15) }
    },
    dht11: {
      name: "DHT11 Ambient Temperature & Humidity Sensor",
      category: "Environmental Climate Monitor",
      manufacturer: "Aosong Electronics",
      pinout: "GPIO 4 (DATA) · 3.3V VCC · Common GND",
      voltage: "3.3V – 5.0V DC (10kΩ pull-up resistor)",
      specs: "Temperature: 0–50°C (±2°C) · Relative Humidity: 20–90% RH (±5%) · 1Hz sampling interval",
      role: "Tracks ambient chamber thermal and moisture conditions to detect thermal runaway in the equipment room.",
      targetCamera: { pos: new THREE.Vector3(95, 60, -45), lookAt: new THREE.Vector3(95, 15, -55) }
    },
    rain: {
      name: "Rain & Precipitation Sensor Module",
      category: "Precipitation & Moisture Detector",
      manufacturer: "Dual-Plate Conductive Sensor + LM393",
      pinout: "GPIO 34 (ADC1_CH6 Analog Out) · GPIO 23 (Digital Out) · 3.3V / 5V",
      voltage: "3.3V – 5.0V DC",
      specs: "Double-Sided Nickel Plated Serpentine Grid · Adjustable Sensitivity Trim Pot · Analog 0–4095 & Digital Threshold",
      role: "Detects rainfall, water ingress, and chamber leaks via conductive bridging across the serpentine surface traces.",
      targetCamera: { pos: new THREE.Vector3(95, 65, 60), lookAt: new THREE.Vector3(95, 15, 45) }
    },
    alarm: {
      name: "Active Buzzer & High-Intensity Alarm LED",
      category: "Auditory & Visual Annunciator",
      manufacturer: "Industrial Audio/Visual Annunciator Suite",
      pinout: "GPIO 19 (Active Buzzer) · GPIO 2 (Status Alarm LED)",
      voltage: "3.3V / 5.0V DC",
      specs: "Active Piezo Oscillator (85dB @ 10cm, 2.3kHz) · 5mm High-Lumen Clear Lens Warning LED",
      role: "Provides immediate localized audio alarms and visual flashing alerts when vibration, thermal, rain, or power faults are detected.",
      targetCamera: { pos: new THREE.Vector3(-25, 50, 45), lookAt: new THREE.Vector3(-25, 15, 30) }
    },
    baseplate: {
      name: "Industrial Test Bench Chassis & Baseplate",
      category: "Chassis & Interconnect Subsystem",
      manufacturer: "MECH AI Engineering Lab",
      pinout: "Shared 3.3V / 5V Power Rails & Common Ground",
      voltage: "Integrated Power Bus Distribution",
      specs: "CNC Anodized 6061-T6 Aluminum · Brass M2.5 Standoffs · Silkscreen Laser Alignment Grid",
      role: "Rigid mechanical mounting platform supporting all sensors, battery BMS, motor testbed, and wiring harnesses.",
      targetCamera: { pos: new THREE.Vector3(0, 160, 220), lookAt: new THREE.Vector3(0, 5, 0) }
    }
  };

  // -------------------------------------------------------------------------
  // INITIALIZATION
  // -------------------------------------------------------------------------
  function init(container, canvas, hudLayer) {
    if (isInitialized) return true;

    containerEl = container;
    canvasEl = canvas;
    hudLayerEl = hudLayer;

    if (!checkWebGLSupport()) {
      showFallback();
      return false;
    }

    try {
      // 1. Scene
      scene = new THREE.Scene();
      scene.background = new THREE.Color(0x070b13);
      scene.fog = new THREE.FogExp2(0x070b13, 0.0018);

      // 2. Camera
      const aspect = containerEl.clientWidth / containerEl.clientHeight || 1;
      camera = new THREE.PerspectiveCamera(42, aspect, 5, 1500);
      camera.position.set(0, 165, 230);

      // 3. Renderer
      renderer = new THREE.WebGLRenderer({
        canvas: canvasEl,
        antialias: true,
        alpha: false,
        powerPreference: "high-performance"
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(containerEl.clientWidth, containerEl.clientHeight);
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.15;

      // 4. OrbitControls
      if (window.THREE.OrbitControls) {
        controls = new THREE.OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.06;
        controls.minDistance = 60;
        controls.maxDistance = 550;
        controls.maxPolarAngle = Math.PI / 2.05;
        controls.target.set(0, 5, 0);
      }

      // 5. Lighting
      setupLighting();

      // 6. Build Procedural Hardware Models
      buildStationModels();

      // 7. Event Listeners
      initEvents();

      isInitialized = true;
      resume();

      return true;
    } catch (err) {
      console.error("Failed to initialize 3D digital twin:", err);
      showFallback();
      return false;
    }
  }

  function checkWebGLSupport() {
    try {
      const testCanvas = document.createElement("canvas");
      return Boolean(
        window.WebGLRenderingContext &&
        (testCanvas.getContext("webgl") || testCanvas.getContext("experimental-webgl"))
      );
    } catch (e) {
      return false;
    }
  }

  function showFallback() {
    if (containerEl) {
      containerEl.innerHTML = `
        <div class="webgl-fallback-card">
          <div class="fallback-icon">⚠️</div>
          <h3>WebGL 3D Acceleration Unavailable</h3>
          <p>Your browser or graphics driver currently does not support hardware-accelerated WebGL. You can still monitor all live readings, analytical charts, alerts, and historical data via the 2D dashboard views.</p>
          <a class="btn btn-secondary btn-sm" href="#monitoring">Return to 2D Live Monitoring</a>
        </div>
      `;
    }
  }

  // -------------------------------------------------------------------------
  // LIGHTING SETUP
  // -------------------------------------------------------------------------
  function setupLighting() {
    // Ambient fill
    const ambientLight = new THREE.AmbientLight(0x131d2e, 1.4);
    scene.add(ambientLight);

    // Key Sunlight
    const keyLight = new THREE.DirectionalLight(0xf0f7ff, 2.2);
    keyLight.position.set(120, 220, 140);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    keyLight.shadow.camera.near = 50;
    keyLight.shadow.camera.far = 600;
    keyLight.shadow.camera.left = -180;
    keyLight.shadow.camera.right = 180;
    keyLight.shadow.camera.top = 180;
    keyLight.shadow.camera.bottom = -180;
    keyLight.shadow.bias = -0.0004;
    keyLight.shadow.radius = 2.5;
    scene.add(keyLight);

    // Cyan Rim Accent Light
    const rimLight = new THREE.DirectionalLight(0x00f0ff, 1.3);
    rimLight.position.set(-150, 90, -140);
    scene.add(rimLight);

    // Blue ground fill
    const fillLight = new THREE.DirectionalLight(0x3b82f6, 0.7);
    fillLight.position.set(0, -50, 150);
    scene.add(fillLight);
  }

  // -------------------------------------------------------------------------
  // PROCEDURAL 3D HARDWARE MODEL GENERATOR
  // -------------------------------------------------------------------------
  function buildStationModels() {
    const stationGroup = new THREE.Group();
    stationGroup.name = "stationGroup";

    // Reusable Materials
    materials.darkAluminum = new THREE.MeshStandardMaterial({
      color: 0x111723,
      metalness: 0.8,
      roughness: 0.28
    });

    materials.pcbDark = new THREE.MeshStandardMaterial({
      color: 0x091424,
      roughness: 0.45,
      metalness: 0.15
    });

    materials.pcbBlue = new THREE.MeshStandardMaterial({
      color: 0x0a2e5c,
      roughness: 0.45,
      metalness: 0.2
    });

    materials.metalSilver = new THREE.MeshStandardMaterial({
      color: 0xd8e1ec,
      metalness: 0.9,
      roughness: 0.2
    });

    materials.goldPin = new THREE.MeshStandardMaterial({
      color: 0xd4af37,
      metalness: 0.95,
      roughness: 0.15
    });

    materials.plasticBlack = new THREE.MeshStandardMaterial({
      color: 0x181c24,
      roughness: 0.6,
      metalness: 0.1
    });

    materials.dhtCyan = new THREE.MeshStandardMaterial({
      color: 0x0099cc,
      roughness: 0.4,
      metalness: 0.1
    });

    materials.solarPanel = new THREE.MeshStandardMaterial({
      color: 0x0d213a,
      metalness: 0.8,
      roughness: 0.15
    });

    materials.lipoBattery = new THREE.MeshStandardMaterial({
      color: 0x1d4ed8,
      roughness: 0.35,
      metalness: 0.1
    });

    materials.motorMetal = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      metalness: 0.85,
      roughness: 0.25
    });

    materials.rainGrid = new THREE.MeshStandardMaterial({
      color: 0xd4af37,
      metalness: 0.95,
      roughness: 0.2
    });

    // Emissive LED Materials
    materials.ledGreen = new THREE.MeshStandardMaterial({
      color: 0x10b981,
      emissive: 0x10b981,
      emissiveIntensity: 1.5,
      roughness: 0.2
    });

    materials.ledRed = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      emissive: 0xef4444,
      emissiveIntensity: 1.8,
      roughness: 0.2
    });

    materials.ledCyan = new THREE.MeshStandardMaterial({
      color: 0x00f0ff,
      emissive: 0x00f0ff,
      emissiveIntensity: 1.8,
      roughness: 0.2
    });

    materials.ledAmber = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: 0xf59e0b,
      emissiveIntensity: 1.6,
      roughness: 0.2
    });

    // 1. Industrial Chassis Baseplate
    const baseplate = createBaseplate();
    stationGroup.add(baseplate);

    // 2. ESP32 Core Gateway
    const esp32 = createESP32Module();
    esp32.position.set(-75, 5, 10);
    stationGroup.add(esp32);
    components.esp32 = esp32;

    // 3. Solar Panel & 3.7V LiPo Battery Subsystem
    const powerSubsystem = createPowerSubsystem();
    powerSubsystem.position.set(-85, 5, -60);
    stationGroup.add(powerSubsystem);
    components.power = powerSubsystem;

    // 4. Testbed Machine Motor for Failure Simulation
    const motorModule = createTestbedMotor();
    motorModule.position.set(25, 5, -50);
    stationGroup.add(motorModule);
    components.motor = motorModule;

    // 5. MPU6050 6-Axis Vibration / Tilt Sensor
    const mpu6050 = createMPU6050Module();
    mpu6050.position.set(25, 5, -15);
    stationGroup.add(mpu6050);
    components.mpu6050 = mpu6050;

    // 6. DHT11 Temperature & Humidity Sensor
    const dht11 = createDHT11Module();
    dht11.position.set(95, 5, -55);
    stationGroup.add(dht11);
    components.dht11 = dht11;

    // 7. Rain & Precipitation Sensor Module
    const rainModule = createRainSensorModule();
    rainModule.position.set(95, 5, 45);
    stationGroup.add(rainModule);
    components.rain = rainModule;

    // 8. Active Piezo Buzzer & Alarm LEDs
    const alarmModule = createAlarmModule();
    alarmModule.position.set(-25, 5, 30);
    stationGroup.add(alarmModule);
    components.alarm = alarmModule;

    // 9. Jumper Wire Harness (Curved Splines)
    const wiringHarness = createWiringHarness();
    stationGroup.add(wiringHarness);
    components.wiring = wiringHarness;

    scene.add(stationGroup);

    // Ground Shadow Plane
    const groundGeo = new THREE.PlaneGeometry(1200, 1200);
    const groundMat = new THREE.ShadowMaterial({ opacity: 0.35 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.5;
    ground.receiveShadow = true;
    scene.add(ground);
  }

  // -------------------------------------------------------------------------
  // 1. CHASSIS BASEPLATE
  // -------------------------------------------------------------------------
  function createBaseplate() {
    const group = new THREE.Group();
    group.name = "baseplate";
    group.userData = { componentKey: "baseplate" };

    // Main Plate (320 x 220 x 8mm)
    const plateGeo = new THREE.BoxGeometry(320, 8, 220);
    const plate = new THREE.Mesh(plateGeo, materials.darkAluminum);
    plate.position.y = 4;
    plate.castShadow = true;
    plate.receiveShadow = true;
    plate.userData = { componentKey: "baseplate" };
    group.add(plate);
    selectableMeshes.push(plate);

    // Rim
    const rimGeo = new THREE.BoxGeometry(324, 2, 224);
    const rim = new THREE.Mesh(rimGeo, materials.plasticBlack);
    rim.position.y = 1;
    rim.receiveShadow = true;
    group.add(rim);

    // 4 Corner Brass Standoff Feet
    const standoffGeo = new THREE.CylinderGeometry(6, 6, 8, 16);
    const corners = [
      [-150, 100],
      [150, 100],
      [-150, -100],
      [150, -100]
    ];
    corners.forEach(([x, z]) => {
      const standoff = new THREE.Mesh(standoffGeo, materials.goldPin);
      standoff.position.set(x, 4, z);
      standoff.castShadow = true;
      group.add(standoff);

      const screw = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 1.5, 12), materials.metalSilver);
      screw.position.set(x, 8.5, z);
      group.add(screw);
    });

    // Alignment Grid Silkscreen
    const gridHelper = new THREE.GridHelper(300, 15, 0x00f0ff, 0x1e2b42);
    gridHelper.position.y = 8.1;
    gridHelper.material.opacity = 0.25;
    gridHelper.material.transparent = true;
    group.add(gridHelper);

    return group;
  }

  // -------------------------------------------------------------------------
  // 2. ESP32 MICROCONTROLLER GATEWAY
  // -------------------------------------------------------------------------
  function createESP32Module() {
    const group = new THREE.Group();
    group.name = "esp32";
    group.userData = { componentKey: "esp32" };

    // Brass Standoffs
    const standGeo = new THREE.CylinderGeometry(2.5, 2.5, 5, 12);
    [[-23, -12], [23, -12], [-23, 12], [23, 12]].forEach(([x, z]) => {
      const stand = new THREE.Mesh(standGeo, materials.goldPin);
      stand.position.set(x, 2.5, z);
      stand.castShadow = true;
      group.add(stand);
    });

    // PCB (52 x 28 x 2.2mm)
    const pcbGeo = new THREE.BoxGeometry(52, 2.2, 28);
    const pcb = new THREE.Mesh(pcbGeo, materials.pcbDark);
    pcb.position.y = 6.1;
    pcb.castShadow = true;
    pcb.receiveShadow = true;
    pcb.userData = { componentKey: "esp32" };
    group.add(pcb);
    selectableMeshes.push(pcb);

    // ESP-WROOM-32 RF Shield (Silver)
    const shieldGeo = new THREE.BoxGeometry(18, 3.5, 25);
    const shield = new THREE.Mesh(shieldGeo, materials.metalSilver);
    shield.position.set(-6, 8.95, 0);
    shield.castShadow = true;
    shield.userData = { componentKey: "esp32" };
    group.add(shield);
    selectableMeshes.push(shield);

    // Gold Antenna Area
    const antGeo = new THREE.BoxGeometry(7, 0.4, 25);
    const antenna = new THREE.Mesh(antGeo, materials.goldPin);
    antenna.position.set(-20.5, 7.3, 0);
    group.add(antenna);

    // Micro-USB Socket
    const usb = new THREE.Mesh(new THREE.BoxGeometry(7, 3.2, 8), materials.metalSilver);
    usb.position.set(24.5, 8, 0);
    usb.castShadow = true;
    group.add(usb);

    // CP2102 IC
    const cpChip = new THREE.Mesh(new THREE.BoxGeometry(5.5, 1.2, 5.5), materials.plasticBlack);
    cpChip.position.set(13, 7.7, 0);
    group.add(cpChip);

    // Dual Header Pin Rows
    const headerBlockGeo = new THREE.BoxGeometry(48, 4, 3);
    const headerTop = new THREE.Mesh(headerBlockGeo, materials.plasticBlack);
    headerTop.position.set(0, 9, -12);
    group.add(headerTop);

    const headerBottom = new THREE.Mesh(headerBlockGeo, materials.plasticBlack);
    headerBottom.position.set(0, 9, 12);
    group.add(headerBottom);

    // Header Golden Pins
    const pinTipGeo = new THREE.CylinderGeometry(0.5, 0.5, 3.5, 6);
    for (let i = -21; i <= 21; i += 3) {
      const pinTop = new THREE.Mesh(pinTipGeo, materials.goldPin);
      pinTop.position.set(i, 12, -12);
      group.add(pinTop);

      const pinBottom = new THREE.Mesh(pinTipGeo, materials.goldPin);
      pinBottom.position.set(i, 12, 12);
      group.add(pinBottom);
    }

    // Power Indicator LED (Red)
    const pwrLed = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.8, 1.6), materials.ledRed);
    pwrLed.position.set(18, 7.6, -7);
    group.add(pwrLed);

    // GPIO 2 Data Telemetry LED (Cyan)
    const dataLed = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.8, 1.6), materials.ledCyan);
    dataLed.position.set(18, 7.6, 7);
    group.add(dataLed);
    materials.esp32DataLed = dataLed;

    return group;
  }

  // -------------------------------------------------------------------------
  // 3. SOLAR PANEL & 3.7V LIPO BATTERY SUBSYSTEM
  // -------------------------------------------------------------------------
  function createPowerSubsystem() {
    const group = new THREE.Group();
    group.name = "power";
    group.userData = { componentKey: "power" };

    // Standoff mount
    const bracketGeo = new THREE.BoxGeometry(45, 12, 6);
    const bracket = new THREE.Mesh(bracketGeo, materials.plasticBlack);
    bracket.position.set(0, 10, -10);
    group.add(bracket);

    // Angled Monocrystalline Solar Panel (60 x 3 x 40mm at 25° tilt)
    const panelFrameGeo = new THREE.BoxGeometry(60, 2.5, 42);
    const panelFrame = new THREE.Mesh(panelFrameGeo, materials.metalSilver);
    panelFrame.position.set(0, 24, -12);
    panelFrame.rotation.x = Math.PI / 8; // 22.5° tilt toward light
    panelFrame.castShadow = true;
    panelFrame.userData = { componentKey: "power" };
    group.add(panelFrame);
    selectableMeshes.push(panelFrame);

    // Solar Photovoltaic Grid Cells
    const cellGeo = new THREE.BoxGeometry(56, 0.8, 38);
    const cells = new THREE.Mesh(cellGeo, materials.solarPanel);
    cells.position.set(0, 25.4, -12);
    cells.rotation.x = Math.PI / 8;
    cells.userData = { componentKey: "power" };
    group.add(cells);
    selectableMeshes.push(cells);

    // 3.7V LiPo Battery Pack (Cylindrical 18650 cell in battery holder)
    const cellHolderGeo = new THREE.BoxGeometry(68, 8, 22);
    const holder = new THREE.Mesh(cellHolderGeo, materials.plasticBlack);
    holder.position.set(0, 7, 18);
    holder.castShadow = true;
    group.add(holder);

    // LiPo Battery Body (Metallic Blue 18650 cell)
    const lipoGeo = new THREE.CylinderGeometry(8.5, 8.5, 62, 24);
    const lipo = new THREE.Mesh(lipoGeo, materials.lipoBattery);
    lipo.rotation.z = Math.PI / 2;
    lipo.position.set(0, 11, 18);
    lipo.castShadow = true;
    lipo.userData = { componentKey: "power" };
    group.add(lipo);
    selectableMeshes.push(lipo);

    // Positive Terminal Button
    const posTerminal = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 2, 16), materials.metalSilver);
    posTerminal.rotation.z = Math.PI / 2;
    posTerminal.position.set(32, 11, 18);
    group.add(posTerminal);

    // TP4056 Solar Charge Controller Breakout Board
    const tp4056Pcb = new THREE.Mesh(new THREE.BoxGeometry(22, 1.8, 14), materials.pcbBlue);
    tp4056Pcb.position.set(0, 7, 34);
    group.add(tp4056Pcb);

    // TP4056 Charging Status LEDs (Red = Charging, Green = Full)
    const chgLed = new THREE.Mesh(new THREE.BoxGeometry(1, 0.6, 1), materials.ledAmber);
    chgLed.position.set(-6, 8.2, 34);
    group.add(chgLed);

    const fullLed = new THREE.Mesh(new THREE.BoxGeometry(1, 0.6, 1), materials.ledGreen);
    fullLed.position.set(6, 8.2, 34);
    group.add(fullLed);
    materials.bmsFullLed = fullLed;

    return group;
  }

  // -------------------------------------------------------------------------
  // 4. TESTBED MOTOR FOR FAILURE SIMULATION
  // -------------------------------------------------------------------------
  function createTestbedMotor() {
    const group = new THREE.Group();
    group.name = "motor";
    group.userData = { componentKey: "motor" };

    // Heavy Anodized Aluminum Mounting Bracket
    const bracketGeo = new THREE.BoxGeometry(32, 18, 36);
    const bracket = new THREE.Mesh(bracketGeo, materials.plasticBlack);
    bracket.position.set(0, 12, 0);
    bracket.castShadow = true;
    bracket.userData = { componentKey: "motor" };
    group.add(bracket);
    selectableMeshes.push(bracket);

    // Motor Standoff Screws
    [[-12, -14], [12, -14], [-12, 14], [12, 14]].forEach(([x, z]) => {
      const screw = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 2, 12), materials.metalSilver);
      screw.position.set(x, 21.5, z);
      group.add(screw);
    });

    // Cylindrical Motor Body (30mm Diameter DC motor)
    const motorCylGeo = new THREE.CylinderGeometry(14, 14, 45, 24);
    const motorCyl = new THREE.Mesh(motorCylGeo, materials.motorMetal);
    motorCyl.rotation.x = Math.PI / 2;
    motorCyl.position.set(0, 14, 0);
    motorCyl.castShadow = true;
    motorCyl.userData = { componentKey: "motor" };
    group.add(motorCyl);
    selectableMeshes.push(motorCyl);

    // Rotating Output Shaft (Extends toward front)
    const shaftGeo = new THREE.CylinderGeometry(2, 2, 18, 16);
    const shaft = new THREE.Mesh(shaftGeo, materials.metalSilver);
    shaft.rotation.x = Math.PI / 2;
    shaft.position.set(0, 14, 28);
    shaft.castShadow = true;
    group.add(shaft);
    motorShaftMesh = shaft;

    // Eccentric Unbalanced Flywheel / Weight (for vibration induction)
    const eccentricGroup = new THREE.Group();
    eccentricGroup.position.set(0, 14, 34);

    const hubGeo = new THREE.CylinderGeometry(4.5, 4.5, 4, 16);
    const hub = new THREE.Mesh(hubGeo, materials.metalSilver);
    hub.rotation.x = Math.PI / 2;
    eccentricGroup.add(hub);

    // Off-center brass counterweight (produces harmonic centrifugal vibration)
    const weightGeo = new THREE.CylinderGeometry(4, 4, 4, 16);
    const weight = new THREE.Mesh(weightGeo, materials.goldPin);
    weight.rotation.x = Math.PI / 2;
    weight.position.set(6.5, 0, 0); // Off-center
    weight.castShadow = true;
    eccentricGroup.add(weight);

    group.add(eccentricGroup);
    motorEccentricMesh = eccentricGroup;

    // Motor Driver MOSFET Circuit Board (Small black PCB)
    const mosfetPcb = new THREE.Mesh(new THREE.BoxGeometry(16, 1.8, 14), materials.pcbDark);
    mosfetPcb.position.set(0, 5, -28);
    group.add(mosfetPcb);

    // Power Heat Sink on MOSFET
    const heatsink = new THREE.Mesh(new THREE.BoxGeometry(10, 6, 8), materials.darkAluminum);
    heatsink.position.set(0, 9, -28);
    group.add(heatsink);

    return group;
  }

  // -------------------------------------------------------------------------
  // 5. MPU6050 6-AXIS VIBRATION & TILT SENSOR
  // -------------------------------------------------------------------------
  function createMPU6050Module() {
    const group = new THREE.Group();
    group.name = "mpu6050";
    group.userData = { componentKey: "mpu6050" };

    // Brass Standoffs directly adjacent to motor mount
    [[-8, -5], [8, -5], [-8, 5], [8, 5]].forEach(([x, z]) => {
      const s = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, 5, 12), materials.goldPin);
      s.position.set(x, 2.5, z);
      group.add(s);
    });

    // GY-521 Breakout PCB (20 x 15 x 1.8mm)
    const pcbGeo = new THREE.BoxGeometry(20, 1.8, 15);
    const pcb = new THREE.Mesh(pcbGeo, materials.pcbBlue);
    pcb.position.y = 5.9;
    pcb.castShadow = true;
    pcb.userData = { componentKey: "mpu6050" };
    group.add(pcb);
    selectableMeshes.push(pcb);

    // MPU-6050 QFN-24 Chip (Black ceramic package with gold marking)
    const chipGeo = new THREE.BoxGeometry(6, 1.2, 6);
    const chip = new THREE.Mesh(chipGeo, materials.plasticBlack);
    chip.position.set(0, 7.4, 0);
    chip.castShadow = true;
    chip.userData = { componentKey: "mpu6050" };
    group.add(chip);
    selectableMeshes.push(chip);

    // Axis Orientation Silkscreen Plate (X, Y, Z indicator)
    const axisP = new THREE.Mesh(new THREE.BoxGeometry(10, 0.1, 4), materials.goldPin);
    axisP.position.set(0, 7.0, -4);
    group.add(axisP);

    // Header Pins (8-pin header: VCC, GND, SCL, SDA, XDA, XCL, AD0, INT)
    const pinBlock = new THREE.Mesh(new THREE.BoxGeometry(18, 3, 2.5), materials.plasticBlack);
    pinBlock.position.set(0, 8, 6);
    group.add(pinBlock);

    for (let i = -7; i <= 7; i += 2) {
      const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 3.5, 6), materials.goldPin);
      pin.position.set(i, 10, 6);
      group.add(pin);
    }

    // Power Indicator LED (Red)
    const mpuLed = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.6, 1), materials.ledRed);
    mpuLed.position.set(-6, 7.2, -4);
    group.add(mpuLed);

    return group;
  }

  // -------------------------------------------------------------------------
  // 6. DHT11 TEMPERATURE & HUMIDITY SENSOR MODULE
  // -------------------------------------------------------------------------
  function createDHT11Module() {
    const group = new THREE.Group();
    group.name = "dht11";
    group.userData = { componentKey: "dht11" };

    // Standoffs
    [[-6, -10], [6, -10]].forEach(([x, z]) => {
      const s = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 5, 12), materials.goldPin);
      s.position.set(x, 2.5, z);
      group.add(s);
    });

    // Breakout PCB
    const pcbGeo = new THREE.BoxGeometry(16, 1.8, 28);
    const pcb = new THREE.Mesh(pcbGeo, materials.pcbBlue);
    pcb.position.y = 5.9;
    pcb.castShadow = true;
    pcb.userData = { componentKey: "dht11" };
    group.add(pcb);
    selectableMeshes.push(pcb);

    // Blue Slotted Plastic Shell
    const dhtBodyGeo = new THREE.BoxGeometry(12, 6.5, 16);
    const dhtBody = new THREE.Mesh(dhtBodyGeo, materials.dhtCyan);
    dhtBody.position.set(0, 10, -4);
    dhtBody.castShadow = true;
    dhtBody.userData = { componentKey: "dht11" };
    group.add(dhtBody);
    selectableMeshes.push(dhtBody);

    // Air Vent Slot Insets
    const slotGeo = new THREE.BoxGeometry(9, 0.8, 1.8);
    [-2, 0, 2].forEach((offsetY) => {
      const slot = new THREE.Mesh(slotGeo, materials.plasticBlack);
      slot.position.set(0, 10 + offsetY, -4 + 8.1);
      group.add(slot);
    });

    // 3 Header Pins (VCC, DATA, GND)
    const pinBlock = new THREE.Mesh(new THREE.BoxGeometry(10, 3, 3), materials.plasticBlack);
    pinBlock.position.set(0, 8, 10);
    group.add(pinBlock);

    for (let i = -3; i <= 3; i += 3) {
      const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 4, 8), materials.goldPin);
      pin.position.set(i, 10.5, 10);
      group.add(pin);
    }

    // Power LED
    const dhtLed = new THREE.Mesh(new THREE.BoxGeometry(1, 0.6, 1.2), materials.ledGreen);
    dhtLed.position.set(4, 7, 6);
    group.add(dhtLed);
    materials.dhtLed = dhtLed;

    return group;
  }

  // -------------------------------------------------------------------------
  // 7. RAIN & PRECIPITATION SENSOR MODULE
  // -------------------------------------------------------------------------
  function createRainSensorModule() {
    const group = new THREE.Group();
    group.name = "rain";
    group.userData = { componentKey: "rain" };

    // 4 Standoffs
    [[-20, -15], [20, -15], [-20, 15], [20, 15]].forEach(([x, z]) => {
      const s = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 5, 12), materials.goldPin);
      s.position.set(x, 2.5, z);
      group.add(s);
    });

    // Rain Detection Plate (48 x 1.6 x 36mm)
    const plateGeo = new THREE.BoxGeometry(48, 1.6, 36);
    const plate = new THREE.Mesh(plateGeo, materials.pcbDark);
    plate.position.y = 5.8;
    plate.castShadow = true;
    plate.userData = { componentKey: "rain" };
    group.add(plate);
    selectableMeshes.push(plate);

    // Gold-Plated Interdigitated Serpentine Tracks
    const trackGeo = new THREE.BoxGeometry(42, 0.3, 1.5);
    for (let z = -12; z <= 12; z += 3.5) {
      const track = new THREE.Mesh(trackGeo, materials.rainGrid);
      track.position.set(0, 6.7, z);
      group.add(track);
    }

    // Connecting bridge rails
    const railLeft = new THREE.Mesh(new THREE.BoxGeometry(2, 0.3, 26), materials.rainGrid);
    railLeft.position.set(-20, 6.7, 0);
    group.add(railLeft);

    const railRight = new THREE.Mesh(new THREE.BoxGeometry(2, 0.3, 26), materials.rainGrid);
    railRight.position.set(20, 6.7, 0);
    group.add(railRight);

    // Comparator Amplifier Breakout Board (LM393)
    const compBoard = new THREE.Mesh(new THREE.BoxGeometry(24, 1.8, 14), materials.pcbBlue);
    compBoard.position.set(0, 7, -26);
    group.add(compBoard);

    // Blue Sensitivity Potentiometer Trim Pot
    const pot = new THREE.Mesh(new THREE.BoxGeometry(5, 4.5, 5), new THREE.MeshStandardMaterial({ color: 0x0284c7 }));
    pot.position.set(-4, 9.8, -26);
    group.add(pot);

    // Header Pins
    for (let i = -4.5; i <= 4.5; i += 3) {
      const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 4, 8), materials.goldPin);
      pin.position.set(i, 9.5, -32);
      group.add(pin);
    }

    // Power & Digital Output Status LEDs
    const rainPwrLed = new THREE.Mesh(new THREE.BoxGeometry(1, 0.6, 1.2), materials.ledRed);
    rainPwrLed.position.set(5, 8.2, -28);
    group.add(rainPwrLed);

    const rainOutLed = new THREE.Mesh(new THREE.BoxGeometry(1, 0.6, 1.2), materials.ledGreen);
    rainOutLed.position.set(5, 8.2, -24);
    group.add(rainOutLed);
    materials.rainOutLed = rainOutLed;

    return group;
  }

  // -------------------------------------------------------------------------
  // 8. ACTIVE BUZZER & ALARM INDICATOR LEDS
  // -------------------------------------------------------------------------
  function createAlarmModule() {
    const group = new THREE.Group();
    group.name = "alarm";
    group.userData = { componentKey: "alarm" };

    // Small Breakout PCB
    const pcbGeo = new THREE.BoxGeometry(28, 1.8, 24);
    const pcb = new THREE.Mesh(pcbGeo, materials.pcbDark);
    pcb.position.y = 5.9;
    pcb.castShadow = true;
    pcb.userData = { componentKey: "alarm" };
    group.add(pcb);
    selectableMeshes.push(pcb);

    // Active Piezo Buzzer (Black cylinder with sound aperture)
    const buzzerGeo = new THREE.CylinderGeometry(6, 6, 9, 24);
    const buzzer = new THREE.Mesh(buzzerGeo, materials.plasticBlack);
    buzzer.position.set(-6, 11.4, 0);
    buzzer.castShadow = true;
    buzzer.userData = { componentKey: "alarm" };
    group.add(buzzer);
    selectableMeshes.push(buzzer);

    // Sound Aperture Hole
    const hole = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.5, 12), materials.darkAluminum);
    hole.position.set(-6, 16.1, 0);
    group.add(hole);

    // High-Intensity Alarm Warning LED (Red dome)
    const ledDomeGeo = new THREE.SphereGeometry(3.5, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    const alarmLed = new THREE.Mesh(ledDomeGeo, materials.ledRed);
    alarmLed.position.set(6, 6.8, -4);
    alarmLed.castShadow = true;
    alarmLed.userData = { componentKey: "alarm" };
    group.add(alarmLed);
    materials.alarmVisualLed = alarmLed;

    // Normal Status OK LED (Green dome)
    const okLed = new THREE.Mesh(ledDomeGeo, materials.ledGreen);
    okLed.position.set(6, 6.8, 5);
    okLed.castShadow = true;
    group.add(okLed);
    materials.okVisualLed = okLed;

    return group;
  }

  // -------------------------------------------------------------------------
  // 9. JUMPER WIRE HARNESS (CURVED SPLINES)
  // -------------------------------------------------------------------------
  function createWiringHarness() {
    const harnessGroup = new THREE.Group();
    harnessGroup.name = "wiringHarness";

    const wireSpecs = [
      // 1. Red Wire (5V Power Bus: Battery BMS -> ESP32 VIN & Motor)
      {
        color: 0xd9383a,
        points: [
          new THREE.Vector3(-85, 12, -40),
          new THREE.Vector3(-80, 24, -15),
          new THREE.Vector3(-60, 20, 5),
          new THREE.Vector3(-55, 12, 12)
        ]
      },
      // 2. Black Wire (Common Ground Bus)
      {
        color: 0x1e2430,
        points: [
          new THREE.Vector3(-85, 12, -35),
          new THREE.Vector3(-70, 22, -10),
          new THREE.Vector3(-60, 18, -12),
          new THREE.Vector3(-55, 12, -12)
        ]
      },
      // 3. Yellow Wire (DHT11 Data -> GPIO 4)
      {
        color: 0xfacc15,
        points: [
          new THREE.Vector3(-60, 12, -12),
          new THREE.Vector3(-15, 26, -35),
          new THREE.Vector3(50, 24, -50),
          new THREE.Vector3(92, 11, -45)
        ]
      },
      // 4. Cyan Wire (MPU6050 I2C SDA -> GPIO 21)
      {
        color: 0x00f0ff,
        points: [
          new THREE.Vector3(-62, 12, 12),
          new THREE.Vector3(-25, 22, 5),
          new THREE.Vector3(5, 18, -5),
          new THREE.Vector3(25, 11, -10)
        ]
      },
      // 5. Blue Wire (MPU6050 I2C SCL -> GPIO 22)
      {
        color: 0x3b82f6,
        points: [
          new THREE.Vector3(-65, 12, 12),
          new THREE.Vector3(-30, 24, 8),
          new THREE.Vector3(0, 20, -2),
          new THREE.Vector3(25, 11, -8)
        ]
      },
      // 6. Purple Wire (Motor PWM Gate -> GPIO 18)
      {
        color: 0xa855f7,
        points: [
          new THREE.Vector3(-68, 12, -12),
          new THREE.Vector3(-25, 26, -42),
          new THREE.Vector3(10, 24, -48),
          new THREE.Vector3(25, 10, -42)
        ]
      },
      // 7. Green Wire (Rain Sensor Analog ADC -> GPIO 34)
      {
        color: 0x10b981,
        points: [
          new THREE.Vector3(-60, 12, 12),
          new THREE.Vector3(-10, 26, 25),
          new THREE.Vector3(50, 22, 35),
          new THREE.Vector3(92, 11, 20)
        ]
      },
      // 8. Orange Wire (Active Buzzer Trigger -> GPIO 19)
      {
        color: 0xf97316,
        points: [
          new THREE.Vector3(-62, 12, 12),
          new THREE.Vector3(-45, 18, 22),
          new THREE.Vector3(-25, 12, 28)
        ]
      }
    ];

    wireSpecs.forEach((spec) => {
      const curve = new THREE.CatmullRomCurve3(spec.points);
      const tubeGeo = new THREE.TubeGeometry(curve, 32, 0.75, 8, false);
      const wireMat = new THREE.MeshStandardMaterial({
        color: spec.color,
        roughness: 0.5,
        metalness: 0.1
      });
      const tube = new THREE.Mesh(tubeGeo, wireMat);
      tube.castShadow = true;
      harnessGroup.add(tube);
    });

    return harnessGroup;
  }

  // -------------------------------------------------------------------------
  // INTERACTION: RAYCASTING & COMPONENT INSPECTION
  // -------------------------------------------------------------------------
  function initEvents() {
    window.addEventListener("resize", onWindowResize);

    canvasEl.addEventListener("mousemove", onMouseMove);
    canvasEl.addEventListener("click", onClick);
    canvasEl.addEventListener("touchstart", onTouchStart, { passive: true });
  }

  function onMouseMove(event) {
    const rect = canvasEl.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    checkRaycastHover();
  }

  function onTouchStart(event) {
    if (event.touches.length === 1) {
      const rect = canvasEl.getBoundingClientRect();
      mouse.x = ((event.touches[0].clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.touches[0].clientY - rect.top) / rect.height) * 2 + 1;
      checkRaycastHover();
    }
  }

  function checkRaycastHover() {
    if (!camera || !selectableMeshes.length) return;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(selectableMeshes, false);

    if (intersects.length > 0) {
      const hit = intersects[0].object;
      const compKey = hit.userData.componentKey;
      if (compKey && compKey !== "baseplate") {
        canvasEl.style.cursor = "pointer";
        hoveredComponent = compKey;
        return;
      }
    }

    canvasEl.style.cursor = "default";
    hoveredComponent = null;
  }

  function onClick() {
    if (hoveredComponent && hoveredComponent !== "baseplate") {
      inspectComponent(hoveredComponent);
    }
  }

  function inspectComponent(componentKey) {
    const meta = COMPONENT_METADATA[componentKey];
    if (!meta) return;

    selectedComponent = componentKey;

    if (meta.targetCamera) {
      animateCameraTo(meta.targetCamera.pos, meta.targetCamera.lookAt);
    }

    const inspector = document.getElementById("componentInspectorCard");
    if (!inspector) return;

    document.getElementById("inspCompName").textContent = meta.name;
    document.getElementById("inspCompCategory").textContent = meta.category;
    document.getElementById("inspCompPinout").textContent = meta.pinout;
    document.getElementById("inspCompVoltage").textContent = meta.voltage;
    document.getElementById("inspCompSpecs").textContent = meta.specs;
    document.getElementById("inspCompRole").textContent = meta.role;

    updateInspectorLiveSnippet();

    inspector.classList.remove("hidden");
    inspector.classList.add("show");
  }

  function updateInspectorLiveSnippet() {
    const snippetEl = document.getElementById("inspCompLiveTelemetry");
    if (!snippetEl || !selectedComponent) return;

    if (!currentReadings) {
      snippetEl.innerHTML = `<span class="muted">No telemetry received yet.</span>`;
      return;
    }

    if (selectedComponent === "esp32") {
      snippetEl.innerHTML = `
        <div class="insp-stat-grid">
          <div><small>Node ID</small><strong>${currentReadings.machine_id}</strong></div>
          <div><small>Data Source</small><strong class="${currentReadings.is_simulated ? "text-cyan" : "text-green"}">${currentReadings.is_simulated ? "Demo Simulation" : "Supabase Live"}</strong></div>
          <div><small>Sampling</small><strong>5000 ms</strong></div>
          <div><small>Timestamp</small><strong>${new Date(currentReadings.recorded_at).toLocaleTimeString()}</strong></div>
        </div>
      `;
    } else if (selectedComponent === "power") {
      const battPct = Math.min(100, Math.max(0, Math.round(((currentReadings.battery_volts || 3.9) - 3.2) / (4.2 - 3.2) * 100)));
      snippetEl.innerHTML = `
        <div class="insp-stat-grid">
          <div><small>LiPo Battery</small><strong>${(currentReadings.battery_volts || 3.92).toFixed(2)} V (${battPct}%)</strong></div>
          <div><small>Solar Input</small><strong>${(currentReadings.solar_volts || 5.45).toFixed(2)} V</strong></div>
          <div><small>Power State</small><strong class="text-green">● Solar Harvesting Active</strong></div>
          <div><small>BMS Cutoff</small><strong>3.00 V (DW01A)</strong></div>
        </div>
      `;
    } else if (selectedComponent === "motor") {
      const isWarn = currentReadings.vibration >= currentThresholds.vibration;
      snippetEl.innerHTML = `
        <div class="insp-stat-grid">
          <div><small>Motor Speed</small><strong>${currentReadings.motor_rpm || 1450} RPM</strong></div>
          <div><small>Vibration Mode</small><strong class="${isWarn ? "text-amber" : "text-green"}">${isWarn ? "▲ Simulated Bearing Wear" : "● Balanced Nominal"}</strong></div>
          <div><small>Drive PWM</small><strong>GPIO 18 (MOSFET)</strong></div>
          <div><small>Failure Testbed</small><strong>Eccentric Weight Active</strong></div>
        </div>
      `;
    } else if (selectedComponent === "mpu6050") {
      snippetEl.innerHTML = `
        <div class="insp-stat-grid">
          <div><small>RMS Vibration</small><strong>${(currentReadings.vibration || 0.42).toFixed(2)} g</strong></div>
          <div><small>Chassis Tilt</small><strong>${(currentReadings.tilt_angle || 1.4).toFixed(1)}°</strong></div>
          <div><small>Warn Threshold</small><strong>${currentThresholds.vibration} g</strong></div>
          <div><small>Interface</small><strong>I2C (0x68) · 400kHz</strong></div>
        </div>
      `;
    } else if (selectedComponent === "dht11") {
      snippetEl.innerHTML = `
        <div class="insp-stat-grid">
          <div><small>Temperature</small><strong>${currentReadings.temperature != null ? currentReadings.temperature.toFixed(1) + " °C" : "--"}</strong></div>
          <div><small>Humidity</small><strong>${currentReadings.humidity != null ? currentReadings.humidity + " % RH" : "--"}</strong></div>
          <div><small>Temp Threshold</small><strong>${currentThresholds.temp} °C</strong></div>
          <div><small>Hum Threshold</small><strong>${currentThresholds.humidity} %</strong></div>
        </div>
      `;
    } else if (selectedComponent === "rain") {
      const rainVal = currentReadings.rain_level != null ? currentReadings.rain_level : 0;
      snippetEl.innerHTML = `
        <div class="insp-stat-grid">
          <div><small>Rainfall Level</small><strong>${rainVal}%</strong></div>
          <div><small>Surface State</small><strong class="${rainVal > 20 ? "text-cyan" : "text-green"}">${rainVal > 50 ? "▲ Heavy Rain" : rainVal > 20 ? "● Light Moisture" : "● Dry Chamber"}</strong></div>
          <div><small>Threshold</small><strong>${currentThresholds.rain}%</strong></div>
          <div><small>Analog Pin</small><strong>GPIO 34 (ADC1)</strong></div>
        </div>
      `;
    } else if (selectedComponent === "alarm") {
      const isBreached = currentReadings.vibration >= currentThresholds.vibration ||
                         currentReadings.temperature >= currentThresholds.temp ||
                         (currentReadings.rain_level || 0) >= currentThresholds.rain;
      snippetEl.innerHTML = `
        <div class="insp-stat-grid">
          <div><small>Active Buzzer</small><strong class="${isBreached ? "text-amber" : "text-green"}">${isBreached ? "🔔 SOUNDING ALARM" : "● Standby (Silent)"}</strong></div>
          <div><small>Alarm LED</small><strong class="${isBreached ? "text-amber" : "text-green"}">${isBreached ? "▲ FLASHING RED" : "● GREEN STEADY"}</strong></div>
          <div><small>Buzzer Pin</small><strong>GPIO 19</strong></div>
          <div><small>Alarm LED Pin</small><strong>GPIO 2</strong></div>
        </div>
      `;
    }
  }

  function closeInspector() {
    const inspector = document.getElementById("componentInspectorCard");
    if (inspector) {
      inspector.classList.remove("show");
      inspector.classList.add("hidden");
    }
    selectedComponent = null;
    resetCameraView();
  }

  // -------------------------------------------------------------------------
  // CAMERA VIEW PRESETS & ANIMATIONS
  // -------------------------------------------------------------------------
  function animateCameraTo(targetPos, targetLookAt) {
    targetCameraPos = targetPos.clone();
    targetControlsTarget = targetLookAt.clone();
    cameraTransitionProgress = 0;
  }

  function setCameraPreset(presetName) {
    if (presetName === "isometric") {
      animateCameraTo(new THREE.Vector3(0, 165, 230), new THREE.Vector3(0, 5, 0));
    } else if (presetName === "top") {
      animateCameraTo(new THREE.Vector3(0, 260, 0.1), new THREE.Vector3(0, 5, 0));
    } else if (COMPONENT_METADATA[presetName]) {
      inspectComponent(presetName);
    }
  }

  function resetCameraView() {
    setCameraPreset("isometric");
  }

  // -------------------------------------------------------------------------
  // TOGGLE FEATURES (Exploded, Wireframe, Auto-Rotate, HUD)
  // -------------------------------------------------------------------------
  function toggleExplodedView(active) {
    isExploded = active !== undefined ? active : !isExploded;
    const yOffset = isExploded ? 24 : 0;

    if (components.esp32) components.esp32.position.y = 5 + yOffset;
    if (components.power) components.power.position.y = 5 + yOffset * 1.3;
    if (components.motor) components.motor.position.y = 5 + yOffset * 0.9;
    if (components.mpu6050) components.mpu6050.position.y = 5 + yOffset * 1.1;
    if (components.dht11) components.dht11.position.y = 5 + yOffset * 1.2;
    if (components.rain) components.rain.position.y = 5 + yOffset * 1.1;
    if (components.alarm) components.alarm.position.y = 5 + yOffset * 1.0;
    if (components.wiring) components.wiring.position.y = yOffset * 0.5;

    return isExploded;
  }

  function toggleWireframe(active) {
    isWireframe = active !== undefined ? active : !isWireframe;
    Object.values(materials).forEach((mat) => {
      if (mat && mat.isMaterial && mat !== materials.darkAluminum) {
        mat.wireframe = isWireframe;
      }
    });
    return isWireframe;
  }

  function toggleAutoRotate(active) {
    isAutoRotate = active !== undefined ? active : !isAutoRotate;
    if (controls) {
      controls.autoRotate = isAutoRotate;
      controls.autoRotateSpeed = 1.0;
    }
    return isAutoRotate;
  }

  function toggleHudTags(active) {
    showHudTags = active !== undefined ? active : !showHudTags;
    if (hudLayerEl) {
      hudLayerEl.style.display = showHudTags ? "block" : "none";
    }
    return showHudTags;
  }

  // -------------------------------------------------------------------------
  // TELEMETRY BINDING & FLOATING 3D HUD TAGS
  // -------------------------------------------------------------------------
  function updateTelemetry(reading, thresholds) {
    if (!reading) return;

    currentReadings = reading;
    if (thresholds) currentThresholds = thresholds;

    // 1. Flash ESP32 GPIO 2 Data LED
    if (materials.esp32DataLed) {
      materials.esp32DataLed.material.emissiveIntensity = 3.0;
      setTimeout(() => {
        if (materials.esp32DataLed) {
          materials.esp32DataLed.material.emissiveIntensity = 1.8;
        }
      }, 300);
    }

    // 2. Adjust Motor Failure Simulation speed
    if (reading.motor_rpm) {
      motorSpeed = Math.max(0.02, Math.min(0.25, (reading.motor_rpm / 1500) * 0.08));
    }

    // 3. Status Alarm LEDs & Buzzer indicator
    const isAlarmTriggered = (reading.vibration && reading.vibration >= currentThresholds.vibration) ||
                             (reading.temperature && reading.temperature >= currentThresholds.temp) ||
                             ((reading.rain_level || 0) >= currentThresholds.rain);

    if (materials.alarmVisualLed) {
      materials.alarmVisualLed.material.emissiveIntensity = isAlarmTriggered ? 3.5 : 0.2;
    }

    if (materials.rainOutLed && reading.rain_level != null) {
      materials.rainOutLed.material = reading.rain_level > currentThresholds.rain ? materials.ledCyan : materials.ledGreen;
    }

    if (materials.dhtLed && reading.temperature != null) {
      const isTempWarn = reading.temperature >= currentThresholds.temp || (reading.humidity && reading.humidity >= currentThresholds.humidity);
      materials.dhtLed.material = isTempWarn ? materials.ledAmber : materials.ledGreen;
    }

    // 4. Update Screen-Space Floating HUD Tags
    updateHudTagContent(reading);

    // 5. Update Inspector if open
    updateInspectorLiveSnippet();
  }

  function updateHudTagContent(r) {
    const tagEsp32 = document.getElementById("hudTagEsp32");
    const tagPower = document.getElementById("hudTagPower");
    const tagMotor = document.getElementById("hudTagMotor");
    const tagMpu = document.getElementById("hudTagMpu6050");
    const tagDht = document.getElementById("hudTagDht11");
    const tagRain = document.getElementById("hudTagRain");

    if (tagEsp32) {
      tagEsp32.querySelector(".tag-value").textContent = `${r.machine_id} · ${r.is_simulated ? "Demo" : "Live"}`;
    }

    if (tagPower) {
      const battV = (r.battery_volts || 3.92).toFixed(2);
      const battPct = Math.min(100, Math.max(0, Math.round(((r.battery_volts || 3.9) - 3.2) / (4.2 - 3.2) * 100)));
      tagPower.querySelector(".tag-value").textContent = `${battV}V · ${battPct}% LiPo`;
    }

    if (tagMotor) {
      const rpm = r.motor_rpm || 1450;
      tagMotor.querySelector(".tag-value").textContent = `${rpm} RPM · Active`;
    }

    if (tagMpu) {
      const vib = (r.vibration || 0.42).toFixed(2);
      tagMpu.querySelector(".tag-value").textContent = `${vib}g RMS Vib`;
      const isWarn = r.vibration >= currentThresholds.vibration;
      tagMpu.classList.toggle("warn", Boolean(isWarn));
    }

    if (tagDht) {
      const tVal = r.temperature != null ? r.temperature.toFixed(1) + "°C" : "--";
      const hVal = r.humidity != null ? r.humidity + "%" : "--";
      tagDht.querySelector(".tag-value").textContent = `${tVal} · ${hVal}`;
      const isWarn = r.temperature >= currentThresholds.temp || r.humidity >= currentThresholds.humidity;
      tagDht.classList.toggle("warn", Boolean(isWarn));
    }

    if (tagRain) {
      const rainVal = r.rain_level != null ? r.rain_level : 0;
      tagRain.querySelector(".tag-value").textContent = rainVal > 20 ? `${rainVal}% Rain Detected` : "Dry Surface";
      const isWarn = rainVal >= currentThresholds.rain;
      tagRain.classList.toggle("warn", Boolean(isWarn));
    }
  }

  // Project 3D Positions to 2D HUD Screen Elements
  function updateFloatingHudPositions() {
    if (!showHudTags || !hudLayerEl || !camera) return;

    const anchorPositions = {
      hudTagEsp32: new THREE.Vector3(-75, 20, 10),
      hudTagPower: new THREE.Vector3(-85, 34, -60),
      hudTagMotor: new THREE.Vector3(25, 28, -50),
      hudTagMpu6050: new THREE.Vector3(25, 18, -15),
      hudTagDht11: new THREE.Vector3(95, 20, -55),
      hudTagRain: new THREE.Vector3(95, 18, 45)
    };

    const width = containerEl.clientWidth;
    const height = containerEl.clientHeight;
    const tempVec = new THREE.Vector3();

    for (const [id, pos3D] of Object.entries(anchorPositions)) {
      const el = document.getElementById(id);
      if (!el) continue;

      tempVec.copy(pos3D);
      tempVec.project(camera);

      if (tempVec.z < 1) {
        const screenX = (tempVec.x * 0.5 + 0.5) * width;
        const screenY = (-tempVec.y * 0.5 + 0.5) * height;

        el.style.transform = `translate(-50%, -100%) translate(${screenX}px, ${screenY - 14}px)`;
        el.style.opacity = "1";
      } else {
        el.style.opacity = "0";
      }
    }
  }

  // -------------------------------------------------------------------------
  // RENDER LOOP & LIFECYCLE
  // -------------------------------------------------------------------------
  function render() {
    if (!isRunning) return;

    animationFrameId = requestAnimationFrame(render);

    // Animate motor shaft and eccentric flywheel rotation
    if (motorShaftMesh && motorEccentricMesh) {
      motorEccentricMesh.rotation.z += motorSpeed;
    }

    // Camera Smooth Tweening
    if (targetCameraPos && targetControlsTarget && cameraTransitionProgress < 1) {
      cameraTransitionProgress += 0.045;
      camera.position.lerp(targetCameraPos, 0.12);
      if (controls) {
        controls.target.lerp(targetControlsTarget, 0.12);
      }

      if (cameraTransitionProgress >= 0.98) {
        camera.position.copy(targetCameraPos);
        if (controls) controls.target.copy(targetControlsTarget);
        targetCameraPos = null;
        targetControlsTarget = null;
      }
    }

    if (controls) {
      controls.update();
    }

    // Screen-space 2D HUD projection update
    updateFloatingHudPositions();

    renderer.render(scene, camera);
  }

  function resume() {
    if (!isRunning && isInitialized) {
      isRunning = true;
      render();
    }
  }

  function pause() {
    if (isRunning) {
      isRunning = false;
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
    }
  }

  function onWindowResize() {
    if (!camera || !renderer || !containerEl) return;

    const width = containerEl.clientWidth;
    const height = containerEl.clientHeight;

    if (width === 0 || height === 0) return;

    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  }

  return {
    init,
    resume,
    pause,
    updateTelemetry,
    setCameraPreset,
    resetCameraView,
    inspectComponent,
    closeInspector,
    toggleExplodedView,
    toggleWireframe,
    toggleAutoRotate,
    toggleHudTags,
    onWindowResize
  };
})();
