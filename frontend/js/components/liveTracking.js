/* ==========================================================================
   CLEANCRED — LIVE PICKUP TRACKING COMPONENT
   Tactile Neumorphism + Civic Technology
   Swiggy/Uber-Style Interactive Delivery Map & Status Progression
   ========================================================================== */

import { State } from '../state.js';
import { Formatters } from '../utils/formatters.js';
import { MapHelper } from '../utils/mapHelper.js';
import { Confetti } from '../utils/confetti.js';
import { SoundFX } from '../utils/audio.js';
import { QRCode } from '../utils/qrCode.js';

export const LiveTrackingView = {
  mapInstance: null,
  truckMarker: null,
  routePolyline: null,
  completedPolyline: null,
  animationTimer: null,
  locationTimer: null,
  mapProvider: null,
  destinationCoord: null,
  initialVanCoord: null,
  simulationRoute: [],
  simulationIndex: 0,
  isSimulationRunning: false,
  isDemoMode: false,
  activePickupId: null,

  render(params = {}) {
    const container = document.getElementById('view-live-tracking');
    if (!container) return;

    let targetId = (params && params.pickupId) ? params.pickupId : this.activePickupId;
    let pickup = null;
    let isDemoMode = false;

    if (targetId) {
      pickup = State.state.pickups.find(p => p.id === targetId);
    }

    if (pickup) {
      this.activePickupId = pickup.id;
    } else {
      // Explicit Demo Telemetry & Selection State (Zero silent guessing)
      isDemoMode = true;
      this.activePickupId = null;
      pickup = {
        id: 'DEMO-ROUTE-4B',
        isDemo: true,
        category: 'wet',
        categoryName: 'Demonstration Fleet Telemetry',
        pointsReward: 0,
        quantityKg: 0,
        subType: 'Municipal Demonstration Route',
        address: 'Municipal Demonstration Route (Ward 4B)',
        status: 'on_the_way',
        workerName: 'Demo Vehicle Operator',
        workerPhone: '+91 98111 22334',
        vehicleNo: 'Collection Van',
        otp: '----',
        etaMinutes: 12
      };
    }
    this.activePickup = pickup;
    this.isDemoMode = isDemoMode;

    const activePickups = State.state.pickups.filter(p => p.status === 'created' || p.status === 'assigned' || p.status === 'on_the_way');

    container.innerHTML = `
      <div class="app-container" style="max-width: 1150px; margin: 0 auto; padding: 1.5rem 1rem 4rem 1rem;">
        
        <!-- Explicit Demo Telemetry & Pickup Selector Banner -->
        ${isDemoMode ? `
        <div class="neu-card-inset" style="padding: 1rem 1.25rem; border-radius: var(--radius-lg); margin-bottom: 1.5rem; border-left: 4px solid #F59E0B; background: #FFFBEB;">
          <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; flex-wrap: wrap;">
            <div>
              <div style="display: flex; align-items: center; gap: 0.5rem; color: #B45309; font-weight: 800; font-size: 0.95rem; margin-bottom: 0.25rem;">
                <i data-lucide="info" class="lucide-icon-sm"></i>
                <span>Demo Telemetry Mode &bull; No Specific Pickup Selected</span>
              </div>
              <p style="margin: 0; font-size: 0.82rem; color: #92400E;">
                You are viewing simulated municipal van movement in Ward 4B. To track an actual collection, select from your active pickups below:
              </p>
            </div>
          </div>
          ${activePickups.length > 0 ? `
            <div style="margin-top: 0.85rem; display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
              <span style="font-size: 0.78rem; font-weight: 700; color: #78350F;">Select Pickup to Track:</span>
              ${activePickups.map(p => `
                <button class="btn btn-secondary btn-sm" onclick="window.LiveTrackingView.render({ pickupId: '${p.id}' })" style="border-color: #FCD34D; background: #FEF3C7; color: #92400E; font-weight: 700;">
                  <i data-lucide="package" class="lucide-icon-xs"></i>
                  <span>Track #${p.id} (${p.categoryName || p.category})</span>
                </button>
              `).join('')}
            </div>
          ` : `
            <div style="margin-top: 0.65rem; font-size: 0.8rem; color: #92400E;">
              No active collections scheduled. <button class="btn btn-secondary btn-sm" onclick="window.AppRouter.navigate('report-waste')" style="margin-left: 0.5rem;">Schedule New Pickup</button>
            </div>
          `}
        </div>
        ` : ''}

        <!-- Header -->
        <div class="flex-between" style="margin-bottom: 1.75rem; flex-wrap: wrap; gap: 1rem;">
          <div>
            <div class="${isDemoMode ? 'badge badge-amber' : 'badge badge-green'}" style="margin-bottom: 0.35rem; display: inline-flex; align-items: center; gap: 0.35rem;">
              <i data-lucide="${isDemoMode ? 'play-circle' : 'navigation'}" class="lucide-icon-sm"></i>
              <span>${isDemoMode ? 'Simulated Fleet Telemetry (Demo) • Ward 4B' : `Live Pickup #${pickup.id} • Ward 4B`}</span>
            </div>
            <h2 style="color: var(--color-navy); font-size: 1.85rem; font-weight: 800; margin: 0.25rem 0;">
              ${isDemoMode ? 'Live Fleet Telemetry <span style="font-size: 1rem; color: #D97706; font-weight: 700;">(Demo Simulation)</span>' : `Live Pickup Tracking &bull; #${pickup.id}`}
            </h2>
            <p style="color: var(--text-muted); font-size: 0.9rem; margin: 0;">
              ${isDemoMode ? 'Observing simulated municipal van movement in Ward 4B.' : `Tracing collection van dispatch to ${Formatters.escapeHtml(pickup.address)}.`}
            </p>
          </div>

          <div style="display: flex; gap: 0.75rem; align-items: center;">
            <button id="tracking-simulation-toggle" class="btn btn-primary btn-sm" onclick="window.LiveTrackingView.toggleSimulation()">
              <i data-lucide="play" class="lucide-icon-sm"></i>
              <span id="tracking-simulation-toggle-label">Start OSM Simulation</span>
            </button>
            <button class="btn btn-secondary btn-sm" onclick="window.LiveTrackingView.restartSimulation()">
              <i data-lucide="rotate-ccw" class="lucide-icon-sm"></i>
              <span>Restart</span>
            </button>
          </div>
        </div>

        <!-- 2-Column Layout: Map (Left) & Status Timeline + Worker Card (Right) -->
        <div class="hero-grid" style="gap: 1.75rem;">
          
          <!-- Left Column: Map -->
          <div class="neu-card neu-card-raised" style="padding: 1.25rem; overflow: hidden; border-radius: var(--radius-xl);">
            <div id="live-tracking-map" style="height: 520px; width: 100%; border-radius: var(--radius-lg); border: 1.5px solid #CBD5E1; box-shadow: inset 0 2px 6px rgba(0,0,0,0.06);"></div>
            
            <div class="flex-between" style="margin-top: 1rem; padding: 0.75rem 1rem; background: var(--bg-surface-elevated); border-radius: var(--radius-md); font-size: 0.8rem; color: var(--text-muted); border: 1px solid var(--color-border); flex-wrap: wrap; gap: 0.6rem;">
              <span style="display: flex; align-items: center; gap: 0.35rem; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                <i data-lucide="map-pin" class="lucide-icon-sm" style="color: var(--color-primary-dark);"></i>
                <span title="${pickup.address}">Pickup: ${pickup.address || 'Flat 402, Ward 4B'}</span>
              </span>
              <span style="display: flex; align-items: center; gap: 0.35rem;">
                <i data-lucide="truck" class="lucide-icon-sm" style="color: #2563EB;"></i>
                <span>Vehicle: ${pickup.vehicleNo || 'Collection Van'}</span>
              </span>
              <span style="display: flex; align-items: center; gap: 0.35rem;">
                <i data-lucide="activity" class="lucide-icon-sm" style="color: var(--color-primary);"></i>
                <span id="tracking-provider">Map: connecting...</span>
              </span>
              <span style="display: flex; align-items: center; gap: 0.35rem;">
                <i data-lucide="clock-3" class="lucide-icon-sm" style="color: #7C3AED;"></i>
                <span id="tracking-last-updated">Waiting for worker GPS</span>
              </span>
              <span style="display: flex; align-items: center; gap: 0.35rem;">
                <i data-lucide="route" class="lucide-icon-sm" style="color: #D97706;"></i>
                <span id="tracking-progress">Route preparing…</span>
              </span>
            </div>
          </div>

          <!-- Right Column: Status Timeline & Driver Card -->
          <div style="display: flex; flex-direction: column; gap: 1.5rem;">
            
            <!-- Worker Info Card -->
            <div class="neu-card neu-card-raised" style="padding: 1.5rem; border-radius: var(--radius-xl);">
              <div class="flex-between" style="margin-bottom: 1rem;">
                <div style="display: flex; align-items: center; gap: 0.85rem;">
                  <div style="width: 48px; height: 48px; border-radius: 50%; background: #DCFCE7; color: var(--color-primary-dark); display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 1.1rem; box-shadow: 0 2px 6px rgba(22, 163, 74, 0.2);">
                    <i data-lucide="user-check" class="lucide-icon-md"></i>
                  </div>
                  <div>
                    <strong style="color: var(--color-navy); font-size: 1rem; display: block;">${pickup.workerName || 'DemoCollector'}</strong>
                    <div style="font-size: 0.78rem; color: var(--text-muted);">Municipal Sanitation Officer &bull; 4.9 Rating</div>
                  </div>
                </div>
                <span class="badge badge-green" style="display: inline-flex; align-items: center; gap: 0.25rem;">
                  <i data-lucide="shield-check" class="lucide-icon-sm"></i>
                  <span>Verified Staff</span>
                </span>
              </div>

              <div class="neu-card-inset" style="padding: 0.85rem 1rem; border-radius: var(--radius-md); margin-bottom: 1rem;">
                <div class="flex-between" style="margin-bottom: 0.35rem; font-size: 0.85rem;">
                  <span style="color: var(--text-muted); font-weight: 600;">Assigned Vehicle</span>
                  <strong style="color: var(--color-navy);">${pickup.vehicleNo || 'Collection Van'}</strong>
                </div>
                <div class="flex-between" style="font-size: 0.85rem;">
                  <span style="color: var(--text-muted); font-weight: 600;">Pickup Handshake OTP</span>
                  <strong style="color: var(--color-primary-dark); font-size: 1.2rem; letter-spacing: 0.12em; font-family: var(--font-mono);">${pickup.otp || '8492'}</strong>
                </div>
              </div>

              ${isDemoMode ? `
              <div class="neu-card-flat" style="padding: 1rem; border-radius: var(--radius-md); margin-bottom: 1rem; text-align: center; background: #FEF3C7; border: 1px dashed #F59E0B;">
                <div style="font-size: 0.82rem; color: #92400E; font-weight: 700; margin-bottom: 0.25rem;">
                  Demo Route Simulation
                </div>
                <div style="font-size: 0.75rem; color: #B45309;">
                  No citizen QR code generated for demo telemetry. Select a real pickup above to track your collection OTP and QR code.
                </div>
              </div>
              ` : pickup.status !== 'verified' && pickup.status !== 'collected' ? `
              <div class="neu-card-flat" style="padding: 1rem; border-radius: var(--radius-md); margin-bottom: 1rem; text-align: center;">
                <div style="font-size: 0.75rem; color: var(--text-muted); font-weight: 700; margin-bottom: 0.5rem; text-transform: uppercase; letter-spacing: 0.05em;">
                  ${pickup.qr_token ? 'Present this Handover QR to ' + Formatters.escapeHtml(pickup.workerName || 'DemoCollector') + ' on arrival' : 'QR Handover Token (Generated upon Worker Inspection)'}
                </div>
                <div id="live-tracking-qr" style="display: flex; justify-content: center;"></div>
                ${pickup.qr_token ? `
                  <div style="margin-top: 0.5rem; font-size: 0.78rem; color: var(--text-muted);">
                    One-Time Token: <strong style="font-family: var(--font-mono); color: var(--color-primary-dark);">${pickup.qr_token}</strong>
                  </div>
                ` : `
                  <div style="margin-top: 0.5rem; font-size: 0.75rem; color: var(--text-muted);">
                    Request #${pickup.id} &bull; OTP: <span style="font-family: var(--font-mono); font-weight: 700;">${pickup.otp || pickup.id}</span>
                  </div>
                `}
              </div>
              ` : `
              <div class="neu-card-flat" style="padding: 1rem; border-radius: var(--radius-md); margin-bottom: 1rem; text-align: center; background: #DCFCE7; border-color: #86EFAC;">
                <div style="color: var(--color-primary-dark); font-weight: 800; font-size: 0.9rem; display: flex; align-items: center; justify-content: center; gap: 0.4rem;">
                  <i data-lucide="check-circle-2" class="lucide-icon-sm"></i>
                  <span>Pickup Completed &amp; Verified</span>
                </div>
              </div>
              `}

              <div class="card-actions-grid-2col">
                <button class="btn btn-secondary btn-sm" onclick="window.AppRouter.showToast('Calling ${pickup.workerName || 'Worker'} at ${pickup.workerPhone || '+91 98111 22334'}...')">
                  <i data-lucide="phone" class="lucide-icon-sm"></i>
                  <span>Call Worker</span>
                </button>
                <button class="btn btn-secondary btn-sm" onclick="window.AppRouter.showToast('Message sent: Please buzz Flat 402 upon arrival.')">
                  <i data-lucide="message-square" class="lucide-icon-sm"></i>
                  <span>Message</span>
                </button>
              </div>
            </div>

            <!-- Milestone Progress Timeline -->
            <div class="neu-card neu-card-raised" style="padding: 1.75rem; flex: 1; border-radius: var(--radius-xl);">
              <h4 style="color: var(--color-navy); margin-bottom: 1.25rem; font-weight: 800; font-size: 1.05rem;">Chain of Custody Timeline</h4>

              <div class="timeline-list">
                
                <!-- 1. Created -->
                <div class="timeline-item done">
                  <div class="timeline-dot">
                    <i data-lucide="check" style="width: 12px; height: 12px;"></i>
                  </div>
                  <strong style="font-size: 0.875rem; color: var(--color-navy);">Request Created</strong>
                  <div style="font-size: 0.75rem; color: var(--text-muted);">Pickup #${pickup.id} registered on ledger</div>
                </div>

                <!-- 2. Assigned -->
                <div class="timeline-item done">
                  <div class="timeline-dot">
                    <i data-lucide="check" style="width: 12px; height: 12px;"></i>
                  </div>
                  <strong style="font-size: 0.875rem; color: var(--color-navy);">Worker Assigned</strong>
                  <div style="font-size: 0.75rem; color: var(--text-muted);">${pickup.workerName || 'DemoCollector'} accepted the route</div>
                </div>

                <!-- 3. On the Way -->
                <div class="timeline-item ${pickup.status === 'on_the_way' || pickup.status === 'collected' || pickup.status === 'verified' ? 'done active-node' : ''}">
                  <div class="timeline-dot">
                    <i data-lucide="${pickup.status === 'on_the_way' ? 'navigation' : 'check'}" style="width: 12px; height: 12px;"></i>
                  </div>
                  <strong style="font-size: 0.875rem; color: var(--color-navy);">Collection Van En Route</strong>
                  <div style="font-size: 0.75rem; color: var(--text-muted);">Assigned worker is en route to your location</div>
                </div>

                <!-- 4. Collected -->
                <div class="timeline-item ${pickup.status === 'collected' || pickup.status === 'verified' ? 'done' : ''}">
                  <div class="timeline-dot">
                    <i data-lucide="${pickup.status === 'collected' || pickup.status === 'verified' ? 'check' : 'package-check'}" style="width: 12px; height: 12px;"></i>
                  </div>
                  <strong style="font-size: 0.875rem; color: var(--color-navy);">Waste Collected</strong>
                  <div style="font-size: 0.75rem; color: var(--text-muted);">Loaded into segregated compartment</div>
                </div>

                <!-- 5. Verified -->
                <div class="timeline-item ${pickup.status === 'verified' ? 'done' : ''}">
                  <div class="timeline-dot">
                    <i data-lucide="${pickup.status === 'verified' ? 'check' : 'scale'}" style="width: 12px; height: 12px;"></i>
                  </div>
                  <strong style="font-size: 0.875rem; color: var(--color-navy);">Purity Verified &amp; Weighed</strong>
                  <div style="font-size: 0.75rem; color: var(--text-muted);">Segregation purity approved by worker</div>
                </div>

                <!-- 6. Points Credited -->
                <div class="timeline-item ${pickup.status === 'verified' ? 'done' : ''}">
                  <div class="timeline-dot">
                    <i data-lucide="${pickup.status === 'verified' ? 'coins' : 'circle'}" style="width: 12px; height: 12px;"></i>
                  </div>
                  <strong style="font-size: 0.875rem; color: var(--color-primary-dark);">Credits Credited</strong>
                  <div style="font-size: 0.75rem; color: var(--color-primary-dark); font-weight: 700;">+${pickup.pointsReward} Credits awarded to your wallet</div>
                </div>

              </div>
            </div>

          </div>

        </div>

      </div>
    `;

    setTimeout(() => this.initMap(), 100);
    if (!isDemoMode && pickup.status !== 'verified' && pickup.status !== 'collected') {
      setTimeout(() => QRCode.renderInto('live-tracking-qr', pickup.qr_token || pickup.id), 50);
    }
    if (window.lucide) {
      window.lucide.createIcons();
    }
  },

  updateOnStateChange() {
    if (this.activePickupId) {
      const p = State.state.pickups.find(item => item.id === this.activePickupId);
      if (p) {
        this.render({ pickupId: this.activePickupId });
      }
    }
  },

  initMap() {
    this.cleanup();
    const mapElement = document.getElementById('live-tracking-map');
    if (!mapElement) return;
    const pickupCoords = this.activePickup?.geoCoords || { lat: 19.0760, lng: 72.8777 };
    const destination = { lat: Number(pickupCoords.lat), lng: Number(pickupCoords.lng) };
    const van = { lat: destination.lat - 0.011, lng: destination.lng - 0.018 };
    this.destinationCoord = destination;
    this.initialVanCoord = van;

    this.initOpenStreetMap(destination, van);
    this.setTrackingLabel('OpenStreetMap • Preparing road route…');
    this.prepareOpenStreetRoute(destination, van);

    if (this.activePickupId && /^\d+$/.test(String(this.activePickupId))) {
      this.refreshLiveLocation();
      this.locationTimer = setInterval(() => this.refreshLiveLocation(), 5000);
    }
  },

  initOpenStreetMap(destination, van) {
    if (!window.L) return;
    this.mapProvider = 'leaflet';
    this.mapInstance = MapHelper.initMap('live-tracking-map', [destination.lat, destination.lng], 14);
    const homePin = MapHelper.createCustomPin('H', 'Pickup location', '#16A34A');
    window.L.marker([destination.lat, destination.lng], { icon: homePin }).addTo(this.mapInstance);
    const vanPin = MapHelper.createCustomPin('V', 'Collection vehicle', '#2563EB');
    this.truckMarker = window.L.marker([van.lat, van.lng], { icon: vanPin }).addTo(this.mapInstance);
    this.completedPolyline = window.L.polyline([], { color:'#64748B',weight:5,opacity:0.65 }).addTo(this.mapInstance);
    this.routePolyline = window.L.polyline([[van.lat, van.lng], [destination.lat, destination.lng]], { color:'#16A34A',weight:5,opacity:0.9 }).addTo(this.mapInstance);
  },

  async prepareOpenStreetRoute(destination, van) {
    let points = [];
    try {
      const start = `${van.lng},${van.lat}`;
      const end = `${destination.lng},${destination.lat}`;
      const url = `https://router.project-osrm.org/route/v1/driving/${start};${end}?overview=full&geometries=geojson&steps=false`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`OSM route service returned ${response.status}`);
      const payload = await response.json();
      const coordinates = payload.routes?.[0]?.geometry?.coordinates;
      if (!Array.isArray(coordinates) || coordinates.length < 2) throw new Error('No road route returned');
      points = coordinates.map(([lng, lat]) => ({ lat:Number(lat), lng:Number(lng) }));
      points[0] = van;
      points[points.length-1] = destination;
      this.setTrackingLabel('OpenStreetMap • OSM road-route simulation');
    } catch (error) {
      console.warn('CleanCred: OSM routing fallback active:', error);
      points = this.buildFallbackRoute(van, destination);
      this.setTrackingLabel('OpenStreetMap • Offline simulated route');
    }

    this.simulationRoute = this.sampleRoute(points, 90);
    this.simulationIndex = 0;
    this.routePolyline?.setLatLngs(this.simulationRoute.map(point => [point.lat, point.lng]));
    this.completedPolyline?.setLatLngs([]);
    if (this.mapInstance && this.simulationRoute.length > 1) {
      this.mapInstance.fitBounds(this.routePolyline.getBounds(), { padding:[35,35] });
    }
    this.updateSimulationStatus(this.simulationRoute[0]);

    if (this.isDemoMode) {
      this.startSimulation();
    }
  },

  buildFallbackRoute(start, destination) {
    const controls = [
      start,
      { lat:start.lat + (destination.lat-start.lat)*0.22, lng:start.lng + (destination.lng-start.lng)*0.12 },
      { lat:start.lat + (destination.lat-start.lat)*0.40, lng:start.lng + (destination.lng-start.lng)*0.36 },
      { lat:start.lat + (destination.lat-start.lat)*0.58, lng:start.lng + (destination.lng-start.lng)*0.50 },
      { lat:start.lat + (destination.lat-start.lat)*0.72, lng:start.lng + (destination.lng-start.lng)*0.76 },
      { lat:start.lat + (destination.lat-start.lat)*0.88, lng:start.lng + (destination.lng-start.lng)*0.86 },
      destination
    ];
    const route = [];
    for (let i=0; i<controls.length-1; i+=1) {
      const from=controls[i], to=controls[i+1];
      for (let step=0; step<10; step+=1) {
        const progress=step/10;
        route.push({ lat:from.lat+(to.lat-from.lat)*progress, lng:from.lng+(to.lng-from.lng)*progress });
      }
    }
    route.push(destination);
    return route;
  },

  sampleRoute(points, maxPoints) {
    if (points.length <= maxPoints) return points;
    return Array.from({ length:maxPoints }, (_, index) => {
      const sourceIndex = Math.round(index*(points.length-1)/(maxPoints-1));
      return points[sourceIndex];
    });
  },

  async refreshLiveLocation() {
    try {
      const tracking = await State.getLiveLocation(this.activePickupId);
      if (!tracking.location) return;
      this.updateVehiclePosition({ lat: tracking.location.lat, lng: tracking.location.lng });
      const time = new Date(tracking.location.updated_at).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit', second:'2-digit' });
      const label = document.getElementById('tracking-last-updated');
      if (label) label.textContent = `GPS updated ${time} • ETA ${this.calculateEta(tracking.location)} min`;
    } catch (error) {
      console.warn('CleanCred: tracking poll failed:', error);
    }
  },

  setTrackingLabel(text) {
    const label = document.getElementById('tracking-provider');
    if (label) label.textContent = text;
  },

  calculateEta(location) {
    const km = this.distanceToDestination(location);
    if (km === null) return '--';
    return Math.max(1, Math.ceil(km / 20 * 60));
  },

  distanceToDestination(location) {
    const target = this.destinationCoord;
    if (!target || !location) return null;
    const toRad = value => value * Math.PI / 180;
    const dLat = toRad(target.lat-location.lat), dLng = toRad(target.lng-location.lng);
    const a = Math.sin(dLat/2)**2 + Math.cos(toRad(location.lat))*Math.cos(toRad(target.lat))*Math.sin(dLng/2)**2;
    return 6371*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
  },

  updateVehiclePosition(position, remainingRoute = null) {
    if (!this.truckMarker) return;
    this.truckMarker.setLatLng([position.lat, position.lng]);
    if (Array.isArray(remainingRoute)) {
      this.routePolyline?.setLatLngs(remainingRoute.map(point => [point.lat, point.lng]));
    } else {
      this.routePolyline?.setLatLngs([[position.lat, position.lng], [this.destinationCoord.lat, this.destinationCoord.lng]]);
    }
    this.mapInstance?.panTo([position.lat, position.lng], { animate:true, duration:0.5 });
  },

  updateSimulationStatus(position) {
    if (!position) return;
    const total = Math.max(1, this.simulationRoute.length-1);
    const progress = Math.min(100, Math.round(this.simulationIndex/total*100));
    const distance = this.distanceToDestination(position);
    const progressLabel = document.getElementById('tracking-progress');
    const updateLabel = document.getElementById('tracking-last-updated');
    if (progressLabel) progressLabel.textContent = `${progress}% complete • ${distance === null ? '--' : distance.toFixed(2)} km remaining`;
    if (updateLabel) updateLabel.textContent = progress >= 100 ? 'Vehicle arrived at pickup' : `Simulated GPS • ETA ${this.calculateEta(position)} min`;
  },

  updateSimulationControls() {
    const label = document.getElementById('tracking-simulation-toggle-label');
    const button = document.getElementById('tracking-simulation-toggle');
    if (label) label.textContent = this.isSimulationRunning ? 'Pause Simulation' : 'Start OSM Simulation';
    if (button) {
      const icon = button.querySelector('[data-lucide]');
      if (icon) icon.setAttribute('data-lucide', this.isSimulationRunning ? 'pause' : 'play');
    }
    if (window.lucide) window.lucide.createIcons();
  },

  startSimulation() {
    if (this.isSimulationRunning || this.simulationRoute.length < 2) return;
    if (this.simulationIndex >= this.simulationRoute.length-1) this.restartSimulation(false);
    if (this.locationTimer) {
      clearInterval(this.locationTimer);
      this.locationTimer = null;
    }
    this.isSimulationRunning = true;
    this.updateSimulationControls();
    this.animationTimer = window.setInterval(() => this.advanceSimulation(), 650);
  },

  pauseSimulation() {
    if (this.animationTimer) clearInterval(this.animationTimer);
    this.animationTimer = null;
    this.isSimulationRunning = false;
    this.updateSimulationControls();
  },

  toggleSimulation() {
    SoundFX.playClick();
    if (!this.simulationRoute.length) {
      window.AppRouter.showToast('OpenStreetMap route is still preparing.');
      return;
    }
    if (this.isSimulationRunning) this.pauseSimulation();
    else this.startSimulation();
  },

  advanceSimulation() {
    if (this.simulationIndex >= this.simulationRoute.length-1) {
      this.pauseSimulation();
      const label = document.getElementById('tracking-simulation-toggle-label');
      if (label) label.textContent = 'Simulation Complete';
      window.AppRouter.showToast('OpenStreetMap simulation complete: vehicle arrived.');
      return;
    }
    this.simulationIndex += 1;
    const position = this.simulationRoute[this.simulationIndex];
    const completed = this.simulationRoute.slice(0,this.simulationIndex+1);
    const remaining = this.simulationRoute.slice(this.simulationIndex);
    this.completedPolyline?.setLatLngs(completed.map(point => [point.lat,point.lng]));
    this.updateVehiclePosition(position,remaining);
    this.updateSimulationStatus(position);
  },

  restartSimulation(autoStart = true) {
    SoundFX.playClick();
    this.pauseSimulation();
    this.simulationIndex = 0;
    const first = this.simulationRoute[0] || this.initialVanCoord;
    if (!first) return;
    this.completedPolyline?.setLatLngs([]);
    this.updateVehiclePosition(first,this.simulationRoute);
    this.updateSimulationStatus(first);
    if (this.mapInstance && this.routePolyline) this.mapInstance.fitBounds(this.routePolyline.getBounds(),{ padding:[35,35] });
    if (autoStart) this.startSimulation();
  },

  cleanup() {
    if (this.animationTimer) {
      clearInterval(this.animationTimer);
      this.animationTimer = null;
    }
    this.isSimulationRunning = false;
    if (this.locationTimer) {
      clearInterval(this.locationTimer);
      this.locationTimer = null;
    }
    if (this.mapInstance) {
      MapHelper.destroyMap('live-tracking-map');
      this.mapInstance = null;
      this.truckMarker = null;
      this.routePolyline = null;
      this.completedPolyline = null;
      this.mapProvider = null;
    }
  },

  simulateWorkerMove() {
    this.toggleSimulation();
  }
};

window.LiveTrackingView = LiveTrackingView;
