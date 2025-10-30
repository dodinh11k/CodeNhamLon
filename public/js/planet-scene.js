;(function(){
  // Expose a small controller so the page can start/stop the scene
  const api = { start, stop, setSettings, setCameraParams, startCinematic, stopCinematic, isRunning: false };
  window.PlanetScene = api;

  let container, scene, camera, renderer, controls, stars, planet, group, pointLight, ambientLight;
  let textRingA = null, textRingB = null;
  let animId = null;
  let flyStartMs = 0;
  let inited = false;
  let settings = null;
  // Cinematic orbit+zoom state
  let cinematic = {
    active: false,
    startMs: 0,
    durationSec: 10,
    rotateDeg: 360,
    baseAzimuthDeg: 0,
    distNear: 100,
    distFar: 200,
    // distance/polar behavior during cinematic
    distanceMode: 'inOut', // 'inOut' | 'hold' | 'path'
    fixedDistance: null,   // used when distanceMode='hold'
    distancePathStart: null, // used when distanceMode='path'
    distancePathEnd: null,   // used when distanceMode='path'
    distanceBobAmp: 0,
    distanceBobHz: 0.2,
    polarMode: 'bob',      // 'bob' | 'hold' | 'path'
    fixedPolarDeg: null,   // used when polarMode='hold'
    // polar path options
    polarStartDeg: null,
    polarEndDeg: null,
    polarBobAmpDeg: 0,
    polarBobHz: 0.06,
    resumeFlyAfter: true,  // whether to restore previous fly state after cinematic ends
    savedFlyEnabled: null
  };

  const defaults = {
    stars: { count: 2000 },
    planet: { radius: 20, textureUrl: 'https://i.imgur.com/UYb5hMP.jpg' },
    // ring.spread is treated as radial thickness (in-plane), not vertical height
    ring: { count: 1000, radius: 120, spread: 120, height: 5, boxSize: 3.5,
      // legacy halo sprite (disabled by default now that we draw a white glow border)
      haloEnabled: false,
      haloColor: '#ffffff',
      haloScale: 1.6,
      haloOpacity: 0.6,
      // rounded white-glow border options (canvas-generated)
      rounded: { enabled: true, cornerRatio: 0.28, glowBlur: 18, glowOpacity: 0.85 },
      imageUrls: [
      'https://cdn.jsdelivr.net/npm/three@0.158.0/examples/textures/sprites/spark1.png'
    ] },
    speed: { planet: 0.002, ring: 0.004, stars: 0.0005 },
  camera: { distance: 150, azimuthDeg: 30, polarDeg: 60, fov: 70, autoRotate: false, autoRotateSpeed: 2, invertY: false,
    fly: {
      enabled: true,
      speed: 1.0,
      azimuthSpeedDegPerSec: 20,
      polarCenterDeg: 55,
      polarAmpDeg: 20,
      polarHz: 0.06,
      distanceBase: 150,
      distanceAmp: 50,
      distanceHz: 0.05,
      // Scripted intro sequence: dolly-in -> rotate 250° -> dolly-out
      sequence: {
        enabled: true,
        distStart: 300,
        distIn: 90,
        distOut: 300,
        polarDeg: 55,
        tInSec: 3,
        tRotateSec: 8,
        tOutSec: 3,
        rotateDeg: 250,
        loop: true
      }
    }
  },
    lights: { point: 2, ambient: 0.25 },
    textRings: {
      a: { text: 'WELCOME TO 3D PLANET', radius: 90, tiltDeg: 20, speed: 0.005, size: 10, color: '#ffffff' },
      b: { text: 'HELLO DODINH 11K', radius: 120, tiltDeg: -15, speed: -0.004, size: 10, color: '#ffffff' }
    }
  };

  function mergeSettings(s){
    const d = JSON.parse(JSON.stringify(defaults));
    if (!s) return d;
    const cam = { ...d.camera, ...(s.camera||{}) };
    cam.fly = { ...(d.camera && d.camera.fly || {}), ...((s.camera && s.camera.fly) || {}) };
    return {
      stars: { ...d.stars, ...(s.stars||{}) },
      planet: { ...d.planet, ...(s.planet||{}) },
      ring: { ...d.ring, ...(s.ring||{}) },
      speed: { ...d.speed, ...(s.speed||{}) },
      camera: cam,
      lights: { ...d.lights, ...(s.lights||{}) },
      textRings: {
        a: { ...d.textRings.a, ...((s.textRings&&s.textRings.a)||{}) },
        b: { ...d.textRings.b, ...((s.textRings&&s.textRings.b)||{}) }
      }
    };
  }

  function initOnce(){
    if (inited) return;
    container = document.getElementById('planet-root');
    if (!container) return;

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(70, 1, 0.1, 1000);
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio || 1);
  container.appendChild(renderer.domElement);

    function size() {
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    }
    // store on api for remove if needed
    api._onResize = size;
    size();

    // Background stars
    const starsGeometry = new THREE.BufferGeometry();
    const starCount = 2000;
    const starPositions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount * 3; i++) starPositions[i] = (Math.random() - 0.5) * 2000;
    starsGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    const starsMaterial = new THREE.PointsMaterial({ color: 0xffffff, size: 1 });
    stars = new THREE.Points(starsGeometry, starsMaterial);
    scene.add(stars);

    // Planet
    const texture = new THREE.TextureLoader().load('https://i.imgur.com/UYb5hMP.jpg');
    planet = new THREE.Mesh(
      new THREE.SphereGeometry(20, 64, 64),
      new THREE.MeshStandardMaterial({ map: texture })
    );
    scene.add(planet);

    // Lights
    const light = new THREE.PointLight(0xffffff, 2);
    light.position.set(50, 50, 50);
    pointLight = light;
    scene.add(pointLight);
    ambientLight = new THREE.AmbientLight(0x404040, (settings?.lights?.ambient) ?? defaults.lights.ambient);
    scene.add(ambientLight);

    // Colored boxes orbiting
    group = new THREE.Group();
    for (let i = 0; i < 800; i++) {
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(`hsl(${Math.random()*360},80%,60%)`) })
      );
      const radius = 60 + Math.random() * 20;
      const angle = Math.random() * Math.PI * 2;
      const y = (Math.random() - 0.5) * 10;
      box.position.set(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
      group.add(box);
    }
    scene.add(group);

    // Controls (robustly detect constructor location)
    const ControlsCtor = (typeof THREE !== 'undefined' && (THREE.OrbitControls || THREE.TrackballControls)) || window.OrbitControls || null;
    if (ControlsCtor) {
      controls = new ControlsCtor(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.05;
  controls.enableZoom = true;
      controls.zoomSpeed = 0.8;
      controls.rotateSpeed = 0.6;
      controls.panSpeed = 0.6;
      controls.minDistance = 20;
      controls.maxDistance = 1000;
      controls.target.set(0,0,0);
      camera.fov = (settings?.camera?.fov) ?? defaults.camera.fov;
      camera.updateProjectionMatrix();
      // Position by spherical coordinates
      setCameraFromSettings();
      // Auto rotate
      controls.autoRotate = !!((settings?.camera?.autoRotate) ?? defaults.camera.autoRotate);
      controls.autoRotateSpeed = (settings?.camera?.autoRotateSpeed) ?? defaults.camera.autoRotateSpeed;
      // Invert Y (OrbitControls inverts both axes via rotateSpeed sign)
      const wantInvert = !!((settings?.camera?.invertY) ?? defaults.camera.invertY);
      controls.rotateSpeed = Math.abs(controls.rotateSpeed) * (wantInvert ? -1 : 1);
      controls.update();
    } else {
      // Fallback: position camera and allow simple auto-rotate if controls not found
      setCameraFromSettings();
      controls = null;
      console.warn('OrbitControls not found; continuing without mouse controls');
    }

    window.addEventListener('resize', api._onResize);
    inited = true;
    // Fallback interactive controls if OrbitControls is missing
    if (!controls) enableBasicMouseControls();
    // Init fly-cam timeline
    flyStartMs = performance.now();
  }

  function loop(){
    animId = window.requestAnimationFrame(loop);
    planet.rotation.y += (settings?.speed?.planet) ?? defaults.speed.planet;
    group.rotation.y += (settings?.speed?.ring) ?? defaults.speed.ring;
    stars.rotation.y += (settings?.speed?.stars) ?? defaults.speed.stars;
    if (textRingA) textRingA.rotation.y += (settings?.textRings?.a?.speed) ?? defaults.textRings.a.speed;
    if (textRingB) textRingB.rotation.y += (settings?.textRings?.b?.speed) ?? defaults.textRings.b.speed;
    // Cinematic sequence has highest priority
    if (cinematic.active) {
      const now = performance.now();
      const tSec = (now - cinematic.startMs) / 1000;
      const dur = Math.max(0.1, cinematic.durationSec || 10);
      const p = Math.min(1, Math.max(0, tSec / dur));
      // Total azimuth rotation over the whole duration
      const az = (cinematic.baseAzimuthDeg + (cinematic.rotateDeg || 0) * p) % 360;
      // Distance behavior
      let dist;
      if (cinematic.distanceMode === 'hold' && isFinite(cinematic.fixedDistance)) {
        dist = cinematic.fixedDistance;
      } else if (cinematic.distanceMode === 'path' && isFinite(cinematic.distancePathStart) && isFinite(cinematic.distancePathEnd)) {
        const easeInOut = (x)=> 0.5 - 0.5*Math.cos(Math.PI * x);
        const pp = easeInOut(p);
        const baseD = cinematic.distancePathStart + (cinematic.distancePathEnd - cinematic.distancePathStart) * pp;
        const bobD = (cinematic.distanceBobAmp||0) * Math.sin(2*Math.PI * (cinematic.distanceBobHz||0.2) * tSec);
        dist = baseD + bobD;
      } else {
        // Zoom in first half, zoom out second half (smooth)
        const easeInOut = (x)=> 0.5 - 0.5*Math.cos(Math.PI * x);
        if (p <= 0.5) {
          const k = easeInOut(p * 2); // 0 -> 1
          dist = cinematic.distFar + (cinematic.distNear - cinematic.distFar) * k;
        } else {
          const k = easeInOut((p - 0.5) * 2); // 0 -> 1
          dist = cinematic.distNear + (cinematic.distFar - cinematic.distNear) * k;
        }
      }
      dist = Math.max(20, Math.min(1000, dist));
      // Polar behavior
      let polar;
      if (cinematic.polarMode === 'hold' && isFinite(cinematic.fixedPolarDeg)) {
        polar = cinematic.fixedPolarDeg;
      } else if (cinematic.polarMode === 'path' && isFinite(cinematic.polarStartDeg) && isFinite(cinematic.polarEndDeg)) {
        // ease between start and end, optional bob overlay
        const easeInOut = (x)=> 0.5 - 0.5*Math.cos(Math.PI * x);
        const pp = easeInOut(p);
        const base = cinematic.polarStartDeg + (cinematic.polarEndDeg - cinematic.polarStartDeg) * pp;
        const bob = (cinematic.polarBobAmpDeg||0) * Math.sin(2*Math.PI * (cinematic.polarBobHz||0.06) * tSec);
        polar = base + bob;
      } else {
        // Vertical bob using fly cam parameters
        const fly = Object.assign({}, defaults.camera.fly || {}, settings?.camera?.fly || {});
        polar = (fly.polarCenterDeg ?? 55) + (fly.polarAmpDeg ?? 20) * Math.sin(2*Math.PI * (fly.polarHz ?? 0.06) * tSec);
        polar = Math.max(5, Math.min(175, polar));
      }
      setCameraSpherical(az, polar, dist);
      if (controls) {
        controls.autoRotate = false;
        controls.enableRotate = false;
        controls.enableZoom = false;
        controls.enablePan = false;
      }
      // End condition
      if (p >= 1) {
        // Snap exactly to final target
        const finalAz = (cinematic.baseAzimuthDeg + (cinematic.rotateDeg || 0)) % 360;
        let finalDist;
        if (cinematic.distanceMode === 'hold' && isFinite(cinematic.fixedDistance)) {
          finalDist = cinematic.fixedDistance;
        } else if (cinematic.distanceMode === 'path' && isFinite(cinematic.distancePathEnd)) {
          finalDist = cinematic.distancePathEnd;
        } else {
          finalDist = dist;
        }
        let finalPolar;
        if (cinematic.polarMode === 'hold' && isFinite(cinematic.fixedPolarDeg)) {
          finalPolar = cinematic.fixedPolarDeg;
        } else if (cinematic.polarMode === 'path' && isFinite(cinematic.polarEndDeg)) {
          finalPolar = cinematic.polarEndDeg;
        } else {
          finalPolar = polar;
        }
  // Apply final transform and persist as the new baseline for normal view
  setCameraSpherical(finalAz, finalPolar, finalDist);
  // Persist into settings so subsequent manual/fly use this as baseline
  setCameraParams({ azimuthDeg: finalAz, polarDeg: finalPolar, distance: finalDist });
        cinematic.active = false;
        // restore or keep fly disabled based on preference
        if (cinematic.savedFlyEnabled !== null) {
          const wantResume = !!cinematic.resumeFlyAfter;
          if (wantResume) {
            setCameraParams({ fly: { enabled: cinematic.savedFlyEnabled } });
          } else {
            setCameraParams({ fly: { enabled: false } });
          }
          cinematic.savedFlyEnabled = null;
        }
      }
    }
    // FlyCam: auto orbit + vertical bob + dolly in/out
    else if (settings?.camera?.fly?.enabled) {
      const fly = Object.assign({}, defaults.camera.fly || {}, settings.camera.fly || {});
      const k = Math.max(0.05, fly.speed ?? 1.0);
      const t = (performance.now() - flyStartMs) / 1000; // seconds
      const baseAz = (settings?.camera?.azimuthDeg) ?? defaults.camera.azimuthDeg;
      const az = baseAz + (fly.azimuthSpeedDegPerSec * k) * t;
      let polar = (fly.polarCenterDeg ?? defaults.camera.fly.polarCenterDeg) + (fly.polarAmpDeg ?? defaults.camera.fly.polarAmpDeg) * Math.sin(2*Math.PI * ((fly.polarHz ?? defaults.camera.fly.polarHz) * k) * t);
      let dist = (fly.distanceBase ?? defaults.camera.fly.distanceBase) + (fly.distanceAmp ?? defaults.camera.fly.distanceAmp) * (0.5 + 0.5*Math.sin(2*Math.PI * ((fly.distanceHz ?? defaults.camera.fly.distanceHz) * k) * t + Math.PI/2));
      // Clamp to safe ranges
      polar = Math.max(5, Math.min(175, polar));
      dist = Math.max(20, Math.min(1000, dist));
      if (!isFinite(polar) || !isFinite(dist) || !isFinite(az)) {
        setCameraFromSettings();
      } else {
        setCameraSpherical(az % 360, polar, dist);
      }
      if (controls) {
        controls.autoRotate = false;
        controls.enableRotate = false;
        controls.enableZoom = false;
        controls.enablePan = false;
      }
    } else {
      if (controls) {
        controls.enableRotate = true;
        controls.enableZoom = true;
        controls.enablePan = true;
        controls.update();
      }
    }
    renderer.render(scene, camera);
  }

  function start(s){
    settings = mergeSettings(s);
    if (!inited) {
      initOnce();
      applySettings(true);
    } else {
      applySettings(false);
    }
    if (!inited || api.isRunning) return;
    api.isRunning = true;
    flyStartMs = performance.now();
    loop();
  }

  function stop(){
    if (!api.isRunning) return;
    api.isRunning = false;
    if (animId != null) {
      window.cancelAnimationFrame(animId);
      animId = null;
    }
  }

  function setSettings(s){
    settings = mergeSettings(s);
    if (inited) applySettings(false);
  }

  function disposeObject3D(obj){
    if (!obj) return;
    const disposedMaterials = new Set();
    const disposedTextures = new Set();
    obj.traverse(n => {
      if (n.isMesh || n.isSprite) {
        try { if (n.geometry) n.geometry.dispose(); } catch(e){}
        const mat = n.material;
        if (Array.isArray(mat)) {
          mat.forEach(m => {
            if (!m) return;
            const tex = m.map;
            if (tex && !disposedTextures.has(tex)) { try { tex.dispose?.(); } catch(e){} disposedTextures.add(tex); }
            if (!disposedMaterials.has(m)) { try { m.dispose?.(); } catch(e){} disposedMaterials.add(m); }
          });
        } else if (mat) {
          const tex = mat.map;
          if (tex && !disposedTextures.has(tex)) { try { tex.dispose?.(); } catch(e){} disposedTextures.add(tex); }
          if (!disposedMaterials.has(mat)) { try { mat.dispose?.(); } catch(e){} disposedMaterials.add(mat); }
        }
      }
    });
  }

  function rebuildStars(){
    if (stars) {
      scene.remove(stars);
      if (stars.geometry) stars.geometry.dispose();
      if (stars.material) stars.material.dispose();
      stars = null;
    }
    const count = settings.stars.count|0;
    const starsGeometry = new THREE.BufferGeometry();
    const starPositions = new Float32Array(Math.max(0, count) * 3);
    for (let i = 0; i < starPositions.length; i++) starPositions[i] = (Math.random() - 0.5) * 2000;
    starsGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    const starsMaterial = new THREE.PointsMaterial({ color: 0xffffff, size: 1 });
    stars = new THREE.Points(starsGeometry, starsMaterial);
    scene.add(stars);
  }

  function rebuildPlanet(){
    if (planet) {
      if (planet.material && planet.material.map) { try { planet.material.map.dispose(); } catch(e){} }
      if (planet.material) planet.material.dispose();
      if (planet.geometry) planet.geometry.dispose();
      scene.remove(planet);
      planet = null;
    }
    const tex = settings.planet.textureUrl ? new THREE.TextureLoader().load(settings.planet.textureUrl) : null;
    const mat = new THREE.MeshStandardMaterial(tex ? { map: tex } : {});
    planet = new THREE.Mesh(new THREE.SphereGeometry(settings.planet.radius, 64, 64), mat);
    scene.add(planet);
  }

  function rebuildRing(){
    if (group) {
      disposeObject3D(group);
      scene.remove(group);
      group = null;
    }
    group = new THREE.Group();
    const n = settings.ring.count|0;
    const urlsRaw = (settings.ring.imageUrls && settings.ring.imageUrls.length)
      ? settings.ring.imageUrls
      : (settings.ring.imageUrl ? [settings.ring.imageUrl] : (defaults.ring.imageUrls || []));

    // Build rounded+glow textures from URLs
    const materials = (function(){
      const arr = [];
      const useRounded = !!(settings.ring.rounded?.enabled ?? defaults.ring.rounded?.enabled);
      const urls = (urlsRaw && urlsRaw.length) ? urlsRaw : [];
      if (!urls.length) {
        const tex = makeRoundedGlowTextureFromUrl(null, settings.ring);
        arr.push(new THREE.SpriteMaterial({ map: tex, transparent: true }));
        return arr;
      }
      urls.forEach(u => {
        const tex = useRounded ? makeRoundedGlowTextureFromUrl(u, settings.ring) : makeSimpleTextureFromUrl(u);
        arr.push(new THREE.SpriteMaterial({ map: tex, transparent: true }));
      });
      return arr;
    })();

    // Build a flat, thick belt like Saturn's rings: all objects near y=0, radial thickness = spread
    const baseR = Number(settings.ring.radius) || defaults.ring.radius;
    const thick = Math.max(0, Number(settings.ring.spread) || defaults.ring.spread);
    const innerR = Math.max(1, baseR - thick * 0.5);
    const outerR = Math.max(innerR + 0.1, baseR + thick * 0.5);
    const height = Math.max(0, Number(settings.ring.height ?? defaults.ring.height ?? 0)); // vertical jitter
  const haloOn = !!(settings.ring.haloEnabled ?? defaults.ring.haloEnabled);
  const haloScale = Math.max(1.05, Number(settings.ring.haloScale ?? defaults.ring.haloScale ?? 1.6));
  const haloOpacity = Math.max(0, Math.min(1, Number(settings.ring.haloOpacity ?? defaults.ring.haloOpacity ?? 0.6)));
  const haloColor = new THREE.Color(settings.ring.haloColor || defaults.ring.haloColor || '#ffffff');
    for (let i = 0; i < n; i++) {
      const s = Math.max(0.1, settings.ring.boxSize || 1);
      const baseMat = materials[(Math.random() * materials.length)|0];
      const r = innerR + Math.random() * (outerR - innerR);
      const angle = Math.random() * Math.PI * 2;
      const y = height > 0 ? (Math.random() - 0.5) * height : 0;

      // Single sprite using rounded+glow texture material
      const spr = new THREE.Sprite(baseMat);
      spr.scale.set(s, s, 1);
      spr.position.set(Math.cos(angle) * r, y, Math.sin(angle) * r);
      group.add(spr);
    }
    scene.add(group);
  }

  // Helpers to generate rounded-rectangle textures with white glow from image URLs
  function makeSimpleTextureFromUrl(url){
    const loader = new THREE.TextureLoader();
    try {
      const t = loader.load(url || '');
      t.needsUpdate = true;
      if (THREE.SRGBColorSpace) t.colorSpace = THREE.SRGBColorSpace;
      return t;
    } catch(e){
      const tex = new THREE.CanvasTexture(document.createElement('canvas'));
      tex.needsUpdate = true;
      return tex;
    }
  }

  function drawRoundedRect(ctx, x, y, w, h, r){
    const rr = Math.max(0, Math.min(Math.min(w,h)/2, r||0));
    ctx.beginPath();
    ctx.moveTo(x+rr, y);
    ctx.arcTo(x+w, y, x+w, y+h, rr);
    ctx.arcTo(x+w, y+h, x, y+h, rr);
    ctx.arcTo(x, y+h, x, y, rr);
    ctx.arcTo(x, y, x+w, y, rr);
    ctx.closePath();
  }

  function makeRoundedGlowTextureFromUrl(url, ringOpts){
    const scale = window.devicePixelRatio || 1;
    const size = 128; // base logical size
    const padding = 8; // to avoid clipping shadow
    const W = (size + padding*2);
    const H = (size + padding*2);
    const canvas = document.createElement('canvas');
    canvas.width = W * scale; canvas.height = H * scale;
    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);

    const cornerRatio = Math.max(0, Math.min(0.49, (ringOpts?.rounded?.cornerRatio ?? 0.28)));
    const glowBlur = Math.max(0, Number(ringOpts?.rounded?.glowBlur ?? 18));
    const glowOpacity = Math.max(0, Math.min(1, Number(ringOpts?.rounded?.glowOpacity ?? 0.85)));
    const rectX = padding, rectY = padding, rectW = size, rectH = size, radius = cornerRatio * Math.min(rectW, rectH);

    function render(img){
      ctx.clearRect(0,0,W,H);
      // Outer glow using shadow
      ctx.save();
      ctx.shadowColor = `rgba(255,255,255,${glowOpacity})`;
      ctx.shadowBlur = glowBlur;
      ctx.fillStyle = 'rgba(255,255,255,0.01)';
      drawRoundedRect(ctx, rectX, rectY, rectW, rectH, radius);
      ctx.fill();
      ctx.restore();

      // Clip rounded rect and draw image (or fallback fill)
      ctx.save();
      drawRoundedRect(ctx, rectX, rectY, rectW, rectH, radius);
      ctx.clip();
      if (img) {
        // cover fit
        ctx.drawImage(img, rectX, rectY, rectW, rectH);
      } else {
        const grd = ctx.createLinearGradient(rectX, rectY, rectX+rectW, rectY+rectH);
        grd.addColorStop(0, '#ffffff');
        grd.addColorStop(1, '#e5e7eb');
        ctx.fillStyle = grd;
        ctx.fillRect(rectX, rectY, rectW, rectH);
      }
      ctx.restore();

      // White border stroke
      ctx.save();
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      drawRoundedRect(ctx, rectX, rectY, rectW, rectH, radius);
      ctx.stroke();
      ctx.restore();
    }

    // Initial render without image
    render(null);
    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;

    // Load image async and redraw
    if (url) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = function(){
        render(img);
        tex.needsUpdate = true;
      };
      img.onerror = function(){ /* ignore */ };
      img.src = url;
    }
    return tex;
  }

  function disposeTextRing(r){
    if (!r) return;
    r.children.forEach(ch => {
      if (ch.material && ch.material.map) { ch.material.map.dispose?.(); }
      if (ch.material) ch.material.dispose?.();
      if (ch.geometry) ch.geometry.dispose?.();
    });
  }

  function makeCharSprite(ch, colorHex, sizeWorld){
    const canvas = document.createElement('canvas');
    const scale = window.devicePixelRatio || 1;
    canvas.width = 128 * scale; canvas.height = 128 * scale;
    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);
    ctx.clearRect(0,0,128,128);
    // White glow shadow
    ctx.shadowColor = 'rgba(255,255,255,0.95)';
    ctx.shadowBlur = 16;
    ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 72px Arial, sans-serif';
    // Fill text with chosen color
    ctx.fillStyle = colorHex || '#ffffff';
    ctx.fillText(ch, 64, 64);
    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
    const sprite = new THREE.Sprite(mat);
    const s = Math.max(0.1, sizeWorld || 8);
    sprite.scale.set(s, s, 1);
    return sprite;
  }

  function buildTextRing(params){
    const grp = new THREE.Group();
    const raw = (params.text || '').toString();
    let base = raw.replace(/\s+/g, ' ');
    base = base.trim();
    if (!base.length) base = '❤';
    const letters = base.split('');

    const radius = Math.max(1, params.radius || 100);
    const sizeW = Math.max(0.1, params.size || 10);
    // Target spacing slightly less than glyph size for tighter look
    const spacing = sizeW * 0.9;
    const circumference = 2 * Math.PI * radius;
    let needed = Math.ceil(circumference / spacing);
    needed = Math.min(Math.max(needed, letters.length), 600); // clamp upper bound for perf

    // Build repeated sequence to fill ring
    // Note: use negative angle to ensure left-to-right reading on the near side
    for (let i = 0; i < needed; i++) {
      const ch = letters[i % letters.length] === ' ' ? '·' : letters[i % letters.length];
      const sp = makeCharSprite(ch, params.color || '#ffffff', sizeW);
      const angle = -(i / needed) * Math.PI * 2;
      sp.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
      grp.add(sp);
    }
    grp.rotation.x = (params.tiltDeg || 0) * Math.PI / 180;
    return grp;
  }

  function rebuildTextRings(){
    if (textRingA) { disposeTextRing(textRingA); scene.remove(textRingA); textRingA = null; }
    if (textRingB) { disposeTextRing(textRingB); scene.remove(textRingB); textRingB = null; }
    textRingA = buildTextRing(settings.textRings.a);
    textRingB = buildTextRing(settings.textRings.b);
    scene.add(textRingA);
    scene.add(textRingB);
  }

  function applySettings(firstTime){
    // camera
    camera.fov = settings.camera.fov;
    camera.updateProjectionMatrix();
    setCameraFromSettings();
    if (controls) {
      controls.autoRotate = !!settings.camera.autoRotate;
      controls.autoRotateSpeed = settings.camera.autoRotateSpeed;
      // toggle interaction by fly state
      const fly = settings.camera.fly || defaults.camera.fly;
      if (fly && fly.enabled) {
        controls.enableRotate = false; controls.enableZoom = false; controls.enablePan = false;
        controls.autoRotate = false;
      } else {
        controls.enableRotate = true; controls.enableZoom = true; controls.enablePan = true;
      }
      controls.update();
    }
    // lights
    if (pointLight) pointLight.intensity = settings.lights.point;
    if (ambientLight) ambientLight.intensity = settings.lights.ambient;
    // rebuild objects
    rebuildStars();
    rebuildPlanet();
    rebuildRing();
    rebuildTextRings();
  }

  function setCameraFromSettings(){
    const dist = (settings?.camera?.distance) ?? defaults.camera.distance;
    const azDeg = (settings?.camera?.azimuthDeg) ?? defaults.camera.azimuthDeg; // around Y
    const poDeg = (settings?.camera?.polarDeg) ?? defaults.camera.polarDeg;     // from top
    const theta = azDeg * Math.PI/180; // azimuth around Y
    const phi = poDeg * Math.PI/180;   // polar from +Y
    // Spherical to Cartesian (Y up):
    const x = dist * Math.sin(phi) * Math.cos(theta);
    const y = dist * Math.cos(phi);
    const z = dist * Math.sin(phi) * Math.sin(theta);
    camera.position.set(x, y, z);
    camera.lookAt(0,0,0);
  }

  // Helper: place camera by spherical coordinates (degrees)
  function setCameraSpherical(azDeg, poDeg, dist){
    const theta = azDeg * Math.PI/180;
    const phi = poDeg * Math.PI/180;
    const x = dist * Math.sin(phi) * Math.cos(theta);
    const y = dist * Math.cos(phi);
    const z = dist * Math.sin(phi) * Math.sin(theta);
    camera.position.set(x, y, z);
    camera.lookAt(0,0,0);
  }

  // Update only camera-related parameters without rebuilding scene objects
  function setCameraParams(p){
    if (!p) return;
    // ensure settings exists
    settings = settings || mergeSettings();
    settings.camera = Object.assign({}, settings.camera || {}, p);
    if (p.fly) {
      settings.camera.fly = Object.assign({}, settings.camera.fly || {}, p.fly);
    }
    // apply immediately
    if (settings.camera.fov !== undefined) {
      camera.fov = settings.camera.fov;
      camera.updateProjectionMatrix();
    }
    if (settings.camera.distance !== undefined || settings.camera.azimuthDeg !== undefined || settings.camera.polarDeg !== undefined) {
      setCameraFromSettings();
    }
    if (controls) {
      controls.autoRotate = !!settings.camera.autoRotate;
      controls.autoRotateSpeed = settings.camera.autoRotateSpeed || controls.autoRotateSpeed;
      const wantInvert = !!settings.camera.invertY;
      controls.rotateSpeed = Math.abs(controls.rotateSpeed) * (wantInvert ? -1 : 1);
      // sync controls interaction according to fly mode
      if (settings.camera.fly && settings.camera.fly.enabled) {
        controls.enableRotate = false; controls.enableZoom = false; controls.enablePan = false; controls.autoRotate = false;
      } else {
        controls.enableRotate = true; controls.enableZoom = true; controls.enablePan = true;
      }
      controls.update();
    }
  }

  // Start a one-shot cinematic orbit+zoom with vertical bobbing
  function startCinematic(opts){
    settings = settings || mergeSettings();
    const fly = Object.assign({}, defaults.camera.fly || {}, settings?.camera?.fly || {});
    // compute near/far distances from fly base/amp
    const base = fly.distanceBase ?? 150;
    const amp = Math.max(0, fly.distanceAmp ?? 50);
    cinematic.distNear = Math.max(20, base - amp);
    cinematic.distFar = Math.min(1000, base + amp);
    cinematic.durationSec = Math.max(0.5, Number(opts?.durationSec) || 10);

    // Determine base (start) azimuth
    const hasStart = Number.isFinite(Number(opts?.startAzimuthDeg));
    const hasEnd = Number.isFinite(Number(opts?.endAzimuthDeg));
    const currentAz = (settings?.camera?.azimuthDeg) ?? defaults.camera.azimuthDeg;
    const startAz = hasStart ? Number(opts.startAzimuthDeg) : currentAz;
    cinematic.baseAzimuthDeg = startAz;

    // Determine rotation amount
    if (hasEnd) {
      const endAz = Number(opts.endAzimuthDeg);
      cinematic.rotateDeg = endAz - startAz;
    } else {
      cinematic.rotateDeg = Number(opts?.rotateDeg);
      if (!Number.isFinite(cinematic.rotateDeg)) cinematic.rotateDeg = 360;
    }

    // Configure distance behavior
    const pos = camera?.position;
    const r = pos ? Math.sqrt(pos.x*pos.x + pos.y*pos.y + pos.z*pos.z) : ((settings?.camera?.distance) ?? defaults.camera.distance);
    // polar from camera (phi from +Y) in degrees
    const phiRad = pos && r > 1e-6 ? Math.acos(Math.max(-1, Math.min(1, pos.y / r))) : ((settings?.camera?.polarDeg) ?? defaults.camera.polarDeg) * Math.PI/180;
    const currentPolarDeg = phiRad * 180/Math.PI;
    const hasStartDist = Number.isFinite(Number(opts?.startDistance));
    const hasEndDist = Number.isFinite(Number(opts?.endDistance));
    if (hasStartDist || hasEndDist) {
      cinematic.distanceMode = 'path';
      cinematic.distancePathStart = hasStartDist ? Number(opts.startDistance) : r;
      cinematic.distancePathEnd = hasEndDist ? Number(opts.endDistance) : r;
      cinematic.distanceBobAmp = Number.isFinite(Number(opts?.distanceBobAmp)) ? Number(opts.distanceBobAmp) : 0;
      cinematic.distanceBobHz = Number.isFinite(Number(opts?.distanceBobHz)) ? Number(opts.distanceBobHz) : 0.2;
    } else {
      const distanceMode = (opts && (opts.distanceMode === 'hold' || opts.distanceMode === 'inOut')) ? opts.distanceMode : (opts?.keepDistance ? 'hold' : 'inOut');
      cinematic.distanceMode = distanceMode;
      cinematic.fixedDistance = Number.isFinite(Number(opts?.distance)) ? Number(opts.distance) : r;
      cinematic.distancePathStart = null;
      cinematic.distancePathEnd = null;
      cinematic.distanceBobAmp = 0;
      cinematic.distanceBobHz = 0.2;
    }
    // Configure polar behavior
    const hasStartPolar = Number.isFinite(Number(opts?.startPolarDeg));
    const hasEndPolar = Number.isFinite(Number(opts?.endPolarDeg));
    if (hasStartPolar || hasEndPolar) {
      cinematic.polarMode = 'path';
      const sp = hasStartPolar ? Number(opts.startPolarDeg) : currentPolarDeg;
      const ep = hasEndPolar ? Number(opts.endPolarDeg) : currentPolarDeg;
      cinematic.polarStartDeg = Math.max(5, Math.min(175, sp));
      cinematic.polarEndDeg = Math.max(5, Math.min(175, ep));
      cinematic.polarBobAmpDeg = Number.isFinite(Number(opts?.polarBobAmpDeg)) ? Number(opts.polarBobAmpDeg) : 0;
      cinematic.polarBobHz = Number.isFinite(Number(opts?.polarBobHz)) ? Number(opts.polarBobHz) : 0.06;
    } else {
      const polarMode = (opts && (opts.polarMode === 'hold' || opts.polarMode === 'bob')) ? opts.polarMode : (opts?.keepPolar ? 'hold' : 'bob');
      cinematic.polarMode = polarMode;
      cinematic.fixedPolarDeg = Number.isFinite(Number(opts?.polarDeg)) ? Number(opts.polarDeg) : currentPolarDeg;
      cinematic.polarStartDeg = null;
      cinematic.polarEndDeg = null;
      cinematic.polarBobAmpDeg = 0;
      cinematic.polarBobHz = 0.06;
    }
    // Resume behavior
    cinematic.resumeFlyAfter = (opts?.resumeFlyAfter === undefined) ? false : !!opts.resumeFlyAfter;

    // Temporarily disable fly cam during cinematic, store old value to restore
    cinematic.savedFlyEnabled = !!(settings?.camera?.fly?.enabled);
    setCameraParams({ fly: { enabled: false } });
    // reset timeline
    cinematic.startMs = performance.now();
    cinematic.active = true;
  }

  function stopCinematic(){
    if (!cinematic.active) return;
    cinematic.active = false;
    if (cinematic.savedFlyEnabled !== null) {
      setCameraParams({ fly: { enabled: cinematic.savedFlyEnabled } });
      cinematic.savedFlyEnabled = null;
    }
  }

  // Very small fallback: drag to orbit and wheel to zoom
  function enableBasicMouseControls(){
    const el = renderer.domElement;
    let dragging = false;
    let lastX = 0, lastY = 0;
    const rotSpeed = 0.3; // deg per px
    el.addEventListener('pointerdown', (e)=>{ dragging = true; lastX = e.clientX; lastY = e.clientY; el.setPointerCapture?.(e.pointerId); });
    el.addEventListener('pointerup', (e)=>{ dragging = false; el.releasePointerCapture?.(e.pointerId); });
    el.addEventListener('pointerleave', ()=>{ dragging = false; });
    el.addEventListener('pointermove', (e)=>{
      if (!dragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY;
      const cam = settings?.camera || defaults.camera;
      const invert = !!(cam.invertY ?? defaults.camera.invertY);
      const az = (cam.azimuthDeg ?? defaults.camera.azimuthDeg) + dx * rotSpeed;
      let po = (cam.polarDeg ?? defaults.camera.polarDeg) + (invert ? -dy : dy) * rotSpeed;
      po = Math.max(5, Math.min(175, po));
      setCameraParams({ azimuthDeg: az, polarDeg: po });
    });
    el.addEventListener('wheel', (e)=>{
      e.preventDefault();
      const cam = settings?.camera || defaults.camera;
      let dist = (cam.distance ?? defaults.camera.distance) + (e.deltaY > 0 ? 10 : -10);
      dist = Math.max(20, Math.min(1000, dist));
      setCameraParams({ distance: dist });
    }, { passive: false });
  }
})();
