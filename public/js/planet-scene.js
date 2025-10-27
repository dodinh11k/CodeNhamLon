;(function(){
  // Expose a small controller so the page can start/stop the scene
  const api = { start, stop, setSettings, isRunning: false };
  window.PlanetScene = api;

  let container, scene, camera, renderer, controls, stars, planet, group, pointLight, ambientLight;
  let animId = null;
  let inited = false;
  let settings = null;

  const defaults = {
    stars: { count: 2000 },
    planet: { radius: 20, textureUrl: 'https://i.imgur.com/UYb5hMP.jpg' },
    ring: { count: 800, radius: 60, spread: 20, boxSize: 1 },
    speed: { planet: 0.002, ring: 0.004, stars: 0.0005 },
    camera: { distance: 150 },
    lights: { point: 2, ambient: 0.25 }
  };

  function mergeSettings(s){
    const d = JSON.parse(JSON.stringify(defaults));
    if (!s) return d;
    return {
      stars: { ...d.stars, ...(s.stars||{}) },
      planet: { ...d.planet, ...(s.planet||{}) },
      ring: { ...d.ring, ...(s.ring||{}) },
      speed: { ...d.speed, ...(s.speed||{}) },
      camera: { ...d.camera, ...(s.camera||{}) },
      lights: { ...d.lights, ...(s.lights||{}) }
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
      camera.position.set(0, 0, (settings?.camera?.distance) ?? defaults.camera.distance);
      controls.update();
    } else {
      // Fallback: position camera and allow simple auto-rotate if controls not found
      camera.position.set(0, 0, 150);
      controls = null;
      console.warn('OrbitControls not found; continuing without mouse controls');
    }

    window.addEventListener('resize', api._onResize);
    inited = true;
  }

  function loop(){
    animId = window.requestAnimationFrame(loop);
    planet.rotation.y += (settings?.speed?.planet) ?? defaults.speed.planet;
    group.rotation.y += (settings?.speed?.ring) ?? defaults.speed.ring;
    stars.rotation.y += (settings?.speed?.stars) ?? defaults.speed.stars;
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
    obj.traverse(n => {
      if (n.isMesh) {
        if (n.geometry) n.geometry.dispose();
        if (n.material) {
          if (Array.isArray(n.material)) n.material.forEach(m => m.dispose());
          else n.material.dispose();
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
    for (let i = 0; i < n; i++) {
      const s = settings.ring.boxSize;
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(s, s, s),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(`hsl(${Math.random()*360},80%,60%)`) })
      );
      const radius = settings.ring.radius + (Math.random() - 0.5) * settings.ring.spread;
      const angle = Math.random() * Math.PI * 2;
      const y = (Math.random() - 0.5) * (settings.ring.spread * 0.5);
      box.position.set(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
      group.add(box);
    }
    scene.add(group);
  }

  function applySettings(firstTime){
    // camera
    camera.position.set(0, 0, settings.camera.distance);
    if (controls) controls.update();
    // lights
    if (pointLight) pointLight.intensity = settings.lights.point;
    if (ambientLight) ambientLight.intensity = settings.lights.ambient;
    // rebuild objects
    rebuildStars();
    rebuildPlanet();
    rebuildRing();
  }
})();
