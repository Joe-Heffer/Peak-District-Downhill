// Shared WGS84 <-> British National Grid (EPSG:27700) projection helpers for the
// tools/terrain/* pipeline scripts, all expressed as local metres relative to
// LOCAL_ORIGIN (see config.js) so they line up with the baked heights/route/landcover
// grids' coordinate space.

import proj4 from 'proj4';
import { LOCAL_ORIGIN } from './config.js';

// Standard OSGB36 National Grid definition (7-parameter Helmert approximation — accurate
// to a few metres, not OSTN15 grid-accurate, which is fine for a game but not
// survey-grade).
proj4.defs(
  'EPSG:27700',
  '+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 +x_0=400000 +y_0=-100000 ' +
    '+ellps=airy +towgs84=446.448,-125.157,542.06,0.15,0.247,0.842,-20.489 +units=m +no_defs',
);

export function wgs84ToLocalBng(lat, lon) {
  const [easting, northing] = proj4('WGS84', 'EPSG:27700').forward([lon, lat]);
  return { e: easting - LOCAL_ORIGIN.easting, n: northing - LOCAL_ORIGIN.northing };
}

export function bngToWgs84(easting, northing) {
  const [lon, lat] = proj4('EPSG:27700', 'WGS84').forward([easting, northing]);
  return { lat, lon };
}
