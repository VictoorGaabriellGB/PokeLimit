import mapLayoutsJson from './mapLayouts.json';

export interface NormalizedBox {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export interface MapLayoutDefinition {
  solidBoxes?: NormalizedBox[];
  waterZones?: NormalizedBox[];
  bridgeZones?: NormalizedBox[];
}

export const MAP_LAYOUTS: Record<string, MapLayoutDefinition> = mapLayoutsJson as Record<string, MapLayoutDefinition>;

