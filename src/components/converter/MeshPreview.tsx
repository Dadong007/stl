import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { IndexedMesh } from '../../engines/image';

interface MeshPreviewProps {
  mesh: IndexedMesh;
  fitPadding?: number;
}

export default function MeshPreview({ mesh, fitPadding = 0.1 }: MeshPreviewProps) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = host.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xe9f0ee);

    const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 10000);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.append(renderer.domElement);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(mesh.positions.slice(), 3));
    geometry.setIndex(new THREE.BufferAttribute(mesh.indices.slice(), 1));
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    geometry.center();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

    const material = new THREE.MeshStandardMaterial({
      color: 0x2f8f78,
      roughness: 0.68,
      metalness: 0.04,
      side: THREE.DoubleSide,
    });
    const model = new THREE.Mesh(geometry, material);
    scene.add(model);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8aa09b, 2.2));
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.5);
    keyLight.position.set(2, 3, 4);
    scene.add(keyLight);

    const bounds = geometry.boundingBox ?? new THREE.Box3().setFromBufferAttribute(
      geometry.getAttribute('position') as THREE.BufferAttribute,
    );
    const center = bounds.getCenter(new THREE.Vector3());
    const boxSize = bounds.getSize(new THREE.Vector3());
    const corners: THREE.Vector3[] = [];
    for (const x of [bounds.min.x, bounds.max.x]) {
      for (const y of [bounds.min.y, bounds.max.y]) {
        for (const z of [bounds.min.z, bounds.max.z]) {
          corners.push(new THREE.Vector3(x, y, z));
        }
      }
    }
    const radius = Math.max(
      geometry.boundingSphere?.radius ?? 0,
      boxSize.length() / 2,
      0.01,
    );
    const defaultDirection = new THREE.Vector3(1.35, -1.75, 1.25).normalize();
    camera.position.copy(center).addScaledVector(defaultDirection, radius * 3);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.minDistance = radius * 0.25;
    controls.maxDistance = radius * 16;
    controls.target.copy(center);
    controls.update();

    const render = () => renderer.render(scene, camera);
    controls.addEventListener('change', render);

    const fitCamera = (width: number, height: number) => {
      const direction = camera.position.clone().sub(controls.target);
      if (direction.lengthSq() < Number.EPSILON) direction.copy(defaultDirection);
      else direction.normalize();

      camera.aspect = width / height;
      const verticalFov = THREE.MathUtils.degToRad(camera.fov);
      const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * camera.aspect);
      const verticalTangent = Math.tan(verticalFov / 2);
      const horizontalTangent = Math.tan(horizontalFov / 2);

      camera.position.copy(center).addScaledVector(direction, radius * 3);
      camera.lookAt(center);
      const inverseRotation = camera.quaternion.clone().invert();
      let distance = radius;
      const safeFitPadding = Number.isFinite(fitPadding)
        ? Math.min(Math.max(fitPadding, 0), 0.5)
        : 0.1;
      const frameUsage = 1 - safeFitPadding;
      for (const corner of corners) {
        const viewPoint = corner.clone().sub(center).applyQuaternion(inverseRotation);
        distance = Math.max(
          distance,
          viewPoint.z + Math.abs(viewPoint.x) / (horizontalTangent * frameUsage),
          viewPoint.z + Math.abs(viewPoint.y) / (verticalTangent * frameUsage),
        );
      }

      controls.target.copy(center);
      camera.position.copy(center).addScaledVector(direction, distance);
      camera.near = Math.max(distance - radius * 2, radius / 1000, 0.001);
      camera.far = Math.max(distance + radius * 4, camera.near + 1);
      camera.updateProjectionMatrix();
      controls.maxDistance = Math.max(radius * 16, distance * 2);
      controls.update();
    };

    const resize = () => {
      const width = Math.max(container.clientWidth, 1);
      const height = Math.max(container.clientHeight, 1);
      renderer.setSize(width, height, false);
      fitCamera(width, height);
      render();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();

    render();

    return () => {
      observer.disconnect();
      controls.removeEventListener('change', render);
      controls.dispose();
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, [fitPadding, mesh]);

  return <div ref={host} className="preview-canvas" aria-label="Interactive 3D model preview" />;
}
