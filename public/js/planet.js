const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.getElementById('planetContainer').appendChild(renderer.domElement);

// Background sao
const starsGeometry = new THREE.BufferGeometry();
const starCount = 2000;
const starPositions = new Float32Array(starCount * 3);
for (let i = 0; i < starCount * 3; i++) starPositions[i] = (Math.random() - 0.5) * 2000;
starsGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
const starsMaterial = new THREE.PointsMaterial({ color: 0xffffff, size: 1 });
const stars = new THREE.Points(starsGeometry, starsMaterial);
scene.add(stars);

// Hành tinh
const texture = new THREE.TextureLoader().load('https://i.imgur.com/UYb5hMP.jpg');
const planet = new THREE.Mesh(
    new THREE.SphereGeometry(20, 64, 64),
    new THREE.MeshStandardMaterial({ map: texture })
);
scene.add(planet);

// Ánh sáng
const light = new THREE.PointLight(0xffffff, 2);
light.position.set(50, 50, 50);
scene.add(light);
scene.add(new THREE.AmbientLight(0x404040));

// Các hạt vuông quanh hành tinh
const group = new THREE.Group();
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

// Điều khiển chuột
const controls = new THREE.OrbitControls(camera, renderer.domElement);
camera.position.z = 150;

function animate() {
    requestAnimationFrame(animate);
    planet.rotation.y += 0.002;
    group.rotation.y += 0.004;
    stars.rotation.y += 0.0005;
    renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});