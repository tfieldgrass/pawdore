import type { GeoFence } from './types.ts';

const EARTH_RADIUS_M = 6_371_000;

export function distanceM(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

export function insideFence(fence: GeoFence, lat: number, lng: number): boolean {
  return distanceM(fence.lat, fence.lng, lat, lng) <= fence.radiusM;
}
