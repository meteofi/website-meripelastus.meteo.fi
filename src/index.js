import "ol/ol.css";
import sync from 'ol-hashed';
import { Map, View } from "ol";
import Geolocation from 'ol/Geolocation';
import TileLayer from "ol/layer/Tile";
import { fromLonLat, transform, toLonLat } from "ol/proj";
import XYZ from "ol/source/XYZ";
import ImageWMS from "ol/source/ImageWMS";
import TileWMS from "ol/source/TileWMS";
import GeoJSON from "ol/format/GeoJSON";
import ImageLayer from 'ol/layer/Image';
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import mqtt from 'mqtt';
import Point from 'ol/geom/Point';
import { bbox as bboxStrategy } from 'ol/loadingstrategy';
// Enhanced imports for better map functionality
import Feature from 'ol/Feature';
import { defaults as defaultControls, MousePosition, ScaleLine, ZoomToExtent } from 'ol/control';
import { createStringXY } from 'ol/coordinate';
import { defaults as defaultInteractions, Select } from 'ol/interaction';
import {
  Circle as CircleStyle,
  Icon,
  Fill,
  Stroke,
  Style,
  Text,
} from "ol/style.js";
import { VesselInfoManager } from './vesselInfoManager.js';
import vaylaSource from "./vaylaSource.js";
import trackedVessels from "./vessels.json"
import pksUimarannatJSON from "./pks-uimarannat.json"
import pksUlkoilusaaretJSON from "./pks-ulkoilusaaret.json"
import pksVenesatamatJSON from "./pks-venesatamat.json"
import pksKohtaamispaikatJSON from "./kohtaamispaikat.json"
import septiJSON from "./septic.json"


const vesselManager = new VesselInfoManager(trackedVessels);
let geolocation;
let DEBUG = true;
let positionFeature;
let accuracyFeature;

const client = mqtt.connect('wss://meri.digitraffic.fi:443/mqtt',{username: 'digitraffic', password: 'digitrafficPassword'});

function debug(str) {
  if (DEBUG) {
    try {
      console.log(str);
    } catch (e) { };
  }
}

const darkGrayBaseLayer = new TileLayer({
  preload: Infinity,
  source: new XYZ({
    attributions:
      'Tiles © <a href="https://services.arcgisonline.com/ArcGIS/' +
      'rest/services/Canvas/World_Dark_Gray_Base/MapServer">ArcGIS</a>',
    url:
      "https://server.arcgisonline.com/ArcGIS/rest/services/" +
      "Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
  }),
});

const darkGrayReferenceLayer = new TileLayer({
  source: new XYZ({
    attributions:
      'Tiles © <a href="https://services.arcgisonline.com/ArcGIS/' +
      'rest/services/Canvas/World_Dark_Gray_Reference/MapServer">ArcGIS</a>',
    url:
      "https://server.arcgisonline.com/ArcGIS/rest/services/" +
      "Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}",
  }),
});

function vesiliikennemerkkiIcon(feature) {
  var svg;
  var anchor = [0.0, 1.0];
  if (feature.get("vlmlajityyppi") == 11) {
    svg =
      '<svg width="120" height="120" version="1.1" xmlns="http://www.w3.org/2000/svg">' +
      '<rect width="120" height="120" style="fill:rgb(255,255,255);stroke-width:30;stroke:rgb(228,0,43)" />' +
      '<text x="50%" y="50%" font-size="70px" font-family="sans-serif" dominant-baseline="central" text-anchor="middle">' +
      feature.get("rajoitusarvo") +
      "</text> " +
      "</svg>";
  } else if (feature.get("vlmlajityyppi") == 15) {
    svg =
      '<svg width="120" height="120" version="1.1" xmlns="http://www.w3.org/2000/svg">' +
      '<rect width="120" height="120" style="fill:rgb(255,255,255);stroke-width:30;stroke:rgb(228,0,43)" />' +
      '<polygon points="40,15 60,35 80,15" style="fill:black;stroke:purple;stroke-width:1" />' +
      '<text x="50%" y="50%" font-size="45px" font-family="sans-serif" dominant-baseline="central" text-anchor="middle">' +
      feature.get("rajoitusarvo") +
      "</text> " +
      "</svg>";
    anchor = [1.0, 1.0];
  } else if (feature.get("vlmlajityyppi") == 16) {
    svg =
      '<svg width="120" height="120" version="1.1" xmlns="http://www.w3.org/2000/svg">' +
      '<rect width="120" height="120" style="fill:rgb(255,255,255);stroke-width:30;stroke:rgb(228,0,43)" />' +
      '<polygon points="40,105 60,85 80,105" style="fill:black;stroke:purple;stroke-width:1" />' +
      '<text x="50%" y="50%" font-size="45px" font-family="sans-serif" dominant-baseline="central" text-anchor="middle">' +
      feature.get("rajoitusarvo") +
      "</text> " +
      "</svg>";
  } else if (feature.get("vlmlajityyppi") == 6) {
    svg =
      '<svg width="120" height="120" version="1.1" xmlns="http://www.w3.org/2000/svg">' +
      '<rect width="120" height="120" style="fill:rgb(255,255,255);stroke-width:30;stroke:rgb(228,0,43)" />' +
      '<line x1="0" y1="0" x2="120" y2="120" style="stroke:rgb(228,0,43);stroke-width:20" />' +
      '<path d="M 30 50 Q 30 60, 45 50 Q 60 40, 75 50 T 90 50" style="fill:rgb(255,255,255);stroke-width:10;stroke:rgb(0,0,0)"/>' +
      '<path d="M 30 70 Q 30 80, 45 70 Q 60 60, 75 70 T 90 70" style="fill:rgb(255,255,255);stroke-width:10;stroke:rgb(0,0,0)"/>' +
      "</svg>";
    anchor = [0.0, 0.0];
  }
  return new Style({
    image: new Icon({
      opacity: 1,
      src: "data:image/svg+xml;utf8," + svg,
      scale: 0.20,
      anchor: anchor,
    }),
  });
}

/* 
Navigointilaji (NAVL_TYYP)
0 Tuntematon
1 Vasen
2 Oikea
3 Pohjois
4 Etelä
5 Länsi
6 Itä
7 Karimerkki
8 Turvavesimerkki
9 Erikoismerkki
99 Ei sovellettavissa 
*/

const turvalaiteIconTemplates = {
  1: `
    <svg width="140" height="140" version="1.1" xmlns="http://www.w3.org/2000/svg">
      <path d="M 42.5,30 L 122.5,30 L 97.5,110 L 17.5,110 L 42.5,30 z" style="fill:rgb(238,90,108);fill-opacity:1;fill-rule:evenodd;stroke:rgb(7,7,7);stroke-width:6;stroke-linecap:round;stroke-linejoin:round" />
    </svg>
  `,
  2: `
    <svg width="140" height="140" version="1.1" xmlns="http://www.w3.org/2000/svg">
      <path d="M 96,9 L 96,96 L 10,96 L 96,9 z" style="fill:rgb(124,240,91);fill-opacity:1;fill-rule:evenodd;stroke:rgb(7,7,7);stroke-width:6;stroke-linecap:round;stroke-linejoin:round" />
    </svg>
  `,
  3: `
    <svg width="140" height="140" version="1.1" xmlns="http://www.w3.org/2000/svg">
      <path d="M 95,9 L 34,64 L 95,64 L 95,9 z M 73,76 L 12,131 L 73,131 L 73,76 z" style="fill:rgb(243,229,77);fill-opacity:1;fill-rule:evenodd;stroke:rgb(7,7,7);stroke-width:6;stroke-linecap:round;stroke-linejoin:round" />
    </svg>
  `,
  4: `
    <svg width="140" height="140" version="1.1" xmlns="http://www.w3.org/2000/svg">
      <path d="M 45,131 L 106,76 L 45,76 L 45,131 z M 67,64 L 128,9 L 67,9 L 67,64 z" style="fill:rgb(243,229,77);fill-opacity:1;fill-rule:evenodd;stroke:rgb(1,1,1);stroke-width:6;stroke-linecap:round;stroke-linejoin:round" />
    </svg>
  `,
  5: `
    <svg width="140" height="140" version="1.1" xmlns="http://www.w3.org/2000/svg">
      <path d="M 70,64 L 131,9 L 70,9 L 70,64 z M 70,76 L 9,131 L 70,131 L 70,76 z" style="fill:rgb(243,229,77);fill-opacity:1;fill-rule:evenodd;stroke:rgb(1,1,1);stroke-width:6;stroke-linecap:round;stroke-linejoin:round" />
    </svg>
  `,
  6: `
    <svg width="140" height="140" version="1.1" xmlns="http://www.w3.org/2000/svg">
      <path d="M 106.5,6.5 L 45.5,61.5 L 106.5,61.5 L 106.5,6.5 z M 33.5,133.5 L 94.5,78.5 L 33.5,78.5 L 33.5,133.5 z" style="fill:rgb(243,229,77);fill-opacity:1;fill-rule:evenodd;stroke:rgb(1,1,1);stroke-width:6;stroke-linecap:round;stroke-linejoin:round" />
    </svg>
  `,
  9: `
    <svg width="140" height="140" version="1.1" xmlns="http://www.w3.org/2000/svg">
      <path d="M 56.5,30 L 83.5,30 L 83.5,110 L 56.5,110 L 56.5,30 z" style="fill:rgb(243,229,77);fill-opacity:1;fill-rule:evenodd;stroke:rgb(1,1,1);stroke-width:6;stroke-linecap:round;stroke-linejoin:round" />
    </svg>
  `
};

function turvalaiteIcon(feature) {
  const navl_tyyp = feature.get("navigointilajikoodi");
  const svg = turvalaiteIconTemplates[navl_tyyp];
  const anchor = [0.5, 1.0];
  let scale = 0.18;

  if (navl_tyyp == 1 || navl_tyyp == 2) {
    scale = 0.15;
  }

  if (svg != null) {
    return new Style({
      image: new Icon({
        opacity: 1,
        src: "data:image/svg+xml;utf8," + svg,
        scale: scale,
        anchor: anchor,
      })
    });
  } else {
    return null
  }
}

function ulkoilusaaretIcon(feature) {
  var newText = feature.get("name").replace("(saari)", "").replace("(ulkosaari)", "").split(',')[0];
  var newLength = newText.length;
  var charsPerLine = 24;
  var newEmSize = charsPerLine / newLength;
  // var textBaseSize = 16;
  var textBaseSize = 48;

  if (newEmSize < 1) {
    // Scale it
    var newFontSize = newEmSize * textBaseSize;
    // alert(newFontSize);
    var formattedSize = newFontSize + "px";
  } else {
    // It fits, leave it alone
    var newFontSize = 1;
    var formattedSize = textBaseSize + "px";
  }

  const svg =
    '<svg width="600" height="120" version="1.1" xmlns="http://www.w3.org/2000/svg">' +
    '<rect width="600" height="120" style="fill:rgb(80,80,171);stroke-width:20;stroke:rgb(255,255,255)" />' +
    '<text x="50%" y="50%" fill="white" font-size="' +
    formattedSize +
    '" font-family="sans-serif" dominant-baseline="central" text-anchor="middle">' +
    newText +
    "</text> " +
    "</svg>";
  return new Style({
    image: new Icon({
      opacity: 1,
      src: "data:image/svg+xml;utf8," + svg,
      scale: 0.25,
      //    anchor: anchor,
    }),
  });
}

function uimarantaIcon(feature) {
  var newText = feature.get("name");
  var newLength = newText.length;
  var charsPerLine = 24;
  var newEmSize = charsPerLine / newLength;
  // var textBaseSize = 16;
  var textBaseSize = 48;

  if (newEmSize < 1) {
    // Scale it
    var newFontSize = newEmSize * textBaseSize;
    // alert(newFontSize);
    var formattedSize = newFontSize + "px";
  } else {
    // It fits, leave it alone
    var newFontSize = 1;
    var formattedSize = textBaseSize + "px";
  }

  const svg =
    '<svg width="600" height="140" version="1.1" xmlns="http://www.w3.org/2000/svg">' +
    '<rect width="600" height="120" style="fill:rgb(255,255,255);stroke-width:0;stroke:rgb(255,255,255);" />' +
    '<rect x="10" y="10" width="580" height="100" style="fill:rgb(0,80,171);stroke-width:0;stroke:rgb(255,255,255);" />' +
    '<polygon points="280,120 300,140 320,120" style="fill:white;stroke:white;stroke-width:0" />' +
    '<text x="49%" y="42%" fill="white" font-size="' +
    formattedSize +
    '" font-family="sans-serif" dominant-baseline="central" text-anchor="middle">' +
    feature.get("name") +
    "</text> " +

    "</svg>";
  return new Style({
    image: new Icon({
      opacity: 1,
      src: "data:image/svg+xml;utf8," + svg,
      scale: 0.25,
      anchor: [0.5, 1.0],
    }),
  });
}

function kohtaamispaikatIcon(feature) {
  debug(feature);
  var newText = feature.get("Katuosoite");
  var newLength = newText.length;
  var charsPerLine = 24;
  var newEmSize = charsPerLine / newLength;
  // var textBaseSize = 16;
  var textBaseSize = 48;

  if (newEmSize < 1) {
    // Scale it
    var newFontSize = newEmSize * textBaseSize;
    // alert(newFontSize);
    var formattedSize = newFontSize + "px";
  } else {
    // It fits, leave it alone
    var newFontSize = 1;
    var formattedSize = textBaseSize + "px";
  }

  const svg =
    '<svg width="600" height="140" version="1.1" xmlns="http://www.w3.org/2000/svg">' +
    '<rect width="600" height="120" style="fill:rgb(255,255,255);stroke-width:0;stroke:rgb(255,255,255);" />' +
    '<rect x="10" y="10" width="580" height="100" style="fill:rgb(190,45,70);stroke-width:0;stroke:rgb(255,255,255);" />' +
    '<polygon points="280,120 300,140 320,120" style="fill:white;stroke:white;stroke-width:0" />' +
    '<text x="49%" y="42%" fill="white" font-size="' +
    formattedSize +
    '" font-family="sans-serif" dominant-baseline="central" text-anchor="middle">' +
    newText +
    "</text> " +

    "</svg>";
  return new Style({
    image: new Icon({
      opacity: 1,
      src: "data:image/svg+xml;utf8," + svg,
      scale: 0.25,
      anchor: [0.5, 1.0],
    }),
  });
}

function septiIcon(feature) {
  var newText = feature.get("stationName") || feature.get("name") || "Septi";
  var newLength = newText.length;
  var charsPerLine = 24;
  var newEmSize = charsPerLine / newLength;
  var textBaseSize = 48;

  if (newEmSize < 1) {
    var newFontSize = newEmSize * textBaseSize;
    var formattedSize = newFontSize + "px";
  } else {
    var newFontSize = 1;
    var formattedSize = textBaseSize + "px";
  }

  const svg =
    '<svg width="600" height="140" version="1.1" xmlns="http://www.w3.org/2000/svg">' +
    '<rect width="600" height="120" style="fill:rgb(255,255,255);stroke-width:0;stroke:rgb(255,255,255);" />' +
    '<rect x="10" y="10" width="580" height="100" style="fill:rgb(139,69,19);stroke-width:0;stroke:rgb(255,255,255);" />' +
    '<polygon points="280,120 300,140 320,120" style="fill:white;stroke:white;stroke-width:0" />' +
    '<text x="49%" y="42%" fill="white" font-size="' +
    formattedSize +
    '" font-family="sans-serif" dominant-baseline="central" text-anchor="middle">' +
    newText +
    "</text> " +
    "</svg>";
  return new Style({
    image: new Icon({
      opacity: 1,
      src: "data:image/svg+xml;utf8," + svg,
      scale: 0.25,
      anchor: [0.5, 1.0],
    }),
  });
}

function navigointilinjaIcon(feature) {
  const tosisuunta = feature.get('tosisuunta');
  const currentZoom = map.getView().getZoom();
  
  if (currentZoom > 12) {
    // High zoom: show detailed icons
    const backDirection = Math.round((tosisuunta + 180) % 360);
    const rotation = (tosisuunta - 90) * (Math.PI / 180);
    
    const svg = `<svg width="100" height="100" xmlns="http://www.w3.org/2000/svg">
      <text x="50%" y="25%" font-size="24px" font-weight="bold" fill="white" text-anchor="middle">${backDirection}</text>
      <path d="M 10,40 L 25,50 L 25,45 L 75,45 L 75,35 L 25,35 L 25,30 z" fill="rgb(238,90,108)" stroke="black" stroke-width="1"/>
      <path d="M 90,60 L 75,70 L 75,65 L 25,65 L 25,55 L 75,55 L 75,50 z" fill="rgb(124,240,91)" stroke="black" stroke-width="1"/>
      <text x="50%" y="90%" font-size="24px" font-weight="bold" fill="white" text-anchor="middle">${Math.round(tosisuunta)}</text>
    </svg>`;

    const geometry = feature.getGeometry();
    const coordinates = geometry.getCoordinates();
    const centerPoint = coordinates[Math.floor(coordinates.length / 2)];
    
    return new Style({
      geometry: new Point(centerPoint),
      image: new Icon({
        src: "data:image/svg+xml;utf8," + encodeURIComponent(svg),
        scale: 0.4,
        rotation: rotation,
        anchor: [0.5, 0.5],
      }),
    });
  } else {
    // Low zoom: simple text
    return new Style({
      text: new Text({
        font: '10px Arial',
        fill: new Fill({ color: '#fff' }),
        stroke: new Stroke({ color: '#000', width: 1 }),
        text: Math.round(tosisuunta) + "°",
        placement: "line",
      }),
    });
  }
}

function aisIcon(feature) {
  var headingline;
  var cogsvg;
  if (feature.get('sog') == 0) {
    headingline = "";
  } else if (feature.get('rot') < 0) {
      headingline = '<path d="M 100,75 L 148,75 L 148,60" />';
  } else if (feature.get('rot') > 0) {
      headingline = '<path d="M 100,75 L 148,75 L 148,90" />';
  } else {
    headingline = '<path d="M 100,75 L 148,75 z" />';
  }

  if (feature.get("sog") != null) {
    cogsvg = 
    '<svg width="150" height="150" version="1.1" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M 75,75 L 148,75 z" style="stroke-dasharray:5; stroke:green; stroke-width:4;" />' +
    '</svg>';
  }
  const svg =
    '<svg width="150" height="150" version="1.1" xmlns="http://www.w3.org/2000/svg">' +
    '<g stroke="green" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" fill-opacity="1">' +
    '<path d="M 100,75 L 50,90 L 50,60 z" style="fill:rgb(255,255,255);fill-opacity:1;fill-rule:evenodd;stroke-linejoin:round" />' +
    headingline +
    '</g>' +
    '</svg>';
  const mmsi = feature.get("mmsi") + "";
  return [new Style({
    image: new Icon({
      opacity: 1,
      src: "data:image/svg+xml;utf8," + svg,
      scale: 0.5,
      rotation: (feature.get('heading')-90) * (Math.PI/180),
      anchor: [0.5, 0.5],
    }),
    text: new Text({
      font: '10px Calibri,sans-serif',
      fill: new Fill({ color: '#fff' }),
      stroke: new Stroke({ color: '#000', width: 1 }),
      offsetX: 0,
      offsetY: 45,
      text: typeof trackedVessels[mmsi].metadata !== "undefined" ? trackedVessels[mmsi].metadata.name : mmsi
  }),
}),
  new Style({
    image: new Icon({
      opacity: 1,
      src: "data:image/svg+xml;utf8," + cogsvg,
      scale: 0.5,
      rotation: (feature.get('cog')-90) * (Math.PI/180),
      anchor: [0.5, 0.5],
    }),
  }),
]
}

function venesatamatIcon(feature) {
  var newText = feature.get("name").replace(" / Vesiliikennelaituri", "").replace(" / Venesatama", "");
  var newLength = newText.length;
  var charsPerLine = 32;
  var newEmSize = charsPerLine / newLength;
  // var textBaseSize = 16;
  var textBaseSize = 48;

  if (newEmSize < 1) {
    // Scale it
    var newFontSize = newEmSize * textBaseSize;
    // alert(newFontSize);
    var formattedSize = newFontSize + "px";
  } else {
    // It fits, leave it alone
    var newFontSize = 1;
    var formattedSize = textBaseSize + "px";
  }

  const svg =
    '<svg width="800" height="120" version="1.1" xmlns="http://www.w3.org/2000/svg">' +
    '<rect width="800" height="120" style="fill:rgb(0,97,69);stroke-width:20;stroke:rgb(255,255,255)" />' +
    '<text x="50%" y="50%" fill="white" font-size="' +
    formattedSize +
    '" font-family="sans-serif" dominant-baseline="central" text-anchor="middle">' +
    newText +
    "</text> " +
    "</svg>";
  return new Style({
    image: new Icon({
      opacity: 1,
      src: "data:image/svg+xml;utf8," + svg,
      scale: 0.25,
      //    anchor: anchor,
    }),
  });
}

const lightningStyle = new Style({
  image: new CircleStyle({
    radius: 2,
    fill: null,
    stroke: new Stroke({ color: "yellow", width: 2 }),
  }),
});

const airTemperatureStyle = new Style({
  image: new CircleStyle({
    radius: 4,
    fill: null,
    stroke: new Stroke({ color: "red", width: 2 }),
  }),
  text: new Text({
    font: "12px Calibri,sans-serif",
    fill: new Fill({
      color: "#fff",
    }),
    stroke: new Stroke({
      color: "#000",
      width: 3,
    }),
    offsetX: 0,
    offsetY: -15,
  }),
});

//
// Väylävirasto
// 

const vesiliikennemerkitLayer = new VectorLayer({
  source: new vaylaSource({ name: "vesiliikennemerkit" }),
  minZoom: 12,
  style: function (feature) {
    let laji = feature.get("vlmlajityyppi");
    if (laji == 6 || laji == 11) {
      return vesiliikennemerkkiIcon(feature);
    } else {
      return null;
    }
  },
});

const vesialuerajoituksetLayer = new VectorLayer({
  source: new vaylaSource({ name: "rajoitusalue_a" }),
  minZoom: 11,
  style: function (feature) {
    let laji = feature.get("rajoitustyypit");
    let color = "rgba(0, 0, 255, 0.3)";
    let speedLimit = feature.get('suuruus');
    
    if (speedLimit == 10) {
      color = 'rgba(255, 0, 0, 0.3)'
    } else if (speedLimit <= 20) {
      color = 'rgba(0, 255, 255, 0.3)'
    }
    if ((laji == "01" || laji == "01, 02") ) {
      //if (feature.get("MERK_VAST") != null && feature.get("MERK_VAST").indexOf("ELY-keskus")) {return null}
      return new Style({
        fill: new Fill({
          color: color,
        }),
        
        text: new Text({
          font: '14px Calibri,sans-serif',
          fill: new Fill({ color: '#fff' }),
          stroke: new Stroke({
            color: '#000', width: 1
          }),
          text: speedLimit ? speedLimit + " km/h" : ""
        }),
      })
    } else {
      return null;
    }
  },
});

const vaylaalueetLayer = new VectorLayer({
  source: new vaylaSource({ name: 'vaylaalueet' }),
  minZoom: 9,
  style: new Style({ fill: new Fill({ color: 'rgba(100, 100, 100, 0.2)' }) })
});

const vaylatLayer = new VectorLayer({
  source: new vaylaSource({ name: 'vaylat' }),
  minZoom: 10,
  style: new Style({ stroke: new Stroke({ color: '#aaa', width: 1 }) })
});

const turvalaiteLayer = new VectorLayer({
  source: new vaylaSource({ name: "turvalaitteet" }),
  minZoom: 12,
  style: function (feature) { return turvalaiteIcon(feature) }
});

// Optimized style cache for navigointilinja layer
const navigointilinjaStyleCache = new Map();

// Safety check function for cache operations
function clearNavigationCache() {
  try {
    if (navigointilinjaStyleCache && typeof navigointilinjaStyleCache.clear === 'function') {
      navigointilinjaStyleCache.clear();
    }
  } catch (error) {
    console.warn('Error clearing navigation cache:', error);
  }
}

const navigointilinjaLayer = new VectorLayer({
  source: new vaylaSource({ 
    name: "navigointilinjat",
  }),
  minZoom: 10,
  maxZoom: 16,
  // Optimized performance settings
  declutter: true, // Enable decluttering to reduce overlapping features
  renderBuffer: 150, // Reduced render buffer for better performance
  updateWhileAnimating: false, // Disable updates during animation for better performance
  updateWhileInteracting: false, // Disable updates during interaction for better performance
  style: function (feature) {
    const tosisuunta = feature.get('tosisuunta');
    const length = feature.getGeometry().getLength();
    
    // Early return for features that shouldn't be styled
    if (tosisuunta == null || length <= 0.4 * 1853) {
      return null;
    }
    
    // Simplified but effective caching with safety checks
    const featureId = feature.getId() || feature.ol_uid;
    const currentZoom = Math.round(map.getView().getZoom());
    const cacheKey = `${featureId}_${currentZoom}`;
    
    // Check cache first, but limit cache size with safety checks
    if (navigointilinjaStyleCache && navigointilinjaStyleCache.size > 500) {
      clearNavigationCache();
    }
    
    let style = navigointilinjaStyleCache && navigointilinjaStyleCache.get(cacheKey);
    if (!style) {
      style = navigointilinjaIcon(feature);
      if (style && navigointilinjaStyleCache && typeof navigointilinjaStyleCache.set === 'function') {
        navigointilinjaStyleCache.set(cacheKey, style);
      }
    }
    return style;
  },
});
        
 //       text: new Text({
 //         font: '14px Calibri,sans-serif',
  //        fill: new Fill({ color: '#ccc' }),
  //        stroke: new Stroke({
  //          color: '#000', width: 1
   //       }),
 //         placement: "line",
  //        text: feature.get('VAY_NIMISU') 
  //      }),


const navigointilinjaLayerT = new VectorLayer({
  source: new vaylaSource({name: "vaylaalueet"}),
  minZoom: 8,
  style: function (feature) {
    let laji = feature.get("TILA");
    debug(feature.get('TILA'))
    if ((laji == 1) ) {
      return new Style({
        stroke: new Stroke({
          color: '#a00', width: 1,
        }),
      })
    } else {
      return null
      return new Style({
        stroke: new Stroke({
          color: '#a00', width: 1,
        }),
      })
    }
  },
})



const syvyysLayer = new VectorLayer({
  source: new VectorSource({
    format: new GeoJSON(),
    url: function (extent) {
      return (
        'https://julkinen.traficom.fi/inspirepalvelu/rajoitettu/wfs?' +
        'version=1.1.0&request=GetFeature&typename=rajoitettu:Sounding_P&' +
        'outputFormat=application/json&srsname=EPSG:3857&' +
        'bbox=' +
        extent.join(',') +
        ',EPSG:3857'
      );
    },
    strategy: bboxStrategy
  }),
  minZoom: 13,
  style: function (feature) {
    if (feature.get("DEPTH") != null ) {
      return new Style({
        text: new Text({
          font: '12px Calibri,sans-serif',
          fill: new Fill({ color: '#999' }),
          stroke: new Stroke({
            color: '#000', width: 1
          }),
          text: feature.get("DEPTH") + ""
        }),
      })
    } else {
      return null;
    }
  },
});

const windLayerBak = new VectorLayer({
  source: new VectorSource({
    format: new GeoJSON(),
    url: function (extent) {
      return (
        'https://wms.meteo.fi/geoserver/wms?' +
        'service=WMS&version=1.1.0&request=GetMap&layers=observation%3Awind_speed&' +
        'format=application%2Fjson%3Btype%3Dgeojson&srs=EPSG:3857&width=768&height=413&' +
        'bbox=' +
        extent.join(',') 
     //   ',EPSG:3857'
      );
    },
    strategy: bboxStrategy
  }),
  //minZoom: 11,
  style: function (feature) {
    debug(feature.get("ws_10min"))
    let laji = feature.get("ws_10min");
    if ((laji > 1) ) {
      return new Style({        
        text: new Text({
          font: '14px Calibri,sans-serif',
          fill: new Fill({ color: '#fff' }),
          stroke: new Stroke({ color: '#000', width: 1 }),
          text: feature.get('ws_10min') + ''
        }),
      })
    } else {
      return null;
    }
  },
});


// PKS Palvelukartta

const pksUimarannatLayer = new VectorLayer({
  source: new VectorSource({
    features: new GeoJSON({
      dataProjection: 'EPSG:4326',
      featureProjection: "EPSG:3857"
    }).readFeatures(pksUimarannatJSON).map(feature => {
      feature.setStyle(uimarantaIcon(feature));
      return feature;
    }),
  }),
  visible: false,
  minZoom: 12,
  style: function (feature) {
    return feature.getStyle();
  },
});

const pksUlkoilusaaretLayer = new VectorLayer({
  source: new VectorSource({
    features: new GeoJSON({
      dataProjection: 'EPSG:4326',
      featureProjection: "EPSG:3857"
    }).readFeatures(pksUlkoilusaaretJSON).map(feature => {
      feature.setStyle(ulkoilusaaretIcon(feature));
      return feature;
    }),
  }),
  visible: false,
  minZoom: 11,
  style: function (feature) {
    return feature.getStyle();
  },
});

const pksVenesatamatLayer = new VectorLayer({
  source: new VectorSource({
    features: new GeoJSON({
      dataProjection: 'EPSG:4326',
      featureProjection: "EPSG:3857"
    }).readFeatures(pksVenesatamatJSON).map(feature => {
      feature.setStyle(venesatamatIcon(feature));
      return feature;
    }),
  }),
  visible: false,
  minZoom: 11,
  style: function (feature) {
    return feature.getStyle();
  },
});

const pksKohtaamispaikatLayer = new VectorLayer({
  source: new VectorSource({
    features: new GeoJSON({
      dataProjection: 'EPSG:4326',
      featureProjection: "EPSG:3857"
    }).readFeatures(pksKohtaamispaikatJSON),
  }),
  visible: false,
  minZoom: 11,
  style: function (feature) {
    return kohtaamispaikatIcon(feature);
  },
});

const septiLayer = new VectorLayer({
  source: new VectorSource({
    features: new GeoJSON({
      dataProjection: 'EPSG:4326',
      featureProjection: "EPSG:3857"
    }).readFeatures(septiJSON),
  }),
  visible: false,
  minZoom: 9,
  style: function (feature) {
    return septiIcon(feature);
  },
});

const turvalaiteviatLayer = new VectorLayer({
  source: new VectorSource({
    format: new GeoJSON(),
    url: "https://meri.digitraffic.fi/api/aton/v1/faults",
  }),
  visible: false,
  minZoom: 11,
  style: function (feature) {
    if (!feature.get("fixed") ) {
      return new Style({
        image: new CircleStyle({
          radius: 2,
          fill: null,
          stroke: new Stroke({ color: "yellow", width: 2 }),
        }),
        text: new Text({
          font: '12px Calibri,sans-serif',
          fill: new Fill({ color: '#f00' }),
          stroke: new Stroke({
            color: '#000', width: 1
          }),
          text: feature.get("type") + "\nTurvalaite: " + feature.get("aton_type") + ", " + feature.get("aton_name_fi") + "\nVäylä: " + feature.get("fairway_name_fi") + "\n" + feature.get("area_description") 
        }),
      })
    } else {
      return null;
    }
  },
});

const airTemperatureLayebak = new VectorLayer({
  source: new VectorSource({
    format: new GeoJSON(),
    url:
      "https://geoserver.apps.meteo.fi/geoserver/observation/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=observation%3Aair_temperature&maxFeatures=50&outputFormat=application%2Fjson",
  }),
  style: function (feature) {
    console.log(feature);
    airTemperatureStyle.getText().setText(feature.get("name"));
    return airTemperatureStyle;
  },
});

var lightningLayer = new VectorLayer({
  source: new VectorSource({
    format: new GeoJSON(),
    visible: false,
    url:
      "https://wms.meteo.fi/geoserver/observation/wms?service=WMS&" +
      "version=1.1.0&request=GetMap&layers=observation:lightning" +
      "&format=application%2Fjson%3Btype%3Dgeojson&srs=EPSG:4326" +
      "&bbox=8.349609,54.724719,35.595188,71.145195" +
      "&width=" +
      document.getElementById("map").offsetWidth +
      "&height=" +
      document.getElementById("map").offsetHeight +
      "&time=PT3H/PRESENT",
  }),
  style: function (feature) {
    console.log(feature);
    return lightningStyle;
  },
});

var radarLayerZ = new ImageLayer({
  name: "radarLayer",
  //visible: VISIBLE.has("radarLayer"),
  opacity: 0.7,
  source: new ImageWMS({
    url: 'https://wms.meteo.fi/geoserver/wms',
    params: { 'LAYERS': 'liikennevirasto.meriliikenne:merikartta' },
    attributions: 'FMI',
    //ratio: options.imageRatio,
    hidpi: false,
    serverType: 'geoserver'
  })
});

var encLayer = new ImageLayer({
  name: "encLayer",
  visible: false,
  opacity: 1,
  source: new ImageWMS({
    url: 'https://julkinen.traficom.fi/s57/wms',
    params: { 'LAYERS': 'cells' },
    attributions: 'Traficom',
    //ratio: options.imageRatio,
    hidpi: false
  })
});

var satelliteLayer = new ImageLayer({
  name: "satelliteLayer",
  visible: false,
  opacity: 0.9,
  source: new ImageWMS({
    url: 'https://view.eumetsat.int/geoserver/wms',
    params: { 'LAYERS': 'msg_fes:rgb_eview' },
    attributions: 'EUMETSAT',
    //ratio: options.imageRatio,
    hidpi: false,
    serverType: 'geoserver'
  })
});

var radarLayer = new ImageLayer({
  name: "radarLayer",
  visible: false,
  opacity: 0.7,
  source: new ImageWMS({
    url: 'https://openwms.fmi.fi/geoserver/wms',
    params: { 'LAYERS': 'Radar:suomi_dbz_eureffin' },
    attributions: 'FMI',
    //ratio: options.imageRatio,
    hidpi: false,
    serverType: 'geoserver'
  })
});

var windLayer = new ImageLayer({
  name: "windLayer",
  visible: false,
  opacity: 1,
  source: new ImageWMS({
    url: 'https://wms.meteo.fi/geoserver/wms',
    params: { 'LAYERS': 'observation:wind_speed', 'TIME': 'PT15M/PRESENT' },
    attributions: 'FMI',
    //ratio: options.imageRatio,
    hidpi: false,
    serverType: 'geoserver'
  })
});

var gustLayer = new ImageLayer({
  name: "gustLayer",
  visible: false,
  opacity: 1,
  source: new ImageWMS({
    url: 'https://wms.meteo.fi/geoserver/wms',
    params: { 'LAYERS': 'observation:wind_speed_of_gust', 'TIME': 'PT15M/PRESENT' },
    attributions: 'FMI',
    //ratio: options.imageRatio,
    hidpi: false,
    serverType: 'geoserver'
  })
});

var temperatureLayer = new ImageLayer({
  name: "temperatureLayer",
  visible: false,
  opacity: 1,
  source: new ImageWMS({
    url: 'https://wms.meteo.fi/geoserver/wms',
    params: { 'LAYERS': 'observation:air_temperature', 'TIME': 'PT15M/PRESENT' },
    attributions: 'FMI',
    //ratio: options.imageRatio,
    hidpi: false,
    serverType: 'geoserver'
  })
});

var seaheightLayer = new ImageLayer({
  name: "seaheightLayer",
  visible: false,
  opacity: 1,
  source: new ImageWMS({
    url: 'https://wms.meteo.fi/geoserver/wms',
    params: { 'LAYERS': 'observation:sea_surface_height', 'TIME': 'PT2H/PRESENT' },
    attributions: 'FMI',
    //ratio: options.imageRatio,
    hidpi: false,
    serverType: 'geoserver'
  })
});

 
// Create features for geolocation
positionFeature = new Feature();
positionFeature.setStyle(
  new Style({
    image: new CircleStyle({
      radius: 6,
      fill: new Fill({
        color: '#3399CC',
      }),
      stroke: new Stroke({
        color: '#fff',
        width: 2,
      }),
    }),
  })
);

accuracyFeature = new Feature();

// Geolocation layer
const geolocationLayer = new VectorLayer({
  source: new VectorSource({
    features: [accuracyFeature, positionFeature],
  }),
  visible: true,
});

var aisLayer = new VectorLayer({
	source: new VectorSource(),
	visible: true,
  declutter: true,
  style: function (feature) {
      return aisIcon(feature);
  }
});

Object.keys(trackedVessels).forEach(function (item) {
	debug("Subscribed vessel " + item + " locations");
	client.subscribe("vessels-v2/" + item + "/+");
});

// Enhanced MQTT connection handling
client.on("connect", function () {
  debug("Connected to Digitraffic MQTT");
});

client.on("error", function (error) {
  debug("MQTT connection error:", error);
});

client.on("offline", function () {
  debug("MQTT connection offline");
});

function getVesselName(mmsi) {
	if (typeof trackedVessels[mmsi].metadata !== "undefined") {
			return trackedVessels[mmsi].metadata.name;
	} else {
		return mmsi;
	}
}
 

client.on("message", function (topic, payload) {

  vesselManager.handleWebsocketMessage(topic,JSON.parse(payload));

	var format = new GeoJSON({
		dataProjection: 'EPSG:4326',
		featureProjection: "EPSG:3857"
	});

	aisLayer.getSource().clear(true);
	Object.keys(trackedVessels).forEach(function (item) {
		if ( vesselManager.getGeoJSONForVessel(item) !== null) {
			aisLayer.getSource().addFeature(format.readFeature(vesselManager.getGeoJSONForVessel(item)));
		}
	});
});

const map = new Map({
  target: "map",
  // Add performance optimizations for better rendering
  pixelRatio: Math.min(window.devicePixelRatio || 1, 2), // Limit high DPI rendering
  layers: [
    darkGrayBaseLayer,
    darkGrayReferenceLayer,
    encLayer,
    vesialuerajoituksetLayer,
    syvyysLayer,
    satelliteLayer,
    radarLayer,
    vaylaalueetLayer,
    vaylatLayer,
    navigointilinjaLayer,
    lightningLayer,
    septiLayer,
    turvalaiteLayer,
    vesiliikennemerkitLayer,
    pksUimarannatLayer,
    pksUlkoilusaaretLayer,
    pksVenesatamatLayer,
    pksKohtaamispaikatLayer,
    turvalaiteviatLayer,
    aisLayer,
    windLayer,
    gustLayer,
    temperatureLayer,
    seaheightLayer,
    geolocationLayer,
  ],
  controls: defaultControls().extend([
    new MousePosition({
      coordinateFormat: function(coordinate) {
        // Convert decimal degrees to degrees and minutes with decimals
        const lon = coordinate[0];
        const lat = coordinate[1];
        
        const lonDeg = Math.floor(Math.abs(lon));
        const lonMin = (Math.abs(lon) - lonDeg) * 60;
        const lonDir = lon >= 0 ? 'E' : 'W';
        
        const latDeg = Math.floor(Math.abs(lat));
        const latMin = (Math.abs(lat) - latDeg) * 60;
        const latDir = lat >= 0 ? 'N' : 'S';
        
        return `${latDeg}°${latMin.toFixed(3)}'${latDir} ${lonDeg}°${lonMin.toFixed(3)}'${lonDir}`;
      },
      projection: 'EPSG:4326',
      className: 'custom-mouse-position',
      target: 'mouse-position',
    }),
    new ScaleLine({
      units: 'nautical',
    }),
  ]),
  interactions: defaultInteractions(),
  view: new View({
    enableRotation: false,
    center: fromLonLat([24.983, 60.1564]),
    maxZoom: 16,
    zoom: 14,
  }),
});

// CRITICAL: Force immediate rendering after map creation
map.render();
map.renderSync();

// Ensure map is properly sized and ready
map.updateSize();

// Improved render optimization with debouncing
let renderTimeout = null;
let isRendering = false;

function scheduleRender() {
  if (isRendering) return; // Prevent overlapping renders
  
  if (renderTimeout) {
    clearTimeout(renderTimeout);
  }
  renderTimeout = setTimeout(() => {
    isRendering = true;
    try {
      map.render();
    } catch (error) {
      console.warn('Render error:', error);
    } finally {
      isRendering = false;
      renderTimeout = null;
    }
  }, 50); // Increased debounce time for better performance during zoom
}

// Handle zoom changes with optimized cache clearing
let lastCacheCleanZoom = null;
map.getView().on('change:resolution', function() {
  const currentZoom = Math.round(map.getView().getZoom());
  
  // Only clear cache when zoom level changes significantly
  if (lastCacheCleanZoom === null || Math.abs(currentZoom - lastCacheCleanZoom) >= 2) {
    clearNavigationCache();
    lastCacheCleanZoom = currentZoom;
  }
  
  scheduleRender();
});

// Force render on move end
map.on('moveend', function() {
  scheduleRender();
});

// Better initial load handling
map.once('loadstart', function() {
  console.log('Map loading started');
});

map.once('loadend', function() {
  console.log('Map loading ended');
  scheduleRender();
});

// Single render complete trigger
map.once('rendercomplete', function() {
  console.log('Initial render complete');
  setTimeout(() => {
    map.render();
  }, 100);
});

// Simplified feature loading handlers
navigointilinjaLayer.getSource().on('featuresloadstart', function() {
  console.log('Navigation features loading started');
});

navigointilinjaLayer.getSource().on('featuresloadend', function() {
  console.log('Navigation features loaded');
  scheduleRender();
});

function onChangeAccuracyGeometry(event) {
  debug('Accuracy geometry changed.');
  accuracyFeature.setGeometry(event.target.getAccuracyGeometry());
}

function onChangePosition(event) {
  const coordinates = event.target.getPosition();
  positionFeature.setGeometry(coordinates ? new Point(coordinates) : null);
}

function setAllVisible(status) {
  radarLayer.setVisible(status);
  satelliteLayer.setVisible(status);
  windLayer.setVisible(status);
  gustLayer.setVisible(status);
  temperatureLayer.setVisible(status);
  seaheightLayer.setVisible(status);
  syvyysLayer.setVisible(status);
  vesialuerajoituksetLayer.setVisible(status);
  vesiliikennemerkitLayer.setVisible(status);
  navigointilinjaLayer.setVisible(status);
  pksUimarannatLayer.setVisible(status);
  pksVenesatamatLayer.setVisible(status);
  pksKohtaamispaikatLayer.setVisible(status);
  pksUlkoilusaaretLayer.setVisible(status);
  turvalaiteLayer.setVisible(status);
  turvalaiteviatLayer.setVisible(status);
  encLayer.setVisible(status);
}

// Layer management functions
function toggleLayer(layerName, layer) {
  const isVisible = layer.getVisible();
  layer.setVisible(!isVisible);
  debug(`Layer ${layerName} is now ${!isVisible ? 'visible' : 'hidden'}`);
  
  // Update button appearance
  const button = document.getElementById(layerName);
  if (button) {
    if (!isVisible) {
      button.classList.add('active');
    } else {
      button.classList.remove('active');
    }
  }
}

function showOnlyLayer(layer) {
  setAllVisible(false);
  aisLayer.setVisible(true); // Always keep AIS visible
  layer.setVisible(true);
}

const main = () => {
  console.log('Main function starting - setting up layers');
  
  // Set initial layer visibility
  setAllVisible(false);
  aisLayer.setVisible(true);
  vesialuerajoituksetLayer.setVisible(true);
  vesiliikennemerkitLayer.setVisible(true);
  navigointilinjaLayer.setVisible(true);
  turvalaiteLayer.setVisible(true);
  syvyysLayer.setVisible(true);

  console.log('Layers configured, forcing initial load');

  // Force feature loading for initial viewport with multiple approaches
  setTimeout(() => {
    console.log('Forcing feature refresh and render');
    // Force feature loading by refreshing the source
    navigointilinjaLayer.getSource().refresh();
    // Also trigger a view change to force feature loading
    const view = map.getView();
    const currentCenter = view.getCenter();
    const currentZoom = view.getZoom();
    
    // Slightly adjust view to trigger feature loading
    view.setCenter([currentCenter[0] + 1, currentCenter[1] + 1]);
    view.setCenter(currentCenter); // Reset to original
    
    map.render();
  }, 200);

  // Additional safety render
  setTimeout(() => {
    console.log('Safety render after 1 second');
    map.render();
  }, 1000);

  // GEOLOCATION
  geolocation = new Geolocation({
    trackingOptions: {
      enableHighAccuracy: true,
    },
    projection: map.getView().getProjection(),
  });

  geolocation.on("error", function (error) {
    debug(error.message);
  });
  geolocation.on("change:accuracyGeometry", onChangeAccuracyGeometry);
  geolocation.on("change:position", onChangePosition);

  // Add click to feature info
  map.on('singleclick', handleMapClick);

  // Location button functionality
  document.getElementById('location-btn').addEventListener('mouseup', function() {
    if (geolocation.getTracking()) {
      geolocation.setTracking(false);
      document.getElementById('location-btn').classList.remove('active');
    } else {
      geolocation.setTracking(true);
      document.getElementById('location-btn').classList.add('active');
      
      // Center map on user location when available
      geolocation.once('change:position', function() {
        const coordinates = geolocation.getPosition();
        if (coordinates) {
          map.getView().setCenter(coordinates);
          map.getView().setZoom(14);
        }
      });
    }
  });

  document.getElementById('nav').addEventListener('mouseup', function() {
    setAllVisible(false);
    aisLayer.setVisible(true);
    vesialuerajoituksetLayer.setVisible(true);
    vesiliikennemerkitLayer.setVisible(true);
    navigointilinjaLayer.setVisible(true);
    turvalaiteLayer.setVisible(true);
    syvyysLayer.setVisible(true);
    
    // Update UI state
    document.querySelectorAll('.action-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById('nav').classList.add('active');
  });

  document.getElementById('ais').addEventListener('mouseup', function() {
    setAllVisible(false);
    syvyysLayer.setVisible(true);
    aisLayer.setVisible(true);
    
    // Update UI state
    document.querySelectorAll('.action-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById('ais').classList.add('active');
  });

  document.getElementById('enc').addEventListener('mouseup', function() {
    setAllVisible(false);
    aisLayer.setVisible(true);
    encLayer.setVisible(true);
    
    // Update UI state
    document.querySelectorAll('.action-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById('enc').classList.add('active');
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', function(event) {
    switch(event.key) {
      case 'l':
      case 'L':
        // Toggle location tracking
        document.getElementById('location-btn').click();
        break;
      case 'n':
      case 'N':
        // Show navigation view
        document.getElementById('nav').click();
        break;
      case 'a':
      case 'A':
        // Show AIS only
        document.getElementById('ais').click();
        break;
      case 'e':
      case 'E':
        // Toggle ENC
        document.getElementById('enc').click();
        break;
      case 'Escape':
        // Hide all overlays
        setAllVisible(false);
        aisLayer.setVisible(true);
        break;
    }
  });

addMenuEventListener('vesiliikennemerkit',vesiliikennemerkitLayer);
addMenuEventListener('radar',radarLayer);
addMenuEventListener('satellite',satelliteLayer);
addMenuEventListener('wind',windLayer);
addMenuEventListener('gust',gustLayer);
addMenuEventListener('temperature',temperatureLayer);
addMenuEventListener('sea_surface_height',seaheightLayer);
addMenuEventListener('uimarannat',pksUimarannatLayer);
addMenuEventListener('ulkoilusaaret',pksUlkoilusaaretLayer);
addMenuEventListener('venesatamat',pksVenesatamatLayer);
addMenuEventListener('kohtaamispaikat',pksKohtaamispaikatLayer);
addMenuEventListener('septit',septiLayer);
addMenuEventListener('enc',encLayer);
addMenuEventListener('turvalaiteviat',turvalaiteviatLayer);

// Enhanced menu system functionality
function initializeMenuSystem() {
  const menuToggle = document.getElementById('menu-toggle');
  const sidePanel = document.getElementById('side-panel');
  const panelOverlay = document.getElementById('panel-overlay');
  
  // Menu toggle functionality
  menuToggle.addEventListener('click', () => {
    const isOpen = sidePanel.classList.contains('open');
    if (isOpen) {
      closePanel();
    } else {
      openPanel();
    }
  });
  
  // Panel overlay click to close (mobile)
  panelOverlay.addEventListener('click', () => {
    closePanel();
  });
  
  // ESC key to close panel
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sidePanel.classList.contains('open')) {
      closePanel();
    }
  });
  
  function openPanel() {
    sidePanel.classList.add('open');
    panelOverlay.classList.add('active');
    menuToggle.classList.add('active');
  }
  
  function closePanel() {
    sidePanel.classList.remove('open');
    panelOverlay.classList.remove('active');
    menuToggle.classList.remove('active');
  }
  
  // Enhanced layer toggle functionality
  function initializeLayerToggles() {
    const layerToggles = document.querySelectorAll('.layer-toggle');
    
    layerToggles.forEach(toggle => {
      toggle.addEventListener('click', () => {
        const isActive = toggle.classList.contains('active');
        // Remove active from all layer toggles in the same section
        const section = toggle.closest('.panel-section');
        if (section) {
          section.querySelectorAll('.layer-toggle.active').forEach(btn => {
            btn.classList.remove('active');
          });
        }
        
        if (!isActive) {
          toggle.classList.add('active');
        }
      });
    });
  }
  
  initializeLayerToggles();
}

// Initialize the new menu system
initializeMenuSystem();

  function addMenuEventListener(id, layer) {
    const element = document.getElementById(id);
    if (!element) return;
    
    element.addEventListener('mouseup', function () {
      setAllVisible(false);
      aisLayer.setVisible(true);
      layer.setVisible(true);
      
      // Update visual state for layer toggles
      if (element.classList.contains('layer-toggle')) {
        // Remove active from all layer toggles
        document.querySelectorAll('.layer-toggle').forEach(btn => {
          btn.classList.remove('active');
        });
        element.classList.add('active');
      }
      
      debug("Set " + id + " visible");
    });
  }

  sync(map);

};
if (typeof septiJSON === 'object' && septiJSON !== null) {
  console.log('Valid JSON');
} else {
  console.log('Invalid JSON');
}
main();

// Enhanced vessel information display
function showVesselInfo(feature) {
  const mmsi = feature.get("mmsi");
  const vessel = trackedVessels[mmsi];
  if (vessel && vessel.metadata) {
    const info = `
      Vessel: ${vessel.metadata.name}
      MMSI: ${mmsi}
      Speed: ${feature.get('sog')} knots
      Course: ${feature.get('cog')}°
      Heading: ${feature.get('heading')}°
    `;
    console.log(info);
    // You could show this in a popup or info panel
  }
}

// Enhanced click handler for map features
function handleMapClick(evt) {
  const pixel = map.getEventPixel(evt.originalEvent);
  const features = [];
  
  map.forEachFeatureAtPixel(pixel, function (feature, layer) {
    features.push({ feature, layer });
  });
  
  if (features.length > 0) {
    const { feature, layer } = features[0];
    const properties = feature.getProperties();
    
    // Handle different layer types
    if (layer === aisLayer) {
      showVesselInfo(feature);
    } else if (layer === turvalaiteLayer) {
      console.log('Safety device:', properties);
    } else if (layer === vesiliikennemerkitLayer) {
      console.log('Water traffic sign:', properties);
    } else {
      console.log('Feature clicked:', properties);
    }
  }
}