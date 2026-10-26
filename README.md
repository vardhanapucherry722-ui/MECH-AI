# MECH AI — Industrial IoT Environmental & Machine Health Digital Twin

> **Enterprise-Grade Environmental Telemetry, Predictive Vibration Diagnostics & Machine Testbed Platform**  
> Powered by ESP32 microcontrollers, 3D procedural digital twin (Three.js), multi-sensor telemetry (Solar/LiPo, DHT11, Rain, MPU6050, DC Testbed Motor, Buzzer, LED), and Supabase Cloud PostgreSQL with Edge Function ingestion.

---

## 1. Project Overview

**MECH AI** is a production-grade IoT environmental monitoring and predictive maintenance console designed for industrial machine rooms, outdoor solar testbeds, automated manufacturing cells, and automated test stations. The platform collects, processes, and visualizes real-time telemetry from physical hardware sensors and an active mechanical failure testbed:

1. **Solar Harvesting & 3.7V LiPo Battery (TP4056 BMS)** — Solar irradiance input (mW), battery charge level (V / %), charging/discharging state.
2. **DHT11 Microclimate Sensor** — Ambient Temperature (°C) & Relative Humidity (% RH).
3. **Rain Sensor Module** — Conductive gold/nickel serpentine detection plate + LM393 comparator (0–100% precipitation index).
4. **MPU6050 6-Axis IMU (Vibration & Tilt)** — Triple-axis accelerometer and gyroscope measuring mechanical vibration RMS (g) and structural tilt (°).
5. **Testbed Motor for Failure Simulation** — 12V/6V DC variable-speed motor equipped with an eccentric counterweight to induce mechanical imbalance, bearing wear, and resonance vibration.
6. **Active Audio-Visual Alarm Station** — High-intensity red alarm LED & 2.4kHz active piezo buzzer with hardware trigger.
7. **ESP32-WROOM-32D Gateway Core** — 240MHz dual-core microcontroller orchestrating sensor sampling, Edge Wi-Fi telemetry, and local closed-loop safety cutoffs.

---

## 2. Platform Architecture & Features

### A. 3D Industrial Digital Twin (`digital-twin.js`)
Built with procedurally generated Three.js geometry, physically plausible PBR materials, dynamic lighting, and real-time animation:
- **Chassis & Standoffs:** Anodized 6061-T6 aluminum baseplate with brass M2.5 hexagonal standoffs and laser silkscreen alignment grid.
- **ESP32 Core Board:** Matte black FR4 PCB, brushed metal RF shield can, inverted-F PCB antenna traces, dual 2x15 header pins, power LED, and pulsing cyan GPIO2 transmission LED.
- **Monocrystalline Solar Panel & 18650 LiPo Cell:** Angled solar collector with solar busbar grid, cylindrical LiPo cell in battery cradle, and TP4056 BMS breakout with dual charge status LEDs.
- **DC Testbed Motor & Eccentric Counterweight:** Cylindrical motor housing, zinc-plated mounting bracket, rotating axle, and brass eccentric counterweight that spins dynamically based on measured motor RPM and induces visual chassis vibration when unbalance spikes.
- **MPU6050 Sensor Breakout:** Direct mechanical coupling to the motor bracket, gold solder pads, QFN-24 IMU chip, and onboard power LED.
- **DHT11 Climate Sensor:** Textured cyan-blue slotted ventilation grill with capacitive substrate inside.
- **Rain Sensor Plate & LM393 Comparator:** Gold serpentine conductive traces with water droplet detection plate and dual-LED LM393 comparator daughterboard.
- **Active Piezo Buzzer & Alarm LEDs:** Cylindrical acoustic chamber with top sound hole, high-intensity red alarm LED, and green operational status LED.
- **Color-Coded Jumper Wire Harness:** Realistic 3D Catmull-Rom spline curves with realistic wire droop and strain relief:
  - 🔴 **Red (+5V / VCC)** — Solar boost & motor rails
  - 🟠 **Orange (+3.3V)** — ESP32 logic rail
  - ⚫ **Black (GND)** — Common system ground
  - 🟡 **Yellow (GPIO 4)** — DHT11 digital one-wire
  - 🔵 **Blue (GPIO 21 SDA)** — MPU6050 I2C data
  - 🟣 **Purple (GPIO 22 SCL)** — MPU6050 I2C clock
  - 🩵 **Cyan (GPIO 34)** — Rain sensor analog ADC
  - 🟢 **Green (GPIO 35)** — Solar/battery voltage divider ADC
  - 🩶 **White (GPIO 18)** — Motor PWM speed control
  - 🟤 **Brown (GPIO 19)** — Piezo buzzer control
  - 🔴 **Red (GPIO 2)** — Alarm indicator LED
- **Interactive Controls & Viewpoint Presets:**
  - One-click camera presets: `Isometric`, `Top View`, `ESP32 Core`, `Solar / Battery`, `DC Testbed Motor`, `MPU6050 IMU`, `DHT11 Climate`, `Rain Plate`, `Alarm Unit`.
  - Exploded assembly view slider & CAD wireframe diagnostic toggle.
  - Interactive Raycaster: Hover over any physical component to highlight it; click to open the **Component Telemetry & Specification Inspector Drawer**.
  - Screen-space floating HUD tags anchored directly to 3D components in real time.

---

### B. Live Telemetry & Analytical Dashboard (`script.js` & `index.html`)
- **System Health Radial Dial:** 0–100 composite health score calculated across vibration, climate, rain, and power metrics.
- **7 Dedicated Hardware Sensor Cards:**
  1. *DHT11 Climate (Temperature & Humidity)* with dynamic comfort zone analysis.
  2. *MPU6050 Vibration Monitor* displaying real-time RMS acceleration (`g`) with ISO 10816 industrial vibration severity zones.
  3. *MPU6050 Structural Tilt* displaying inclination angle (`°`) with level baseline checks.
  4. *Precipitation & Rain Sensor* displaying wet surface percentage (`%`) and LM393 comparator digital trigger.
  5. *Solar Power & 3.7V LiPo Battery* displaying cell voltage (`3.2V – 4.2V`), charge percentage, solar harvesting irradiance (`mW`), and BMS charge state.
  6. *Testbed DC Motor Controller* displaying shaft RPM (`0 – 3200 RPM`), duty cycle, and simulated failure induction trigger.
  7. *Active Alarm Station* displaying hardware piezo buzzer status, alarm LED state, and sound test button.
  8. *ESP32 Node Gateway* displaying Wi-Fi RSSI (`dBm`), loop latency (`ms`), free heap (`KB`), and uptime.
- **4 Real-Time Analytical Charts (Chart.js):**
  1. *Ambient Temperature History (°C)*
  2. *Relative Humidity History (% RH)*
  3. *MPU6050 Vibration RMS & Machine Tilt Dual-Axis Trajectory*
  4. *Solar Harvesting Power Curve & LiPo Battery Voltage Discharge Dynamics*
- **Configurable Multi-Parameter Alert Matrix:**
  - Range sliders for Temperature (`°C`), Humidity (`%`), Vibration RMS (`g`), Rain Surface (`%`), and Low Battery Cutoff (`V`).
  - Presets: `Industrial Bench`, `Sensitive Bearing`, `Outdoor Solar`.
  - Audio Warning: Synthesized Web Audio API alarm pulse with test buzzer button.
- **Historical Telemetry Table & CSV Export:**
  - 12 comprehensive data columns with search, status filtering, sorting, pagination, and RFC 4180 CSV export.

---

## 3. ESP32 Hardware Wiring & Pin Mapping

| Hardware Module | Physical Pin | ESP32 GPIO | Voltage | Interface Type | Description |
|---|---|---|---|---|---|
| **DHT11** | DATA | `GPIO 4` | 3.3V / 5V | Single-Wire Digital | Ambient temperature & relative humidity (10kΩ pull-up) |
| **MPU6050** | SDA | `GPIO 21` | 3.3V | I2C (Wire) | 6-axis accelerometer/gyro serial data |
| **MPU6050** | SCL | `GPIO 22` | 3.3V | I2C (Wire) | 6-axis accelerometer/gyro serial clock (400kHz Fast Mode) |
| **Rain Sensor** | AOUT | `GPIO 34` (ADC1_CH6) | 3.3V (ADC) | Analog 12-bit ADC | Gold serpentine rain plate precipitation depth (0–4095) |
| **Rain Sensor** | DOUT | `GPIO 23` | 3.3V | Digital Input | LM393 comparator threshold interrupt trigger |
| **Solar / Battery BMS** | V_DIV | `GPIO 35` (ADC1_CH7) | 3.3V (ADC) | Analog 12-bit ADC | 2:1 precision 100kΩ voltage divider reading LiPo voltage (3.0V–4.2V) |
| **Testbed Motor** | PWM_IN | `GPIO 18` | 3.3V Logic | LEDC PWM (5kHz) | Gate drive for IRLZ44N N-channel MOSFET or L298N driver |
| **Active Piezo Buzzer** | SIG | `GPIO 19` | 3.3V Logic | Digital / PWM | Active 2.4kHz piezo buzzer alarm drive |
| **High-Intensity LED** | ANODE | `GPIO 2` | 3.3V Logic | Digital Output | Red alarm indicator LED (with 220Ω series resistor) |
| **Common Rails** | VCC / GND | `VIN` / `GND` | 5.0V & GND | Common Bus | TP4056 5V boost output and star ground network |

---

## 4. Running the Dashboard Locally

The repository includes a dedicated, zero-dependency Node.js HTTP server configured with proper MIME types, CORS headers, and fallback routing:

```bash
# Launch the local server on port 3000
node server.js
```

Then open your browser at:
```
http://localhost:3000/
```

Alternatively, you can use any static file server:
- **VS Code Live Server:** Right-click `index.html` → *Open with Live Server* (`http://127.0.0.1:5500/`)
- **Python:** `python -m http.server 3000`
- **npx serve:** `npx -y serve . -p 3000`

---

## 5. Connecting to Supabase Cloud

### Step 1: Database Table Schema
1. Open your [Supabase Dashboard](https://supabase.com/dashboard) and navigate to **SQL Editor → New Query**.
2. Run the provided schema in `supabase/schema.sql` to configure the table with all hardware columns:
   ```sql
   create table if not exists public.sensor_readings (
     id bigint generated by default as identity primary key,
     machine_id text not null default 'Alpha-01',
     temperature numeric(5,2) not null,
     humidity numeric(5,2) not null,
     vibration_rms numeric(5,3) not null default 0.25,
     tilt_deg numeric(5,2) not null default 1.2,
     rain_percent numeric(5,2) not null default 0.0,
     battery_v numeric(4,2) not null default 3.92,
     motor_rpm integer not null default 1450,
     solar_mw integer not null default 420,
     alarm_active boolean not null default false,
     recorded_at timestamptz not null default now()
   );
   ```

### Step 2: Configure Credentials in `config.js`
Edit `config.js` with your Supabase credentials:
```javascript
window.MECH_AI_CONFIG = {
  supabaseUrl: "https://YOUR_PROJECT_ID.supabase.co",
  supabasePublishableKey: "YOUR_ANON_PUBLISHABLE_KEY",
  machineId: "Alpha-01",
  pollIntervalMs: 5000
};
```
*Note:* You can also configure or test credentials live from the dashboard under **Settings → Supabase Connection Credentials**.

### Step 3: Edge Function Telemetry Ingestion
Sensor readings are securely ingested via the Supabase Edge Function located at `supabase/functions/ingest-sensor-data/index.ts`. Deploy using:
```bash
supabase functions deploy ingest-sensor-data
supabase secrets set MECH_DEVICE_TOKEN="YOUR_SECRET_DEVICE_TOKEN"
```

Simulate an ESP32 hardware transmission via PowerShell:
```powershell
$headers = @{
  "Content-Type"   = "application/json"
  "apikey"         = "YOUR_SUPABASE_PUBLISHABLE_KEY"
  "x-device-token" = "YOUR_SECRET_DEVICE_TOKEN"
}

$payload = @{
  machine_id    = "Alpha-01"
  temperature   = 28.4
  humidity      = 58.2
  vibration_rms = 0.42
  tilt_deg      = 1.1
  rain_percent  = 12.5
  battery_v     = 3.96
  motor_rpm     = 1620
  solar_mw      = 540
  alarm_active  = $false
} | ConvertTo-Json

Invoke-RestMethod -Uri "https://YOUR_PROJECT_ID.supabase.co/functions/v1/ingest-sensor-data" `
  -Method Post -Headers $headers -Body $payload
```

---

## 6. Project File Structure

```
MECH-AI-Improved/
├── index.html            # Complete responsive dashboard with 8 sections, 3D viewport & inspector drawer
├── style.css             # Industrial design system (dark & light modes, glassmorphism, responsive grids)
├── digital-twin.js       # Procedural 3D station (Three.js), motor animation, wiring harness, camera presets
├── script.js             # Telemetry engine, Chart.js graphs, canvas sparklines, alert matrix, CSV export
├── server.js             # Lightweight Node.js local server with MIME handling and subfolder resolution
├── config.js             # Supabase URL & publishable key configuration file
├── README.md             # Complete engineering documentation, wiring guide, and operation manual
└── supabase/
    ├── schema.sql        # Database schema, indexes, and Row Level Security policies
    └── functions/
        └── ingest-sensor-data/
            └── index.ts  # Deno Edge Function with device token verification
```

---

## 7. Keyboard Shortcuts & User Controls
- **`R`**: Trigger an instantaneous telemetry refresh cycle.
- **Sidebar Collapse:** Toggle the sidebar rail mode to expand the 3D canvas or analytical chart area.
- **Exploded View Slider:** Separate station subassemblies along their mounting axes for maintenance inspection.
- **CAD Wireframe Mode:** Toggle mesh wireframe overlay for structural inspection.
- **Induce Motor Failure Button:** Injects eccentric imbalance into the testbed motor, causing vibration spikes and triggering the visual/audio alarm system.
