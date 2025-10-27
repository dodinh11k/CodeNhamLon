/*
 * Settings
 */
var settings = {
    particles: {
        length: 500, // maximum amount of particles
        duration: 2, // particle duration in sec
        velocity: 100, // particle velocity in pixels/sec
        effect: -0.75, // play with this for a nice effect
        size: 30, // particle size in pixels
    },
    // optional orbiting images configuration
    orbiters: {
        count: 0,        // number of orbiting images
        radius: 120,     // radius of orbit in pixels
        speed: 1.0,      // angular speed (radians per second)
        size: 40,        // rendered size of each orbiter image
        images: []       // array of image URLs (strings)
    },
};

/*
 * RequestAnimationFrame polyfill by Erik Möller
 */
(function () { var b = 0; var c = ["ms", "moz", "webkit", "o"]; for (var a = 0; a < c.length && !window.requestAnimationFrame; ++a) { window.requestAnimationFrame = window[c[a] + "RequestAnimationFrame"]; window.cancelAnimationFrame = window[c[a] + "CancelAnimationFrame"] || window[c[a] + "CancelRequestAnimationFrame"] } if (!window.requestAnimationFrame) { window.requestAnimationFrame = function (h, e) { var d = new Date().getTime(); var f = Math.max(0, 16 - (d - b)); var g = window.setTimeout(function () { h(d + f) }, f); b = d + f; return g } } if (!window.cancelAnimationFrame) { window.cancelAnimationFrame = function (d) { clearTimeout(d) } } }());

/*
 * Point class
 */
var Point = (function () {
    function Point(x, y) {
        this.x = (typeof x !== 'undefined') ? x : 0;
        this.y = (typeof y !== 'undefined') ? y : 0;
    }

    Point.prototype.clone = function () {
        return new Point(this.x, this.y);
    };

    Point.prototype.length = function (length) {
        if (typeof length == 'undefined')
            return Math.sqrt(this.x * this.x + this.y * this.y);
        this.normalize();
        this.x *= length;
        this.y *= length;
        return this;
    };

    Point.prototype.normalize = function () {
        var length = this.length();
        this.x /= length;
        this.y /= length;
        return this;
    };

    return Point;
})();

/*
 * Particle class
 */
var Particle = (function () {
    function Particle() {
        this.position = new Point();
        this.velocity = new Point();
        this.acceleration = new Point();
        this.age = 0;
    }

    Particle.prototype.initialize = function (x, y, dx, dy) {
        this.position.x = x;
        this.position.y = y;
        this.velocity.x = dx;
        this.velocity.y = dy;
        this.acceleration.x = dx * settings.particles.effect;
        this.acceleration.y = dy * settings.particles.effect;
        this.age = 0;
    };

    Particle.prototype.update = function (deltaTime) {
        this.position.x += this.velocity.x * deltaTime;
        this.position.y += this.velocity.y * deltaTime;
        this.velocity.x += this.acceleration.x * deltaTime;
        this.velocity.y += this.acceleration.y * deltaTime;
        this.age += deltaTime;
    };

    Particle.prototype.draw = function (context, image) {
        function ease(t) {
            return (--t) * t * t + 1;
        }
        var size = image.width * ease(this.age / settings.particles.duration);
        context.globalAlpha = 1 - this.age / settings.particles.duration;
        context.drawImage(image, this.position.x - size / 2, this.position.y - size / 2, size, size);
    };

    return Particle;
})();

/*
 * ParticlePool class
 */
var ParticlePool = (function () {
    var particles,
        firstActive = 0,
        firstFree = 0,
        duration = settings.particles.duration;

    function ParticlePool(length) {
        // create and populate particle pool
        particles = new Array(length);
        for (var i = 0; i < particles.length; i++)
            particles[i] = new Particle();
    }

    ParticlePool.prototype.add = function (x, y, dx, dy) {
        particles[firstFree].initialize(x, y, dx, dy);

        // handle circular queue
        firstFree++;
        if (firstFree == particles.length) firstFree = 0;
        if (firstActive == firstFree) firstActive++;
        if (firstActive == particles.length) firstActive = 0;
    };

    ParticlePool.prototype.update = function (deltaTime) {
        var i;

        // update active particles
        if (firstActive < firstFree) {
            for (i = firstActive; i < firstFree; i++)
                particles[i].update(deltaTime);
        }
        if (firstFree < firstActive) {
            for (i = firstActive; i < particles.length; i++)
                particles[i].update(deltaTime);
            for (i = 0; i < firstFree; i++)
                particles[i].update(deltaTime);
        }

        // remove inactive particles
        while (particles[firstActive].age >= duration && firstActive != firstFree) {
            firstActive++;
            if (firstActive == particles.length) firstActive = 0;
        }
    };

    ParticlePool.prototype.draw = function (context, image) {
        // draw active particles
        if (firstActive < firstFree) {
            for (i = firstActive; i < firstFree; i++)
                particles[i].draw(context, image);
        }
        if (firstFree < firstActive) {
            for (i = firstActive; i < particles.length; i++)
                particles[i].draw(context, image);
            for (i = 0; i < firstFree; i++)
                particles[i].draw(context, image);
        }
    };

    return ParticlePool;
})();

/*
 * Putting it all together
 */
function initHeartAnimation() {
    var canvas = document.getElementById('pinkboard'),
        context = canvas.getContext('2d'),
        particles = new ParticlePool(settings.particles.length),
        particleRate = settings.particles.length / settings.particles.duration, // particles/sec
        time;

    // get point on heart with -PI <= t <= PI
    function pointOnHeart(t) {
        var h = settings.heartScale || 1;
        return new Point(
            h * (160 * Math.pow(Math.sin(t), 3)),
            h * (130 * Math.cos(t) - 50 * Math.cos(2 * t) - 20 * Math.cos(3 * t) - 10 * Math.cos(4 * t) + 25)
        );
    }

    // creating the particle image using a dummy canvas
    var image = (function () {
        var canvas = document.createElement('canvas'),
            context = canvas.getContext('2d');
        canvas.width = settings.particles.size;
        canvas.height = settings.particles.size;

        // helper function to create the path
        function to(t) {
            var point = pointOnHeart(t);
            point.x = settings.particles.size / 2 + point.x * settings.particles.size / 350;
            point.y = settings.particles.size / 2 - point.y * settings.particles.size / 350;
            return point;
        }

        // create the path
        context.beginPath();
        var t = -Math.PI;
        var point = to(t);
        context.moveTo(point.x, point.y);
        while (t < Math.PI) {
            t += 0.01; // baby steps!
            point = to(t);
            context.lineTo(point.x, point.y);
        }
        context.closePath();
        // create the fill
        context.fillStyle = '#ea80b0';
        context.fill();
        // create the image
        var image = new Image();
        image.src = canvas.toDataURL();
        return image;
    })();

    // prepare orbit images (may be empty)
    var orbitImages = [];
    function preloadOrbitImages(urls, cb) {
        orbitImages = [];
        if (!urls || !urls.length) return cb && cb();
        var loaded = 0;
        for (var i = 0; i < urls.length; i++) {
            (function (i) {
                var img = new Image();
                img.crossOrigin = 'anonymous';
                img.onload = function () { loaded++; if (loaded === urls.length) cb && cb(); };
                img.onerror = function () { loaded++; if (loaded === urls.length) cb && cb(); };
                img.src = urls[i];
                orbitImages.push(img);
            })(i);
        }
    }

    // render that thing!
    function render() {
        // next animation frame
        requestAnimationFrame(render);

        // update time
        var newTime = new Date().getTime() / 1000,
            deltaTime = newTime - (time || newTime);
        time = newTime;

        // clear canvas
        context.clearRect(0, 0, canvas.width, canvas.height);

        // create new particles
        var amount = particleRate * deltaTime;
        for (var i = 0; i < amount; i++) {
            var pos = pointOnHeart(Math.PI - 2 * Math.PI * Math.random());
            var dir = pos.clone().length(settings.particles.velocity);
            particles.add(canvas.width / 2 + pos.x, canvas.height / 2 - pos.y, dir.x, -dir.y);
        }

        // update and draw particles
        particles.update(deltaTime);
        particles.draw(context, image);

        // draw optional orbiting images under the heart
        try {
            const ob = settings.orbiters || {};
            const count = ob.count || 0;
            if (count > 0 && orbitImages.length > 0) {
                const cx = canvas.width / 2;
                const cy = canvas.height / 2 + (ob.offsetY || 160) * (settings.heartScale || 1); // xuống thấp hơn
                const radius = (ob.radius || 160) * (settings.heartScale || 1);
                const speed = ob.speed || 1.0;
                const baseSize = ob.size || 40;

                for (let k = 0; k < count; k++) {
                    const img = orbitImages[k % orbitImages.length];
                    if (!img) continue;
                    const angle = time * speed + (k * 2 * Math.PI) / count;

                    // hiệu ứng 3D đơn giản: co giãn kích thước và độ mờ theo sin(angle)
                    const depth = (Math.sin(angle) + 1) / 2; // 0..1
                    const size = baseSize * (0.6 + 0.6 * depth);
                    const alpha = 0.3 + 0.7 * depth;

                    // vị trí: hơi nghiêng xuống để tạo cảm giác xoay chân tim
                    const x = cx + radius * Math.cos(angle);
                    const y = cy + radius * Math.sin(angle) * 0.4; // làm dẹt trục Y để nhìn 3D hơn

                    context.globalAlpha = alpha;
                    context.drawImage(img, x - size / 2, y - size / 2, size, size);
                }
                context.globalAlpha = 1.0; // reset alpha
            }
        } catch (e) { /* ignore */ }
    }

    // handle (re-)sizing of the canvas
    function onResize() {
        canvas.width = canvas.clientWidth;
        canvas.height = canvas.clientHeight;
    }

    window.onresize = onResize;
    window.preloadOrbitImages = preloadOrbitImages;
    // delay rendering bootstrap
    setTimeout(function () {
        onResize();
        render();
    }, 10);
}