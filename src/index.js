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
import { RescueVesselManager } from './rescueVesselManager.js';
import vaylaSource from "./vaylaSource.js";
import pksUimarannatJSON from "./pks-uimarannat.json"
import pksUlkoilusaaretJSON from "./pks-ulkoilusaaret.json"
import pksVenesatamatJSON from "./pks-venesatamat.json"
import pksKohtaamispaikatJSON from "./kohtaamispaikat.json"
import septiJSON from "./septic.json"

// Initialize rescue vessel manager
console.log("=== APPLICATION STARTING ===");
console.log("Initializing rescue vessel manager...");

let rescueVesselManager, trackedVessels, vesselManager;

try {
  rescueVesselManager = new RescueVesselManager();
  console.log("Rescue vessel manager created");
  trackedVessels = {}; // Will be populated from API
  vesselManager = new VesselInfoManager(trackedVessels, rescueVesselManager);
  console.log("Vessel manager created");
} catch (error) {
  console.error("=== ERROR CREATING MANAGERS ===", error);
  throw error;
}
let geolocation;
let DEBUG = true;
let positionFeature;
let accuracyFeature;

console.log("Connecting to MQTT...");
const client = mqtt.connect('wss://meri.digitraffic.fi:443/mqtt',{username: 'digitraffic', password: 'digitrafficPassword'});

// Add detailed MQTT connection monitoring
client.on('connecting', function() {
  console.log('=== MQTT CONNECTING... ===');
});

client.on('reconnect', function() {
  console.log('=== MQTT RECONNECTING... ===');
});

client.on('close', function() {
  console.log('=== MQTT CONNECTION CLOSED ===');
});

client.on('disconnect', function() {
  console.log('=== MQTT DISCONNECTED ===');
});

// Add debugging functions to window for testing
window.debugRescueVessels = function() {
  console.log('=== RESCUE VESSEL DEBUG INFO ===');
  console.log('RescueVesselManager loaded:', rescueVesselManager?.loaded);
  console.log('RescueVesselManager loading:', rescueVesselManager?.loading);
  console.log('TrackedVessels count:', Object.keys(trackedVessels || {}).length);
  console.log('MQTT client connected:', client?.connected);
  if (rescueVesselManager) {
    console.log('Stats:', rescueVesselManager.getStatistics());
  } else {
    console.log('RescueVesselManager not available');
  }
};

// Notification System
class NotificationManager {
  constructor() {
    this.notifications = [];
    this.container = null;
    this.init();
  }

  init() {
    // Create notification container
    this.container = document.createElement('div');
    this.container.id = 'notification-container';
    this.container.style.cssText = `
      position: fixed;
      top: 80px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 10000;
      display: flex;
      flex-direction: column;
      gap: 10px;
      pointer-events: none;
    `;
    document.body.appendChild(this.container);
  }

  show(message, type = 'info', duration = 4000) {
    const notification = document.createElement('div');
    notification.style.cssText = `
      background: ${this.getBackgroundColor(type)};
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      opacity: 0;
      transform: translateY(-20px);
      transition: all 0.3s ease;
      pointer-events: auto;
      text-align: center;
      min-width: 200px;
      max-width: 400px;
    `;
    
    notification.textContent = message;
    this.container.appendChild(notification);
    this.notifications.push(notification);

    // Animate in
    requestAnimationFrame(() => {
      notification.style.opacity = '1';
      notification.style.transform = 'translateY(0)';
    });

    // Auto-remove after duration
    if (duration > 0) {
      setTimeout(() => {
        this.remove(notification);
      }, duration);
    }

    return notification;
  }

  remove(notification) {
    if (!notification || !notification.parentNode) return;

    // Animate out
    notification.style.opacity = '0';
    notification.style.transform = 'translateY(-20px)';
    
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
      const index = this.notifications.indexOf(notification);
      if (index > -1) {
        this.notifications.splice(index, 1);
      }
    }, 300);
  }

  getBackgroundColor(type) {
    switch (type) {
      case 'success': return 'rgba(34, 197, 94, 0.95)';
      case 'error': return 'rgba(239, 68, 68, 0.95)';
      case 'warning': return 'rgba(251, 146, 60, 0.95)';
      case 'info':
      default: return 'rgba(59, 130, 246, 0.95)';
    }
  }
}

// Initialize notification manager
const notificationManager = new NotificationManager();

// Log when window loads
window.addEventListener('load', function() {
  console.log('=== WINDOW LOADED ===');
  console.log('Page fully loaded - rescue vessel manager should initialize when MQTT connects');
});

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
  const mmsi = feature.get("mmsi") + "";
  const sog = feature.get('sog') || 0; // Speed over ground
  const heading = feature.get('heading') || 0;
  const cog = feature.get('cog'); // Course over ground
  const rot = feature.get('rot') || 0; // Rate of turn
  
  // Determine if this is a rescue vessel for different styling
  const isRescueVessel = rescueVesselManager.isRescueVessel(mmsi);
  // Check if this is the user's own tracked vessel
  const isOwnVessel = vesselPanelManager && vesselPanelManager.currentMMSI === mmsi;
  const triangleColor = isOwnVessel ? '#ff6b35' : '#00b04f'; // Orange for own vessel, green for all others
  const cogColor = isOwnVessel ? '#ff6b35' : '#00b04f'; // COG vector matches vessel color
  
  const markerSize = 80;
  const centerX = markerSize / 2;
  const centerY = markerSize / 2;
  
  // Main vessel triangle (pointing right, will be rotated by heading)
  const triangleSize = 12;
  const vesselTriangle = `<polygon points="${centerX + triangleSize},${centerY} ${centerX - triangleSize/2},${centerY - triangleSize/2} ${centerX - triangleSize/2},${centerY + triangleSize/2}" 
                          fill="${triangleColor}" fill-opacity="0.6" 
                          stroke="${triangleColor}" stroke-width="1"/>`;
  
  // COG vector (independent of vessel heading)
  let cogVector = '';
  if (sog > 0 && cog != null) {
    const cogLength = 25;
    const cogEndX = centerX + cogLength;
    const cogEndY = centerY;
    
    // Calculate turn indicator based on ROT
    const maxRotLength = 15; // Maximum length for turn indicator
    const rotLength = Math.min(Math.abs(rot) * 2, maxRotLength); // Scale ROT to indicator length
    
    let turnIndicator = '';
    if (Math.abs(rot) > 1) { // Only show turn indicator if ROT is significant
      if (rot > 0) {
        // Right turn - 90 degree bend downward (to the right relative to COG direction)
        turnIndicator = `<path d="M ${cogEndX},${cogEndY} L ${cogEndX},${cogEndY + rotLength}" 
                         stroke="${cogColor}" stroke-width="2" fill="none" stroke-linecap="round"/>`;
      } else {
        // Left turn - 90 degree bend upward (to the left relative to COG direction)
        turnIndicator = `<path d="M ${cogEndX},${cogEndY} L ${cogEndX},${cogEndY - rotLength}" 
                         stroke="${cogColor}" stroke-width="2" fill="none" stroke-linecap="round"/>`;
      }
    }
    
    // COG vector line with turn indicator (fix rotation - COG is already in degrees)
    cogVector = `<g transform="rotate(${cog - 90} ${centerX} ${centerY})">
                   <line x1="${centerX}" y1="${centerY}" x2="${cogEndX}" y2="${cogEndY}" 
                         stroke="${cogColor}" stroke-width="2" stroke-dasharray="4,2" opacity="0.9" stroke-linecap="round"/>
                   ${turnIndicator}
                 </g>`;
  }
  
  // Determine text position based on COG to avoid overlap with COG vector
  // If COG is between 90° and 270°, place text above marker to avoid COG vector
  const textAbove = sog > 0 && cog != null && cog > 90 && cog < 270;
  const speedTextY = textAbove ? centerY - 22 : centerY + 22;
  const courseTextY = textAbove ? centerY - 34 : centerY + 34;
  
  // Speed text
  const speedText = sog.toFixed(1);
  const fontSize = '11';
  const speedTextColor = isOwnVessel ? '#ff6b35' : '#00b04f'; // Speed text matches vessel color
  
  // Course text (only if speed > 0 and COG is available)
  let courseText = '';
  if (sog > 0 && cog != null) {
    courseText = `<text x="${centerX}" y="${courseTextY}" 
                       font-family="Arial, sans-serif" font-size="10" font-weight="normal"
                       text-anchor="middle" dominant-baseline="central" 
                       fill="${speedTextColor}">${cog.toFixed(0)}°</text>`;
  }
  
  const svg = `<svg width="${markerSize}" height="${markerSize}" version="1.1" xmlns="http://www.w3.org/2000/svg">
    <!-- COG vector (rendered first, independent rotation) -->
    ${cogVector}
    
    <!-- Vessel triangle (rotated by heading) -->
    <g transform="rotate(${heading - 90} ${centerX} ${centerY})">
      ${vesselTriangle}
    </g>
    
    <!-- Speed text -->
    <text x="${centerX}" y="${speedTextY}" 
          font-family="Arial, sans-serif" font-size="${fontSize}" font-weight="normal"
          text-anchor="middle" dominant-baseline="central" 
          fill="${speedTextColor}">${speedText} kn</text>
    
    <!-- Course text (if moving) -->
    ${courseText}
  </svg>`;
  
  const styles = [
    new Style({
      image: new Icon({
        opacity: 1,
        src: "data:image/svg+xml;utf8," + encodeURIComponent(svg),
        scale: 1.0,
        anchor: [0.5, 0.5],
      }),
    })
  ];
  
  return styles;
}

// Enhanced vessel name display on hover/click
function showVesselNameOnHover(feature, pixel) {
  const mmsi = feature.get("mmsi") + "";
  const vesselName = getVesselName(mmsi);
  const sog = feature.get('sog') || 0;
  const heading = feature.get('heading') || 0;
  const cog = feature.get('cog');
  const rot = feature.get('rot') || 0;
  
  // Create hover tooltip
  const tooltip = document.getElementById('vessel-tooltip') || createVesselTooltip();
  
  let tooltipContent = `<strong>${vesselName}</strong><br/>`;
  tooltipContent += `Speed: ${sog.toFixed(1)} kn<br/>`;
  tooltipContent += `Heading: ${heading.toFixed(0)}°`;
  
  if (cog != null && sog > 0) {
    tooltipContent += `<br/>Course: ${cog.toFixed(0)}°`;
  }
  
  if (Math.abs(rot) > 0.1) {
    tooltipContent += `<br/>Turn Rate: ${rot.toFixed(1)}°/min`;
  }
  
  if (vesselPanelManager && vesselPanelManager.currentMMSI === mmsi) {
    tooltipContent += `<br/><span style="color: #ff6b35; font-weight: bold;">YOUR VESSEL</span>`;
  } else if (rescueVesselManager.isRescueVessel(mmsi)) {
    tooltipContent += `<br/><span style="color: #ff6b35; font-weight: bold;">RESCUE VESSEL</span>`;
  }
  
  tooltip.innerHTML = tooltipContent;
  tooltip.style.display = 'block';
  tooltip.style.left = (pixel[0] + 10) + 'px';
  tooltip.style.top = (pixel[1] - 10) + 'px';
}

function hideVesselTooltip() {
  const tooltip = document.getElementById('vessel-tooltip');
  if (tooltip) {
    tooltip.style.display = 'none';
  }
}

function createVesselTooltip() {
  const tooltip = document.createElement('div');
  tooltip.id = 'vessel-tooltip';
  tooltip.style.cssText = `
    position: absolute;
    background: rgba(0, 0, 0, 0.9);
    color: white;
    padding: 8px 12px;
    border-radius: 6px;
    font-size: 12px;
    font-family: Arial, sans-serif;
    line-height: 1.4;
    pointer-events: none;
    z-index: 1000;
    display: none;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    border: 1px solid rgba(255,255,255,0.2);
    max-width: 200px;
  `;
  document.body.appendChild(tooltip);
  return tooltip;
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
      // Create a more prominent warning symbol
      return new Style({
        image: new CircleStyle({
          radius: 6,
          fill: new Fill({ color: 'rgba(255, 165, 0, 0.8)' }), // Orange background
          stroke: new Stroke({ color: '#ff0000', width: 2 }), // Red border
        }),
        text: new Text({
          font: 'bold 11px Arial,sans-serif',
          fill: new Fill({ color: '#ffffff' }),
          stroke: new Stroke({
            color: '#000000', width: 2
          }),
          offsetY: 15, // Position text below the marker
          textAlign: 'center',
          // Show only essential information: type and device name if available
          text: feature.get("type") + (feature.get("aton_name_fi") ? "\n" + feature.get("aton_name_fi") : "")
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

 
// GPS icon function using same triangle style as AIS vessels
function gpsIcon(heading = 0, speed = 0) {
  const triangleColor = '#ff6b35'; // Orange for GPS own vessel
  const markerSize = 80;
  const centerX = markerSize / 2;
  const centerY = markerSize / 2;
  
  // Main vessel triangle (pointing right, will be rotated by heading)
  const triangleSize = 12;
  const vesselTriangle = `<polygon points="${centerX + triangleSize},${centerY} ${centerX - triangleSize/2},${centerY - triangleSize/2} ${centerX - triangleSize/2},${centerY + triangleSize/2}" 
                          fill="${triangleColor}" fill-opacity="0.6" 
                          stroke="${triangleColor}" stroke-width="1"/>`;
  
  // Speed text (always show for GPS)
  const speedText = `<text x="${centerX}" y="${centerY + 22}" 
                     text-anchor="middle" dominant-baseline="middle" 
                     font-family="Arial, sans-serif" font-size="11px" 
                     fill="${triangleColor}" font-weight="normal">
                     ${speed.toFixed(1)} kn
                   </text>`;
  
  const svgContent = `
    <svg width="${markerSize}" height="${markerSize}" xmlns="http://www.w3.org/2000/svg">
      <g transform="rotate(${heading - 90} ${centerX} ${centerY})">
        ${vesselTriangle}
      </g>
      ${speedText}
    </svg>
  `;
  
  return new Style({
    image: new Icon({
      src: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgContent),
      scale: 1,
      anchor: [0.5, 0.5]
    })
  });
}

// Create features for geolocation
positionFeature = new Feature();
// Initial style - will be updated dynamically
positionFeature.setStyle(gpsIcon(0, 0));

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

// Initialize rescue vessel loading
async function initializeRescueVessels() {
	console.log("=== INITIALIZING RESCUE VESSELS ===");
	try {
		console.log('Loading rescue vessels from Digitraffic API...');
		
		// Show loading notification to user
		const loadingNotification = notificationManager.show('Loading rescue vessels...', 'info', 0); // 0 = don't auto-dismiss
		
		console.log("Calling rescueVesselManager.initialize()...");
		await rescueVesselManager.initialize();
		console.log("RescueVesselManager initialized successfully");
		
		// Update tracked vessels with rescue vessels
		trackedVessels = rescueVesselManager.getRescueVessels();
		console.log("Updated trackedVessels with", Object.keys(trackedVessels).length, "rescue vessels");
		
		// Update vessel manager with new followed list
		vesselManager.followedList = trackedVessels;
		console.log("Updated vesselManager.followedList");
		
		// Subscribe to rescue vessel MQTT topics
		Object.keys(trackedVessels).forEach(function (mmsi) {
			debug("Subscribed rescue vessel " + mmsi + " (" + rescueVesselManager.getVesselName(mmsi) + ") locations");
			client.subscribe("vessels-v2/" + mmsi + "/+");
		});
		
		const vesselCount = Object.keys(trackedVessels).length;
		console.log(`Successfully loaded and subscribed to ${vesselCount} rescue vessels`);
		
		// Remove loading notification and show success
		notificationManager.remove(loadingNotification);
		notificationManager.show(`Loaded ${vesselCount} rescue vessels`, 'success', 3000);
				
	} catch (error) {
		console.error('=== RESCUE VESSEL INITIALIZATION ERROR ===');
		console.error('Failed to load rescue vessels:', error);
		console.error('Error stack:', error.stack);
		
		// Show error notification
		notificationManager.show('Failed to load rescue vessels - using offline mode', 'error', 5000);
		
		// Fall back to empty vessels list
		trackedVessels = {};
		vesselManager.followedList = trackedVessels;
	}
}

// Start loading rescue vessels when MQTT connects
let rescueVesselsInitialized = false;

// Enhanced MQTT connection handling
client.on("connect", function () {
  console.log("=== MQTT CONNECTION ESTABLISHED ===");
  debug("Connected to Digitraffic MQTT");
  
  // Show connection notification
  notificationManager.show('Connected to vessel tracking system', 'success', 2000);
  
  // Initialize rescue vessels when connected
  if (!rescueVesselsInitialized) {
    console.log("Starting rescue vessel initialization...");
    rescueVesselsInitialized = true;
    initializeRescueVessels().then(() => {
      console.log('Rescue vessels initialization completed');
      
      // Add global test function for debugging
      window.testRescueVessels = function() {
        console.log('=== Rescue Vessel Manager Test ===');
        const stats = rescueVesselManager.getStatistics();
        console.log('Statistics:', stats);
        
        // Test known rescue vessel
        const testMMSI = '265571640';
        console.log(`\nTesting MMSI ${testMMSI}:`);
        console.log('- Is rescue vessel:', rescueVesselManager.isRescueVessel(testMMSI));
        console.log('- Vessel name:', rescueVesselManager.getVesselName(testMMSI));
        console.log('- Call sign:', rescueVesselManager.getVesselCallSign(testMMSI));
        
        // Show first 5 rescue vessels
        const rescueVessels = rescueVesselManager.getRescueVessels();
        const mmsis = Object.keys(rescueVessels).slice(0, 5);
        console.log('\nFirst 5 rescue vessels:');
        mmsis.forEach(mmsi => {
          const vessel = rescueVessels[mmsi];
          console.log(`- ${mmsi}: ${vessel.metadata.name} (${vessel.metadata.callsign || 'No callsign'})`);
        });
        
        return stats;
      };
      
    }).catch(error => {
      console.error('Rescue vessels initialization failed:', error);
    });
  }
});

client.on("error", function (error) {
  console.error("=== MQTT CONNECTION ERROR ===", error);
  debug("MQTT connection error:", error);
});

client.on("offline", function () {
  console.log("=== MQTT CONNECTION OFFLINE ===");
  debug("MQTT connection offline");
});

function getVesselName(mmsi) {
	// First try to get from rescue vessel manager for faster lookup
	const rescueName = rescueVesselManager.getVesselName(mmsi);
	if (rescueName && rescueName !== mmsi) {
		return rescueName;
	}
	
	// Fall back to tracked vessels metadata if available
	if (typeof trackedVessels[mmsi]?.metadata !== "undefined") {
		return trackedVessels[mmsi].metadata.name;
	} else {
		return mmsi;
	}
}
 

client.on("message", function (topic, payload) {
  try {
    const parsedPayload = JSON.parse(payload);
    
    vesselManager.handleWebsocketMessage(topic, parsedPayload);

    var format = new GeoJSON({
      dataProjection: 'EPSG:4326',
      featureProjection: "EPSG:3857"
    });

    // Clear existing features
    aisLayer.getSource().clear(true);
    
    // Add all vessels that have location data
    let addedFeatures = 0;
    Object.keys(trackedVessels).forEach(function (mmsi) {
      const geoJSON = vesselManager.getGeoJSONForVessel(mmsi);
      if (geoJSON !== null) {
        try {
          const feature = format.readFeature(geoJSON);
          aisLayer.getSource().addFeature(feature);
          addedFeatures++;
        } catch (error) {
          console.error(`Error adding feature for vessel ${mmsi}:`, error);
        }
      }
    });
    
    // Force map to re-render
    map.render();
    
  } catch (error) {
    console.error('Error processing MQTT message:', error, 'Topic:', topic, 'Payload:', payload.toString());
  }
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
  
  // Update GPS icon style with current heading and speed
  if (coordinates && vesselPanelManager) {
    const speed = geolocation.getSpeed(); // Speed in m/s
    let heading = geolocation.getHeading(); // GPS heading
    
    // Convert speed from m/s to knots
    const speedKnots = speed ? (speed * 1.94384) : 0;
    
    // If GPS heading is not available, try to use calculated heading
    if (heading === null || heading === undefined) {
      heading = vesselPanelManager.calculatedHeading || 0;
    } else {
      // GPS heading might be in radians, convert to degrees if needed
      if (Math.abs(heading) <= Math.PI * 2) {
        heading = heading * 180 / Math.PI; // Convert from radians
      }
      // Normalize to 0-360
      heading = ((heading % 360) + 360) % 360;
    }
    
    // Update the GPS position marker style
    positionFeature.setStyle(gpsIcon(heading, speedKnots));
  }
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

  // Add hover functionality for vessel tooltips
  map.on('pointermove', function(evt) {
    const pixel = map.getEventPixel(evt.originalEvent);
    const features = [];
    
    map.forEachFeatureAtPixel(pixel, function (feature, layer) {
      if (layer === aisLayer) {
        features.push({ feature, layer });
      }
    });
    
    const mapTarget = map.getTarget();
    const mapElement = typeof mapTarget === 'string' ? document.getElementById(mapTarget) : mapTarget;
    
    if (features.length > 0) {
      const { feature } = features[0];
      showVesselNameOnHover(feature, pixel);
      if (mapElement) {
        mapElement.style.cursor = 'pointer';
      }
    } else {
      hideVesselTooltip();
      if (mapElement) {
        mapElement.style.cursor = 'crosshair';
      }
    }
  });

  // Hide tooltip when pointer leaves the map
  map.on('pointerleave', function() {
    hideVesselTooltip();
    const mapTarget = map.getTarget();
    const mapElement = typeof mapTarget === 'string' ? document.getElementById(mapTarget) : mapTarget;
    if (mapElement) {
      mapElement.style.cursor = 'crosshair';
    }
  });

  // Note: Location button functionality is now handled by VesselPanelManager
  // The location button now toggles the vessel panel instead of location tracking

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
  
  // Try to get vessel name from rescue vessel manager first
  let vesselName = rescueVesselManager.getVesselName(mmsi);
  
  // Fall back to tracked vessels if not found
  if (vesselName === mmsi && trackedVessels[mmsi]?.metadata?.name) {
    vesselName = trackedVessels[mmsi].metadata.name;
  }
  
  const info = `
    Vessel: ${vesselName}
    MMSI: ${mmsi}
    Speed: ${feature.get('sog')} knots
    Course: ${feature.get('cog')}°
    Heading: ${feature.get('heading')}°
    ${rescueVesselManager.isRescueVessel(mmsi) ? 'Type: RESCUE VESSEL' : ''}
  `;
  console.log(info);
  // You could show this in a popup or info panel
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

// Vessel Panel Management
class VesselPanelManager {
  constructor() {
    this.panel = document.getElementById('vessel-panel');
    this.gpsBtn = document.getElementById('gps-btn');
    this.aisBtn = document.getElementById('ais-btn');
    this.mmsiInputSection = document.getElementById('mmsi-input-section');
    this.mmsiInput = document.getElementById('mmsi-input');
    this.mmsiSubmit = document.getElementById('mmsi-submit');
    this.locationBtn = document.getElementById('location-btn');
    
    // Data source: 'none', 'gps' or 'ais'
    this.currentSource = 'none';
    this.currentMMSI = null;
    this.isOpen = false;
    
    // For calculated heading based on position changes
    this.lastPosition = null;
    this.lastPositionTime = null;
    this.calculatedHeading = null;
    
    this.initializeEventListeners();
    this.startLocationUpdates();
  }
  
  initializeEventListeners() {
    // Panel toggle from location button
    this.locationBtn.addEventListener('click', () => {
      this.togglePanel();
    });
    
    // Close panel when clicking overlay (mobile)
    const overlay = document.getElementById('panel-overlay');
    if (overlay) {
      overlay.addEventListener('click', () => {
        if (this.isOpen) {
          this.togglePanel();
        }
      });
    }
    
    // GPS button
    this.gpsBtn.addEventListener('click', () => {
      this.selectSource('gps');
    });
    
    // AIS button
    this.aisBtn.addEventListener('click', () => {
      this.selectSource('ais');
    });
    
    // MMSI input
    this.mmsiSubmit.addEventListener('click', () => {
      this.submitMMSI();
    });
    
    this.mmsiInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.submitMMSI();
      }
    });
    
    // Only allow numbers in MMSI input
    this.mmsiInput.addEventListener('input', (e) => {
      e.target.value = e.target.value.replace(/[^0-9]/g, '');
    });
    
    // Keyboard shortcut for vessel info panel (now L key)
    document.addEventListener('keydown', (e) => {
      if (e.key === 'l' || e.key === 'L') {
        this.togglePanel();
      }
    });
  }
  
  togglePanel() {
    this.isOpen = !this.isOpen;
    this.panel.classList.toggle('open', this.isOpen);
    this.locationBtn.classList.toggle('active', this.isOpen);
    
    // Update map size when panel is toggled
    setTimeout(() => {
      map.updateSize();
    }, 300); // Wait for CSS transition to complete
  }
  
  selectSource(source) {
    // If clicking the same source that's already active, deactivate it
    if (this.currentSource === source) {
      this.currentSource = 'none';
      this.updateSourceButtons();
      this.clearVesselInfo();
      
      // If deactivating GPS, also stop geolocation
      if (source === 'gps') {
        geolocation.setTracking(false);
        this.locationBtn.classList.remove('active');
      }
      return;
    }
    
    // Activate the selected source
    this.currentSource = source;
    this.updateSourceButtons();
    
    if (source === 'gps') {
      // Activate geolocation
      geolocation.setTracking(true);
      this.locationBtn.classList.add('active');
      this.mmsiInputSection.style.display = 'none';
      this.currentMMSI = null;
      notificationManager.show('GPS tracking activated', 'info', 2000);
    } else if (source === 'ais') {
      // Stop geolocation if it was active
      geolocation.setTracking(false);
      this.locationBtn.classList.remove('active');
      this.mmsiInputSection.style.display = 'block';
    }
    
    this.updateVesselInfo();
  }
  
  updateSourceButtons() {
    // Update button states
    this.gpsBtn.classList.toggle('active', this.currentSource === 'gps');
    this.aisBtn.classList.toggle('active', this.currentSource === 'ais');
  }
  
  submitMMSI() {
    const mmsi = this.mmsiInput.value.trim();
    if (mmsi.length >= 7 && mmsi.length <= 9) {
      this.currentMMSI = mmsi;
      this.mmsiInput.value = '';
      
      // Check if it's a rescue vessel for better status message and notification
      if (rescueVesselManager.isRescueVessel(mmsi)) {
        const vesselName = rescueVesselManager.getVesselName(mmsi);
        this.updateStatus(`Tracking rescue vessel: ${vesselName}`, 'active');
        notificationManager.show(`Now tracking rescue vessel: ${vesselName}`, 'success', 2500);
      } else {
        this.updateStatus('Tracking vessel...', 'active');
        notificationManager.show(`Now tracking vessel: ${mmsi}`, 'info', 2000);
      }
      
      // Subscribe to the vessel if not already tracked
      if (!trackedVessels[mmsi]) {
        client.subscribe(`vessels-v2/${mmsi}/+`);
        trackedVessels[mmsi] = {};
      }
      
      // Center map on vessel location if available
      this.centerMapOnVessel(mmsi);
      
      // Immediately update vessel info display
      this.updateVesselInfo();
    } else {
      this.updateStatus('Invalid MMSI format', 'error');
      notificationManager.show('Invalid MMSI format. Please enter 7-9 digits.', 'error', 3000);
      setTimeout(() => this.updateVesselInfo(), 3000);
    }  }
  
  centerMapOnVessel(mmsi) {
    // Check if vessel has location data
    const vesselData = vesselManager.getGeoJSONForVessel(mmsi);
    
    if (vesselData && vesselData.properties && vesselData.properties.lat && vesselData.properties.lon) {
      const lat = vesselData.properties.lat;
      const lon = vesselData.properties.lon;
      
      // Convert lat/lon to map projection and center the map with zoom
      const coordinates = fromLonLat([lon, lat]);
      const view = map.getView();
      view.setCenter(coordinates);
      view.setZoom(14); // Zoom in to a good level for vessel tracking
      
      console.log(`Map centered and zoomed on vessel ${mmsi} at coordinates: ${lat}, ${lon}`);
      
      // Show notification about centering and zooming
      if (rescueVesselManager.isRescueVessel(mmsi)) {
        const vesselName = rescueVesselManager.getVesselName(mmsi);
        notificationManager.show(`Map centered and zoomed on rescue vessel: ${vesselName}`, 'info', 2000);
      } else {
        notificationManager.show(`Map centered and zoomed on vessel: ${mmsi}`, 'info', 2000);
      }
    } else {
      console.log(`No location data available for vessel ${mmsi} yet`);
      // We could add a listener to center the map when location data becomes available
      this.scheduleMapCenteringWhenDataAvailable(mmsi);
    }
  }
  
  scheduleMapCenteringWhenDataAvailable(mmsi) {
    // Set up a periodic check for location data (max 30 seconds)
    let attempts = 0;
    const maxAttempts = 30; // 30 seconds with 1-second intervals
    
    const checkForLocation = () => {
      attempts++;
      const vesselData = vesselManager.getGeoJSONForVessel(mmsi);
      
      if (vesselData && vesselData.properties && vesselData.properties.lat && vesselData.properties.lon) {
        // Location data is now available, center and zoom the map
        const lat = vesselData.properties.lat;
        const lon = vesselData.properties.lon;
        const coordinates = fromLonLat([lon, lat]);
        const view = map.getView();
        view.setCenter(coordinates);
        view.setZoom(12); // Zoom in to a good level for vessel tracking
        
        console.log(`Map centered and zoomed on vessel ${mmsi} (delayed) at coordinates: ${lat}, ${lon}`);
        
        if (rescueVesselManager.isRescueVessel(mmsi)) {
          const vesselName = rescueVesselManager.getVesselName(mmsi);
          notificationManager.show(`Map centered and zoomed on rescue vessel: ${vesselName}`, 'info', 2000);
        } else {
          notificationManager.show(`Map centered and zoomed on vessel: ${mmsi}`, 'info', 2000);
        }
      } else if (attempts < maxAttempts) {
        // Try again in 1 second
        setTimeout(checkForLocation, 1000);
      } else {
        console.log(`No location data received for vessel ${mmsi} after ${maxAttempts} seconds`);
      }
    };
    
    // Start checking after 1 second
    setTimeout(checkForLocation, 1000);
  }

  updateVesselInfo() {
    if (this.currentSource === 'gps') {
      this.updateGPSInfo();
    } else if (this.currentSource === 'ais' && this.currentMMSI) {
      this.updateAISInfo();
    } else {
      this.clearVesselInfo();
    }
  }
  
  updateGPSInfo() {
    if (!geolocation || !geolocation.getPosition()) {
      this.updateStatus('GPS not available', 'error');
      this.clearDisplayValues();
      return;
    }
    
    const position = geolocation.getPosition();
    const accuracy = geolocation.getAccuracy();
    const speed = geolocation.getSpeed(); // Speed in m/s
    const heading = geolocation.getHeading(); // May be in radians or degrees
    
    if (position) {
      // Convert position to lat/lon
      const [lon, lat] = toLonLat(position);
      
      // Format position
      const formattedPos = this.formatPosition(lat, lon);
      document.getElementById('vessel-position').textContent = formattedPos;
      
      // Speed (convert from m/s to knots if available)
      if (speed !== null && speed !== undefined && speed >= 0) {
        const speedKnots = (speed * 1.94384).toFixed(1); // m/s to knots
        document.getElementById('vessel-speed').textContent = `${speedKnots} kn`;
      } else {
        document.getElementById('vessel-speed').textContent = '-- kn';
      }
      
      // Heading - GPS heading should be in degrees (0-360)
      if (heading !== null && heading !== undefined && heading >= 0) {
        // Log for debugging
        console.log('GPS heading value:', heading, 'type:', typeof heading);
        
        // Normalize to 0-360 range and ensure it's a proper number
        let headingDegrees = Number(heading);
        headingDegrees = ((headingDegrees % 360) + 360) % 360;
        
        // Display with proper formatting
        document.getElementById('vessel-heading').textContent = `${Math.round(headingDegrees)}°`;
      } else {
        console.log('GPS heading not available:', heading);
        // Try to calculate heading from position changes if GPS heading is not available
        const calculatedHeading = this.calculateHeadingFromMovement(position);
        if (calculatedHeading !== null) {
          console.log('Using calculated heading:', calculatedHeading);
          document.getElementById('vessel-heading').textContent = `${Math.round(calculatedHeading)}°`;
        } else {
          document.getElementById('vessel-heading').textContent = '--°';
        }
      }
      
      // Hide vessel name, call sign and MMSI for GPS
      document.getElementById('vessel-name-item').style.display = 'none';
      document.getElementById('call-sign-item').style.display = 'none';
      document.getElementById('mmsi-display-item').style.display = 'none';
      
      this.updateStatus(`GPS active (±${accuracy?.toFixed(0)}m)`, 'active');
    } else {
      this.updateStatus('GPS not available', 'error');
      this.clearDisplayValues();
    }
  }
  
  calculateHeadingFromMovement(currentPosition) {
    const currentTime = Date.now();
    
    if (this.lastPosition && this.lastPositionTime) {
      const timeDiff = currentTime - this.lastPositionTime;
      
      // Only calculate if we have moved and enough time has passed (at least 5 seconds)
      if (timeDiff > 5000) {
        const [currentLon, currentLat] = toLonLat(currentPosition);
        const [lastLon, lastLat] = toLonLat(this.lastPosition);
        
        // Calculate distance moved (in degrees)
        const deltaLat = currentLat - lastLat;
        const deltaLon = currentLon - lastLon;
        const distance = Math.sqrt(deltaLat * deltaLat + deltaLon * deltaLon);
        
        // Only calculate heading if we've moved a significant distance (at least 10 meters in degrees)
        if (distance > 0.0001) { // Roughly 10 meters
          // Calculate bearing/heading
          const y = Math.sin(deltaLon * Math.PI / 180) * Math.cos(currentLat * Math.PI / 180);
          const x = Math.cos(lastLat * Math.PI / 180) * Math.sin(currentLat * Math.PI / 180) - 
                   Math.sin(lastLat * Math.PI / 180) * Math.cos(currentLat * Math.PI / 180) * Math.cos(deltaLon * Math.PI / 180);
          
          let bearing = Math.atan2(y, x) * 180 / Math.PI;
          bearing = (bearing + 360) % 360; // Normalize to 0-360
          
          this.calculatedHeading = bearing;
        }
      }
    }
    
    // Update position tracking
    this.lastPosition = currentPosition;
    this.lastPositionTime = currentTime;
    
    return this.calculatedHeading;
  }
  
  updateAISInfo() {
    if (!this.currentMMSI) {
      this.updateStatus('No MMSI specified', 'error');
      this.clearDisplayValues();
      return;
    }

    const vesselData = vesselManager.getGeoJSONForVessel(this.currentMMSI);
    
    if (vesselData && vesselData.properties) {
      const props = vesselData.properties;
      
      // Position
      if (props.lat && props.lon) {
        const formattedPos = this.formatPosition(props.lat, props.lon);
        document.getElementById('vessel-position').textContent = formattedPos;
      }
      
      // Speed (AIS data is already in knots)
      if (props.sog !== undefined) {
        document.getElementById('vessel-speed').textContent = `${props.sog.toFixed(1)} kn`;
      } else if (props.speed !== undefined) {
        document.getElementById('vessel-speed').textContent = `${props.speed.toFixed(1)} kn`;
      }
      
      // Heading (prioritize heading over COG for AIS data)
      if (props.heading !== undefined) {
        document.getElementById('vessel-heading').textContent = `${props.heading.toFixed(0)}°`;
      } else if (props.cog !== undefined) {
        document.getElementById('vessel-heading').textContent = `${props.cog.toFixed(0)}°`;
      }
      
      // Vessel name - try rescue vessel manager first for faster access
      let vesselName = rescueVesselManager.getVesselName(this.currentMMSI);
      if (vesselName === this.currentMMSI && props.name) {
        // Fall back to props if not found in rescue manager
        vesselName = props.name;
      }
      
      if (vesselName && vesselName !== this.currentMMSI) {
        document.getElementById('vessel-name').textContent = vesselName;
        document.getElementById('vessel-name-item').style.display = 'flex';
      } else {
        document.getElementById('vessel-name-item').style.display = 'none';
      }
      
      // Call sign - try rescue vessel manager first
      let callSign = rescueVesselManager.getVesselCallSign(this.currentMMSI);
      if (!callSign && (props.callsign || props.callSign)) {
        callSign = props.callsign || props.callSign;
      }
      
      if (callSign) {
        document.getElementById('call-sign').textContent = callSign;
        document.getElementById('call-sign-item').style.display = 'flex';
      } else {
        document.getElementById('call-sign-item').style.display = 'none';
      }
      
      // MMSI
      document.getElementById('mmsi-display').textContent = this.currentMMSI;
      document.getElementById('mmsi-display-item').style.display = 'flex';
      
      // Navigation fields
      // COG (Course Over Ground)
      if (props.cog !== undefined) {
        document.getElementById('vessel-cog').textContent = `${props.cog.toFixed(0)}°`;
        document.getElementById('vessel-cog-item').style.display = 'flex';
      } else {
        document.getElementById('vessel-cog-item').style.display = 'none';
      }
      
      // ROT (Rate of Turn)
      if (props.rot !== undefined) {
        document.getElementById('vessel-rot').textContent = `${props.rot.toFixed(1)}°/min`;
        document.getElementById('vessel-rot-item').style.display = 'flex';
      } else {
        document.getElementById('vessel-rot-item').style.display = 'none';
      }
      
      // Navigation Status
      if (props.navStat !== undefined || props.navigationalStatus !== undefined) {
        const navStatus = props.navStat || props.navigationalStatus;
        const statusText = this.getNavigationStatusText(navStatus);
        document.getElementById('vessel-nav-status').textContent = statusText;
        document.getElementById('vessel-nav-status-item').style.display = 'flex';
      } else {
        document.getElementById('vessel-nav-status-item').style.display = 'none';
      }
      
      // Vessel Information fields
      // IMO
      if (props.imo) {
        document.getElementById('vessel-imo').textContent = props.imo;
        document.getElementById('vessel-imo-item').style.display = 'flex';
      } else {
        document.getElementById('vessel-imo-item').style.display = 'none';
      }
      
      // Vessel Type
      if (props.vesselType !== undefined) {
        document.getElementById('vessel-type').textContent = props.vesselType;
        document.getElementById('vessel-type-item').style.display = 'flex';
      } else {
        document.getElementById('vessel-type-item').style.display = 'none';
      }
      
      // Ship Type
      if (props.shipType !== undefined) {
        document.getElementById('ship-type').textContent = props.shipType;
        document.getElementById('ship-type-item').style.display = 'flex';
      } else {
        document.getElementById('ship-type-item').style.display = 'none';
      }
      
      // Ship and Cargo Type
      if (props.shipAndCargoType !== undefined) {
        document.getElementById('ship-cargo-type').textContent = props.shipAndCargoType;
        document.getElementById('ship-cargo-type-item').style.display = 'flex';
      } else {
        document.getElementById('ship-cargo-type-item').style.display = 'none';
      }
      
      // Voyage Information fields
      // Destination
      if (props.destination) {
        document.getElementById('vessel-destination').textContent = props.destination;
        document.getElementById('vessel-destination-item').style.display = 'flex';
      } else {
        document.getElementById('vessel-destination-item').style.display = 'none';
      }
      
      // ETA
      if (props.eta) {
        const formattedETA = this.formatETA(props.eta);
        document.getElementById('vessel-eta').textContent = formattedETA;
        document.getElementById('vessel-eta-item').style.display = 'flex';
      } else {
        document.getElementById('vessel-eta-item').style.display = 'none';
      }
      
      // Draught - check AIS data first, then rescue vessel data
      let draught = props.draught;
      if (draught === undefined && rescueVesselManager.isRescueVessel(this.currentMMSI)) {
        const rescueVessel = rescueVesselManager.getRescueVessel(this.currentMMSI);
        if (rescueVessel && rescueVessel.metadata && rescueVessel.metadata.draught !== undefined) {
          draught = rescueVessel.metadata.draught;
        }
      }
      
      if (draught !== undefined) {
        document.getElementById('vessel-draught').textContent = `${draught} m`;
        document.getElementById('vessel-draught-item').style.display = 'flex';
      } else {
        document.getElementById('vessel-draught-item').style.display = 'none';
      }
      
      // Dimensions
      if (props.dimensions) {
        const dim = props.dimensions;
        if (dim.length !== undefined && dim.width !== undefined) {
          document.getElementById('vessel-length').textContent = `${dim.length} m`;
          document.getElementById('vessel-width').textContent = `${dim.width} m`;
          document.getElementById('vessel-length-item').style.display = 'flex';
          document.getElementById('vessel-width-item').style.display = 'flex';
          
          // Detailed dimensions (A, B, C, D)
          if (dim.dimToBow !== undefined) {
            document.getElementById('vessel-dim-a').textContent = `${dim.dimToBow} m`;
            document.getElementById('vessel-dim-a-item').style.display = 'flex';
          } else {
            document.getElementById('vessel-dim-a-item').style.display = 'none';
          }
          
          if (dim.dimToStern !== undefined) {
            document.getElementById('vessel-dim-b').textContent = `${dim.dimToStern} m`;
            document.getElementById('vessel-dim-b-item').style.display = 'flex';
          } else {
            document.getElementById('vessel-dim-b-item').style.display = 'none';
          }
          
          if (dim.dimToPort !== undefined) {
            document.getElementById('vessel-dim-c').textContent = `${dim.dimToPort} m`;
            document.getElementById('vessel-dim-c-item').style.display = 'flex';
          } else {
            document.getElementById('vessel-dim-c-item').style.display = 'none';
          }
          
          if (dim.dimToStarboard !== undefined) {
            document.getElementById('vessel-dim-d').textContent = `${dim.dimToStarboard} m`;
            document.getElementById('vessel-dim-d-item').style.display = 'flex';
          } else {
            document.getElementById('vessel-dim-d-item').style.display = 'none';
          }
        } else {
          document.getElementById('vessel-length-item').style.display = 'none';
          document.getElementById('vessel-width-item').style.display = 'none';
          document.getElementById('vessel-dim-a-item').style.display = 'none';
          document.getElementById('vessel-dim-b-item').style.display = 'none';
          document.getElementById('vessel-dim-c-item').style.display = 'none';
          document.getElementById('vessel-dim-d-item').style.display = 'none';
        }
      } else {
        document.getElementById('vessel-length-item').style.display = 'none';
        document.getElementById('vessel-width-item').style.display = 'none';
        document.getElementById('vessel-dim-a-item').style.display = 'none';
        document.getElementById('vessel-dim-b-item').style.display = 'none';
        document.getElementById('vessel-dim-c-item').style.display = 'none';
        document.getElementById('vessel-dim-d-item').style.display = 'none';
      }
      
      // Calculate data age
      const timestamp = props.timestamp || props.lastUpdate;
      let status = 'AIS data active';
      
      // Add indicator if this is a rescue vessel
      if (rescueVesselManager.isRescueVessel(this.currentMMSI)) {
        status = 'Rescue vessel - ' + status;
      }
      
      if (timestamp) {
        const age = Date.now() - new Date(timestamp).getTime();
        const ageMinutes = Math.floor(age / 60000);
        if (ageMinutes > 0) {
          status = status.replace('active', `(${ageMinutes}m old)`);
        }
      }
      
      this.updateStatus(status, 'active');
    } else {
      // Always show MMSI immediately, even without vessel data
      document.getElementById('mmsi-display').textContent = this.currentMMSI;
      document.getElementById('mmsi-display-item').style.display = 'flex';
      
      // Clear position, speed, and heading until data arrives
      this.clearDisplayValues();
      
      // Even if no AIS data, try to show rescue vessel info
      if (rescueVesselManager.isRescueVessel(this.currentMMSI)) {
        const rescueVessel = rescueVesselManager.getRescueVessel(this.currentMMSI);
        if (rescueVessel && rescueVessel.metadata) {
          // Show vessel name and call sign from rescue data
          document.getElementById('vessel-name').textContent = rescueVessel.metadata.name;
          document.getElementById('vessel-name-item').style.display = 'flex';
          
          if (rescueVessel.metadata.callsign) {
            document.getElementById('call-sign').textContent = rescueVessel.metadata.callsign;
            document.getElementById('call-sign-item').style.display = 'flex';
          } else {
            document.getElementById('call-sign-item').style.display = 'none';
          }
          
          // Show draught from rescue vessel data if available
          if (rescueVessel.metadata.draught !== undefined) {
            document.getElementById('vessel-draught').textContent = `${rescueVessel.metadata.draught} m`;
            document.getElementById('vessel-draught-item').style.display = 'flex';
          } else {
            document.getElementById('vessel-draught-item').style.display = 'none';
          }
          
          this.updateStatus('Waiting for location data', 'active');
        } else {
          // Hide name, call sign, and draught if rescue vessel data not available
          document.getElementById('vessel-name-item').style.display = 'none';
          document.getElementById('call-sign-item').style.display = 'none';
          document.getElementById('vessel-draught-item').style.display = 'none';
          this.updateStatus('Waiting for data', 'active');
        }
      } else {
        // For non-rescue vessels, hide name, call sign, and draught until MQTT data arrives
        document.getElementById('vessel-name-item').style.display = 'none';
        document.getElementById('call-sign-item').style.display = 'none';
        document.getElementById('vessel-draught-item').style.display = 'none';
        this.updateStatus('Waiting for AIS data...', 'active');
      }
    }
  }
  
  clearVesselInfo() {
    this.clearDisplayValues();
    document.getElementById('vessel-name-item').style.display = 'none';
    document.getElementById('call-sign-item').style.display = 'none';
    document.getElementById('mmsi-display-item').style.display = 'none';
    document.getElementById('vessel-draught-item').style.display = 'none';
    this.updateStatus('No data source selected', '');
  }
  
  clearDisplayValues() {
    // Basic navigation fields
    document.getElementById('vessel-position').textContent = '--';
    document.getElementById('vessel-speed').textContent = '-- kn';
    document.getElementById('vessel-heading').textContent = '--°';
    
    // Additional navigation fields
    document.getElementById('vessel-cog').textContent = '--°';
    document.getElementById('vessel-rot').textContent = '--°/min';
    document.getElementById('vessel-nav-status').textContent = '--';
    
    // Vessel information fields
    document.getElementById('vessel-imo').textContent = '--';
    document.getElementById('vessel-type').textContent = '--';
    document.getElementById('ship-type').textContent = '--';
    document.getElementById('ship-cargo-type').textContent = '--';
    
    // Voyage fields
    document.getElementById('vessel-destination').textContent = '--';
    document.getElementById('vessel-eta').textContent = '--';
    document.getElementById('vessel-draught').textContent = '-- m';
    
    // Dimension fields
    document.getElementById('vessel-length').textContent = '-- m';
    document.getElementById('vessel-width').textContent = '-- m';
    document.getElementById('vessel-dim-a').textContent = '-- m';
    document.getElementById('vessel-dim-b').textContent = '-- m';
    document.getElementById('vessel-dim-c').textContent = '-- m';
    document.getElementById('vessel-dim-d').textContent = '-- m';
    
    // Hide all optional items
    document.getElementById('vessel-cog-item').style.display = 'none';
    document.getElementById('vessel-rot-item').style.display = 'none';
    document.getElementById('vessel-nav-status-item').style.display = 'none';
    document.getElementById('vessel-imo-item').style.display = 'none';
    document.getElementById('vessel-type-item').style.display = 'none';
    document.getElementById('ship-type-item').style.display = 'none';
    document.getElementById('ship-cargo-type-item').style.display = 'none';
    document.getElementById('vessel-destination-item').style.display = 'none';
    document.getElementById('vessel-eta-item').style.display = 'none';
    document.getElementById('vessel-draught-item').style.display = 'none';
    document.getElementById('vessel-length-item').style.display = 'none';
    document.getElementById('vessel-width-item').style.display = 'none';
    document.getElementById('vessel-dim-a-item').style.display = 'none';
    document.getElementById('vessel-dim-b-item').style.display = 'none';
    document.getElementById('vessel-dim-c-item').style.display = 'none';
    document.getElementById('vessel-dim-d-item').style.display = 'none';
  }
  
  formatPosition(lat, lon) {
    // Format to degrees and decimal minutes
    const latDeg = Math.floor(Math.abs(lat));
    const latMin = (Math.abs(lat) - latDeg) * 60;
    const latDir = lat >= 0 ? 'N' : 'S';
    
    const lonDeg = Math.floor(Math.abs(lon));
    const lonMin = (Math.abs(lon) - lonDeg) * 60;
    const lonDir = lon >= 0 ? 'E' : 'W';
    
    return `${latDeg}°${latMin.toFixed(3)}'${latDir} ${lonDeg}°${lonMin.toFixed(3)}'${lonDir}`;
  }
  
  getNavigationStatusText(status) {
    const statusMap = {
      0: 'Under way using engine',
      1: 'At anchor',
      2: 'Not under command',
      3: 'Restricted maneuverability',
      4: 'Constrained by her draught',
      5: 'Moored',
      6: 'Aground',
      7: 'Engaged in fishing',
      8: 'Under way sailing',
      9: 'Reserved (DG/HS/MP, HSC)',
      10: 'Reserved (DG/HS/MP, WIG)',
      11: 'Power-driven vessel towing astern',
      12: 'Power-driven vessel pushing ahead/alongside',
      13: 'Reserved for future use',
      14: 'AIS-SART/MOB-AIS/EPIRB-AIS (active)',
      15: 'Default'
    };
    
    return statusMap[status] || `Unknown (${status})`;
  }
  
  formatETA(eta) {
    if (!eta) return 'N/A';
    
    // ETA format can vary, handle different formats
    if (typeof eta === 'string') {
      // Try to parse ISO string or other formats
      const date = new Date(eta);
      if (!isNaN(date.getTime())) {
        return date.toLocaleString();
      }
      return eta; // Return as-is if can't parse
    } else if (typeof eta === 'number') {
      // Handle numeric ETA format (e.g., 691456)
      // This could be a packed format: MMDDHHMM
      const etaStr = eta.toString().padStart(8, '0');
      if (etaStr.length >= 6) {
        const month = parseInt(etaStr.substring(0, 2));
        const day = parseInt(etaStr.substring(2, 4));
        const hour = parseInt(etaStr.substring(4, 6));
        const minute = etaStr.length >= 8 ? parseInt(etaStr.substring(6, 8)) : 0;
        
        if (month > 0 && month <= 12 && day > 0 && day <= 31) {
          const currentYear = new Date().getFullYear();
          const etaDate = new Date(currentYear, month - 1, day, hour, minute);
          return etaDate.toLocaleString();
        }
      }
      return `ETA: ${eta}`;
    } else if (typeof eta === 'object' && eta.month && eta.day) {
      // Handle structured ETA format (month, day, hour, minute)
      const month = eta.month || 0;
      const day = eta.day || 0;
      const hour = eta.hour || 0;
      const minute = eta.minute || 0;
      
      if (month === 0 || day === 0) {
        return 'N/A';
      }
      
      // Construct date (using current year)
      const currentYear = new Date().getFullYear();
      const etaDate = new Date(currentYear, month - 1, day, hour, minute);
      return etaDate.toLocaleString();
    }
    
    return 'N/A';
  }
  
  updateStatus(text, type = '') {
    const statusIndicator = document.getElementById('status-indicator');
    const statusText = statusIndicator.querySelector('.status-text');
    
    statusText.textContent = text;
    statusIndicator.className = `status-indicator ${type}`;
  }
  
  startLocationUpdates() {
    // Update every 2 seconds
    setInterval(() => {
      this.updateVesselInfo();
    }, 2000);
  }
}

// Initialize vessel panel when DOM is loaded
let vesselPanelManager;

// Initialize vessel panel after the map setup
setTimeout(() => {
  vesselPanelManager = new VesselPanelManager();
}, 1000);