(() => {
const CDN = 'https://esm.sh/three@0.160.0';

class GuardianSceneCopy extends HTMLElement {
  connectedCallback() {
    if (this._started) return;
    this._started = true;
    const bg = this.getAttribute('background') || '#D2F0D1';
    this._transparent = bg === 'transparent' || bg === 'none';
    this.style.display = 'block';
    this.style.width = '100%';
    this.style.height = '100%';
    this.style.background = this._transparent ? 'transparent' : bg;

    // lazy-init: don't fetch three.js until the section is close to the viewport
    const boot = () => {
      if (this._booted) return;
      this._booted = true;
      this.init().catch(e => console.error('[guardian-scene]', e));
    };
    boot();
  }

  disconnectedCallback() {
    if (this._bootTimer) clearTimeout(this._bootTimer);
    if (this._lazyIO) this._lazyIO.disconnect();
    if (this._visIO) this._visIO.disconnect();
    if (this._stop) this._stop();
  }

  init() {
    return this._build();
  }

  async _build() {
    const THREE = await import(CDN);
    const { SVGLoader } = await import(CDN + '/examples/jsm/loaders/SVGLoader.js');
    const { RoomEnvironment } = await import(CDN + '/examples/jsm/environments/RoomEnvironment.js');
    this.THREE = THREE;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    // cap resolution: retina at 2x quadruples fragment work for little visible gain
    const mobile = matchMedia('(max-width: 1400px)').matches;
    renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 2 : 2));
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    this.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.03).texture;
    const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 200);
    camera.position.set(0, 0, 34);

    scene.add(new THREE.AmbientLight(0xffffff, 0.62));
    const hemi = new THREE.HemisphereLight(0xffffff, 0xb9c4cf, 0.45);
    scene.add(hemi);
    const key = new THREE.DirectionalLight(0xffffff, 1.35);
    key.position.set(-8, 12, 16);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -20; key.shadow.camera.right = 20;
    key.shadow.camera.top = 20; key.shadow.camera.bottom = -20;
    key.shadow.radius = 4;
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.55);
    fill.position.set(10, -4, 10);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0xeaf2ff, 0.6);
    rim.position.set(4, 6, -12);
    scene.add(rim);

    // soft backdrop (shadow catching disabled)
    const catcher = new THREE.Mesh(
      new THREE.PlaneGeometry(120, 80),
      new THREE.ShadowMaterial({ color: 0x2c4a2b, opacity: 0 })
    );
    catcher.position.z = -12;
    catcher.visible = false;
    scene.add(catcher);

    // diagonal sheen reflection for the glass
    const sheenTex = (() => {
      const c = document.createElement('canvas');
      c.width = 256; c.height = 512;
      const x = c.getContext('2d');
      const gr = x.createLinearGradient(0, 512, 256, 0);
      gr.addColorStop(0.00, 'rgba(255,255,255,0)');
      gr.addColorStop(0.42, 'rgba(255,255,255,0)');
      gr.addColorStop(0.52, 'rgba(255,255,255,0.5)');
      gr.addColorStop(0.60, 'rgba(255,255,255,0.06)');
      gr.addColorStop(0.66, 'rgba(255,255,255,0.22)');
      gr.addColorStop(0.74, 'rgba(255,255,255,0)');
      x.fillStyle = gr;
      x.fillRect(0, 0, 256, 512);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    })();

    const root = new THREE.Group();
    scene.add(root);
    const phones = new THREE.Group();
    root.add(phones);

    const floaters = [];
    const texLoader = new THREE.TextureLoader();

    // ---------- phones ----------
    // same construction as the Vodafone scene: extruded rounded-rect body with a
    // bevelled edge + a thin metal rail, and a flat unlit screen sitting on top.
    const PHONE_ASPECT = 375 / 772;
    const PHONE_H = 9.9;
    const screens = ['uploads/Spotify%203-2ed1e4ce.png', 'uploads/Spotify%202-3caef593.png', 'uploads/Spotify%201-86d81f06.png'];

    const bodyMat = new THREE.MeshPhysicalMaterial({ name: 'phone-body', color: 0x050607, roughness: 0.5, metalness: 0.6, clearcoat: 0.15, clearcoatRoughness: 0.5, envMapIntensity: 0.5 });
    const edgeMat = new THREE.MeshPhysicalMaterial({ name: 'phone-edge', color: 0xd8dde1, roughness: 0.34, metalness: 0.92, clearcoat: 0.25, clearcoatRoughness: 0.35, envMapIntensity: 1.05 });
    const speakerMat = new THREE.MeshStandardMaterial({ name: 'speaker', color: 0x9aa0a5, roughness: 0.6, metalness: 0.6 });
    const buttonMat = new THREE.MeshPhysicalMaterial({ name: 'button', color: 0xd6dade, roughness: 0.35, metalness: 0.9, clearcoat: 0.2, envMapIntensity: 1.0 });

    function roundedRectShape(w, h, r) {
      const s = new THREE.Shape();
      const x = -w / 2, y = -h / 2;
      s.moveTo(x + r, y);
      s.lineTo(x + w - r, y);
      s.quadraticCurveTo(x + w, y, x + w, y + r);
      s.lineTo(x + w, y + h - r);
      s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      s.lineTo(x + r, y + h);
      s.quadraticCurveTo(x, y + h, x, y + h - r);
      s.lineTo(x, y + r);
      s.quadraticCurveTo(x, y, x + r, y);
      return s;
    }

    screens.forEach((src, i) => {
      const g = new THREE.Group();
      const h = PHONE_H, w = h * PHONE_ASPECT;
      const bezel = h * 0.016, depth = h * 0.031, bevel = h * 0.008;

      const bodyGeo = new THREE.ExtrudeGeometry(roundedRectShape(w, h, w * 0.13), {
        depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 4, curveSegments: 24
      });
      bodyGeo.translate(0, 0, -depth / 2);
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.castShadow = true; body.receiveShadow = true;
      g.add(body);

      const railGeo = new THREE.ExtrudeGeometry(roundedRectShape(w + w * 0.008, h + w * 0.008, w * 0.135), {
        depth: depth * 0.42, bevelEnabled: true, bevelThickness: bevel * 0.45, bevelSize: bevel * 0.45, bevelSegments: 2, curveSegments: 24
      });
      railGeo.translate(0, 0, -depth * 0.21);
      const rail = new THREE.Mesh(railGeo, edgeMat);
      rail.castShadow = true;
      g.add(rail);

      const tex = texLoader.load(src);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
      tex.minFilter = THREE.LinearFilter;
      tex.generateMipmaps = false;
      const sw2 = w - bezel * 2, sh2 = h - bezel * 2;
      const sgeo = new THREE.ShapeGeometry(roundedRectShape(sw2, sh2, sw2 * 0.105), 24);
      const pos = sgeo.attributes.position, uvs = [];
      for (let k = 0; k < pos.count; k++) uvs.push((pos.getX(k) + sw2 / 2) / sw2, (pos.getY(k) + sh2 / 2) / sh2);
      sgeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      const screen = new THREE.Mesh(sgeo, new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
      screen.position.z = depth / 2 + bevel + 0.01;
      g.add(screen);

      const sheen = new THREE.Mesh(sgeo.clone(), new THREE.MeshBasicMaterial({
        map: sheenTex, transparent: true, opacity: 0.16,
        blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false
      }));
      sheen.position.z = screen.position.z + 0.01;
      g.add(sheen);

      const notch = new THREE.Mesh(new THREE.CapsuleGeometry(w * 0.008, w * 0.16, 4, 12), speakerMat);
      notch.rotation.z = Math.PI / 2;
      notch.position.set(0, h / 2 - bezel * 0.55, depth / 2 + bevel + 0.014);
      g.add(notch);

      const layout = [
        { x: -6.6, y: -0.7, z: -0.4, rz: -0.26, scale: 0.86 },
        { x: 0.4,  y: 0.9,  z: 1.1,  rz: 0.07,  scale: 1.2 },
        { x: 6.4,  y: -0.4, z: -0.6, rz: 0.32,  scale: 0.92 }
      ][i];
      g.position.set(layout.x, layout.y, layout.z);
      g.rotation.y = 0;
      g.rotation.x = -0.32;
      g.rotation.z = layout.rz;
      g.scale.setScalar(layout.scale);
      phones.add(g);
      floaters.push({
        obj: g, base: g.position.clone(), amp: 0.22 + i * 0.06, speed: 0.18 + i * 0.1,
        phase: i * 1.8, depth: 0, baseRz: layout.rz, rotSpeed: 0.12 + i * 0.08, wobble: true
      });
    });

    // ---------- extruded svg shapes ----------
    const svgGroup = async (url, opts) => {
      let text;
      try { text = await (await fetch(url)).text(); } catch (e) { return null; }
      const data = new SVGLoader().parse(text);
      const group = new THREE.Group();
      data.paths.forEach(p => {
        const fill = p.userData && p.userData.style && p.userData.style.fill;
        const color = (p.color && p.color.isColor)
          ? p.color.clone()
          : new THREE.Color().setStyle(typeof fill === 'string' && fill !== 'none' ? fill : '#EF9D44');
        const mat = new THREE.MeshBasicMaterial({
          color, side: THREE.DoubleSide, toneMapped: false
        });
        const hex = '#' + color.getHexString().toUpperCase();
        const isOrange = hex === '#EF9D44';
        SVGLoader.createShapes(p).forEach(shape => {
          const geo = new THREE.ExtrudeGeometry(shape, {
            depth: 2, bevelEnabled: true, bevelThickness: 8, bevelSize: 1.5, bevelSegments: 4, curveSegments: 8
          });
          const m = new THREE.Mesh(geo, mat);
          m.position.z = isOrange ? -70 : 40;
          m.position.x = isOrange ? 26 : -12;
          m.castShadow = false;
          group.add(m);
        });
      });
      group.scale.y = -1;
      const box = new THREE.Box3().setFromObject(group);
      const size = new THREE.Vector3(), center = new THREE.Vector3();
      box.getSize(size); box.getCenter(center);
      const inner = new THREE.Group();
      group.position.sub(center);
      inner.add(group);
      const s = opts.width / size.x;
      inner.scale.setScalar(s);
      inner.position.copy(opts.position);
      inner.rotation.set(opts.rx || 0, opts.ry || 0, opts.rz || 0);
      return inner;
    };

    const [left, right] = await Promise.all([
      svgGroup('uploads/blob-left.svg', { width: 6.6, position: new THREE.Vector3(-11.2, 2.0, -5.5), ry: 0.35, rz: 0.04 }),
      svgGroup('uploads/blob-right.svg', { width: 5.1, position: new THREE.Vector3(12.0, -3.6, -5.2), ry: -0.35, rz: -0.05 })
    ]);
    [left, right].forEach((grp, i) => {
      if (!grp) return;
      root.add(grp);
      floaters.push({
        obj: grp, base: grp.position.clone(), amp: 0.75, speed: 0.4 + i * 0.1,
        phase: 2.4 + i * 2.2, depth: i === 0 ? 0.5 : -0.45, rot: true
      });
    });

    // ---------- pointer ----------
    const target = { x: 0, y: 0 }, cur = { x: 0, y: 0 };
    const setFromEvent = (cx, cy) => {
      const r = this.getBoundingClientRect();
      target.x = ((cx - r.left) / r.width) * 2 - 1;
      target.y = ((cy - r.top) / r.height) * 2 - 1;
    };
    const onMove = e => setFromEvent(e.clientX, e.clientY);
    const onTouch = e => { if (e.touches[0]) setFromEvent(e.touches[0].clientX, e.touches[0].clientY); };
    window.addEventListener('mousemove', onMove, { passive: true });
    window.addEventListener('touchmove', onTouch, { passive: true });

    // ---------- touch drag: phones follow the swipe, decisive horizontal swipe changes section ----------
    let drag = null;
    this.addEventListener('touchstart', e => {
      const t = e.touches[0];
      if (!t) return;
      drag = { x: t.clientX, y: t.clientY, tx: 0, ty: 0 };
    }, { passive: true });
    this.addEventListener('touchmove', e => {
      if (!drag) return;
      const t = e.touches[0];
      if (!t) return;
      const ddx = t.clientX - drag.x, ddy = t.clientY - drag.y;
      drag = { x: t.clientX, y: t.clientY, tx: drag.tx + ddx, ty: drag.ty + ddy };
    }, { passive: true });
    const endTouchDrag = () => {
      if (drag && Math.abs(drag.tx) > 180 && Math.abs(drag.tx) > Math.abs(drag.ty) * 3) {
        try { parent.postMessage({ type: 'gu3d-swipe', dir: drag.tx < 0 ? 1 : -1 }, '*'); } catch (err) {}
      }
      drag = null;
    };
    this.addEventListener('touchend', endTouchDrag, { passive: true });
    this.addEventListener('touchcancel', endTouchDrag, { passive: true });

    // ---------- resize ----------
    const resize = () => {
      const w = this.clientWidth || 1, h = this.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      const fitW = 31, fitH = 13.6;
      const vFov = (camera.fov * Math.PI) / 180;
      const distH = (fitH / 2) / Math.tan(vFov / 2);
      const distW = (fitW / 2) / Math.tan(vFov / 2) / camera.aspect;
      camera.position.z = Math.max(distH, distW) * 1.02;
      camera.updateProjectionMatrix();
    };
    new ResizeObserver(resize).observe(this);
    resize();

    const num = (names, d) => {
      for (const n of names) { const v = parseFloat(this.getAttribute(n)); if (!isNaN(v)) return v; }
      return d;
    };
    const clock = new THREE.Clock();
    let t = 0;
    const frame = () => {
      const px = num(['parallax'], 1), fs = num(['float-speed', 'floatspeed'], 1);
      t += clock.getDelta() * fs;
      this.style.background = this._transparent ? 'transparent' : (this.getAttribute('background') || '#D2F0D1');
      cur.x += (target.x - cur.x) * 0.16;
      cur.y += (target.y - cur.y) * 0.16;
      root.rotation.y = -cur.x * 0.07 * px;
      root.rotation.x = cur.y * 0.05 * px;
      phones.rotation.y = -cur.x * 0.12 * px;
      phones.rotation.x = cur.y * 0.07 * px;
      root.position.x = -cur.x * 1.1 * px;
      root.position.y = -cur.y * 0.35 * px;
      floaters.forEach(f => {
        f.obj.position.y = f.base.y + Math.sin(t * f.speed + f.phase) * f.amp;
        f.obj.position.x = f.base.x + Math.cos(t * f.speed * 0.7 + f.phase) * f.amp * 0.35 + cur.x * f.depth * px;
        if (f.wobble) {
          f.obj.rotation.z = f.baseRz + Math.sin(t * f.rotSpeed + f.phase) * 0.06;
        } else {
          f.obj.rotation.z = (f.rot ? Math.sin(t * f.speed * 0.6 + f.phase) * 0.06 : 0) + cur.x * 0.03;
        }
        if (!f.rot && !f.wobble) { f.obj.position.y += -cur.y * 1.0 * px; f.obj.rotation.z = cur.x * 0.03; }
      });
      renderer.render(scene, camera);
    };

    // pause the loop whenever the scene is off-screen or the tab is hidden
    let running = false;
    const start = () => {
      if (running) return;
      running = true;
      clock.getDelta();
      renderer.setAnimationLoop(frame);
    };
    this._stop = () => {
      if (!running) return;
      running = false;
      renderer.setAnimationLoop(null);
    };
    let onScreen = true, hostInactive = false;
    const sync = () => (onScreen && !hostInactive && !document.hidden ? start() : this._stop());
    if (typeof IntersectionObserver !== 'undefined') {
      this._visIO = new IntersectionObserver(es => {
        onScreen = es.some(e => e.isIntersecting);
        // never fully idle: keep one frame painted so the canvas is not blank
        if (!onScreen) { frame(); }
        sync();
      }, { rootMargin: '80px 0px' });
      this._visIO.observe(this);
    }
    document.addEventListener('visibilitychange', sync);
    sync();
    frame();

    // host page toggles rendering as this slide becomes active/adjacent/inactive, to save GPU when off-screen
    addEventListener('message', e => {
      if (!e.data || e.data.type !== 'gu3d-visibility') return;
      hostInactive = e.data.state === 'inactive';
      sync();
    });
  }
}

if (!customElements.get('guardian-scene-copy')) customElements.define('guardian-scene-copy', GuardianSceneCopy);
})();
