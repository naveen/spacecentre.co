/* spacecentre — deep space, drifting.
   One WebGL scene warps and dissolves between telescope images;
   a 2D canvas on top streaks stars past the viewer between them. */
(() => {
	'use strict';

	const IMAGES = [
		{ file: 'weic2205a', name: 'Cosmic Cliffs in the Carina Nebula', source: 'Webb, 2022', url: 'https://esawebb.org/images/weic2205a/' },
		{ file: 'weic2216a', name: 'Pillars of Creation', source: 'Webb, 2022', url: 'https://esawebb.org/images/weic2216a/' },
		{ file: 'weic2212a', name: 'Tarantula Nebula', source: 'Webb, 2022', url: 'https://esawebb.org/images/weic2212a/' },
		{ file: 'weic2316a', name: 'Rho Ophiuchi cloud complex', source: 'Webb, 2023', url: 'https://esawebb.org/images/weic2316a/' },
		{ file: 'weic2330a', name: 'Cassiopeia A', source: 'Webb, 2023', url: 'https://esawebb.org/images/weic2330a/' },
		{ file: 'heic1808a', name: 'Lagoon Nebula', source: 'Hubble, 2018', url: 'https://esahubble.org/images/heic1808a/' },
		{ file: 'heic1411a', name: 'Hubble Ultra Deep Field', source: 'Hubble, 2014', url: 'https://esahubble.org/images/heic1411a/' },
	];

	const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
	const HOLD = 9000;                       // ms an image sits before drifting to the next
	const TRANS = reduced ? 1400 : 2800;     // ms for the dissolve
	const DPR = Math.min(devicePixelRatio || 1, 2);

	// Visit order: shuffled once per page load, then looped.
	const order = IMAGES.map((_, i) => i);
	for (let i = order.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[order[i], order[j]] = [order[j], order[i]];
	}

	const $ = (id) => document.getElementById(id);
	const space = $('space');
	const starsCanvas = $('stars');
	const caption = $('caption');
	const captionName = $('caption-name');
	const captionSource = $('caption-source');
	const captionLink = $('caption-link');
	const root = document.documentElement;

	const ease = {
		inOut: (x) => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2,
		in: (x) => x * x * x,
		out: (x) => 1 - Math.pow(1 - x, 3),
	};

	/* ------------------------------------------------------------------ */
	/* WebGL scene                                                         */
	/* ------------------------------------------------------------------ */

	const VERT = `
		attribute vec2 p;
		varying vec2 v;
		void main() { v = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`;

	const FRAG = `
		precision highp float;
		varying vec2 v;
		uniform sampler2D tA, tB;
		uniform vec2 res, imgA, imgB, mouse;
		uniform float t, mixv, burst, zA, zB, seedA, seedB, warp;

		float hash(vec2 p) {
			p = fract(p * vec2(123.34, 456.21));
			p += dot(p, p + 45.32);
			return fract(p.x * p.y);
		}
		float noise(vec2 p) {
			vec2 i = floor(p), f = fract(p);
			f = f * f * (3.0 - 2.0 * f);
			float a = hash(i), b = hash(i + vec2(1, 0)), c = hash(i + vec2(0, 1)), d = hash(i + vec2(1, 1));
			return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
		}
		float fbm(vec2 p) {
			float s = 0.0, a = 0.5;
			for (int i = 0; i < 4; i++) { s += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
			return s;
		}

		// Map screen uv to image uv so the image covers the canvas, zoomed and panned.
		vec2 cover(vec2 uv, vec2 img, float zoom, vec2 pan) {
			float ca = res.x / res.y, ia = img.x / img.y;
			vec2 s = ca > ia ? vec2(1.0, ia / ca) : vec2(ca / ia, 1.0);   // visible fraction of the image
			s /= zoom;
			return (uv - 0.5) * s + 0.5 + pan * (1.0 - s) * 0.5;
		}

		// Sample with radial chromatic aberration.
		vec3 tex(sampler2D tx, vec2 uv, vec2 img, float zoom, vec2 pan, float ca) {
			vec2 off = (uv - 0.5) * ca;
			return vec3(
				texture2D(tx, cover(uv - off, img, zoom, pan)).r,
				texture2D(tx, cover(uv,       img, zoom, pan)).g,
				texture2D(tx, cover(uv + off, img, zoom, pan)).b);
		}

		void main() {
			vec2 uv = v;
			vec2 d = uv - 0.5; d.x *= res.x / res.y;
			float r = length(d);

			// Slow domain warp that swells during a transition.
			float amp = warp * (0.006 + 0.034 * burst);
			vec2 w = vec2(fbm(uv * 3.0 + t * 0.07 + seedA), fbm(uv * 3.0 + 11.3 - t * 0.06)) - 0.5;
			uv += w * amp;
			uv += mouse * 0.012 * warp;

			float ca = (0.004 + 0.04 * burst) * warp;
			vec2 panA = vec2(sin(t * 0.045 + seedA), cos(t * 0.037 + seedA * 2.0)) * warp;
			vec2 panB = vec2(sin(t * 0.045 + seedB), cos(t * 0.037 + seedB * 2.0)) * warp;
			vec3 A = tex(tA, uv, imgA, zA, panA, ca);
			vec3 B = tex(tB, uv, imgB, zB, panB, ca);

			// Noise dissolve, blooming slightly from the centre.
			float n = fbm(uv * 4.0 + seedB) + (r - 0.4) * 0.25;
			float th = mix(-0.3, 1.3, mixv);
			float m = 1.0 - smoothstep(th - 0.22, th + 0.22, n);
			vec3 col = mix(A, B, m);

			// Ionised edge along the dissolve front.
			float edge = 1.0 - smoothstep(0.0, 0.1, abs(n - th));
			col += vec3(0.45, 0.8, 1.0) * edge * burst * 0.45;

			// Vignette, then grain.
			col *= 1.0 - smoothstep(0.3, 1.0, r) * 0.6;
			col += (hash(v * res + fract(t) * 7.0) - 0.5) * 0.05;

			gl_FragColor = vec4(col, 1.0);
		}`;

	let gl, prog, uni = {}, texCache = new Map();

	function initGL() {
		gl = space.getContext('webgl', { antialias: false, alpha: false, depth: false, powerPreference: 'high-performance' });
		if (!gl) return false;

		const compile = (type, src) => {
			const s = gl.createShader(type);
			gl.shaderSource(s, src);
			gl.compileShader(s);
			if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
			return s;
		};
		prog = gl.createProgram();
		gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
		gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
		gl.linkProgram(prog);
		if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
		gl.useProgram(prog);

		const buf = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, buf);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
		const loc = gl.getAttribLocation(prog, 'p');
		gl.enableVertexAttribArray(loc);
		gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

		for (const name of ['tA', 'tB', 'res', 'imgA', 'imgB', 'mouse', 't', 'mixv', 'burst', 'zA', 'zB', 'seedA', 'seedB', 'warp']) {
			uni[name] = gl.getUniformLocation(prog, name);
		}
		gl.uniform1i(uni.tA, 0);
		gl.uniform1i(uni.tB, 1);
		gl.uniform1f(uni.warp, reduced ? 0 : 1);
		texCache.clear();
		return true;
	}

	function loadTexture(index) {
		if (texCache.has(index)) return texCache.get(index);
		const p = new Promise((resolve, reject) => {
			const img = new Image();
			img.decoding = 'async';
			img.onload = () => {
				const tex = gl.createTexture();
				gl.bindTexture(gl.TEXTURE_2D, tex);
				gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
				gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
				resolve({ tex, w: img.naturalWidth, h: img.naturalHeight, seed: Math.random() * 100 });
			};
			img.onerror = () => reject(new Error('image failed: ' + IMAGES[index].file));
			img.src = 'space/' + IMAGES[index].file + '.webp';
		});
		texCache.set(index, p);
		return p;
	}

	/* ------------------------------------------------------------------ */
	/* Star streaks (2D canvas, screen-blended over the scene)             */
	/* ------------------------------------------------------------------ */

	const ctx = starsCanvas.getContext('2d');
	const STAR_COUNT = reduced ? 0 : 260;
	const stars = [];
	for (let i = 0; i < STAR_COUNT; i++) stars.push(newStar(Math.random()));

	function newStar(z) {
		return { x: (Math.random() * 2 - 1), y: (Math.random() * 2 - 1), z, s: 0.4 + Math.random() * 1.4 };
	}

	function drawStars(dt, burst, mx, my) {
		const w = starsCanvas.width, h = starsCanvas.height;
		ctx.clearRect(0, 0, w, h);
		if (!STAR_COUNT) return;
		const cx = w * (0.5 + mx * 0.04), cy = h * (0.5 - my * 0.04);
		const speed = 0.012 + burst * 0.9;        // z units per second
		const streak = 0.6 + burst * 5;           // how far back the tail reaches, in frames
		const bright = 0.35 + burst * 0.65;
		ctx.lineCap = 'round';
		for (const st of stars) {
			const zPrev = st.z;
			st.z -= speed * dt;
			if (st.z <= 0.03) { Object.assign(st, newStar(1)); continue; }
			const k = Math.min(w, h) * 0.9;
			const x1 = cx + (st.x / st.z) * k, y1 = cy + (st.y / st.z) * k;
			const zTail = Math.min(1, st.z + speed * dt * streak);
			const x0 = cx + (st.x / zTail) * k, y0 = cy + (st.y / zTail) * k;
			if (x1 < -50 || x1 > w + 50 || y1 < -50 || y1 > h + 50) { Object.assign(st, newStar(1)); continue; }
			const near = 1 - st.z;
			ctx.strokeStyle = `rgba(${220 + near * 35}, ${228 + near * 20}, 255, ${Math.min(1, near * near * bright * st.s)})`;
			ctx.lineWidth = (0.4 + near * 1.6 * st.s) * DPR;
			ctx.beginPath();
			ctx.moveTo(x0, y0);
			ctx.lineTo(x1 + 0.01, y1 + 0.01);
			ctx.stroke();
			void zPrev;
		}
	}

	/* ------------------------------------------------------------------ */
	/* Timeline                                                            */
	/* ------------------------------------------------------------------ */

	let cur = null, next = null;          // { index, tex, w, h, seed, born }
	let pos = 0;                          // position in `order`
	let transStart = -1;                  // ms when the current dissolve began
	let lastFrame = 0, elapsed = 0, running = false;
	let mouse = { x: 0, y: 0, tx: 0, ty: 0, vel: 0 };
	let split = 0;

	function setCaption(img) {
		caption.classList.add('swap');
		setTimeout(() => {
			captionName.textContent = img.name;
			captionSource.textContent = img.source;
			captionLink.href = img.url;
			caption.classList.remove('swap');
		}, 320);
	}

	async function begin() {
		pos = 0;
		cur = await loadTexture(order[0]);
		cur.index = order[0];
		cur.born = performance.now();
		setCaption(IMAGES[cur.index]);
		space.classList.add('ready');
		preload();
		running = true;
		lastFrame = performance.now();
		requestAnimationFrame(frame);
	}

	function preload() {
		const i = order[(pos + 1) % order.length];
		loadTexture(i).then((t) => { next = Object.assign({ index: i }, t); }).catch(() => {});
	}

	function advance(now) {
		if (transStart >= 0 || !next) return;   // mid-dissolve or not loaded yet
		transStart = now;
	}

	function finishTransition(now) {
		cur = next;
		cur.born = now;
		next = null;
		pos = (pos + 1) % order.length;
		transStart = -1;
		preload();
	}

	function resize() {
		const w = Math.floor(innerWidth * DPR), h = Math.floor(innerHeight * DPR);
		if (space.width !== w || space.height !== h) {
			space.width = w; space.height = h;
			starsCanvas.width = w; starsCanvas.height = h;
			if (gl) gl.viewport(0, 0, w, h);
		}
	}

	function frame(now) {
		if (!running) return;
		requestAnimationFrame(frame);
		const dt = Math.min(0.05, (now - lastFrame) / 1000);
		lastFrame = now;
		elapsed += dt;
		resize();

		// Pointer smoothing + velocity (drives the chromatic split on the wordmark).
		const px = mouse.x, py = mouse.y;
		mouse.x += (mouse.tx - mouse.x) * Math.min(1, dt * 4);
		mouse.y += (mouse.ty - mouse.y) * Math.min(1, dt * 4);
		mouse.vel = Math.hypot(mouse.x - px, mouse.y - py) / Math.max(dt, 1e-3);

		// Auto-advance.
		if (transStart < 0 && now - cur.born > HOLD) advance(now);

		let mixv = 0, burst = 0;
		if (transStart >= 0) {
			const p = Math.min(1, (now - transStart) / TRANS);
			mixv = ease.inOut(p);
			burst = reduced ? 0 : Math.sin(p * Math.PI);
			if (p >= 0.5 && caption.dataset.index !== String(next.index)) {
				caption.dataset.index = String(next.index);
				setCaption(IMAGES[next.index]);
			}
			if (p >= 1) finishTransition(now);
		}

		// Zoom: a slow push-in while held, a fast one on exit; the incoming image arrives from close and settles.
		const age = Math.min(1, (now - cur.born) / (HOLD + TRANS));
		const zA = reduced ? 1.02 : 1.05 + 0.12 * age + 0.4 * ease.in(mixv);
		const zB = reduced ? 1.02 : 1.05 + 0.3 * (1 - ease.out(mixv));

		const B = next || cur;
		gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, cur.tex);
		gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, B.tex);
		gl.uniform2f(uni.res, space.width, space.height);
		gl.uniform2f(uni.imgA, cur.w, cur.h);
		gl.uniform2f(uni.imgB, B.w, B.h);
		gl.uniform2f(uni.mouse, mouse.x, mouse.y);
		gl.uniform1f(uni.t, elapsed);
		gl.uniform1f(uni.mixv, mixv);
		gl.uniform1f(uni.burst, burst);
		gl.uniform1f(uni.zA, zA);
		gl.uniform1f(uni.zB, zB);
		gl.uniform1f(uni.seedA, cur.seed);
		gl.uniform1f(uni.seedB, B.seed);
		gl.drawArrays(gl.TRIANGLES, 0, 3);

		drawStars(dt, burst, mouse.x, mouse.y);

		// Chromatic split on the mark and wordmark: wide during a dissolve, a flicker on fast pointer moves.
		const target = reduced ? 0 : Math.min(9, burst * 7 + Math.min(3, mouse.vel * 1.2));
		split += (target - split) * Math.min(1, dt * 8);
		root.style.setProperty('--split', split.toFixed(2) + 'px');
		root.style.setProperty('--split-y', (split * 0.35 * (mouse.y || 0.2)).toFixed(2) + 'px');
	}

	/* ------------------------------------------------------------------ */
	/* Input                                                               */
	/* ------------------------------------------------------------------ */

	addEventListener('pointermove', (e) => {
		mouse.tx = (e.clientX / innerWidth) * 2 - 1;
		mouse.ty = 1 - (e.clientY / innerHeight) * 2;
	}, { passive: true });

	addEventListener('pointerdown', (e) => {
		if (e.target.closest('a')) return;
		advance(performance.now());
	});
	addEventListener('keydown', (e) => {
		if (e.key === ' ' || e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); advance(performance.now()); }
	});
	addEventListener('visibilitychange', () => {
		if (document.hidden) { running = false; }
		else if (gl && cur) { running = true; lastFrame = performance.now(); if (cur) cur.born = performance.now(); requestAnimationFrame(frame); }
	});
	addEventListener('resize', resize, { passive: true });

	space.addEventListener('webglcontextlost', (e) => { e.preventDefault(); running = false; });
	space.addEventListener('webglcontextrestored', () => { initGL(); begin(); });

	/* ------------------------------------------------------------------ */
	/* Fallback for browsers without WebGL: plain crossfade                */
	/* ------------------------------------------------------------------ */

	function fallback() {
		space.remove(); starsCanvas.remove();
		const layers = [document.createElement('div'), document.createElement('div')];
		for (const l of layers) {
			Object.assign(l.style, { position: 'fixed', inset: '0', backgroundSize: 'cover', backgroundPosition: 'center', transition: 'opacity 1.6s ease', opacity: '0', zIndex: '-1' });
			document.body.prepend(l);
		}
		let i = 0, top = 0;
		const show = () => {
			const img = IMAGES[order[i % order.length]];
			layers[top].style.backgroundImage = `url(space/${img.file}.webp)`;
			layers[top].style.opacity = '1';
			layers[1 - top].style.opacity = '0';
			setCaption(img);
			top = 1 - top; i++;
		};
		show();
		setInterval(show, HOLD + TRANS);
		addEventListener('pointerdown', (e) => { if (!e.target.closest('a')) show(); });
	}

	try {
		if (!initGL()) throw new Error('no webgl');
		resize();
		begin().catch(fallback);
	} catch (err) {
		fallback();
	}
})();
